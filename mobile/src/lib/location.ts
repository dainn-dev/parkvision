import { UserLocation } from '../types';

export const DEFAULT_USER_LOCATION: UserLocation = {
  lat: 10.7324,
  lng: 106.7210,
  address: "Nguyen Van Linh, District 7",
  district: "District 7",
  city: "Ho Chi Minh City",
  isDetecting: false,
  permissionStatus: 'prompt'
};

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
