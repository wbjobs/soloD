require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const axios = require('axios');

const PROTO_PATH = path.join(__dirname, '../../proto/routing.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const routingProto = grpc.loadPackageDefinition(packageDefinition).routing;

const OPENROUTESERVICE_API_KEY = process.env.OPENROUTESERVICE_API_KEY;
const OPENROUTESERVICE_URL = 'https://api.openrouteservice.org/v2/directions';
const REQUEST_TIMEOUT = 3000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIME = 30000;

let circuitBreakerState = {
  failureCount: 0,
  lastFailureTime: 0,
  isOpen: false
};

const routeCache = new Map();
const CACHE_TTL = 300000;

const axiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Authorization': OPENROUTESERVICE_API_KEY,
    'Content-Type': 'application/json'
  }
});

function checkCircuitBreaker() {
  if (circuitBreakerState.isOpen) {
    const now = Date.now();
    if (now - circuitBreakerState.lastFailureTime > CIRCUIT_BREAKER_RESET_TIME) {
      circuitBreakerState.isOpen = false;
      circuitBreakerState.failureCount = 0;
      console.log('Circuit breaker: HALF-OPEN, allowing test request');
      return false;
    }
    return true;
  }
  return false;
}

function recordFailure() {
  circuitBreakerState.failureCount++;
  circuitBreakerState.lastFailureTime = Date.now();
  if (circuitBreakerState.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerState.isOpen = true;
    console.log(`Circuit breaker: OPEN, no requests allowed for ${CIRCUIT_BREAKER_RESET_TIME/1000}s`);
  }
}

function recordSuccess() {
  circuitBreakerState.failureCount = 0;
  if (circuitBreakerState.isOpen) {
    circuitBreakerState.isOpen = false;
    console.log('Circuit breaker: CLOSED, requests resumed');
  }
}

function getCacheKey(waypoints, profile) {
  const coords = waypoints.map(wp => `${wp.latitude.toFixed(4)},${wp.longitude.toFixed(4)}`).join('|');
  return `${profile}|${coords}`;
}

function generateFallbackRoute(waypoints) {
  const coordinates = [];
  if (waypoints.length >= 2) {
    const start = waypoints[0];
    const end = waypoints[waypoints.length - 1];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      coordinates.push({
        latitude: start.latitude + (end.latitude - start.latitude) * t,
        longitude: start.longitude + (end.longitude - start.longitude) * t
      });
    }
    waypoints.slice(1, -1).forEach(wp => coordinates.push(wp));
  } else if (waypoints.length === 1) {
    const wp = waypoints[0];
    coordinates.push({ latitude: wp.latitude, longitude: wp.longitude });
    coordinates.push({ latitude: wp.latitude + 0.01, longitude: wp.longitude + 0.01 });
  }
  const distance = coordinates.length * 100;
  const duration = coordinates.length * 60;
  return { coordinates, distance, duration };
}

