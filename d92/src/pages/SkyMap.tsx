import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, useMapEvents } from 'react-leaflet';
import { LatLngBounds, LatLngExpression, Icon, CRS } from 'leaflet';
import { Search, Info, MapPin, ChevronRight, Loader2, X, Globe } from 'lucide-react';
import { observationsApi, type ObservationMetadata } from '@/lib/api';
import { formatFileSize } from '@/lib/hash';
import { raToLng, decToLat, lngToRa, latToDec, formatRa, formatDec } from '@/lib/celestial';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';

const CENTER: LatLngExpression = [0, 0];
const DEFAULT_ZOOM = 2;

const customIcon = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiM2NERGRkEiIGZpbGwtb3BhY2l0eT0iMC4zIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjUiIGZpbGw9IiM2NERGRkEiLz4KPC9zdmc+Cg==',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface SelectionRectangleProps {
  onSelectionComplete: (raMin: number, raMax: number, decMin: number, decMax: number) => void;
}

const SelectionRectangle = ({ onSelectionComplete }: SelectionRectangleProps) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState<{ lat: number; lng: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);

  useMapEvents({
    mousedown: (e) => {
      setIsSelecting(true);
      setStartPos({ lat: e.latlng.lat, lng: e.latlng.lng });
      setCurrentPos({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mousemove: (e) => {
      if (isSelecting && startPos) {
        setCurrentPos({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
    mouseup: () => {
      if (startPos && currentPos) {
        const lng1 = startPos.lng;
        const lng2 = currentPos.lng;
        const lat1 = startPos.lat;
        const lat2 = currentPos.lat;

        const ra1 = lngToRa(lng1);
        const ra2 = lngToRa(lng2);
        const dec1 = latToDec(lat1);
        const dec2 = latToDec(lat2);

        const raMin = Math.min(ra1, ra2);
        const raMax = Math.max(ra1, ra2);
        const decMin = Math.min(dec1, dec2);
        const decMax = Math.max(dec1, dec2);

        onSelectionComplete(raMin, raMax, decMin, decMax);
      }
      setIsSelecting(false);
      setStartPos(null);
      setCurrentPos(null);
    },
  });

  if (!startPos || !currentPos) return null;

  const bounds = new LatLngBounds(
    [Math.min(startPos.lat, currentPos.lat), Math.min(startPos.lng, currentPos.lng)],
    [Math.max(startPos.lat, currentPos.lat), Math.max(startPos.lng, currentPos.lng)]
  );

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{ color: '#64FFDA', fillColor: '#64FFDA', fillOpacity: 0.2, weight: 2 }}
    />
  );
};

const SkyMap = () => {
  const [observations, setObservations] = useState<ObservationMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBounds, setSelectedBounds] = useState<{
    raMin: number;
    raMax: number;
    decMin: number;
    decMax: number;
  } | null>(null);
  const [queryResults, setQueryResults] = useState<ObservationMetadata[]>([]);
  const [showResults, setShowResults] = useState(false);

  const loadObservations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await observationsApi.getObservations(1, 50);
      setObservations(response.data.data);
    } catch (error) {
      console.error('Failed to load observations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadObservations();
  }, [loadObservations]);

  const handleSelectionComplete = async (raMin: number, raMax: number, decMin: number, decMax: number) => {
    setSelectedBounds({ raMin, raMax, decMin, decMax });
    setShowResults(true);
    setLoading(true);

    try {
      const response = await observationsApi.querySpatial({
        ra_min: raMin,
        ra_max: raMax,
        dec_min: decMin,
        dec_max: decMax,
        page: 1,
        page_size: 100,
      });
      setQueryResults(response.data.data);
    } catch (error) {
      console.error('Spatial query failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedBounds(null);
    setQueryResults([]);
    setShowResults(false);
  };

  const getSelectionRectangle = () => {
    if (!selectedBounds) return null;
    
    const { raMin, raMax, decMin, decMax } = selectedBounds;
    
    const lngMin = raToLng(raMin);
    const lngMax = raToLng(raMax);
    const latMin = decToLat(decMin);
    const latMax = decToLat(decMax);

    const bounds = new LatLngBounds(
      [latMin, Math.min(lngMin, lngMax)],
      [latMax, Math.max(lngMin, lngMax)]
    );

    return bounds;
  };

  const selectionBounds = getSelectionRectangle();

  return (
    <div className="h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">天球检索</h1>
          <p className="text-nebula-400">在天球图上框选区域，检索对应位置的观测数据</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-nebula-300">
            <MapPin className="w-4 h-4 text-cosmic-500" />
            <span>共 {observations.length} 条记录</span>
          </div>
          {showResults && (
            <button
              onClick={clearSelection}
              className="px-4 py-2 bg-space-800 hover:bg-space-700 text-white rounded-lg text-sm flex items-center space-x-2 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>清除选择</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-6 h-full">
        <div className="flex-1 glass-card rounded-xl overflow-hidden relative">
          <div className="absolute top-4 left-4 z-[1000] bg-space-900/90 backdrop-blur px-4 py-2 rounded-lg border border-space-700">
            <div className="flex items-center space-x-2 text-sm text-nebula-300">
              <Search className="w-4 h-4 text-cosmic-500" />
              <span>按住鼠标拖动框选天区</span>
            </div>
          </div>

          <MapContainer
            center={CENTER}
            zoom={DEFAULT_ZOOM}
            className="w-full h-full"
            style={{ background: '#0A192F' }}
            crs={CRS.EPSG4326}
            maxBounds={[[-90, -180], [90, 180]]}
            maxBoundsViscosity={1.0}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.star.nesdis.noaa.gov/">NOAA</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              opacity={0.3}
              noWrap={true}
              bounds={[[-90, -180], [90, 180]]}
            />

            {observations.map((obs) => (
              <Marker
                key={obs.id}
                position={[decToLat(obs.dec), raToLng(obs.ra)]}
                icon={customIcon}
              >
                <Popup className="bg-space-900 border-space-700">
                  <div className="p-2 min-w-[200px]">
                    <h4 className="font-semibold text-white mb-2">{obs.file_name}</h4>
                    <div className="space-y-1 text-sm text-nebula-300">
                      <p>RA: {formatRa(obs.ra)}</p>
                      <p>Dec: {formatDec(obs.dec)}</p>
                      <p>大小: {formatFileSize(obs.file_size)}</p>
                    </div>
                    <Link
                      to={`/data/${obs.id}`}
                      className="mt-3 flex items-center text-cosmic-500 text-sm hover:underline"
                    >
                      查看详情 <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}

            <SelectionRectangle onSelectionComplete={handleSelectionComplete} />

            {selectionBounds && (
              <Rectangle
                bounds={selectionBounds}
                pathOptions={{ color: '#64FFDA', fillColor: '#64FFDA', fillOpacity: 0.1, weight: 2, dashArray: '5,5' }}
              />
            )}
          </MapContainer>
        </div>

        <div className="w-80 glass-card rounded-xl p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <Globe className="w-5 h-5 text-cosmic-500 mr-2" />
              检索结果
            </h3>
            {showResults && (
              <span className="text-sm text-nebula-400">
                {queryResults.length} 条结果
              </span>
            )}
          </div>

          {selectedBounds && (
            <div className="mb-4 p-3 bg-space-800/50 rounded-lg">
              <p className="text-xs text-nebula-400 mb-2">选中区域</p>
              <div className="text-xs text-nebula-300 space-y-1">
                <p>赤经: {selectedBounds.raMin.toFixed(2)}° - {selectedBounds.raMax.toFixed(2)}°</p>
                <p>赤纬: {selectedBounds.decMin.toFixed(2)}° - {selectedBounds.decMax.toFixed(2)}°</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-cosmic-500 animate-spin mb-3" />
              <p className="text-nebula-400 text-sm">检索中...</p>
            </div>
          )}

          {!loading && !showResults && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Info className="w-12 h-12 text-nebula-500 mb-4" />
              <p className="text-nebula-400 text-sm">
                在天球图上框选区域<br />
                查看对应位置的观测数据
              </p>
            </div>
          )}

          {!loading && showResults && (
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {queryResults.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-nebula-400 text-sm">该区域没有找到观测数据</p>
                </div>
              ) : (
                queryResults.map((obs) => (
                  <Link
                    key={obs.id}
                    to={`/data/${obs.id}`}
                    className="block p-3 bg-space-800/50 hover:bg-space-800 rounded-lg transition-colors"
                  >
                    <p className="text-sm font-medium text-white truncate mb-1">
                      {obs.file_name}
                    </p>
                    <div className="text-xs text-nebula-400 space-y-1">
                      <p>RA: {formatRa(obs.ra)}</p>
                      <p>Dec: {formatDec(obs.dec)}</p>
                    </div>
                    <div className="text-xs text-nebula-500 mt-1">
                      {formatFileSize(obs.file_size)}
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkyMap;
