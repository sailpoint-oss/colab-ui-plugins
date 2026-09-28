import { rampPosition, type LocationCountRange, type LocationFillEasing } from './location-color';
import type { GlobeCameraConfig } from './visual-config';

/** Altitude of the smallest location's dot above the globe surface. */
export const MARKER_BASE_ALTITUDE = 0.012;

/** Halos sit at this fraction of their own dot's altitude, just underneath. */
export const GLOW_ALTITUDE_RATIO = 0.9;

interface MarkerAltitudeColors {
  readonly locationFillEasing: LocationFillEasing;
  readonly locationAltitudeScale: number;
}

/**
 * Dot radius and label height for a location, in degrees of arc (the unit
 * three-globe's label layer expects). Square-rooted so a 400-identity city
 * reads as larger than a 3-identity one without swamping it, then clamped so
 * the long tail stays visible and the hubs stay on-screen (FR-20).
 *
 * Shared by the dot, the label, and the glow halo so the three stay locked
 * together when the config is retuned.
 */
export function markerSize(count: number, config: GlobeCameraConfig): number {
  const scaled = Math.sqrt(Math.max(count, 0)) * config.labelSizeScale;
  return Math.max(config.labelMinSize, Math.min(config.labelMaxSize, scaled));
}

/**
 * Height of a location's dot above the globe, rising with identity count so
 * that larger cities occlude smaller neighbours instead of the depth buffer
 * picking a winner arbitrarily. Mexico City sits above Puebla rather than
 * fighting it.
 *
 * Reuses the fill ramp's easing, so stacking order matches the colour ordering
 * and the long tail of 1–3 identity cities still separates from each other.
 */
export function markerAltitude(
  count: number,
  range: LocationCountRange,
  colors: MarkerAltitudeColors,
): number {
  const position = rampPosition(count, range, colors.locationFillEasing);
  return MARKER_BASE_ALTITUDE + position * colors.locationAltitudeScale;
}
