export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Decode a Google encoded polyline string to an array of coordinates.
 */
export const decodePolyline = (encoded: string): LocationCoordinates[] => {
  if (!encoded) return [];

  const poly: LocationCoordinates[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      if (index >= len) return poly;

      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      if (index >= len) return poly;

      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return poly;
};

/**
 * Parses route coordinates from either a Google encoded polyline or a JSON coordinates array.
 */
export const parseRouteCoordinates = (
  polylineOrJson: string | null | undefined
): LocationCoordinates[] => {
  if (!polylineOrJson || typeof polylineOrJson !== 'string') {
    return [];
  }

  const trimmed = polylineOrJson.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (pt) =>
              pt &&
              typeof pt.latitude === 'number' &&
              typeof pt.longitude === 'number'
          )
          .map((pt) => ({ latitude: pt.latitude, longitude: pt.longitude }));
      }
    } catch {
      // Fallback to polyline decoder if JSON parsing fails
    }
  }

  return decodePolyline(trimmed);
};

/**
 * Calculate approximate distance in kilometers between two coordinates using Haversine formula.
 */
export const calculateDistanceKm = (
  coord1: LocationCoordinates,
  coord2: LocationCoordinates
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.latitude * Math.PI) / 180) *
      Math.cos((coord2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate the approximate distance in kilometers from a point to a polyline segment.
 */
export const distancePointToSegmentKm = (
  point: LocationCoordinates,
  segmentStart: LocationCoordinates,
  segmentEnd: LocationCoordinates
): number => {
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos((point.latitude * Math.PI) / 180);

  const startX = (segmentStart.longitude - point.longitude) * lonScale;
  const startY = (segmentStart.latitude - point.latitude) * latScale;
  const endX = (segmentEnd.longitude - point.longitude) * lonScale;
  const endY = (segmentEnd.latitude - point.latitude) * latScale;

  const dx = endX - startX;
  const dy = endY - startY;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared === 0) {
    return Math.sqrt(startX * startX + startY * startY);
  }

  const projection = -(startX * dx + startY * dy) / segmentLengthSquared;
  const clampedProjection = Math.max(0, Math.min(1, projection));

  const closestX = startX + clampedProjection * dx;
  const closestY = startY + clampedProjection * dy;

  return Math.sqrt(closestX * closestX + closestY * closestY);
};

/**
 * Check whether a point coordinate lies within thresholdKm (default 0.15 km = 150m) of a route polyline.
 */
export const isPointOnRoute = (
  point: LocationCoordinates,
  routeCoordinates: LocationCoordinates[],
  thresholdKm = 0.04 // Calibrated to 40m corridor to eliminate false matches on parallel roads
): boolean => {
  if (!routeCoordinates || routeCoordinates.length === 0) {
    return false;
  }

  if (routeCoordinates.length === 1) {
    return calculateDistanceKm(point, routeCoordinates[0]) <= thresholdKm;
  }

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segDist = distancePointToSegmentKm(
      point,
      routeCoordinates[i],
      routeCoordinates[i + 1]
    );

    if (segDist <= thresholdKm) {
      return true;
    }
  }

  return false;
};

/**
 * Check whether a point coordinate lies on an encoded polyline or JSON coordinate string.
 */
export const isPointOnEncodedRoute = (
  point: LocationCoordinates,
  polylineOrJson: string | null | undefined,
  thresholdKm = 0.04
): boolean => {
  const coords = parseRouteCoordinates(polylineOrJson);
  if (coords.length === 0) {
    return false;
  }
  return isPointOnRoute(point, coords, thresholdKm);
};

/**
 * Calculate the smallest angular difference in degrees between two compass headings.
 * Correctly handles wrap-around across north (e.g. 359° to 1° is 2°).
 */
export const calculateHeadingDifference = (heading1: number, heading2: number): number => {
  const diff = Math.abs(heading1 - heading2) % 360;
  return diff > 180 ? 360 - diff : diff;
};
