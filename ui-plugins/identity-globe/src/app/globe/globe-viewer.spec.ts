import { TestBed } from '@angular/core/testing';
import { Color, Texture, TextureLoader, Vector3, type Mesh, type MeshBasicMaterial } from 'three';

import { GlobeViewer } from './globe-viewer';
import { ViewSettingsService, VIEW_SETTINGS_STORAGE_KEY } from './view-settings.service';
import { locationCountRange, locationFillColor } from './location-color';
import { MOON_EMPTY_MARKER_COLOR } from './moon-landing-sites';
import { GLOW_ALTITUDE_RATIO, markerAltitude, markerSize } from './marker-size';
import type { LocationAggregate } from './models';
import { DEFAULT_GLOBE_VISUAL_CONFIG } from './visual-config';

const globeMock = vi.hoisted(() => {
  const callbacks: {
    labelClick?: (location: LocationAggregate, event: MouseEvent) => void;
    labelHover?: (location: LocationAggregate | null) => void;
    globeClick?: () => void;
  } = {};
  const controls = { autoRotate: false, autoRotateSpeed: 0 };
  const fluent = [
    'backgroundColor',
    'backgroundImageUrl',
    'globeImageUrl',
    'bumpImageUrl',
    'labelLat',
    'labelLng',
    'labelText',
    'labelColor',
    'labelSize',
    'labelDotRadius',
    'labelDotOrientation',
    'labelAltitude',
    'labelResolution',
    'labelLabel',
    'labelsTransitionDuration',
    'pointerEventsFilter',
    'arcStartLat',
    'arcStartLng',
    'arcEndLat',
    'arcEndLng',
    'arcColor',
    'arcDashLength',
    'arcDashGap',
    'arcDashAnimateTime',
    'arcsTransitionDuration',
    'labelsData',
    'arcsData',
    'customThreeObject',
    'customThreeObjectUpdate',
    'customLayerData',
    'showAtmosphere',
    'showGraticules',
    'width',
    'height',
  ];

  const instance: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of fluent) {
    instance[method] = vi.fn(() => instance);
  }
  instance['controls'] = vi.fn(() => controls);
  instance['getGlobeRadius'] = vi.fn(() => 100);
  instance['getCoords'] = vi.fn(() => ({ x: 1, y: 2, z: 3 }));
  instance['scene'] = vi.fn(() => ({ add: vi.fn(), remove: vi.fn() }));
  instance['_destructor'] = vi.fn();
  instance['pointOfView'] = vi.fn((pov?: unknown) =>
    pov === undefined ? { lat: 12, lng: 34, altitude: 2.5 } : instance,
  );
  instance['globeMaterial'] = vi.fn((material?: unknown) => {
    if (material === undefined) {
      return { name: 'day' };
    }
    return instance;
  });
  instance['onLabelClick'] = vi.fn((callback) => {
    callbacks.labelClick = callback;
    return instance;
  });
  instance['onLabelHover'] = vi.fn((callback) => {
    callbacks.labelHover = callback;
    return instance;
  });
  instance['onGlobeClick'] = vi.fn((callback) => {
    callbacks.globeClick = callback;
    return instance;
  });
  instance['onGlobeReady'] = vi.fn((callback: () => void) => {
    callback();
    return instance;
  });

  return { callbacks, controls, instance };
});

vi.mock('globe.gl', () => ({
  default: class MockGlobe {
    constructor() {
      return globeMock.instance;
    }
  },
}));


const AUSTIN: LocationAggregate = {
  key: 'austin',
  displayName: 'Austin',
  lat: 30.2672,
  lng: -97.7431,
  countryCode: 'US',
  count: 500,
  breakdown: { Engineering: 300, Sales: 200 },
  rawLocations: ['Austin, TX, USA'],
};

const BATON_ROUGE: LocationAggregate = {
  key: 'baton-rouge',
  displayName: 'Baton Rouge',
  lat: 30.45,
  lng: -91.1543,
  countryCode: 'US',
  count: 1,
  breakdown: { People: 1 },
  rawLocations: ['Baton Rouge, LA, USA'],
};

/** jsdom has no 2D canvas, and without one the glow layer skips itself. */
const CANVAS_CONTEXT = {
  fillStyle: '' as string | CanvasGradient,
  createRadialGradient: () => ({ addColorStop: vi.fn() }),
  fillRect: vi.fn(),
};

