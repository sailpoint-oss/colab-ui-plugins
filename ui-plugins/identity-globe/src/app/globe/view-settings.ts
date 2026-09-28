/** Display toggles for the globe. Separate from operator Search settings. */

export interface ViewSettings {
  /** Slow auto-rotate. Turned off by a drag, zoom, or city click. */
  readonly rotate: boolean;
  /** Random arcs between cities. */
  readonly arcs: boolean;
  /** Translucent cloud shell drifting over the earth. */
  readonly clouds: boolean;
  /** Day and night textures split by the current subsolar point. */
  readonly dayNight: boolean;
  /** Lunar surface and landing sites instead of the Earth. */
  readonly moon: boolean;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  rotate: true,
  arcs: true,
  clouds: false,
  dayNight: false,
  moon: false,
};

const FLAGS = ['rotate', 'arcs', 'clouds', 'dayNight', 'moon'] as const;

/**
 * Accept a stored object. Missing or non-boolean flags fall back to the
 * default so a newer toggle does not wipe an older save. Anything that is not
 * an object is rejected.
 */
export function parseViewSettings(raw: unknown): ViewSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const settings: Record<(typeof FLAGS)[number], boolean> = { ...DEFAULT_VIEW_SETTINGS };
  for (const flag of FLAGS) {
    const value = record[flag];
    settings[flag] = typeof value === 'boolean' ? value : DEFAULT_VIEW_SETTINGS[flag];
  }
  return settings;
}
