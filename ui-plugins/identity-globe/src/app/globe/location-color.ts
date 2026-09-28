/**
 * Identity-count fill ramp for location markers (FR-20).
 *
 * globe.gl gives each label a single flat color, so "gradient" here means a
 * ramp *across* cities rather than a gradient painted within one marker.
 *
 * Real tenant data is heavily skewed — in the demo set 169 of 195 cities hold
 * three or fewer identities while the largest holds 500. Linear and sqrt
 * easing both crush that long tail onto one end stop, so the default easing is
 * logarithmic to spend most of the ramp where most of the cities actually are.
 *
 * Ramp direction is data, not code: `locationFillStops` is ordered from the
 * smallest location to the largest, so reversing the array swaps the ramp.
 */

import type { LocationAggregate } from './models';

/** Smallest and largest identity counts currently on the globe. */
export interface LocationCountRange {
  readonly min: number;
  readonly max: number;
}

/** How identity counts are distributed across the ramp. */
export type LocationFillEasing = 'log' | 'sqrt' | 'linear';

interface LocationRampColors {
  readonly locationFill: string;
  readonly locationFillStops: readonly string[];
  readonly locationFillEasing: LocationFillEasing;
}

const EMPTY_RANGE: LocationCountRange = { min: 0, max: 0 };

/**
 * Derive the ramp domain from the aggregated locations. Recomputed on every
 * Search page so the ramp keeps stretching as counts grow (FR-3).
 */
export function locationCountRange(
  locations: readonly LocationAggregate[],
): LocationCountRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const { count } of locations) {
    const safe = safeCount(count);
    if (safe < min) {
      min = safe;
    }
    if (safe > max) {
      max = safe;
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : EMPTY_RANGE;
}

/** Pick the fill for one location from the configured ramp. */
export function locationFillColor(
  count: number,
  range: LocationCountRange,
  colors: LocationRampColors,
): string {
  const stops = colors.locationFillStops
    .map(parseHex)
    .filter((stop): stop is [number, number, number] => stop !== null);

  if (stops.length !== colors.locationFillStops.length || stops.length === 0) {
    return colors.locationFill;
  }

  const position = rampPosition(count, range, colors.locationFillEasing);
  if (stops.length === 1) {
    return toHex(stops[0]);
  }

  const scaled = position * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  return toHex(mix(stops[index], stops[index + 1], scaled - index));
}

/**
 * Eased 0..1 position of `count` within `range`, where 0 is the smallest
 * location and 1 the largest. Returns 1 when every location is the same size.
 */
export function rampPosition(
  count: number,
  range: LocationCountRange,
  easing: LocationFillEasing = 'log',
): number {
  const ease = EASINGS[easing] ?? EASINGS.log;
  const min = ease(safeCount(range.min));
  const max = ease(safeCount(range.max));
  if (max <= min) {
    return 1;
  }

  const position = (ease(safeCount(count)) - min) / (max - min);
  return Math.min(1, Math.max(0, position));
}

const EASINGS: Record<LocationFillEasing, (count: number) => number> = {
  // log1p keeps count 0 at zero and stays finite for the unknown bucket.
  log: (count) => Math.log1p(count),
  sqrt: Math.sqrt,
  linear: (count) => count,
};

function safeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function mix(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  position: number,
): [number, number, number] {
  return [
    Math.round(from[0] + (to[0] - from[0]) * position),
    Math.round(from[1] + (to[1] - from[1]) * position),
    Math.round(from[2] + (to[2] - from[2]) * position),
  ];
}

function parseHex(value: string): [number, number, number] | null {
  const digits = value.startsWith('#') ? value.slice(1) : value;
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;

  if (expanded.length !== 6 || !/^[0-9a-f]{6}$/i.test(expanded)) {
    return null;
  }

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function toHex(channels: readonly [number, number, number]): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