/**
 * jsdom has no ResizeObserver. Without this the component's `observeSize()`
 * throws, the WebGL catch swallows it, and the arc spawner and glow layer
 * never run — so those paths would silently go untested.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('GlobeViewer', () => {
  let activeFixture: ReturnType<typeof TestBed.createComponent<GlobeViewer>> | undefined;

  beforeEach(async () => {
    localStorage.clear();
    globeMock.controls.autoRotate = false;
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      CANVAS_CONTEXT as unknown as CanvasRenderingContext2D,
    );
    // The globe mock is module-level, so call history leaks between tests.
    vi.clearAllMocks();
    globeMock.callbacks.labelClick = undefined;
    globeMock.callbacks.labelHover = undefined;
    globeMock.callbacks.globeClick = undefined;
    await TestBed.configureTestingModule({ imports: [GlobeViewer] }).compileComponents();
  });

  afterEach(() => {
    activeFixture?.destroy();
    activeFixture = undefined;
  });

  function createViewer(locations: readonly LocationAggregate[] = [AUSTIN]) {
    const fixture = TestBed.createComponent(GlobeViewer);
    activeFixture = fixture;
    fixture.componentRef.setInput('locations', locations);
    fixture.componentRef.setInput('config', DEFAULT_GLOBE_VISUAL_CONFIG);
    fixture.detectChanges();
    return fixture;
  }

  function selectAustin(fixture: ReturnType<typeof createViewer>): void {
    globeMock.callbacks.labelClick?.(AUSTIN, new MouseEvent('click', {
      clientX: 200,
      clientY: 200,
    }));
    fixture.detectChanges();
  }

  it('initializes without falling into the WebGL error path', async () => {
    const fixture = createViewer();
    await vi.waitFor(() => expect(globeMock.instance['labelsData']).toHaveBeenCalled());

    const viewer = fixture.componentInstance as unknown as {
      renderError: () => string;
    };
    expect(viewer.renderError()).toBe('');
  });

  it('uses bundled photoreal textures and persistent label data', async () => {
    createViewer();
    await vi.waitFor(() => expect(globeMock.instance['labelsData']).toHaveBeenCalled());

    expect(globeMock.instance['globeImageUrl']).toHaveBeenCalledWith(
      expect.stringContaining('assets/globe/earth-blue-marble.webp'),
    );
    expect(globeMock.instance['bumpImageUrl']).toHaveBeenCalledWith(
      expect.stringContaining('assets/globe/earth-topology.webp'),
    );
    expect(globeMock.instance['backgroundImageUrl']).toHaveBeenCalledWith(
      expect.stringContaining('assets/globe/night-sky.webp'),
    );
    expect(globeMock.instance['labelsData']).toHaveBeenCalledWith([AUSTIN]);
    expect(globeMock.instance['labelsTransitionDuration']).toHaveBeenLastCalledWith(0);
    const labelTooltip = globeMock.instance['labelLabel'].mock.calls.at(-1)?.[0] as
      | (() => string)
      | undefined;
    expect(labelTooltip?.()).toBe('');
  });

  it('switches to lunar landing sites while preserving Earth effect settings', async () => {
    localStorage.setItem(
      VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        rotate: true,
        arcs: true,
        clouds: false,
        dayNight: false,
        moon: true,
      }),
    );
    const textureLoad = vi
      .spyOn(TextureLoader.prototype, 'loadAsync')
      .mockImplementation(async () => new Texture());

    try {
      const fixture = createViewer();
      await vi.waitFor(() => {
        const labels = globeMock.instance['labelsData'].mock.calls.at(-1)?.[0] as
          | LocationAggregate[]
          | undefined;
        expect(labels).toHaveLength(25);
      });

      expect(globeMock.instance['labelsTransitionDuration']).toHaveBeenLastCalledWith(0);
      expect(globeMock.instance['pointOfView']).toHaveBeenLastCalledWith(
        { lat: 12.25, lng: 62.2, altitude: DEFAULT_GLOBE_VISUAL_CONFIG.globe.initialAltitude },
        0,
      );
      expect(globeMock.instance['showAtmosphere']).toHaveBeenLastCalledWith(false);
      expect(globeMock.instance['showGraticules']).toHaveBeenLastCalledWith(true);
      expect(globeMock.instance['backgroundImageUrl']).toHaveBeenLastCalledWith(
        expect.stringContaining('assets/globe/night-sky.webp'),
      );
      expect(globeMock.instance['arcsData']).toHaveBeenCalledWith([]);
      expect(TestBed.inject(ViewSettingsService).settings()).toMatchObject({
        rotate: true,
        arcs: true,
        clouds: false,
        dayNight: false,
        moon: true,
      });

      const labelsBeforeToggle = globeMock.instance['labelsData'].mock.calls.length;
      const canvas = fixture.nativeElement.querySelector('.globe-canvas') as HTMLElement;
      TestBed.inject(ViewSettingsService).patch({ clouds: true });
      fixture.detectChanges();
      TestBed.inject(ViewSettingsService).patch({ dayNight: true });
      fixture.detectChanges();
      expect(canvas.classList.contains('globe-canvas--swap')).toBe(false);
      expect(globeMock.instance['labelsData'].mock.calls.length).toBe(labelsBeforeToggle);
      expect(globeMock.instance['backgroundImageUrl']).toHaveBeenLastCalledWith(
        expect.stringContaining('assets/globe/night-sky-milky-way.webp'),
      );

      TestBed.inject(ViewSettingsService).patch({ moon: false });
      fixture.detectChanges();
      fixture.detectChanges();
      expect(canvas.classList.contains('globe-canvas--swap')).toBe(true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(canvas.classList.contains('globe-canvas--swap')).toBe(false);
        expect(globeMock.instance['backgroundImageUrl']).toHaveBeenLastCalledWith(
          expect.stringContaining('assets/globe/night-sky.webp'),
        );
      }, { timeout: 3000 });
      expect(globeMock.instance['pointOfView']).toHaveBeenCalledWith(
        {
          lat: DEFAULT_GLOBE_VISUAL_CONFIG.globe.initialLat,
          lng: DEFAULT_GLOBE_VISUAL_CONFIG.globe.initialLng,
          altitude: DEFAULT_GLOBE_VISUAL_CONFIG.globe.initialAltitude,
        },
        0,
      );
    } finally {
      textureLoad.mockRestore();
    }
  });

  it('keeps empty landings gray and paints identity landings with the Earth pink', async () => {
    localStorage.setItem(
      VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        rotate: true,
        arcs: false,
        clouds: false,
        dayNight: false,
        moon: true,
      }),
    );
    const apollo: LocationAggregate = {
      key: 'moon:apollo-17',
      displayName: 'Apollo 17',
      lat: 20.18935,
      lng: 30.76996,
      countryCode: 'ZZ',
      count: 1,
      breakdown: { 'Space Exploration': 1 },
      rawLocations: ['Apollo 17'],
    };
    const textureLoad = vi
      .spyOn(TextureLoader.prototype, 'loadAsync')
      .mockImplementation(async () => new Texture());

    try {
      createViewer([AUSTIN, apollo]);
      await vi.waitFor(() => {
        const labels = globeMock.instance['labelsData'].mock.calls.at(-1)?.[0] as
          | LocationAggregate[]
          | undefined;
        expect(labels?.some((label) => label.key === apollo.key && label.count === 1)).toBe(true);
      });

      const labels = globeMock.instance['labelsData'].mock.calls.at(-1)?.[0] as LocationAggregate[];
      const colorOf = globeMock.instance['labelColor'].mock.calls.at(-1)?.[0] as (
        point: LocationAggregate,
      ) => string;
      const occupied = labels.find((label) => label.key === apollo.key);
      const empty = labels.filter((label) => label.count === 0);
      const earthRange = locationCountRange([AUSTIN]);

      expect(occupied).toBeDefined();
      expect(empty.length).toBeGreaterThan(0);
      expect(empty.every((label) => colorOf(label) === MOON_EMPTY_MARKER_COLOR)).toBe(true);
      expect(colorOf(occupied!)).toBe(
        locationFillColor(occupied!.count, earthRange, DEFAULT_GLOBE_VISUAL_CONFIG.colors),
      );
      const sizeOf = globeMock.instance['labelSize'].mock.calls.at(-1)?.[0] as (
        point: LocationAggregate,
      ) => number;
      const dotOf = globeMock.instance['labelDotRadius'].mock.calls.at(-1)?.[0] as (
        point: LocationAggregate,
      ) => number;
      expect(new Set(empty.map(sizeOf)).size).toBe(1);
      expect(sizeOf(empty[0])).toBeCloseTo(sizeOf(occupied!) / 2);
      expect(dotOf(empty[0])).toBeCloseTo(dotOf(occupied!) / 2);
    } finally {
      textureLoad.mockRestore();
    }
  });

  it('opens on the configured coordinates rather than globe.gl 0, 0', async () => {
    createViewer();
    await vi.waitFor(() => expect(globeMock.instance['pointOfView']).toHaveBeenCalled());

    // 0, 0 is the Gulf of Guinea, which fills the first frame with Europe.
    expect(globeMock.instance['pointOfView']).toHaveBeenCalledWith(
      {
        lat: DEFAULT_GLOBE_VISUAL_CONFIG.globe.initialLat,
        lng: DEFAULT_GLOBE_VISUAL_CONFIG.globe.initialLng,
        altitude: DEFAULT_GLOBE_VISUAL_CONFIG.globe.initialAltitude,
      },
      // Instant, so the move does not fight the auto-rotate starting alongside it.
      0,
    );
  });

  it('renders a glow halo per location, scaled by count but tinted uniformly', async () => {
    createViewer([AUSTIN, BATON_ROUGE]);
    await vi.waitFor(() => expect(globeMock.instance['customLayerData']).toHaveBeenCalled());

    expect(globeMock.instance['customLayerData']).toHaveBeenCalledWith([AUSTIN, BATON_ROUGE]);

    const build = globeMock.instance['customThreeObject'].mock.calls[0][0] as (
      datum: LocationAggregate,
    ) => Mesh;
    const place = globeMock.instance['customThreeObjectUpdate'].mock.calls[0][0] as (
      object: Mesh,
      datum: LocationAggregate,
    ) => void;

    const austin = build(AUSTIN);
    const batonRouge = build(BATON_ROUGE);
    place(austin, AUSTIN);
    place(batonRouge, BATON_ROUGE);
    const austinMaterial = austin.material as MeshBasicMaterial;
    const batonRougeMaterial = batonRouge.material as MeshBasicMaterial;

    // The component's dynamic `import('three')` bypasses the mock above, so
    // compare against the real constant rather than the stubbed module.
    const { AdditiveBlending } = await vi.importActual<typeof import('three')>('three');

    expect(austin.scale.x).toBeGreaterThan(batonRouge.scale.x);
    // Additive blending makes tint brightness the halo's intensity, so every
    // halo shares one tint and size alone carries the magnitude.
    expect(austinMaterial.color.getHexString()).toBe(
      batonRougeMaterial.color.getHexString(),
    );
    expect(`#${austinMaterial.color.getHexString()}`).toBe(
      DEFAULT_GLOBE_VISUAL_CONFIG.glow.color,
    );
    expect(austinMaterial.blending).toBe(AdditiveBlending);
    expect(austinMaterial.depthWrite).toBe(false);
    expect(austinMaterial.opacity).toBe(DEFAULT_GLOBE_VISUAL_CONFIG.glow.opacity);
  });

  it('keeps halos out of pointer picking so a big halo cannot hide nearby cities', async () => {
    createViewer();
    await vi.waitFor(() => expect(globeMock.instance['pointerEventsFilter']).toHaveBeenCalled());

    const filter = globeMock.instance['pointerEventsFilter'].mock.calls[0][0] as (object: object) => boolean;
    expect(filter({ __globeObjType: 'custom' })).toBe(false);
    expect(filter({ __globeObjType: 'label' })).toBe(true);
    expect(filter({ __globeObjType: 'globe' })).toBe(true);
  });

  it('lays each halo flat on the globe under its dot', async () => {
    createViewer();
    await vi.waitFor(() => expect(globeMock.instance['customThreeObjectUpdate']).toHaveBeenCalled());

    const place = globeMock.instance['customThreeObjectUpdate'].mock.calls[0][0] as (
      object: {
        position: Record<string, number>;
        scale: { setScalar: (value: number) => void };
        lookAt: (x: number, y: number, z: number) => void;
      },
      datum: LocationAggregate,
    ) => void;

    const halo = { position: { x: 0, y: 0, z: 0 }, scale: { setScalar: vi.fn() }, lookAt: vi.fn() };
    place(halo, AUSTIN);

    // Below the 0.012 dot altitude, so the two tangent planes stay parallel and
    // never produce an intersection line across the dot.
    expect(globeMock.instance['getCoords']).toHaveBeenCalledWith(
      AUSTIN.lat,
      AUSTIN.lng,
      markerAltitude(AUSTIN.count, { min: AUSTIN.count, max: AUSTIN.count }, DEFAULT_GLOBE_VISUAL_CONFIG.colors) *
        GLOW_ALTITUDE_RATIO,
    );
    expect(halo.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(halo.lookAt).toHaveBeenCalledWith(0, 0, 0);
  });

  it('skips the glow layer when the config disables it', async () => {
    const fixture = TestBed.createComponent(GlobeViewer);
    activeFixture = fixture;
    fixture.componentRef.setInput('locations', [AUSTIN]);
    fixture.componentRef.setInput('config', {
      ...DEFAULT_GLOBE_VISUAL_CONFIG,
      glow: { ...DEFAULT_GLOBE_VISUAL_CONFIG.glow, enabled: false },
    });
    fixture.detectChanges();

    await vi.waitFor(() => expect(globeMock.instance['labelsData']).toHaveBeenCalled());
    expect(globeMock.instance['customLayerData']).not.toHaveBeenCalled();
  });

  it('dismisses the tooltip from its close button and returns focus to the globe', async () => {
    const fixture = createViewer();
    await vi.waitFor(() => expect(globeMock.callbacks.labelClick).toBeTypeOf('function'));
    selectAustin(fixture);

    const close = fixture.nativeElement.querySelector('.tooltip-close') as HTMLButtonElement;
    expect(close).toBeTruthy();
    close.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.location-tooltip')).toBeNull();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.globe-canvas'));
  });

  it('links the city and departments to the host Search page with active facets', async () => {
    const fixture = TestBed.createComponent(GlobeViewer);
    activeFixture = fixture;
    fixture.componentRef.setInput('locations', [AUSTIN]);
    fixture.componentRef.setInput('config', DEFAULT_GLOBE_VISUAL_CONFIG);
    fixture.componentRef.setInput(
      'pageRoute',
      'https://acme.identitysoon.com/ui/plugin/example',
    );
    fixture.componentRef.setInput('facetSelection', {
      countries: ['USA'],
      departments: [],
      titles: ['Senior Software Engineer'],
    });
    fixture.detectChanges();
    await vi.waitFor(() => expect(globeMock.callbacks.labelClick).toBeTypeOf('function'));
    selectAustin(fixture);

    const links = [
      ...fixture.nativeElement.querySelectorAll('.location-tooltip a'),
    ] as HTMLAnchorElement[];
    expect(links).toHaveLength(3);
    // The App Shell sandbox withholds allow-popups, but the user requested _blank.
    // Ensure the links use _blank and noopener noreferrer.
    expect(links.every((link) => link.target === '_blank')).toBe(true);
    expect(links.every((link) => link.rel === 'noopener noreferrer')).toBe(true);

    const titleQuery = new URL(links[0].href).searchParams.get('query');
    expect(titleQuery).toContain('attributes.city: "Austin, TX, USA"');
    expect(titleQuery).toContain('attributes.country: "USA"');
    expect(titleQuery).toContain('attributes.title: "Senior Software Engineer"');
    const engineeringQuery = new URL(links[1].href).searchParams.get('query');
    expect(engineeringQuery).toContain('attributes.department: "Engineering"');
  });

  it('dismisses the tooltip with Escape', async () => {
    const fixture = createViewer();
    await vi.waitFor(() => expect(globeMock.callbacks.labelClick).toBeTypeOf('function'));
    selectAustin(fixture);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.location-tooltip')).toBeNull();
  });

  it('dismisses on an outside pointer down but not inside the tooltip', async () => {
    const fixture = createViewer();
    await vi.waitFor(() => expect(globeMock.callbacks.labelClick).toBeTypeOf('function'));
    selectAustin(fixture);

    const tooltip = fixture.nativeElement.querySelector('.location-tooltip') as HTMLElement;
    tooltip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.location-tooltip')).toBeTruthy();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.location-tooltip')).toBeNull();
  });

  it('pauses rotation on drag or a city click and resumes without moving the camera', async () => {
    const fixture = createViewer();
    await vi.waitFor(() => expect(globeMock.callbacks.labelClick).toBeTypeOf('function'));

    expect(globeMock.controls.autoRotate).toBe(true);
    const povCalls = globeMock.instance['pointOfView'].mock.calls.length;

    fixture.nativeElement
      .querySelector('.globe-canvas')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(globeMock.controls.autoRotate).toBe(false);
    expect(TestBed.inject(ViewSettingsService).settings().rotate).toBe(false);

    TestBed.inject(ViewSettingsService).patch({ rotate: true });
    fixture.detectChanges();
    expect(globeMock.controls.autoRotate).toBe(true);
    expect(globeMock.instance['pointOfView']).toHaveBeenCalledTimes(povCalls);

    selectAustin(fixture);
    expect(globeMock.controls.autoRotate).toBe(false);
    expect(globeMock.instance['pointOfView']).toHaveBeenCalledTimes(povCalls);
  });

  it("animates a hovered city to 60 percent past the largest marker and the largest city's color", async () => {
    const color = new Color('#cc27b0');
    const label = {
      scale: {
        x: 1,
        y: 1,
        z: 1,
        setScalar(value: number) {
          this.x = this.y = this.z = value;
        },
      },
      children: [{ material: { color } }],
      position: new Vector3(0, 0, 0),
    };
    const range = locationCountRange([AUSTIN, BATON_ROUGE]);
    const colors = DEFAULT_GLOBE_VISUAL_CONFIG.colors;
    const restRadius = 100 * (1 + markerAltitude(BATON_ROUGE.count, range, colors));
    const topRadius = 100 * (1 + markerAltitude(AUSTIN.count, range, colors));
    label.position.set(0, 0, restRadius);
    Object.assign(BATON_ROUGE, { __threeObjLabel: label });
    createViewer([AUSTIN, BATON_ROUGE]);
    await vi.waitFor(() => expect(globeMock.callbacks.labelHover).toBeTypeOf('function'));

    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    window.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };

    try {
      globeMock.callbacks.labelHover?.(BATON_ROUGE);
      now = 300;
      while (frames.length > 0) {
        frames.shift()?.(now);
      }

      const globeConfig = DEFAULT_GLOBE_VISUAL_CONFIG.globe;
      expect(label.scale.x * markerSize(BATON_ROUGE.count, globeConfig)).toBeCloseTo(
        globeConfig.labelMaxSize * 1.6,
      );
      expect(`#${color.getHexString()}`).toBe(locationFillColor(range.max, range, colors));
      expect(label.position.length()).toBeGreaterThan(topRadius);

      globeMock.callbacks.labelHover?.(null);
      now = 600;
      while (frames.length > 0) {
        frames.shift()?.(now);
      }
      expect(label.scale.x).toBeCloseTo(1);
      expect(`#${color.getHexString()}`).toBe(locationFillColor(BATON_ROUGE.count, range, colors));
      expect(label.position.length()).toBeCloseTo(restRadius);
    } finally {
      delete (BATON_ROUGE as { __threeObjLabel?: unknown }).__threeObjLabel;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('starts rotation off when that was saved, and hides arcs when they are turned off', async () => {
    localStorage.setItem(
      VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({ rotate: false, arcs: true, clouds: false, dayNight: false }),
    );
    const fixture = createViewer([AUSTIN, { ...BATON_ROUGE, countryCode: 'FR' }]);
    await vi.waitFor(() => expect(globeMock.instance['labelsData']).toHaveBeenCalled());
    await vi.waitFor(() => expect(fixture.componentInstance.sceneReady()).toBe(true));

    expect(globeMock.controls.autoRotate).toBe(false);

    TestBed.inject(ViewSettingsService).patch({ arcs: false });
    fixture.detectChanges();
    expect(globeMock.instance['arcsData']).toHaveBeenCalledWith([]);
  });
});
