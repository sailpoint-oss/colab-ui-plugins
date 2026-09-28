/**
 * Typed parsing for `globe-visual-config.json` — the single source of visual
 * defaults for the globe (FR-22).
 *
 * Parsing never throws and never echoes tenant data: a bad asset returns field
 * paths so the shell can show a generic config error instead of mounting
 * globe.gl (EC-14).
 */

import type { LocationFillEasing } from './location-color';

/** Bundled, same-origin location of the visual config asset (NFR-S2). */
export const GLOBE_VISUAL_CONFIG_URL = 'assets/globe/globe-visual-config.json';

export interface GlobeColorConfig {
  /** Fallback location fill when a ramp stop is invalid (Horizon `amber.500`). */
  readonly locationFill: string;
  /** Highlight fill for the selected location (Horizon `amber.300`). */
  readonly locationFillLight: string;
  /**
   * Identity-count fill ramp, ordered smallest location to largest (FR-20).
   * Reversing the array swaps the ramp direction without a code change.
   */
  readonly locationFillStops: readonly string[];
  /** Distribution of counts across the ramp; `log` suits skewed tenants. */
  readonly locationFillEasing: LocationFillEasing;
  /** Multiplier turning an eased identity count into globe point altitude. */
  readonly locationAltitudeScale: number;
  /** Gradient stops travelling along each arc, cyan through blue (FR-21). */
  readonly arcColorStops: readonly string[];
  /** Title and chrome text color on the star field (FR-23). */
  readonly title: string;
  /** Department pie slice colors (FR-27). */
  readonly departmentPalette: readonly string[];
}

export interface GlobeArcConfig {
  /** Always `false`: an arc may never start and end in the same country (FR-6). */
  readonly sameCountryAllowed: false;
  /** Always `true`: endpoint probability is identity-count weighted (FR-6). */
  readonly weightByIdentityCount: true;
  readonly maxConcurrent: number;
  readonly spawnIntervalMs: number;
  readonly dashLength: number;
  readonly dashGap: number;
  readonly dashAnimateTimeMs: number;
  readonly altitudeAutoScale: boolean;
}

export interface GlobeCameraConfig {
  /** Auto-rotate speed before the first user camera change (FR-8). */
  readonly autoRotateSpeed: number;
  /**
   * Where the camera sits on the first frame. globe.gl otherwise opens at
   * 0, 0 — the Gulf of Guinea — which fills the frame with Europe and Africa.
   * Auto-rotate then carries the view westward from here.
   */
  readonly initialLat: number;
  readonly initialLng: number;
  /** Camera distance in globe radii; globe.gl's own default is 2.5. */
  readonly initialAltitude: number;
  /** Multiplier applied to sqrt(identity count) for dot and label size. */
  readonly labelSizeScale: number;
  readonly labelMinSize: number;
  readonly labelMaxSize: number;
  readonly pointResolution: number;
}

export interface GlobeGlowConfig {
  /** Draws the halo layer at all; `false` restores plain dots. */
  readonly enabled: boolean;
  /**
   * One fixed tint for every halo (Horizon `amber.200`), rather than each
   * city's own ramp color. Blending is additive, so tint brightness sets halo
   * intensity; a per-city tint would make the largest cities — which sit at the
   * dark end of the ramp — glow the faintest.
   */
  readonly color: string;
  /** Halo diameter as a multiple of the dot diameter. */
  readonly sizeScale: number;
  readonly opacity: number;
}

export interface GlobeVisualConfig {
  readonly colors: GlobeColorConfig;
  readonly arcs: GlobeArcConfig;
  readonly globe: GlobeCameraConfig;
  readonly glow: GlobeGlowConfig;
}

export type GlobeVisualConfigResult =
  | { readonly ok: true; readonly config: GlobeVisualConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Values used for any key the asset omits. Matches the shipped JSON. */
export const DEFAULT_GLOBE_VISUAL_CONFIG: GlobeVisualConfig = {
  colors: {
    locationFill: '#cc27b0',
    locationFillLight: '#d650bf',
    locationFillStops: ['#d650bf', '#cc27b0', '#ad2196'],
    locationFillEasing: 'log',
    locationAltitudeScale: 0.02,
    arcColorStops: ['#00b5e2', '#1d5ade', '#38d9f5', '#00b5e2'],
    title: '#ffffff',
    departmentPalette: ['#00b5e2', '#753bbd', '#93d500', '#26c8a1', '#0074d9', '#1d5ade'],
  },
  arcs: {
    sameCountryAllowed: false,
    weightByIdentityCount: true,
    maxConcurrent: 12,
    spawnIntervalMs: 700,
    dashLength: 0.4,
    dashGap: 0.15,
    dashAnimateTimeMs: 2000,
    altitudeAutoScale: true,
  },
  globe: {
    autoRotateSpeed: 0.35,
    // New York's meridian, lifted just off the equator so North America pulls
    // back toward the centre of the frame instead of crowding the top edge.
    initialLat: 15,
    initialLng: -74,
    initialAltitude: 2.5,
    labelSizeScale: 0.06,
    labelMinSize: 0.3,
    labelMaxSize: 1.4,
    pointResolution: 2,
  },
  glow: {
    enabled: true,
    color: '#e9a2dd',
    sizeScale: 4,
    opacity: 0.55,
  },
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const EASINGS: readonly LocationFillEasing[] = ['log', 'sqrt', 'linear'];

const EMPTY_SECTION: Record<string, unknown> = Object.freeze(Object.create(null));

interface NumberRule {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

/** Parse raw asset text. Malformed JSON is reported, never thrown (EC-14). */
export function parseGlobeVisualConfigText(text: string): GlobeVisualConfigResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ['globe visual config is not valid JSON'] };
  }

  return parseGlobeVisualConfig(raw);
}

