import {
  locationCountRange,
  locationFillColor,
  rampPosition,
} from './location-color';
import type { LocationAggregate } from './models';
import { DEFAULT_GLOBE_VISUAL_CONFIG } from './visual-config';

const COLORS = DEFAULT_GLOBE_VISUAL_CONFIG.colors;
const SMALLEST_STOP = COLORS.locationFillStops[0];
const LARGEST_STOP = COLORS.locationFillStops[COLORS.locationFillStops.length - 1];

/** Sum of channels; lower means a darker color. */
function brightness(hex: string): number {
  return (
    Number.parseInt(hex.slice(1, 3), 16) +
    Number.parseInt(hex.slice(3, 5), 16) +
    Number.parseInt(hex.slice(5, 7), 16)
  );
}

function location(key: string, count: number): LocationAggregate {
  return {
    key,
    displayName: key,
    lat: 0,
    lng: 0,
    countryCode: 'US',
    count,
    breakdown: {},
  };
}

describe('locationCountRange', () => {
  it('spans the smallest and largest identity counts', () => {
    const range = locationCountRange([
      location('austin', 500),
      location('tulsa', 12),
      location('pune', 240),
    ]);

    expect(range).toEqual({ min: 12, max: 500 });
  });

  it('returns an empty range for no locations', () => {
    expect(locationCountRange([])).toEqual({ min: 0, max: 0 });
  });
});

describe('rampPosition', () => {
  it('puts the largest city at the top and the smallest at the bottom', () => {
    const range = { min: 10, max: 1000 };

    expect(rampPosition(1000, range)).toBe(1);
    expect(rampPosition(10, range)).toBe(0);
  });

  it('increases monotonically with identity count', () => {
    const range = { min: 1, max: 900 };
    const positions = [1, 25, 100, 400, 900].map((count) =>
      rampPosition(count, range),
    );

    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]).toBeGreaterThan(positions[index - 1]);
    }
  });

  it('gives the long tail of small cities more of the ramp than sqrt or linear', () => {
    // Demo tenant shape: 169 of 195 cities hold 3 or fewer identities, max 500.
    const range = { min: 1, max: 500 };
    const spread = (easing: 'log' | 'sqrt' | 'linear'): number =>
      rampPosition(3, range, easing) - rampPosition(1, range, easing);

    expect(spread('log')).toBeGreaterThan(spread('sqrt'));
    expect(spread('sqrt')).toBeGreaterThan(spread('linear'));
    expect(spread('log')).toBeGreaterThan(0.1);
  });

  it('defaults to logarithmic easing', () => {
    const range = { min: 1, max: 500 };

    expect(rampPosition(3, range)).toBe(rampPosition(3, range, 'log'));
  });

  it('gives every city full strength when all counts are equal', () => {
    expect(rampPosition(7, { min: 7, max: 7 })).toBe(1);
  });

  it('clamps counts outside the range and ignores invalid ones', () => {
    expect(rampPosition(5000, { min: 10, max: 100 })).toBe(1);
    expect(rampPosition(-4, { min: 10, max: 100 })).toBe(0);
    expect(rampPosition(Number.NaN, { min: 10, max: 100 })).toBe(0);
  });
});

describe('locationFillColor', () => {
  it('renders the largest city in the final stop', () => {
    expect(locationFillColor(500, { min: 1, max: 500 }, COLORS)).toBe(
      LARGEST_STOP,
    );
  });

  it('renders the smallest city in the first stop', () => {
    expect(locationFillColor(1, { min: 1, max: 500 }, COLORS)).toBe(
      SMALLEST_STOP,
    );
  });

  it('gets darker as the identity count grows', () => {
    const range = { min: 1, max: 500 };
    const small = brightness(locationFillColor(1, range, COLORS));
    const medium = brightness(locationFillColor(40, range, COLORS));
    const large = brightness(locationFillColor(500, range, COLORS));

    expect(medium).toBeLessThan(small);
    expect(large).toBeLessThan(medium);
  });

  it('separates the crowded low end into distinct colors', () => {
    const range = { min: 1, max: 500 };
    const tail = [1, 2, 3, 5].map((count) =>
      locationFillColor(count, range, COLORS),
    );

    expect(new Set(tail).size).toBe(tail.length);
  });

  it('passes through the middle stop for a mid-sized city', () => {
    const midway = locationFillColor(
      22,
      { min: 1, max: 500 },
      { ...COLORS, locationFillEasing: 'log' },
    );

    expect(midway).toMatch(/^#[0-9a-f]{6}$/);
    expect(brightness(midway)).toBeLessThan(brightness(SMALLEST_STOP));
    expect(brightness(midway)).toBeGreaterThan(brightness(LARGEST_STOP));
  });

  it('swaps direction when the stops are reversed', () => {
    const reversed = {
      ...COLORS,
      locationFillStops: [...COLORS.locationFillStops].reverse(),
    };

    expect(locationFillColor(500, { min: 1, max: 500 }, reversed)).toBe(
      SMALLEST_STOP,
    );
    expect(locationFillColor(1, { min: 1, max: 500 }, reversed)).toBe(
      LARGEST_STOP,
    );
  });

  it('falls back to the brand fill when a stop is not a hex color', () => {
    const result = locationFillColor(
      10,
      { min: 1, max: 500 },
      { ...COLORS, locationFillStops: ['#cc27b0', 'fuchsia'] },
    );

    expect(result).toBe(COLORS.locationFill);
  });

  it('supports shorthand hex stops', () => {
    const result = locationFillColor(
      1,
      { min: 1, max: 500 },
      { ...COLORS, locationFillStops: ['#303', '#fff'] },
    );

    expect(result).toBe('#330033');
  });
});
