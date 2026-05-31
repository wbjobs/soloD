/**
 * 天球坐标转换工具
 * 
 * 天球坐标系 (Celestial Coordinate System):
 * - 赤经 (RA / Right Ascension): 0° - 360° 或 0h - 24h
 * - 赤纬 (Dec / Declination): -90° - +90°
 * 
 * Leaflet坐标系:
 * - 经度 (Lng): -180° - +180°
 * - 纬度 (Lat): -90° - +90°
 */

/**
 * 赤经转换为Leaflet经度
 * RA (0-360) -> Lng (-180-180)
 */
export function raToLng(ra: number): number {
  let lng = ra;
  if (lng > 180) {
    lng = lng - 360;
  }
  return lng;
}

/**
 * Leaflet经度转换为赤经
 * Lng (-180-180) -> RA (0-360)
 */
export function lngToRa(lng: number): number {
  let ra = lng;
  if (ra < 0) {
    ra = ra + 360;
  }
  return ra;
}

/**
 * 赤纬直接映射为纬度 (范围相同)
 */
export function decToLat(dec: number): number {
  return dec;
}

/**
 * 纬度直接映射为赤纬 (范围相同)
 */
export function latToDec(lat: number): number {
  return lat;
}

/**
 * 转换天球坐标边界为Leaflet边界
 */
export function celestialBoundsToLeaflet(
  raMin: number,
  raMax: number,
  decMin: number,
  decMax: number
): {
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
} {
  return {
    lngMin: raToLng(raMin),
    lngMax: raToLng(raMax),
    latMin: decToLat(decMin),
    latMax: decToLat(decMax)
  };
}

/**
 * 转换Leaflet边界为天球坐标边界
 */
export function leafletBoundsToCelestial(
  lngMin: number,
  lngMax: number,
  latMin: number,
  latMax: number
): {
  raMin: number;
  raMax: number;
  decMin: number;
  decMax: number;
} {
  return {
    raMin: lngToRa(lngMin),
    raMax: lngToRa(lngMax),
    decMin: latToDec(latMin),
    decMax: latToDec(latMax)
  };
}

/**
 * 规范化赤经范围到0-360
 */
export function normalizeRa(ra: number): number {
  while (ra < 0) ra += 360;
  while (ra >= 360) ra -= 360;
  return ra;
}

/**
 * 规范化赤纬范围到-90-90
 */
export function normalizeDec(dec: number): number {
  while (dec < -90) dec += 180;
  while (dec > 90) dec -= 180;
  return dec;
}

/**
 * 检查边界是否跨越0度赤经线（日期线）
 */
export function crossesRaZero(raMin: number, raMax: number): boolean {
  return raMin > raMax;
}

/**
 * 格式化赤经显示 (时分秒格式)
 */
export function formatRa(ra: number): string {
  const hours = ra / 15;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = ((hours - h - m / 60) * 3600).toFixed(2);
  return `${h}h ${m}m ${s}s`;
}

/**
 * 格式化赤纬显示 (度分秒格式)
 */
export function formatDec(dec: number): string {
  const sign = dec >= 0 ? '+' : '-';
  const absDec = Math.abs(dec);
  const d = Math.floor(absDec);
  const m = Math.floor((absDec - d) * 60);
  const s = ((absDec - d - m / 60) * 3600).toFixed(2);
  return `${sign}${d}° ${m}' ${s}"`;
}