/**
 * Validate a parsed visual config object, filling documented defaults for
 * omitted keys. Unknown keys (such as designer `tokens` siblings) are ignored.
 */
export function parseGlobeVisualConfig(raw: unknown): GlobeVisualConfigResult {
  const errors: string[] = [];
  const root = asRecord(raw);
  if (!root) {
    return { ok: false, errors: ['globe visual config must be a JSON object'] };
  }

  const defaults = DEFAULT_GLOBE_VISUAL_CONFIG;
  const colors = readSection(root, 'colors', errors);
  const arcs = readSection(root, 'arcs', errors);
  const globe = readSection(root, 'globe', errors);
  const glow = readSection(root, 'glow', errors);

  const config: GlobeVisualConfig = {
    colors: {
      locationFill: readColor(colors, 'locationFill', 'colors.locationFill', defaults.colors.locationFill, errors),
      locationFillLight: readColor(
        colors,
        'locationFillLight',
        'colors.locationFillLight',
        defaults.colors.locationFillLight,
        errors,
      ),
      locationFillStops: readColorList(
        colors,
        'locationFillStops',
        'colors.locationFillStops',
        defaults.colors.locationFillStops,
        2,
        errors,
      ),
      locationFillEasing: readEasing(
        colors,
        'locationFillEasing',
        'colors.locationFillEasing',
        defaults.colors.locationFillEasing,
        errors,
      ),
      locationAltitudeScale: readNumber(
        colors,
        'locationAltitudeScale',
        'colors.locationAltitudeScale',
        defaults.colors.locationAltitudeScale,
        { min: 0, max: 1 },
        errors,
      ),
      arcColorStops: readColorList(
        colors,
        'arcColorStops',
        'colors.arcColorStops',
        defaults.colors.arcColorStops,
        2,
        errors,
      ),
      title: readColor(colors, 'title', 'colors.title', defaults.colors.title, errors),
      departmentPalette: readColorList(
        colors,
        'departmentPalette',
        'colors.departmentPalette',
        defaults.colors.departmentPalette,
        1,
        errors,
      ),
    },
    arcs: {
      sameCountryAllowed: readRequiredLiteral(arcs, 'sameCountryAllowed', 'arcs.sameCountryAllowed', false, errors),
      weightByIdentityCount: readRequiredLiteral(
        arcs,
        'weightByIdentityCount',
        'arcs.weightByIdentityCount',
        true,
        errors,
      ),
      maxConcurrent: readNumber(
        arcs,
        'maxConcurrent',
        'arcs.maxConcurrent',
        defaults.arcs.maxConcurrent,
        { min: 1, max: 500, integer: true },
        errors,
      ),
      spawnIntervalMs: readNumber(
        arcs,
        'spawnIntervalMs',
        'arcs.spawnIntervalMs',
        defaults.arcs.spawnIntervalMs,
        { min: 16, max: 60_000 },
        errors,
      ),
      dashLength: readNumber(arcs, 'dashLength', 'arcs.dashLength', defaults.arcs.dashLength, { min: 0, max: 1 }, errors),
      dashGap: readNumber(arcs, 'dashGap', 'arcs.dashGap', defaults.arcs.dashGap, { min: 0, max: 1 }, errors),
      dashAnimateTimeMs: readNumber(
        arcs,
        'dashAnimateTimeMs',
        'arcs.dashAnimateTimeMs',
        defaults.arcs.dashAnimateTimeMs,
        { min: 16, max: 60_000 },
        errors,
      ),
      altitudeAutoScale: readBoolean(
        arcs,
        'altitudeAutoScale',
        'arcs.altitudeAutoScale',
        defaults.arcs.altitudeAutoScale,
        errors,
      ),
    },
    globe: {
      autoRotateSpeed: readNumber(
        globe,
        'autoRotateSpeed',
        'globe.autoRotateSpeed',
        defaults.globe.autoRotateSpeed,
        { min: 0, max: 10 },
        errors,
      ),
      initialLat: readNumber(
        globe,
        'initialLat',
        'globe.initialLat',
        defaults.globe.initialLat,
        { min: -90, max: 90 },
        errors,
      ),
      initialLng: readNumber(
        globe,
        'initialLng',
        'globe.initialLng',
        defaults.globe.initialLng,
        { min: -180, max: 180 },
        errors,
      ),
      initialAltitude: readNumber(
        globe,
        'initialAltitude',
        'globe.initialAltitude',
        defaults.globe.initialAltitude,
        { min: 0.5, max: 10 },
        errors,
      ),
      labelSizeScale: readNumber(
        globe,
        'labelSizeScale',
        'globe.labelSizeScale',
        defaults.globe.labelSizeScale,
        { min: 0.001, max: 1 },
        errors,
      ),
      labelMinSize: readNumber(
        globe,
        'labelMinSize',
        'globe.labelMinSize',
        defaults.globe.labelMinSize,
        { min: 0.01, max: 5 },
        errors,
      ),
      labelMaxSize: readNumber(
        globe,
        'labelMaxSize',
        'globe.labelMaxSize',
        defaults.globe.labelMaxSize,
        { min: 0.01, max: 5 },
        errors,
      ),
      pointResolution: readNumber(
        globe,
        'pointResolution',
        'globe.pointResolution',
        defaults.globe.pointResolution,
        { min: 1, max: 12, integer: true },
        errors,
      ),
    },
    glow: {
      enabled: readBoolean(glow, 'enabled', 'glow.enabled', defaults.glow.enabled, errors),
      color: readColor(glow, 'color', 'glow.color', defaults.glow.color, errors),
      sizeScale: readNumber(
        glow,
        'sizeScale',
        'glow.sizeScale',
        defaults.glow.sizeScale,
        { min: 1, max: 20 },
        errors,
      ),
      opacity: readNumber(glow, 'opacity', 'glow.opacity', defaults.glow.opacity, { min: 0, max: 1 }, errors),
    },
  };

  return errors.length > 0 ? { ok: false, errors } : { ok: true, config };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readSection(root: Record<string, unknown>, key: string, errors: string[]): Record<string, unknown> {
  const value = root[key];
  if (value === undefined) {
    return EMPTY_SECTION;
  }

  const section = asRecord(value);
  if (!section) {
    errors.push(`${key} must be an object`);
    return EMPTY_SECTION;
  }

  return section;
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: number,
  rule: NumberRule,
  errors: string[],
): number {
  const value = source[key];
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`);
    return fallback;
  }

  if (value < rule.min || value > rule.max) {
    errors.push(`${path} must be between ${rule.min} and ${rule.max}`);
    return fallback;
  }

  if (rule.integer && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer`);
    return fallback;
  }

  return value;
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: boolean,
  errors: string[],
): boolean {
  const value = source[key];
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    errors.push(`${path} must be a boolean`);
    return fallback;
  }

  return value;
}

