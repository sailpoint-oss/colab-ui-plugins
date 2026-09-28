import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';

import { IdentityAttributesApi } from '@sailpoint/api-client/identity_attributes/api';

import { SailpointApiService, SailpointPluginService } from '@core';

import { GlobeViewer } from './globe/globe-viewer';
import { ViewToggles } from './globe/view-toggles';
import { ViewSettingsService } from './globe/view-settings.service';
import {
  FacetDrawer,
  type FacetToggle,
} from './globe/facet-drawer';
import { OperatorSettingsPanel } from './globe/operator-settings-panel';
import { IdentityGlobeSettingsService } from './globe/identity-globe-settings.service';
import {
  aggregateFilteredFacts,
  buildFacetOptions,
  EMPTY_FACET_SELECTION,
  filterFacts,
} from './globe/facet-filter';
import { IdentitySearchLoader } from './globe/identity-search.loader';
import { preloadGlobeTextures, GLOBE_TEXTURE_PATHS } from './globe/globe-textures';
import { parseGazetteer } from './globe/location-matcher';
import type { FacetSelection } from './globe/models';
import {
  identityAttributeChoices,
  settingsForDefaultAttributes,
} from './globe/operator-settings';
import {
  parseGlobeVisualConfig,
  type GlobeVisualConfig,
} from './globe/visual-config';

