const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PROTO_PATH = path.join(__dirname, '../../proto/routing.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const routingProto = grpc.loadPackageDefinition(packageDefinition).routing;

const deliveryPoints = new Map();
const drivers = new Map();
const orderAssignments = new Map();
const trafficConditions = new Map();
const pendingReroutes = new Set();

const REROUTE_CONFIG = {
  DELAY_THRESHOLD_MIN: 15,
  TRAFFIC_SCORE_THRESHOLD: 0.7,
  MIN_DELIVERIES_FOR_REROUTE: 2,
  REROUTE_COOLDOWN_MS: 300000,
  AUTO_REROUTE_ENABLED: true
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimateRouteDuration(points, driverLocation) {
  if (points.length === 0) return { distance: 0, duration: 0 };
  
  let totalDistance = 0;
  let currentLocation = driverLocation;
  
  for (const point of points) {
    const distance = calculateDistance(
      currentLocation.latitude, currentLocation.longitude,
      point.location.latitude, point.location.longitude
    );
    totalDistance += distance;
    currentLocation = point.location;
  }
  
  const avgSpeedKmh = 25;
  const duration = (totalDistance / avgSpeedKmh) * 60;
  
  return { distance: totalDistance, duration };
}

function calculateTrafficImpact(assignment) {
  let impact = 0;
  let hotspotCount = 0;
  
  for (const [id, hotspot] of trafficConditions) {
    for (const point of assignment.delivery_points || []) {
      const distance = calculateDistance(
        hotspot.location.latitude, hotspot.location.longitude,
        point.location.latitude, point.location.longitude
      );
      if (distance < 2) {
        impact += hotspot.severity * (2 - distance) / 2;
        hotspotCount++;
      }
    }
  }
  
  return { impact, hotspotCount };
}

function selectOptimalDriver(orderId, deliveryPointsList, excludedDriverId = null) {
  const availableDrivers = Array.from(drivers.values()).filter(d => {
    if (d.status !== 'AVAILABLE') return false;
    if (excludedDriverId && d.id === excludedDriverId) return false;
    return true;
  });
  
  if (availableDrivers.length === 0) return null;
  
  const firstPoint = deliveryPointsList[0];
  if (!firstPoint) return availableDrivers[0];
  
  const scoredDrivers = availableDrivers.map(driver => {
    const distanceToStart = calculateDistance(
      driver.current_location.latitude, driver.current_location.longitude,
      firstPoint.location.latitude, firstPoint.location.longitude
    );
    const routeEstimate = estimateRouteDuration(deliveryPointsList, driver.current_location);
    const loadFactor = driver.current_load / Math.max(driver.capacity, 1);
    
    const score = (distanceToStart * 0.5) + (routeEstimate.duration * 0.3) + (loadFactor * 100);
    
    return { driver, score, distance: distanceToStart, estimate: routeEstimate };
  });
  
  scoredDrivers.sort((a, b) => a.score - b.score);
  return scoredDrivers[0];
}

function checkAndTriggerReroute(assignment) {
  if (!REROUTE_CONFIG.AUTO_REROUTE_ENABLED) return false;
  
  const now = Date.now();
  const lastReroute = assignment.last_updated || assignment.assigned_at;
  if (now - lastReroute < REROUTE_CONFIG.REROUTE_COOLDOWN_MS) return false;
  
  const { impact, hotspotCount } = calculateTrafficImpact(assignment);
  if (impact >= REROUTE_CONFIG.TRAFFIC_SCORE_THRESHOLD) {
    console.log(`[Auto-Reroute] Order ${assignment.order_id} triggered by traffic: impact=${impact.toFixed(2)}, hotspots=${hotspotCount}`);
    return true;
  }
  
  const currentEstimate = estimateRouteDuration(
    assignment.delivery_points,
    drivers.get(assignment.driver_id)?.current_location || { latitude: 0, longitude: 0 }
  );
  
  if (currentEstimate.duration - assignment.estimated_duration_min > REROUTE_CONFIG.DELAY_THRESHOLD_MIN) {
    console.log(`[Auto-Reroute] Order ${assignment.order_id} triggered by delay: +${(currentEstimate.duration - assignment.estimated_duration_min).toFixed(1)}min`);
    return true;
  }
  
  return false;
}

function createDeliveryPoint(call, callback) {
  const { order_id, location, address, sequence } = call.request;
  const id = uuidv4();
  const deliveryPoint = {
    id,
    order_id,
    location,
    address,
    status: 'PENDING',
    sequence
  };
  deliveryPoints.set(id, deliveryPoint);
  callback(null, deliveryPoint);
}

function getDeliveryPoints(call, callback) {
  const { order_id } = call.request;
  const points = Array.from(deliveryPoints.values())
    .filter(p => p.order_id === order_id)
    .sort((a, b) => a.sequence - b.sequence);
  callback(null, { points });
}

function updateDeliveryStatus(call, callback) {
  const { point_id, status } = call.request;
  if (deliveryPoints.has(point_id)) {
    const point = deliveryPoints.get(point_id);
    point.status = status;
    deliveryPoints.set(point_id, point);
    
    const assignment = Array.from(orderAssignments.values())
      .find(a => a.delivery_points.some(p => p.id === point_id));
    if (assignment) {
      const dpIndex = assignment.delivery_points.findIndex(p => p.id === point_id);
      if (dpIndex >= 0) {
        assignment.delivery_points[dpIndex] = point;
      }
    }
    
    callback(null, point);
  } else {
    callback({
      code: grpc.status.NOT_FOUND,
      details: 'Delivery point not found'
    });
  }
}

function registerDriver(call, callback) {
  const { name, phone, vehicle_type, capacity, initial_location } = call.request;
  const id = uuidv4();
  const driver = {
    id,
    name,
    phone,
    vehicle_type: vehicle_type || 'VAN',
    status: 'AVAILABLE',
    current_location: initial_location || { latitude: 39.9042, longitude: 116.4074 },
    capacity: capacity || 10,
    current_load: 0,
    last_update_time: Date.now()
  };
  drivers.set(id, driver);
  console.log(`[Driver] Registered: ${id} - ${name}`);
  callback(null, driver);
}

function updateDriverStatus(call, callback) {
  const { driver_id, status, location, current_load } = call.request;
  if (!drivers.has(driver_id)) {
    return callback({
      code: grpc.status.NOT_FOUND,
      details: 'Driver not found'
    });
  }
  
  const driver = drivers.get(driver_id);
  if (status) driver.status = status;
  if (location) driver.current_location = location;
  if (current_load !== undefined) driver.current_load = current_load;
  driver.last_update_time = Date.now();
  
  drivers.set(driver_id, driver);
  
  const assignments = Array.from(orderAssignments.values())
    .filter(a => a.driver_id === driver_id && a.status === 'ACTIVE');
  
  for (const assignment of assignments) {
    if (checkAndTriggerReroute(assignment)) {
      pendingReroutes.add(assignment.order_id);
    }
  }
  
  callback(null, driver);
}

function getAvailableDrivers(call, callback) {
  const { near_location, max_distance_km, vehicle_type, min_capacity } = call.request;
  
  let availableDrivers = Array.from(drivers.values())
    .filter(d => d.status === 'AVAILABLE');
  
  if (vehicle_type) {
    availableDrivers = availableDrivers.filter(d => d.vehicle_type === vehicle_type);
  }
  
  if (min_capacity) {
    availableDrivers = availableDrivers.filter(d => d.capacity >= min_capacity);
  }
  
  if (near_location && max_distance_km) {
    availableDrivers = availableDrivers.filter(d => {
      const distance = calculateDistance(
        near_location.latitude, near_location.longitude,
        d.current_location.latitude, d.current_location.longitude
      );
      return distance <= max_distance_km;
    });
    
    availableDrivers.sort((a, b) => {
      const distA = calculateDistance(
        near_location.latitude, near_location.longitude,
        a.current_location.latitude, a.current_location.longitude
      );
      const distB = calculateDistance(
        near_location.latitude, near_location.longitude,
        b.current_location.latitude, b.current_location.longitude
      );
      return distA - distB;
    });
  }
  
  callback(null, {
    drivers: availableDrivers,
    total_count: availableDrivers.length
  });
}

function assignDriverToOrder(call, callback) {
  const { order_id, driver_id, delivery_points: req_points, auto_select_driver } = call.request;
  
  let points = req_points || [];
  if (points.length === 0) {
    points = Array.from(deliveryPoints.values())
      .filter(p => p.order_id === order_id)
      .sort((a, b) => a.sequence - b.sequence);
  }
  
  if (points.length === 0) {
    return callback({
      code: grpc.status.FAILED_PRECONDITION,
      details: 'No delivery points found for order'
    });
  }
  
  let selectedDriver = null;
  let selectedDriverId = driver_id;
  
  if (auto_select_driver) {
    const selection = selectOptimalDriver(order_id, points);
    if (!selection) {
      return callback({
        code: grpc.status.UNAVAILABLE,
        details: 'No available drivers found'
      });
    }
    selectedDriver = selection.driver;
    selectedDriverId = selectedDriver.id;
  } else {
    if (!drivers.has(driver_id)) {
      return callback({
        code: grpc.status.NOT_FOUND,
        details: 'Driver not found'
      });
    }
    selectedDriver = drivers.get(driver_id);
    if (selectedDriver.status !== 'AVAILABLE') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        details: `Driver is ${selectedDriver.status}`
      });
    }
  }
  
  const routeEstimate = estimateRouteDuration(points, selectedDriver.current_location);
  
  const assignmentId = uuidv4();
  const now = Date.now();
  const assignment = {
    assignment_id: assignmentId,
    order_id,
    driver_id: selectedDriverId,
    status: 'ACTIVE',
    delivery_points: points,
    estimated_duration_min: routeEstimate.duration,
    total_distance_km: routeEstimate.distance,
    assigned_at: now,
    last_updated: now,
    reroute_reason: '',
    reroute_count: 0
  };
  
  orderAssignments.set(assignmentId, assignment);
  
  selectedDriver.status = 'ON_ROUTE';
  selectedDriver.current_load += points.length;
  drivers.set(selectedDriverId, selectedDriver);
  
  console.log(`[Assignment] Order ${order_id} assigned to Driver ${selectedDriverId}, est: ${routeEstimate.duration.toFixed(1)}min`);
  callback(null, assignment);
}

