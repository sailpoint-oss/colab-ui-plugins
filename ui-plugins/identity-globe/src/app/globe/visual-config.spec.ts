import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_GLOBE_VISUAL_CONFIG,
  GLOBE_VISUAL_CONFIG_URL,
  parseGlobeVisualConfig,
  parseGlobeVisualConfigText,
} from './visual-config';

function readShippedConfig(): string {
  return readFileSync(join(process.cwd(), 'public', GLOBE_VISUAL_CONFIG_URL), 'utf-8');
}

describe('parseGlobeVisualConfig', () => {
  it('accepts the shipped asset and exposes the documented defaults', () => {
    const result = parseGlobeVisualConfigText(readShippedConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.config).toEqual(DEFAULT_GLOBE_VISUAL_CONFIG);
    expect(result.config.colors.locationFill).toBe('#cc27b0');
    expect(result.config.colors.locationFillStops).toEqual([
      '#d650bf',
      '#cc27b0',
      '#ad2196',
    ]);
    expect(result.config.colors.locationFillEasing).toBe('log');
    expect(result.config.colors.arcColorStops.length).toBeGreaterThan(1);
    expect(result.config.arcs.sameCountryAllowed).toBe(false);
    expect(result.config.arcs.weightByIdentityCount).toBe(true);
  });

  it('honors overridden colors and spawn interval', () => {
    const result = parseGlobeVisualConfig({
      colors: { locationFill: '#123456', departmentPalette: ['#abcdef'] },
      arcs: { spawnIntervalMs: 250 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.config.colors.locationFill).toBe('#123456');
    expect(result.config.colors.departmentPalette).toEqual(['#abcdef']);
    expect(result.config.arcs.spawnIntervalMs).toBe(250);
    expect(result.config.colors.title).toBe('#ffffff');
    expect(result.config.globe.autoRotateSpeed).toBe(0.35);
  });

  it('defaults the opening camera just north of the equator at the US east coast', () => {
    const result = parseGlobeVisualConfig({});

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.config.globe.initialLng).toBe(-74);
    expect(result.config.globe.initialLat).toBe(15);
    expect(result.config.globe.initialAltitude).toBe(2.5);
  });

  it('rejects opening coordinates outside the globe', () => {
    const result = parseGlobeVisualConfig({ globe: { initialLat: 120, initialLng: -400 } });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors).toEqual([
      'globe.initialLat must be between -90 and 90',
      'globe.initialLng must be between -180 and 180',
    ]);
  });

  it('reads the glow knobs and defaults the rest', () => {
    const result = parseGlobeVisualConfig({ glow: { enabled: false, sizeScale: 6 } });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.config.glow).toEqual({
      enabled: false,
      color: '#e9a2dd',
      sizeScale: 6,
      opacity: 0.55,
    });
  });

  it('rejects out-of-range glow values', () => {
    const result = parseGlobeVisualConfig({ glow: { sizeScale: 40, enabled: 'yes' } });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors).toEqual([
      'glow.enabled must be a boolean',
      'glow.sizeScale must be between 1 and 20',
    ]);
  });

  it('ignores designer token siblings and other unknown keys', () => {
    const result = parseGlobeVisualConfig({
      colors: { tokens: { locationFill: '--color-p4' } },
      unexpected: 'ignored',
    });

    expect(result).toEqual({ ok: true, config: DEFAULT_GLOBE_VISUAL_CONFIG });
  });

  it('reports malformed JSON without echoing the payload', () => {
    const result = parseGlobeVisualConfigText('{ "colors": ');

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors).toEqual(['globe visual config is not valid JSON']);
  });

  it('rejects a config that is not an object', () => {
    for (const raw of [null, undefined, 42, 'config', []]) {
      const result = parseGlobeVisualConfig(raw);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects same-country arcs and unweighted endpoints', () => {
    const result = parseGlobeVisualConfig({
      arcs: { sameCountryAllowed: true, weightByIdentityCount: false },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors).toContain('arcs.sameCountryAllowed must be false');
    expect(result.errors).toContain('arcs.weightByIdentityCount must be true');
  });

  it('rejects an unknown fill easing', () => {
    const result = parseGlobeVisualConfig({
      colors: { locationFillEasing: 'exponential' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors).toContain(
      'colors.locationFillEasing must be one of log, sqrt, linear',
    );
  });

  it('reports the field path for invalid colors, ranges, and types', () => {
    const result = parseGlobeVisualConfig({
      colors: { locationFill: 'fuchsia', arcColorStops: ['#00b5e2'], departmentPalette: ['not-a-color'] },
      arcs: { maxConcurrent: 1.5 },
      globe: 'nope',
      glow: { opacity: 4 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors).toEqual([
      'globe must be an object',
      'colors.locationFill must be a hex color such as #cc27b0',
      'colors.arcColorStops must list at least 2 hex color(s)',
      'colors.departmentPalette must contain only hex colors such as #00b5e2',
      'arcs.maxConcurrent must be an integer',
      'glow.opacity must be between 0 and 1',
    ]);
  });
});