/**
 * Read a boolean that the spec pins to one value. A different value is a config
 * error rather than a silently widened behavior (FR-6).
 */
function readRequiredLiteral<T extends boolean>(
  source: Record<string, unknown>,
  key: string,
  path: string,
  expected: T,
  errors: string[],
): T {
  const value = source[key];
  if (value !== undefined && value !== expected) {
    errors.push(`${path} must be ${String(expected)}`);
  }

  return expected;
}

function readColor(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: string,
  errors: string[],
): string {
  const value = source[key];
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    errors.push(`${path} must be a hex color such as #cc27b0`);
    return fallback;
  }

  return value;
}

function readEasing(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: LocationFillEasing,
  errors: string[],
): LocationFillEasing {
  const value = source[key];
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !EASINGS.includes(value as LocationFillEasing)) {
    errors.push(`${path} must be one of ${EASINGS.join(', ')}`);
    return fallback;
  }

  return value as LocationFillEasing;
}

function readColorList(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: readonly string[],
  minLength: number,
  errors: string[],
): readonly string[] {
  const value = source[key];
  if (value === undefined) {
    return fallback;
  }

  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of hex colors`);
    return fallback;
  }

  if (value.length < minLength) {
    errors.push(`${path} must list at least ${minLength} hex color(s)`);
    return fallback;
  }

  const invalid = value.some((entry) => typeof entry !== 'string' || !HEX_COLOR.test(entry));
  if (invalid) {
    errors.push(`${path} must contain only hex colors such as #00b5e2`);
    return fallback;
  }

  return value as readonly string[];
}