@Component({
  selector: 'app-root',
  imports: [FacetDrawer, GlobeViewer, OperatorSettingsPanel, ViewToggles],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly plugin = inject(SailpointPluginService);
  private readonly sailpointApi = inject(SailpointApiService);
  private readonly loader = inject(IdentitySearchLoader);
  private readonly settingsService = inject(IdentityGlobeSettingsService);
  private readonly viewSettings = inject(ViewSettingsService);
  private readonly settingsPanel = viewChild(OperatorSettingsPanel);
  private readonly globeViewer = viewChild(GlobeViewer);
  private initialized = false;
  private cities: any = null;

  protected readonly context = this.plugin.context;
  protected readonly status = this.plugin.status;
  protected readonly visualConfig = signal<GlobeVisualConfig | null>(null);
  protected readonly loading = this.loader.loading;
  /** Search is still paging, or the globe is mounted and Earth has not painted yet. */
  protected readonly startupOverlay = computed(() =>
    showStartupOverlay(
      this.loading(),
      this.globeViewer() != null,
      this.globeViewer()?.sceneReady() ?? false,
    ),
  );
  protected readonly drawerOpen = signal(false);
  protected readonly settingsOpen = signal(false);
  protected readonly hasFilterFacets = computed(
    () => this.settingsService.settings().facets.length > 0,
  );
  protected readonly selection = signal<FacetSelection>(EMPTY_FACET_SELECTION);
  protected readonly filteredFacts = computed(() =>
    filterFacts(this.loader.facts(), this.selection()),
  );
  protected readonly locations = computed(() =>
    aggregateFilteredFacts(this.filteredFacts(), this.loader.locations()),
  );
  protected readonly facetOptions = computed(() =>
    buildFacetOptions(this.loader.facts(), this.selection(), this.settingsService.settings()),
  );
  protected readonly loadError = computed(
    () => this.assetError() || this.loader.error(),
  );
  protected readonly loadHeading = 'Identity Globe loading...';
  protected readonly productBlurb = 'Navigate your identities around the globe.';
  protected readonly texturesLoaded = signal(0);
  protected readonly texturesTotal = GLOBE_TEXTURE_PATHS.length;
  protected readonly title = 'Identity Globe';
  protected readonly pageRoute = computed(() => this.context()?.page.route ?? null);
  protected readonly progressLabel = computed(() => {
    const loaded = this.loader.loadedCount();
    const total = this.loader.totalCount();
    const hasFilters = Object.values(this.selection()).some((values) => values?.length > 0);
    if (!this.loading() && hasFilters) {
      return `${this.filteredFacts().length.toLocaleString()} of ${loaded.toLocaleString()} identities`;
    }
    if (total !== null) {
      return `${loaded.toLocaleString()} of ${total.toLocaleString()} identities loaded`;
    }
    if (this.loader.loading()) {
      return `${loaded.toLocaleString()} identities loaded`;
    }
    return `${loaded.toLocaleString()} identities`;
  });
  /** Image preload, then identity search, on one status line. */
  protected readonly loadStatus = computed(() => {
    if (this.texturesLoaded() < this.texturesTotal) {
      return `${this.texturesLoaded()} of ${this.texturesTotal} images loaded`;
    }
    return this.progressLabel();
  });
  protected readonly loadBar = computed(() => {
    const fraction = startupProgress(
      this.texturesLoaded(),
      this.texturesTotal,
      this.loader.loadedCount(),
      this.loader.totalCount(),
    );
    return { value: Math.round(fraction * 1000), max: 1000 };
  });

  private readonly assetError = signal('');

  protected toggleFacet(change: FacetToggle): void {
    this.selection.update((selection) => ({
      ...selection,
      [change.group]: updateSelection(selection[change.group] || [], change.value, change.checked),
    }));
  }

  protected clearFilters(): void {
    this.selection.set(EMPTY_FACET_SELECTION);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected onEscape(): void {
    if (this.settingsOpen()) {
      if (this.settingsService.configured()) {
        this.settingsPanel()?.requestClose();
      }
      return;
    }
    if (this.drawerOpen()) {
      this.closeDrawer();
    }
  }

  protected onSettingsSaved(): void {
    this.settingsOpen.set(false);
    this.selection.set(EMPTY_FACET_SELECTION);
    if (!this.hasFilterFacets()) {
      this.drawerOpen.set(false);
    }
    if (this.cities) {
      void this.loader.start(this.cities, this.settingsService.settings());
    }
  }

  /** Forget saved settings and start over as if the plugin had just opened. */
  protected async onSettingsCleared(): Promise<void> {
    this.settingsService.clear();
    this.viewSettings.clear();
    this.settingsOpen.set(false);
    this.drawerOpen.set(false);
    this.selection.set(EMPTY_FACET_SELECTION);
    this.loader.reset();
    if (this.cities) {
      await this.startWithSettings();
    }
  }

  constructor() {
    effect(() => {
      if (this.status() === 'ready' && !this.initialized) {
        this.initialized = true;
        void this.initialize();
      }
    });
  }

  private async initialize(): Promise<void> {
    const texturesPromise = preloadGlobeTextures(
      (path) => this.assetUrl(path),
      (loaded) => this.texturesLoaded.set(loaded),
    );
    try {
      const [configResponse, gazetteerResponse] = await Promise.all([
        fetch(this.assetUrl('assets/globe/globe-visual-config.json')),
        fetch(this.assetUrl('assets/geo/cities.json')),
      ]);
      if (!configResponse.ok || !gazetteerResponse.ok) {
        throw new Error('Required Identity Globe assets could not be loaded.');
      }

      const configResult = parseGlobeVisualConfig(await configResponse.json());
      if (!configResult.ok) {
        throw new Error('The bundled visual configuration is invalid.');
      }
      this.cities = parseGazetteer(await gazetteerResponse.json());
      // Search only needs the city list. Let it page while the images finish.
      const searchPromise = this.startWithSettings();
      await texturesPromise;
      this.visualConfig.set(configResult.config);
      await searchPromise;
    } catch (error) {
      void texturesPromise.catch(() => undefined);
      this.assetError.set(
        error instanceof Error
          ? error.message
          : 'Identity Globe could not start because its assets are invalid.',
      );
    }
  }

  /** Load with saved settings, auto-configure from tenant defaults, or ask for settings. */
  private async startWithSettings(): Promise<void> {
    if (!this.settingsService.configured()) {
      const defaults = await this.defaultSettingsIfPresent();
      if (!defaults) {
        this.settingsOpen.set(true);
        return;
      }
      this.settingsService.save(defaults);
    }
    await this.loader.start(this.cities, this.settingsService.settings());
  }

  private async defaultSettingsIfPresent() {
    try {
      const api = await this.sailpointApi.getApi(IdentityAttributesApi);
      const response = await api.listIdentityAttributesV1({ includeSystem: true });
      return settingsForDefaultAttributes(identityAttributeChoices(response.data ?? []));
    } catch {
      return null;
    }
  }

  private assetUrl(path: string): string {
    return new URL(path, document.baseURI).toString();
  }
}

/**
 * The startup card stays until Search finishes and, once the globe is mounted,
 * until its Earth image has painted. A finished Search must not uncover a black canvas.
 */
export function showStartupOverlay(
  searchLoading: boolean,
  globeMounted: boolean,
  sceneReady: boolean,
): boolean {
  return searchLoading || (globeMounted && !sceneReady);
}

/** The bar opens a little full, so the first paint is not an empty track. */
const PROGRESS_FLOOR = 0.05;
/** Of the distance after that floor, image loading uses this share. Identities use the rest. */
const IMAGE_PROGRESS_SHARE = 0.25;

/**
 * One 0–1 position for image preload and identity search. Images only move
 * the first slice, so the bar continues forward when identity counts begin.
 */
export function startupProgress(
  texturesLoaded: number,
  texturesTotal: number,
  identitiesLoaded: number,
  identitiesTotal: number | null,
): number {
  const imageFraction = texturesTotal > 0 ? Math.min(1, texturesLoaded / texturesTotal) : 1;
  const identityFraction =
    identitiesTotal === null
      ? 0
      : identitiesTotal === 0
        ? 1
        : Math.min(1, identitiesLoaded / identitiesTotal);
  const work =
    imageFraction * IMAGE_PROGRESS_SHARE + identityFraction * (1 - IMAGE_PROGRESS_SHARE);
  return PROGRESS_FLOOR + (1 - PROGRESS_FLOOR) * work;
}

function updateSelection(
  values: readonly string[],
  value: string,
  checked: boolean,
): readonly string[] {
  const next = new Set(values);
  if (checked) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return [...next].sort();
}
