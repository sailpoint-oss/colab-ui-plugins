import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { App, showStartupOverlay, startupProgress } from './app';
import { SailpointApiService, SailpointPluginService } from '@core';
import { IdentitySearchLoader } from './globe/identity-search.loader';
import { IdentityGlobeSettingsService } from './globe/identity-globe-settings.service';
import { DEFAULT_OPERATOR_SETTINGS } from './globe/operator-settings';
import { DEFAULT_VIEW_SETTINGS } from './globe/view-settings';
import { GLOBE_TEXTURE_PATHS } from './globe/globe-textures';
import { ViewSettingsService, VIEW_SETTINGS_STORAGE_KEY } from './globe/view-settings.service';

vi.mock('globe.gl', () => ({
  default: class MockGlobe {
    constructor() {
      throw new Error('WebGL is intentionally unavailable in unit tests');
    }
  },
}));

describe('App', () => {
  const status = signal<'pending' | 'ready' | 'failed'>('pending');
  const context = signal<unknown>(null);
  const loader = {
    locations: signal<readonly any[]>([]),
    facts: signal<readonly any[]>([]),
    loadedCount: signal(0),
    totalCount: signal<number | null>(null),
    loading: signal(false),
    error: signal(''),
    start: vi.fn(),
    reset: vi.fn(),
  };

  const settingsService = {
    settings: signal(DEFAULT_OPERATOR_SETTINGS),
    configured: signal(true),
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(() => settingsService.configured.set(false)),
  };
  const listIdentityAttributes = vi.fn();
  const sailpointApi = {
    getApi: vi.fn(async () => ({ listIdentityAttributesV1: listIdentityAttributes })),
  };

  beforeEach(async () => {
    localStorage.clear();
    vi.unstubAllGlobals();
    status.set('pending');
    context.set(null);
    loader.loading.set(false);
    loader.loadedCount.set(0);
    loader.totalCount.set(null);
    loader.facts.set([]);
    loader.locations.set([]);
    loader.start.mockReset();
    settingsService.configured.set(true);
    settingsService.settings.set(DEFAULT_OPERATOR_SETTINGS);
    settingsService.save.mockReset();
    listIdentityAttributes.mockReset();
    listIdentityAttributes.mockResolvedValue({ data: [] });

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: SailpointPluginService,
          useValue: { context, status },
        },
        {
          provide: IdentitySearchLoader,
          useValue: loader,
        },
        {
          provide: IdentityGlobeSettingsService,
          useValue: settingsService,
        },
        {
          provide: SailpointApiService,
          useValue: sailpointApi,
        },
      ],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('keeps the startup card up until Search and the painted Earth are both done', () => {
    expect(showStartupOverlay(true, false, false)).toBe(true);
    expect(showStartupOverlay(false, true, false)).toBe(true);
    expect(showStartupOverlay(true, true, true)).toBe(true);
    expect(showStartupOverlay(false, true, true)).toBe(false);
    expect(showStartupOverlay(false, false, false)).toBe(false);
  });

  it('keeps startup progress moving forward from a 5 percent floor', () => {
    const none = startupProgress(0, 8, 0, null);
    const imagesDone = startupProgress(8, 8, 0, null);
    const identitiesHalfway = startupProgress(8, 8, 1000, 2000);
    const done = startupProgress(8, 8, 2000, 2000);

    expect(none).toBeCloseTo(0.05);
    expect(imagesDone).toBeGreaterThan(none);
    expect(identitiesHalfway).toBeGreaterThan(imagesDone);
    expect(done).toBeCloseTo(1);
  });

  it('shows connection progress while the handshake is pending', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Identity Globe');
    expect(compiled.textContent).toContain('Connecting to SailPoint');
  });

  it('blocks the globe and Search when the handshake fails', () => {
    status.set('failed');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-globe-viewer')).toBeNull();
    expect(compiled.textContent).toContain('?spPluginDev=identity-globe');
    expect(loader.start).not.toHaveBeenCalled();
  });

  it('loads bundled assets and starts Search after a ready handshake', async () => {
    status.set('ready');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob()),
          json: () =>
            Promise.resolve(
              url.endsWith('globe-visual-config.json')
                ? {}
                : {
                    cities: [
                      {
                        id: '4671654',
                        displayName: 'Austin',
                        cityNorm: 'austin',
                        admin1CodeNorm: 'tx',
                        countryNorm: 'united states',
                        countryCode: 'US',
                        lat: 30.2672,
                        lng: -97.7431,
                      },
                    ],
                  },
            ),
        }),
      ),
    );
    loader.start.mockResolvedValue(undefined);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await vi.waitFor(() => expect(loader.start).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(2 + GLOBE_TEXTURE_PATHS.length);
    for (const path of GLOBE_TEXTURE_PATHS) {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path));
    }
  });

  it('starts Search before the textures finish', async () => {
    status.set('ready');
    let releaseTextures = (): void => undefined;
    const texturesHeld = new Promise<void>((resolve) => {
      releaseTextures = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          blob: () =>
            GLOBE_TEXTURE_PATHS.some((path) => String(url).includes(path))
              ? texturesHeld.then(() => new Blob())
              : Promise.resolve(new Blob()),
          json: () =>
            Promise.resolve(
              String(url).endsWith('globe-visual-config.json')
                ? {}
                : {
                    cities: [
                      {
                        id: '4671654',
                        displayName: 'Austin',
                        cityNorm: 'austin',
                        admin1CodeNorm: 'tx',
                        countryNorm: 'united states',
                        countryCode: 'US',
                        lat: 30.2672,
                        lng: -97.7431,
                      },
                    ],
                  },
            ),
        }),
      ),
    );
    loader.start.mockResolvedValue(undefined);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await vi.waitFor(() => expect(loader.start).toHaveBeenCalledTimes(1));
    expect(fixture.nativeElement.querySelector('app-globe-viewer')).toBeNull();

    releaseTextures();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-globe-viewer')).toBeTruthy();
    });
  });

  it('saves the defaults and loads when the tenant has every default attribute', async () => {
    status.set('ready');
    settingsService.configured.set(false);
    listIdentityAttributes.mockResolvedValue({
      data: [
        { name: 'city', displayName: 'City' },
        { name: 'department', displayName: 'Department' },
        { name: 'country', displayName: 'Countries' },
        { name: 'title', displayName: 'Job Title' },
      ],
    });
    loader.start.mockResolvedValue(undefined);
    stubAssets();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await vi.waitFor(() => expect(loader.start).toHaveBeenCalledTimes(1));
    expect(settingsService.save).toHaveBeenCalledWith({
      schemaVersion: 1,
      locationAttribute: 'city',
      breakdownAttribute: 'department',
      facets: [
        { selectionKey: 'country', attribute: 'country', label: 'Countries', omitUnknown: true },
        { selectionKey: 'department', attribute: 'department', label: 'Department', omitUnknown: false },
        { selectionKey: 'title', attribute: 'title', label: 'Job Title', omitUnknown: false },
      ],
    });
    expect(fixture.nativeElement.querySelector('app-operator-settings-panel')).toBeNull();
  });

  it('Reset forgets settings and reruns first-run setup without reloading the frame', async () => {
    status.set('ready');
    loader.start.mockResolvedValue(undefined);
    stubAssets();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loader.start).toHaveBeenCalledTimes(1));

    listIdentityAttributes.mockResolvedValue({
      data: [{ name: 'city', displayName: 'City' }],
    });
    const viewSettings = TestBed.inject(ViewSettingsService);
    viewSettings.patch({ rotate: false, arcs: false, clouds: true, dayNight: true, moon: true });
    await fixture.componentInstance['onSettingsCleared']();
    fixture.detectChanges();

    expect(settingsService.clear).toHaveBeenCalled();
    expect(viewSettings.settings()).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(loader.reset).toHaveBeenCalled();
    expect(loader.start).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('app-operator-settings-panel')).toBeTruthy();
  });

  it('shows settings panel on first run and blocks Search until saved', async () => {
    status.set('ready');
    settingsService.configured.set(false);
    listIdentityAttributes.mockResolvedValue({
      data: [{ name: 'city', displayName: 'City' }],
    });
    loader.start.mockResolvedValue(undefined);
    stubAssets();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-operator-settings-panel')).toBeTruthy();
    });

    const compiled = fixture.nativeElement as HTMLElement;
    expect(loader.start).not.toHaveBeenCalled();

    // Simulate save
    settingsService.configured.set(true);
    fixture.componentInstance['onSettingsSaved']();
    fixture.detectChanges();

    expect(compiled.querySelector('app-operator-settings-panel')).toBeNull();
    expect(loader.start).toHaveBeenCalledTimes(1);
  });

  it('blurs the globe and hides facet chrome until Search finishes', async () => {
    status.set('ready');
    loader.loading.set(true);
    loader.loadedCount.set(250);
    loader.totalCount.set(2000);
    loader.start.mockResolvedValue(undefined);
    stubAssets();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loader.start).toHaveBeenCalled());
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.globe-canvas--blurred')).toBeTruthy();
    expect(compiled.querySelector('.title-panel')).toBeNull();
    expect(compiled.querySelector('p.progress')).toBeNull();
    expect(compiled.querySelector('.view-toggle')).toBeNull();
    expect(compiled.querySelector('.facet-trigger')).toBeNull();
    expect(compiled.querySelector('app-facet-drawer')).toBeNull();
    expect(compiled.querySelector('#load-title')?.textContent).toContain(
      'Identity Globe loading...',
    );
    expect(compiled.textContent).toContain('Navigate your identities around the globe');
    const bar = compiled.querySelector('.load-panel progress') as HTMLProgressElement;
    expect(bar).toBeTruthy();
    expect(bar.max).toBe(1000);
    expect(bar.value).toBe(
      Math.round(startupProgress(GLOBE_TEXTURE_PATHS.length, GLOBE_TEXTURE_PATHS.length, 250, 2000) * 1000),
    );

    loader.loading.set(false);
    fixture.detectChanges();
    expect(compiled.querySelector('.load-panel')).toBeNull();
    expect(compiled.querySelector('.title-panel')).toBeTruthy();
    expect(compiled.querySelector('.globe-title')?.textContent).toBe('Identity Globe');
    expect(compiled.querySelector('p.progress')).toBeTruthy();
    expect(compiled.querySelector('.hud-stack .view-toggles')).toBeTruthy();
    const hudChildren = [...compiled.querySelectorAll('.hud-stack > *')];
    expect(hudChildren.map((child) => child.tagName)).toEqual(['P', 'APP-VIEW-TOGGLES']);
    expect(
      [...compiled.querySelectorAll('.view-toggle')].map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(['true', 'true', 'false', 'false', 'false']);
    expect(compiled.querySelector('.facet-trigger')).toBeTruthy();
  });

  it('hides Filters when no filter facets are configured', async () => {
    status.set('ready');
    settingsService.settings.set({ ...DEFAULT_OPERATOR_SETTINGS, facets: [] });
    loader.start.mockResolvedValue(undefined);
    stubAssets();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.title-panel')).toBeTruthy());

    const labels = [...fixture.nativeElement.querySelectorAll('.facet-trigger')].map(
      (button: HTMLButtonElement) => button.textContent?.trim(),
    );
    expect(labels.join(' ')).not.toContain('Filters');
    expect(labels.join(' ')).toContain('Settings');
  });

  it('opens the facet drawer with counts and clears a selected filter', async () => {
    status.set('ready');
    loader.locations.set([
      {
        key: '4671654',
        displayName: 'Austin',
        lat: 30.2672,
        lng: -97.7431,
        countryCode: 'US',
        count: 1,
        departments: { Engineering: 1 },
        rawLocations: ['Austin, TX, USA'],
      },
    ]);
    loader.facts.set([
      {
        locationKey: '4671654',
        rawLocation: 'Austin, TX, USA',
        breakdown: 'Engineering',
        facets: {
          countries: 'USA',
          departments: 'Engineering',
          titles: 'Software Engineer',
        },
        countryCode: 'US',
      },
    ]);
    loader.start.mockResolvedValue(undefined);
    stubAssets();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.facet-trigger')).toBeTruthy());

    (fixture.nativeElement.querySelector('.facet-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    // The settings button is still there, so .facet-trigger will not be null.
    // We should check that the filters button is gone, or just check that the drawer is open.
    expect(fixture.nativeElement.querySelector('app-facet-drawer')?.textContent).toContain(
      'Engineering',
    );

    (fixture.nativeElement.querySelector('.icon-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-facet-drawer')).toBeNull();
    expect(fixture.nativeElement.querySelector('.facet-trigger')).toBeTruthy();

    (fixture.nativeElement.querySelector('.facet-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('.globe-canvas')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-facet-drawer')).toBeTruthy();

    const checkbox = fixture.nativeElement.querySelector(
      'app-facet-drawer input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();
    const clear = fixture.nativeElement.querySelector('.clear-button') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    clear.click();
    fixture.detectChanges();
    expect(checkbox.checked).toBe(false);
  });
});

function stubAssets(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
        json: () =>
          Promise.resolve(
            url.endsWith('globe-visual-config.json')
              ? {}
              : {
                  cities: [
                    {
                      id: '4671654',
                      displayName: 'Austin',
                      cityNorm: 'austin',
                      admin1CodeNorm: 'tx',
                      countryNorm: 'united states',
                      countryCode: 'US',
                      lat: 30.2672,
                      lng: -97.7431,
                    },
                  ],
                },
          ),
      }),
    ),
  );
}
