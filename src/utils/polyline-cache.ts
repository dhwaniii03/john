import {
  parseRouteCoordinates,
  isPointOnRoute,
  type LocationCoordinates,
} from './geo.js';

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CachedPolyline {
  journeyId: number;
  coordinates: LocationCoordinates[];
  bbox: BoundingBox;
  rawPolyline: string;
}

/**
 * In-memory LRU Cache for decoded journey polyline routes.
 * Eliminates repeated polyline decoding on the event loop and provides
 * fast bounding-box rejection prior to computing cross-track segment projections.
 */
export class PolylineCache {
  private cache = new Map<number, CachedPolyline>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Calculate bounding box for a set of coordinates.
   */
  private calculateBoundingBox(coordinates: LocationCoordinates[]): BoundingBox {
    if (coordinates.length === 0) {
      return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
    }

    let minLat = coordinates[0].latitude;
    let maxLat = coordinates[0].latitude;
    let minLng = coordinates[0].longitude;
    let maxLng = coordinates[0].longitude;

    for (let i = 1; i < coordinates.length; i++) {
      const pt = coordinates[i];
      if (pt.latitude < minLat) minLat = pt.latitude;
      if (pt.latitude > maxLat) maxLat = pt.latitude;
      if (pt.longitude < minLng) minLng = pt.longitude;
      if (pt.longitude > maxLng) maxLng = pt.longitude;
    }

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Retrieve or decode route polyline for a journey.
   */
  getOrCreate(journeyId: number, rawPolyline: string): CachedPolyline {
    const existing = this.cache.get(journeyId);
    if (existing && existing.rawPolyline === rawPolyline) {
      // Re-insert to maintain LRU access order
      this.cache.delete(journeyId);
      this.cache.set(journeyId, existing);
      return existing;
    }

    // Decode once
    const coordinates = parseRouteCoordinates(rawPolyline);
    const bbox = this.calculateBoundingBox(coordinates);

    const entry: CachedPolyline = {
      journeyId,
      coordinates,
      bbox,
      rawPolyline,
    };

    // LRU eviction if full
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(journeyId, entry);
    return entry;
  }

  /**
   * Check if a location coordinate is on the journey route.
   * Utilizes an expanded bounding-box pre-filter before executing segment calculations.
   */
  isPointOnRoute(
    point: LocationCoordinates,
    journeyId: number,
    rawPolyline: string,
    thresholdKm = 0.15
  ): boolean {
    const cached = this.getOrCreate(journeyId, rawPolyline);
    if (cached.coordinates.length === 0) {
      return false;
    }

    // Convert threshold km to approximate degrees with 50% safety margin
    // 1 deg latitude ~ 111 km
    const bufferDeg = (thresholdKm / 111.32) * 1.5;

    // Fast bounding box pre-filter
    if (
      point.latitude < cached.bbox.minLat - bufferDeg ||
      point.latitude > cached.bbox.maxLat + bufferDeg ||
      point.longitude < cached.bbox.minLng - bufferDeg ||
      point.longitude > cached.bbox.maxLng + bufferDeg
    ) {
      return false;
    }

    // Point is inside the bounding box buffer -> perform cross-track segment check
    return isPointOnRoute(point, cached.coordinates, thresholdKm);
  }

  /**
   * Evict a journey from cache (e.g. when journey ends or is cancelled).
   */
  evict(journeyId: number): void {
    this.cache.delete(journeyId);
  }

  /**
   * Clear entire polyline cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Current number of cached journeys.
   */
  size(): number {
    return this.cache.size;
  }
}

export const polylineCache = new PolylineCache();
