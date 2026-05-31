import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

const driverIcon = L.divIcon({
  className: 'driver-marker',
  html: `
    <div style="
      width: 32px;
      height: 32px;
      background: #2196F3;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const deliveryIcon = L.divIcon({
  className: 'delivery-marker',
  html: `
    <div style="
      width: 28px;
      height: 28px;
      background: #4CAF50;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function MapComponent() {
  const [driverLocation, setDriverLocation] = useState({ latitude: 39.9042, longitude: 116.4074 });
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [deliveryPoints, setDeliveryPoints] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const sampleRoute = [
      [39.9042, 116.4074],
      [39.9142, 116.4174],
      [39.9242, 116.4274],
      [39.9342, 116.4374],
      [39.9442, 116.4474]
    ];
    setRouteCoordinates(sampleRoute);

    const sampleDeliveryPoints = [
      { id: '1', latitude: 39.9142, longitude: 116.4174, address: '北京市朝阳区xxx路1号', status: 'DELIVERED' },
      { id: '2', latitude: 39.9242, longitude: 116.4274, address: '北京市朝阳区xxx路2号', status: 'PENDING' },
      { id: '3', latitude: 39.9342, longitude: 116.4374, address: '北京市朝阳区xxx路3号', status: 'PENDING' },
      { id: '4', latitude: 39.9442, longitude: 116.4474, address: '北京市朝阳区xxx路4号', status: 'PENDING' }
    ];
    setDeliveryPoints(sampleDeliveryPoints);

    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      if (update.location) {
        setDriverLocation(update.location);
      }
    };

    ws.onerror = (error) => {
      console.log('WebSocket connection error, using mock data');
    };

    let index = 0;
    const mockInterval = setInterval(() => {
      if (index < sampleRoute.length) {
        const [lat, lng] = sampleRoute[index];
        setDriverLocation({ latitude: lat, longitude: lng });
        index++;
      } else {
        index = 0;
      }
    }, 2000);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      clearInterval(mockInterval);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '50px',
        zIndex: 1000,
        background: 'white',
        padding: '15px 20px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>实时配送追踪</h3>
        <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
          🚗 司机位置: {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}
        </p>
        <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
          📍 配送点: {deliveryPoints.filter(p => p.status === 'DELIVERED').length}/{deliveryPoints.length}
        </p>
      </div>

      <MapContainer
        center={[driverLocation.latitude, driverLocation.longitude]}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
      >
        <MapController center={[driverLocation.latitude, driverLocation.longitude]} zoom={13} />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routeCoordinates.length > 0 && (
          <Polyline
            positions={routeCoordinates}
            color="#2196F3"
            weight={4}
            opacity={0.8}
            smoothFactor={1}
          />
        )}

        {deliveryPoints.map((point) => (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={deliveryIcon}
          >
            <Popup>
              <div style={{ padding: '5px' }}>
                <strong>配送点 #{point.id}</strong><br />
                地址: {point.address}<br />
                状态: <span style={{ color: point.status === 'DELIVERED' ? '#4CAF50' : '#FF9800' }}>
                  {point.status === 'DELIVERED' ? '已送达' : '待配送'}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        <Marker
          position={[driverLocation.latitude, driverLocation.longitude]}
          icon={driverIcon}
        >
          <Popup>
            <div style={{ padding: '5px' }}>
              <strong>🚗 司机位置</strong><br />
              纬度: {driverLocation.latitude.toFixed(6)}<br />
              经度: {driverLocation.longitude.toFixed(6)}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

export default MapComponent;