function getOrderAssignment(call, callback) {
  const { order_id } = call.request;
  const assignment = Array.from(orderAssignments.values())
    .find(a => a.order_id === order_id);
  
  if (assignment) {
    callback(null, assignment);
  } else {
    callback({
      code: grpc.status.NOT_FOUND,
      details: 'Assignment not found'
    });
  }
}

function triggerReroute(call, callback) {
  const { order_id, reason, force_reassign, traffic_hotspots } = call.request;
  
  if (traffic_hotspots) {
    traffic_hotspots.forEach((hotspot, index) => {
      const hotspotId = `hotspot_${Date.now()}_${index}`;
      trafficConditions.set(hotspotId, {
        id: hotspotId,
        location: hotspot,
        severity: 0.8,
        reported_at: Date.now()
      });
    });
  }
  
  const oldAssignment = Array.from(orderAssignments.values())
    .find(a => a.order_id === order_id);
  
  if (!oldAssignment) {
    return callback({
      code: grpc.status.NOT_FOUND,
      details: 'Order assignment not found'
    });
  }
  
  const points = oldAssignment.delivery_points;
  let newDriverId = oldAssignment.driver_id;
  let driverChanged = false;
  
  if (force_reassign) {
    const selection = selectOptimalDriver(order_id, points, oldAssignment.driver_id);
    if (selection && selection.driver.id !== oldAssignment.driver_id) {
      newDriverId = selection.driver.id;
      driverChanged = true;
      
      const oldDriver = drivers.get(oldAssignment.driver_id);
      if (oldDriver) {
        oldDriver.status = 'AVAILABLE';
        oldDriver.current_load = Math.max(0, oldDriver.current_load - points.length);
        drivers.set(oldAssignment.driver_id, oldDriver);
      }
      
      const newDriver = drivers.get(newDriverId);
      if (newDriver) {
        newDriver.status = 'ON_ROUTE';
        newDriver.current_load += points.length;
        drivers.set(newDriverId, newDriver);
      }
    }
  }
  
  const newDriver = drivers.get(newDriverId);
  const newEstimate = estimateRouteDuration(points, newDriver?.current_location || { latitude: 0, longitude: 0 });
  const timeSaved = Math.max(0, oldAssignment.estimated_duration_min - newEstimate.duration);
  
  const now = Date.now();
  const newAssignment = {
    ...oldAssignment,
    driver_id: newDriverId,
    estimated_duration_min: newEstimate.duration,
    total_distance_km: newEstimate.distance,
    last_updated: now,
    reroute_reason: reason || 'TRAFFIC_CONGESTION',
    reroute_count: oldAssignment.reroute_count + 1
  };
  
  orderAssignments.set(oldAssignment.assignment_id, newAssignment);
  pendingReroutes.delete(order_id);
  
  console.log(`[Reroute] Order ${order_id}: driver_changed=${driverChanged}, saved=${timeSaved.toFixed(1)}min, reason=${reason || 'auto'}`);
  
  callback(null, {
    success: true,
    order_id,
    new_assignment: newAssignment,
    old_assignment: oldAssignment,
    reason: reason || 'TRAFFIC_CONGESTION',
    driver_changed: driverChanged,
    time_saved_min: timeSaved,
    message: `Route recalculated${driverChanged ? ', driver reassigned' : ''}`
  });
}

