import { describe, it, expect } from 'vitest';
import { calculateHeadingDifference } from '../src/utils/geo.js';
import {
  locationUpdateSchema,
  locationModeSchema,
  hazardsAreaSchema,
} from '../src/modules/locations/location.validation.js';

describe('Heading Difference (Smallest Angular Distance)', () => {
  it('correctly handles wrap-around across North (359 deg to 1 deg = 2 deg)', () => {
    expect(calculateHeadingDifference(359, 1)).toBe(2);
    expect(calculateHeadingDifference(1, 359)).toBe(2);
  });

  it('correctly handles wrap-around across North (10 deg to 350 deg = 20 deg)', () => {
    expect(calculateHeadingDifference(10, 350)).toBe(20);
    expect(calculateHeadingDifference(350, 10)).toBe(20);
  });

  it('calculates standard differences within the same quadrant', () => {
    expect(calculateHeadingDifference(45, 90)).toBe(45);
    expect(calculateHeadingDifference(90, 45)).toBe(45);
    expect(calculateHeadingDifference(180, 180)).toBe(0);
    expect(calculateHeadingDifference(0, 180)).toBe(180);
  });
});

describe('Location Zod Validation Schemas', () => {
  describe('locationUpdateSchema', () => {
    it('accepts valid location ping payloads', () => {
      const valid = {
        lat: 12.971598,
        lng: 77.594562,
        speed: 15.5,
        heading: 180,
        accuracy: 10,
        journeyId: 42,
        clientTimestamp: Date.now(),
      };
      const result = locationUpdateSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects coordinates out of range', () => {
      expect(locationUpdateSchema.safeParse({ lat: 95, lng: 77, clientTimestamp: Date.now() }).success).toBe(false);
      expect(locationUpdateSchema.safeParse({ lat: -91, lng: 77, clientTimestamp: Date.now() }).success).toBe(false);
      expect(locationUpdateSchema.safeParse({ lat: 12, lng: 185, clientTimestamp: Date.now() }).success).toBe(false);
      expect(locationUpdateSchema.safeParse({ lat: 12, lng: -185, clientTimestamp: Date.now() }).success).toBe(false);
    });

    it('rejects negative speed or accuracy', () => {
      expect(locationUpdateSchema.safeParse({ lat: 12, lng: 77, speed: -5, clientTimestamp: Date.now() }).success).toBe(false);
      expect(locationUpdateSchema.safeParse({ lat: 12, lng: 77, accuracy: -1, clientTimestamp: Date.now() }).success).toBe(false);
    });

    it('rejects heading > 360', () => {
      expect(locationUpdateSchema.safeParse({ lat: 12, lng: 77, heading: 361, clientTimestamp: Date.now() }).success).toBe(false);
    });

    it('requires positive clientTimestamp', () => {
      expect(locationUpdateSchema.safeParse({ lat: 12, lng: 77 }).success).toBe(false);
      expect(locationUpdateSchema.safeParse({ lat: 12, lng: 77, clientTimestamp: -100 }).success).toBe(false);
    });
  });

  describe('locationModeSchema', () => {
    it('accepts DRIVER, CYCLIST, WALKER', () => {
      expect(locationModeSchema.safeParse({ transportMode: 'DRIVER' }).success).toBe(true);
      expect(locationModeSchema.safeParse({ transportMode: 'CYCLIST' }).success).toBe(true);
      expect(locationModeSchema.safeParse({ transportMode: 'WALKER' }).success).toBe(true);
    });

    it('rejects unsupported modes', () => {
      expect(locationModeSchema.safeParse({ transportMode: 'BOAT' }).success).toBe(false);
      expect(locationModeSchema.safeParse({ transportMode: 'CAR' }).success).toBe(false);
    });
  });

  describe('hazardsAreaSchema', () => {
    it('accepts valid bounding boxes', () => {
      const valid = {
        minLat: 12.9,
        minLng: 77.5,
        maxLat: 13.0,
        maxLng: 77.6,
      };
      expect(hazardsAreaSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects inverted bounding boxes where min > max', () => {
      const invertedLat = {
        minLat: 13.0,
        minLng: 77.5,
        maxLat: 12.9,
        maxLng: 77.6,
      };
      expect(hazardsAreaSchema.safeParse(invertedLat).success).toBe(false);

      const invertedLng = {
        minLat: 12.9,
        minLng: 77.8,
        maxLat: 13.0,
        maxLng: 77.6,
      };
      expect(hazardsAreaSchema.safeParse(invertedLng).success).toBe(false);
    });
  });
});
