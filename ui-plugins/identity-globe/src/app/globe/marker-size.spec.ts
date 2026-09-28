import { MARKER_BASE_ALTITUDE, markerAltitude, markerSize } from './marker-size';
import { DEFAULT_GLOBE_VISUAL_CONFIG } from './visual-config';

const CONFIG = DEFAULT_GLOBE_VISUAL_CONFIG.globe;
const COLORS = DEFAULT_GLOBE_VISUAL_CONFIG.colors;

describe('markerSize', () => {
  it('grows with identity count', () => {
    expect(markerSize(400, CONFIG)).toBeGreaterThan(markerSize(40, CONFIG));
    expect(markerSize(40, CONFIG)).toBeGreaterThan(markerSize(3, CONFIG));
  });

  it('clamps to the configured range', () => {
    expect(markerSize(0, CONFIG)).toBe(CONFIG.labelMinSize);
    expect(markerSize(1_000_000, CONFIG)).toBe(CONFIG.labelMaxSize);
  });

  it('keeps the smallest cities at the floor rather than vanishing', () => {
    expect(markerSize(1, CONFIG)).toBe(CONFIG.labelMinSize);
  });

  it('treats a negative count as empty instead of returning NaN', () => {
    expect(markerSize(-5, CONFIG)).toBe(CONFIG.labelMinSize);
  });
});

describe('markerAltitude', () => {
  // The Mexico cluster that overlapped: Mexico City must stack above Puebla.
  const MEXICO = { min: 1, max: 400 };

  it('lifts larger cities above smaller ones so they occlude cleanly', () => {
    expect(markerAltitude(240, MEXICO, COLORS)).toBeGreaterThan(
      markerAltitude(8, MEXICO, COLORS),
    );
    expect(markerAltitude(8, MEXICO, COLORS)).toBeGreaterThan(
      markerAltitude(1, MEXICO, COLORS),
    );
  });

  it('floors the smallest location at the base altitude', () => {
    expect(markerAltitude(1, MEXICO, COLORS)).toBe(MARKER_BASE_ALTITUDE);
  });

  it('caps the largest location at base plus the configured scale', () => {
    expect(markerAltitude(400, MEXICO, COLORS)).toBeCloseTo(
      MARKER_BASE_ALTITUDE + COLORS.locationAltitudeScale,
    );
  });

  it('separates the long tail rather than crushing it onto the floor', () => {
    const gap = markerAltitude(3, MEXICO, COLORS) - markerAltitude(1, MEXICO, COLORS);
    const headroom = markerAltitude(400, MEXICO, COLORS) - markerAltitude(1, MEXICO, COLORS);

    expect(gap / headroom).toBeGreaterThan(0.05);
  });
});
