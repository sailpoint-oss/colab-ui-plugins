import { CAPABILITY_CATALOG, capabilityBadge, declarationCode } from './capability-catalog';

describe('CAPABILITY_CATALOG', () => {
  const ids = CAPABILITY_CATALOG.map((item) => item.id);

  it('contains every required capability id', () => {
    expect(ids).toEqual([
      'allow-top-navigation',
      'open-link-new-tab',
      'allow-downloads',
      'allow-modals',
      'clipboard',
      'geolocation',
      'device-sensors',
      'fullscreen',
      'microphone',
      'camera',
    ]);
  });

  it('uses iframeAllow src for camera and never mentions webgl', () => {
    const camera = CAPABILITY_CATALOG.find((item) => item.id === 'camera');
    expect(camera?.declaration.iframeAllow?.['camera']).toEqual(["'src'"]);
    expect(camera?.declaration.permissionPolicy?.['camera']).toEqual(["'self'"]);
    const serialized = JSON.stringify(CAPABILITY_CATALOG);
    expect(serialized).not.toContain('webgl');
    expect(declarationCode(camera!)).toContain("'src'");
  });

  it('declares iframeSandbox tokens for the sandbox capabilities', () => {
    const expected: Record<string, string[]> = {
      'allow-top-navigation': ['allow-top-navigation'],
      'open-link-new-tab': ['allow-popups', 'allow-popups-to-escape-sandbox'],
      'allow-downloads': ['allow-downloads'],
      'allow-modals': ['allow-modals'],
    };
    for (const [id, tokens] of Object.entries(expected)) {
      const def = CAPABILITY_CATALOG.find((item) => item.id === id);
      expect(def?.declaration.iframeSandbox).toEqual(tokens);
      expect(def?.declaration.iframeAllow).toBeUndefined();
      expect(def?.declaration.permissionPolicy).toBeUndefined();
    }
  });

  it('only declares tokens UMS accepts and never the renderer baseline', () => {
    const allowed = new Set([
      'allow-top-navigation',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-downloads',
      'allow-modals',
    ]);
    for (const def of CAPABILITY_CATALOG) {
      for (const token of def.declaration.iframeSandbox ?? []) {
        expect(allowed.has(token)).toBe(true);
      }
    }
  });

  it('shows the iframeSandbox fragment for a sandbox capability', () => {
    const modals = CAPABILITY_CATALOG.find((item) => item.id === 'allow-modals');
    expect(declarationCode(modals!)).toContain('"iframeSandbox"');
    expect(declarationCode(modals!)).toContain('"allow-modals"');
  });

  it('marks every capability as opt-in', () => {
    const badge = capabilityBadge();
    expect(badge.label).toBe('Opt-in');
    expect(badge.tooltip).toContain('sp-ui-plugin.json');
  });

  it('keeps the copyable fragment as JSON for every capability', () => {
    for (const def of CAPABILITY_CATALOG) {
      const code = declarationCode(def);

      expect(code).toMatch(/^\/\/ sp-ui-plugin\.json\n/);
      const json = code.replace(/^\/\/[^\n]*\n/, '');
      expect(() => JSON.parse(json)).not.toThrow();
      if (def.declaration.iframeAllow) {
        expect(code).toContain("'src'");
        expect(code).toContain("'self'");
      }
    }
  });

  it('uses customer-facing titles and combines new-tab sandbox flags', () => {
    expect(CAPABILITY_CATALOG.find((item) => item.id === 'allow-top-navigation')?.title).toBe(
      'Open a link in the same window',
    );
    expect(CAPABILITY_CATALOG.find((item) => item.id === 'geolocation')?.title).toBe(
      "Use this device's location",
    );
    const newTab = CAPABILITY_CATALOG.find((item) => item.id === 'open-link-new-tab');
    expect(newTab?.title).toBe('Open a link in a new tab');
    expect(newTab?.declaration.iframeSandbox).toEqual([
      'allow-popups',
      'allow-popups-to-escape-sandbox',
    ]);
  });

  it('declares both clipboard keys on one card', () => {
    const clipboard = CAPABILITY_CATALOG.find((item) => item.id === 'clipboard');
    expect(clipboard?.title).toBe('Use the clipboard');
    expect(Object.keys(clipboard?.declaration.permissionPolicy ?? {})).toEqual([
      'clipboard-write',
      'clipboard-read',
    ]);
  });

  it('declares gyroscope, accelerometer, and magnetometer on one card', () => {
    const sensors = CAPABILITY_CATALOG.find((item) => item.id === 'device-sensors');
    expect(sensors?.title).toBe('Read device sensors');
    expect(Object.keys(sensors?.declaration.permissionPolicy ?? {})).toEqual([
      'gyroscope',
      'accelerometer',
      'magnetometer',
    ]);
  });
});