setInterval(() => {
  if (!REROUTE_CONFIG.AUTO_REROUTE_ENABLED) return;
  
  for (const assignment of orderAssignments.values()) {
    if (assignment.status !== 'ACTIVE') continue;
    if (pendingReroutes.has(assignment.order_id)) continue;
    
    if (checkAndTriggerReroute(assignment)) {
      pendingReroutes.add(assignment.order_id);
      console.log(`[Auto-Reroute] Queued order ${assignment.order_id} for rerouting`);
    }
  }
}, 60000);

setInterval(() => {
  const now = Date.now();
  for (const [id, hotspot] of trafficConditions) {
    if (now - hotspot.reported_at > 3600000) {
      trafficConditions.delete(id);
    }
  }
}, 300000);

function main() {
  const server = new grpc.Server();
  server.addService(routingProto.OrderService.service, {
    createDeliveryPoint,
    getDeliveryPoints,
    updateDeliveryStatus,
    registerDriver,
    updateDriverStatus,
    getAvailableDrivers,
    assignDriverToOrder,
    getOrderAssignment,
    triggerReroute
  });
  
  const port = '0.0.0.0:50051';
  server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
    console.log(`Order Service running on ${port}`);
    console.log(`- Auto-Reroute: ${REROUTE_CONFIG.AUTO_REROUTE_ENABLED ? 'ENABLED' : 'DISABLED'}`);
    console.log(`- Delay threshold: ${REROUTE_CONFIG.DELAY_THRESHOLD_MIN}min`);
    console.log(`- Traffic threshold: ${REROUTE_CONFIG.TRAFFIC_SCORE_THRESHOLD}`);
    console.log(`- Cooldown: ${REROUTE_CONFIG.REROUTE_COOLDOWN_MS/1000}s`);
    server.start();
  });
}

main();
