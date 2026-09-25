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
    expect(camera?.declaration.kind).toBe('manifest');
    if (camera?.declaration.kind === 'manifest') {
      expect(camera.declaration.iframeAllow?.['camera']).toEqual(["'src'"]);
      expect(camera.declaration.permissionPolicy?.['camera']).toEqual(["'self'"]);
    }
    const serialized = JSON.stringify(CAPABILITY_CATALOG);
    expect(serialized).not.toContain('webgl');
    expect(declarationCode(camera!)).toContain("'src'");
  });

  it('names the host tokens in the Default badge tooltip', () => {
    const topNav = CAPABILITY_CATALOG.find((item) => item.id === 'allow-top-navigation');
    expect(topNav?.declaration.kind).toBe('host-sandbox');
    expect(capabilityBadge(topNav!).label).toBe('Default');
    expect(capabilityBadge(topNav!).tooltip).toContain('allow-top-navigation');
  });

  it('gives host baseline capabilities no declaration block', () => {
    for (const id of ['allow-downloads', 'allow-modals']) {
      const def = CAPABILITY_CATALOG.find((item) => item.id === id);
      expect(def?.declaration.kind).toBe('host-sandbox');
      expect(declarationCode(def!)).toBeNull();
    }
  });

  it('marks manifest capabilities as opt-in', () => {
    const camera = CAPABILITY_CATALOG.find((item) => item.id === 'camera');
    expect(capabilityBadge(camera!).label).toBe('Opt-in');
    expect(capabilityBadge(camera!).tooltip).toContain('sp-ui-plugin.json');
  });

  it('keeps the copyable fragment as JSON', () => {
    for (const def of CAPABILITY_CATALOG) {
      const code = declarationCode(def);

      if (def.declaration.kind === 'manifest') {
        expect(code).toContain("'src'");
        expect(code).toContain("'self'");
        expect(code).toMatch(/^\/\/ sp-ui-plugin\.json\n/);
        const json = code!.replace(/^\/\/[^\n]*\n/, '');
        expect(() => JSON.parse(json)).not.toThrow();
      } else {
        expect(code).toBeNull();
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
    expect(newTab?.declaration.kind).toBe('host-sandbox');
    if (newTab?.declaration.kind === 'host-sandbox') {
      expect(newTab.declaration.sandboxTokens).toEqual([
        'allow-popups',
        'allow-popups-to-escape-sandbox',
      ]);
    }
  });

  it('declares both clipboard keys on one card', () => {
    const clipboard = CAPABILITY_CATALOG.find((item) => item.id === 'clipboard');
    expect(clipboard?.title).toBe('Use the clipboard');
    expect(clipboard?.declaration.kind).toBe('manifest');
    if (clipboard?.declaration.kind === 'manifest') {
      expect(Object.keys(clipboard.declaration.permissionPolicy ?? {})).toEqual([
        'clipboard-write',
        'clipboard-read',
      ]);
    }
  });

  it('declares gyroscope, accelerometer, and magnetometer on one card', () => {
    const sensors = CAPABILITY_CATALOG.find((item) => item.id === 'device-sensors');
    expect(sensors?.title).toBe('Read device sensors');
    expect(sensors?.declaration.kind).toBe('manifest');
    if (sensors?.declaration.kind === 'manifest') {
      expect(Object.keys(sensors.declaration.permissionPolicy ?? {})).toEqual([
        'gyroscope',
        'accelerometer',
        'magnetometer',
      ]);
    }
  });
});