async function calculateRoute(call, callback) {
  const startTime = Date.now();
  try {
    const { waypoints, profile = 'driving-car' } = call.request;
    
    if (!waypoints || waypoints.length === 0) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: 'Waypoints are required'
      });
    }

    const cacheKey = getCacheKey(waypoints, profile);
    const cached = routeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Cache hit, response time: ${Date.now() - startTime}ms`);
      return callback(null, cached.data);
    }

    if (checkCircuitBreaker()) {
      console.log('Circuit breaker is OPEN, using fallback route');
      const fallbackRoute = generateFallbackRoute(waypoints);
      return callback(null, {
        ...fallbackRoute,
        is_fallback: true
      });
    }

    const coordinates = waypoints.map(wp => [wp.longitude, wp.latitude]);
    
    const response = await axiosInstance.post(
      `${OPENROUTESERVICE_URL}/${profile}`,
      {
        coordinates,
        instructions: false,
        geometry_format: 'geojson'
      }
    );

    recordSuccess();

    const routeGeometry = response.data.features[0].geometry.coordinates;
    const summary = response.data.features[0].properties.summary;

    const routeCoordinates = routeGeometry.map(coord => ({
      longitude: coord[0],
      latitude: coord[1]
    }));

    const result = {
      coordinates: routeCoordinates,
      distance: summary.distance,
      duration: summary.duration
    };

    routeCache.set(cacheKey, { data: result, timestamp: Date.now() });

    console.log(`Route calculated, response time: ${Date.now() - startTime}ms`);
    callback(null, result);
  } catch (error) {
    recordFailure();
    console.error('Route calculation error:', error.message, `response time: ${Date.now() - startTime}ms`);
    
    const fallbackRoute = generateFallbackRoute(call.request.waypoints || []);
    callback(null, {
      ...fallbackRoute,
      is_fallback: true,
      error_message: error.message
    });
  }
}

function generateFallbackInstructions(waypoints) {
  const steps = [];
  if (waypoints.length >= 2) {
    steps.push({
      instruction: '开始出发，前往目的地',
      distance: 500,
      duration: 60,
      start_location: waypoints[0]
    });
    steps.push({
      instruction: '继续直行',
      distance: 500,
      duration: 60,
      start_location: waypoints[0]
    });
    steps.push({
      instruction: '到达目的地',
      distance: 0,
      duration: 0,
      start_location: waypoints[waypoints.length - 1]
    });
  }
  const total_distance = waypoints.length * 500;
  const total_duration = waypoints.length * 120;
  return { steps, total_distance, total_duration };
}

async function getDrivingInstructions(call, callback) {
  const startTime = Date.now();
  try {
    const { waypoints, profile = 'driving-car' } = call.request;
    
    if (!waypoints || waypoints.length === 0) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: 'Waypoints are required'
      });
    }

    const cacheKey = `instructions_${getCacheKey(waypoints, profile)}`;
    const cached = routeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Instructions cache hit, response time: ${Date.now() - startTime}ms`);
      return callback(null, cached.data);
    }

    if (checkCircuitBreaker()) {
      console.log('Circuit breaker is OPEN, using fallback instructions');
      const fallback = generateFallbackInstructions(waypoints);
      return callback(null, {
        ...fallback,
        is_fallback: true
      });
    }

    const coordinates = waypoints.map(wp => [wp.longitude, wp.latitude]);
    
    const response = await axiosInstance.post(
      `${OPENROUTESERVICE_URL}/${profile}`,
      {
        coordinates,
        instructions: true,
        instructions_format: 'text'
      }
    );

    recordSuccess();

    const segments = response.data.features[0].properties.segments;
    const steps = [];
    
    segments.forEach(segment => {
      segment.steps.forEach(step => {
        steps.push({
          instruction: step.instruction,
          distance: step.distance,
          duration: step.duration,
          start_location: {
            latitude: waypoints[0].latitude,
            longitude: waypoints[0].longitude
          }
        });
      });
    });

    const summary = response.data.features[0].properties.summary;

    const result = {
      steps,
      total_distance: summary.distance,
      total_duration: summary.duration
    };

    routeCache.set(cacheKey, { data: result, timestamp: Date.now() });

    console.log(`Instructions calculated, response time: ${Date.now() - startTime}ms`);
    callback(null, result);
  } catch (error) {
    recordFailure();
    console.error('Driving instructions error:', error.message, `response time: ${Date.now() - startTime}ms`);
    
    const fallback = generateFallbackInstructions(call.request.waypoints || []);
    callback(null, {
      ...fallback,
      is_fallback: true,
      error_message: error.message
    });
  }
}

function main() {
  const server = new grpc.Server();
  server.addService(routingProto.MapService.service, {
    calculateRoute,
    getDrivingInstructions
  });
  
  const port = '0.0.0.0:50052';
  server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
    console.log(`Map Service running on ${port}`);
    server.start();
  });
}

main();
