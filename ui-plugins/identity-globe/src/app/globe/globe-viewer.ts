import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { GlobeInstance } from 'globe.gl';
import {
  Color,
  type BufferGeometry,
  type CanvasTexture,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type MeshLambertMaterial,
  type MeshPhongMaterial,
  type Texture,
} from 'three';

import {
  UNKNOWN_LOCATION_KEY,
  type FacetSelection,
  type LocationAggregate,
} from './models';
import type { GlobeVisualConfig } from './visual-config';
import { sampleArcPair, sampleSiteArcPair } from './arc-sampler';
import { globeLabelText } from './label-text';
import {
  LABEL_OUTLINE_COLOR,
  MOON_LANDMARK_OUTLINE_Z,
  disposeLabelOutline,
  setLabelOutlineVisible,
  syncLabelOutline,
} from './label-outline';
import {
  CLOUDS_TEXTURE,
  EARTH_DAY_TEXTURE,
  EARTH_NIGHT_TEXTURE,
  EARTH_TOPOLOGY_TEXTURE,
  MOON_BUMP_TEXTURE,
  MOON_SURFACE_TEXTURE,
  NIGHT_SKY_MILKY_WAY_TEXTURE,
  NIGHT_SKY_TEXTURE,
} from './globe-textures';
import { GLOW_ALTITUDE_RATIO, markerAltitude, markerSize } from './marker-size';
import {
  MOON_EMPTY_MARKER_COLOR,
  MOON_LANDING_SITES,
  earthLocations,
  isEmptyMoonLanding,
  isMoonLocation,
  moonLocations,
  type MoonLocation,
} from './moon-landing-sites';
import {
  locationCountRange,
  locationFillColor,
  type LocationCountRange,
} from './location-color';
import { buildIdentitySearchQuery, buildIdentitySearchUrl } from './search-link';
import { IdentityGlobeSettingsService } from './identity-globe-settings.service';
import { createDayNightMaterial, type DayNightMaterial } from './day-night';
import { sunPosition, moonSunPosition } from './sun-position';
import { ViewSettingsService } from './view-settings.service';
import type { ViewSettings } from './view-settings';

/** Edge of the halo texture, in pixels. */
const GLOW_TEXTURE_SIZE = 128;

/** Segments in the unit halo disc; shared by every marker. */
const GLOW_SEGMENTS = 32;

/** Every hovered city grows to this multiple of the largest marker size, whatever its own size. */
const HOVER_MAX_SIZE_RATIO = 1.6;

/** Grow and shrink duration. globe.gl does not tween label size, so we do. */
const HOVER_MS = 220;

/** A hovered marker rises this far above the tallest marker, so its enlarged label stays on top. */
const HOVER_LIFT_ALTITUDE = 0.006;

/** About one second of frames to catch globe.gl's deferred label rebuild. */
const OUTLINE_SYNC_FRAMES = 60;

interface HoverOrigin {
  scale: number;
  color: Color;
  haloScale: number;
  haloColor: Color | null;
  radius: number | null;
  haloRadius: number | null;
}

type BoundLocation = LocationAggregate & {
  __threeObjLabel?: Object3D;
  __threeObjCustom?: Object3D;
};

/** Cloud shell sits just above the earth, in globe radii. */
const CLOUDS_ALTITUDE = 0.004;

/** Cloud drift, degrees per frame. Negative moves them westward. */
const CLOUDS_DEGREES_PER_FRAME = -0.0015;

/** Landing labels follow the globe.gl moon example. */
const MOON_LABEL_SIZE = 1.7;
/** Night side of the Moon stays faintly visible, like earthshine, instead of matching the black sky. */
const MOON_NIGHT_SCALE = 0.05;
/** Matches the blur transition in globe-viewer.scss. */
const SWAP_RAMP_MS = 200;
/** Cached swaps finish in a frame; hold the blur long enough to read as a transition. */
const SWAP_MIN_MS = 700;
const MOON_DOT_RADIUS = 0.4;
/** Landings without identities are background landmarks, drawn at half size. */
const MOON_EMPTY_SCALE = 0.5;
const MOON_LABEL_ALTITUDE = 0.012;
const MOON_TOP_LABELS = new Set([
  'Apollo 12',
  'Luna 2',
  'Luna 20',
  'Luna 21',
  'Luna 24',
  'LCROSS Probe',
]);

interface ArcDatum {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

interface DepartmentEntry {
  name: string;
  count: number;
  color: string;
}

@Component({
  selector: 'app-globe-viewer',
  templateUrl: './globe-viewer.html',
  styleUrl: './globe-viewer.scss',
})
export class GlobeViewer implements AfterViewInit {
  readonly locations = input.required<readonly LocationAggregate[]>();
  readonly config = input.required<GlobeVisualConfig>();
  readonly blurred = input(false);
  readonly pageRoute = input<string | null>(null);
  readonly facetSelection = input<FacetSelection>({
    countries: [],
    departments: [],
    titles: [],
  });

  @ViewChild('container', { static: true })
  private readonly container!: ElementRef<HTMLElement>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly settingsService = inject(IdentityGlobeSettingsService);
  private readonly viewSettings = inject(ViewSettingsService);
  private globe: GlobeInstance | null = null;
  private readonly globeReady = signal(false);
  /** True after the Earth image is on the globe and the browser has painted it. */
  readonly sceneReady = signal(false);
  private revealToken = 0;
  private resizeObserver: ResizeObserver | null = null;
  private arcTimer: ReturnType<typeof setInterval> | null = null;
  private arcs: ArcDatum[] = [];
  private renderedLocations: readonly LocationAggregate[] = [];
  private countRange: LocationCountRange = { min: 0, max: 0 };
  private glowTexture: CanvasTexture | null = null;
  private glowGeometry: BufferGeometry | null = null;
  private glowMaterials: MeshBasicMaterial[] = [];
  private clouds: Mesh | null = null;
  private cloudsPromise: Promise<Mesh | null> | null = null;
  private cloudsRequest = 0;
  private dayNight: DayNightMaterial | null = null;
  private dayNightTextures: Texture[] = [];
  private dayNightPromise: Promise<DayNightMaterial | null> | null = null;
  private dayNightRequest = 0;
  private dayNightOn = false;
  private moonDayNight: DayNightMaterial | null = null;
  private moonDayNightTextures: Texture[] = [];
  private moonDayNightPromise: Promise<DayNightMaterial | null> | null = null;
  private moonDayNightRequest = 0;
  private moonDayNightOn = false;
  private moonMaterial: MeshPhongMaterial | null = null;
  private moonTextures: Texture[] = [];
  private moonPromise: Promise<MeshPhongMaterial | null> | null = null;
  private moonRequest = 0;
  private moonOn = false;
  private defaultGlobeMaterial: Material | null = null;
  private skyUrl = '';
  private shownView: ViewSettings | null = null;
  private swapToken = 0;
  /** Blur while a large texture is uploading. */
  protected readonly swapping = signal(false);
  private effectsFrame = 0;
  private hoverFrame = 0;
  private hoverStarted = 0;
  private readonly hoverOrigin = new Map<string, HoverOrigin>();
  private hoveredKey: string | null = null;
  private outlineMaterial: MeshLambertMaterial | null = null;
  private readonly outlinedLabels = new Set<Object3D>();
  private outlineFrame = 0;

  protected readonly selected = signal<LocationAggregate | null>(null);
  protected readonly tooltipPosition = signal({ x: 0, y: 0 });
  protected readonly renderError = signal('');

  constructor() {
    effect(() => {
      const locations = this.locations();
      const selected = this.selected();
      if (selected) {
        this.selected.set(locations.find(({ key }) => key === selected.key) ?? null);
      }
      if (this.globe) {
        this.renderLocations(locations);
      }
    });

    effect(() => {
      const settings = this.viewSettings.settings();
      if (!this.globeReady()) {
        return;
      }
      this.applyView(settings);
    });

    this.destroyRef.onDestroy(() => this.destroyGlobe());
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      const { default: Globe } = await import('globe.gl');
      const { DoubleSide, MeshLambertMaterial } = await import('three');
      this.outlineMaterial = new MeshLambertMaterial({
        color: LABEL_OUTLINE_COLOR,
        side: DoubleSide,
        // Day/night is rendered in a later material pass. Writing depth keeps
        // that globe pass from painting over a hovered label's rim.
        depthWrite: true,
      });
      this.globe = new Globe(this.container.nativeElement, {
        animateIn: false,
      });
      this.configureGlobe();
      this.renderLocations(this.locations());
      this.observeSize();
      void this.addGlowLayer();
    } catch {
      this.sceneReady.set(true);
      this.renderError.set(
        'WebGL is unavailable. This plugin needs WebGL in the browser and in the App Shell.',
      );
    }
  }

  /**
   * A drag, wheel zoom, or city click pauses rotation. The camera stays where
   * the user left it; turning Rotate back on only resumes the spin.
   */
  protected stopAutoRotate(): void {
    if (this.globe) {
      this.globe.controls().autoRotate = false;
    }
    this.viewSettings.patch({ rotate: false });
  }

  protected dismissTooltip(returnFocus = false): void {
    if (!this.selected()) {
      return;
    }
    this.selected.set(null);
    if (returnFocus) {
      this.container.nativeElement.focus({ preventScroll: true });
    }
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (
      this.selected() &&
      target instanceof Node &&
      !this.container.nativeElement.parentElement?.querySelector('.location-tooltip')?.contains(target)
    ) {
      this.dismissTooltip();
    }
  }

  protected breakdownEntries(
    location: LocationAggregate,
  ): DepartmentEntry[] {
    const palette = this.config().colors.departmentPalette;
    return Object.entries(location.breakdown)
      .sort((left, right) => right[1] - left[1])
      .map(([name, count], index) => ({
        name,
        count,
        color: palette[index % palette.length],
      }));
  }

  protected breakdownSummary(location: LocationAggregate): string {
    const details = this.breakdownEntries(location)
      .map(({ name, count }) => `${name}: ${count}`)
      .join(', ');
    return `Breakdown distribution for ${location.displayName}. ${details}`;
  }

  protected breakdownPie(location: LocationAggregate): string {
    let cursor = 0;
    const stops = this.breakdownEntries(location).map(
      ({ count, color }) => {
        const start = cursor;
        cursor += (count / location.count) * 100;
        return `${color} ${start}% ${cursor}%`;
      },
    );
    return `conic-gradient(${stops.join(', ')})`;
  }

  protected locationSearchUrl(location: LocationAggregate): string | null {
    if (location.key === UNKNOWN_LOCATION_KEY || location.count === 0) {
      return null;
    }
    return this.searchUrl(location, {});
  }

  protected moonLanding(location: LocationAggregate): MoonLocation['landingSite'] | null {
    return isMoonLocation(location) ? location.landingSite : null;
  }

  protected landingDate(date: string): string {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));
  }

  protected breakdownSearchUrl(
    location: LocationAggregate,
    breakdownValue: string,
  ): string | null {
    return this.searchUrl(location, { [this.settingsService.settings().breakdownAttribute]: [breakdownValue] });
  }

  private configureGlobe(): void {
    if (!this.globe) {
      return;
    }

    const config = this.config();
    this.skyUrl = this.assetUrl(NIGHT_SKY_TEXTURE);
    // Fires after the wrapping image has loaded. The library defers that one
    // frame so the texture can upload; we wait one more paint before revealing.
    (this.globe as GlobeInstance & { onGlobeReady(callback: () => void): void }).onGlobeReady(() => {
      void this.revealAfterFirstPaint();
    });
    this.globe
      .backgroundColor('#000000')
      .backgroundImageUrl(this.skyUrl)
      .globeImageUrl(this.assetUrl(EARTH_DAY_TEXTURE))
      .bumpImageUrl(this.assetUrl(EARTH_TOPOLOGY_TEXTURE))
      .labelLat('lat')
      .labelLng('lng')
      .labelText((point) => globeLabelText((point as LocationAggregate).displayName))
      .labelColor((point) => this.locationColor(point as LocationAggregate))
      .labelAltitude((point) => this.labelAltitude(point as LocationAggregate))
      .labelDotOrientation((point) =>
        MOON_TOP_LABELS.has((point as LocationAggregate).displayName) ? 'top' : 'bottom',
      )
      .labelResolution(config.globe.pointResolution)
      .labelLabel(() => '')
      .onLabelHover((point) => this.setHovered((point as LocationAggregate | null)?.key ?? null))
      .onLabelClick((point, event) => {
        this.stopAutoRotate();
        this.selected.set(point as LocationAggregate);
        this.tooltipPosition.set({
          x: Math.min(event.clientX, this.container.nativeElement.clientWidth - 320),
          y: Math.max(100, event.clientY),
        });
      })
      .onGlobeClick(() => this.dismissTooltip())
      // Halos are decoration, several times wider than their dot. Left pickable,
      // a big city's halo sits above nearby small cities and swallows their hover.
      .pointerEventsFilter((object) => (object as { __globeObjType?: string }).__globeObjType !== 'custom')
      .arcStartLat('startLat')
      .arcStartLng('startLng')
      .arcEndLat('endLat')
      .arcEndLng('endLng')
      .arcColor(() => [...config.colors.arcColorStops])
      .arcDashLength(config.arcs.dashLength)
      .arcDashGap(config.arcs.dashGap)
      .arcDashAnimateTime(config.arcs.dashAnimateTimeMs)
      .arcsTransitionDuration(0);
    this.applyMarkerSizes();

    // Without this the first frame is globe.gl's 0, 0 default — the Gulf of
    // Guinea, so Europe and Africa fill the view. Instant, not animated: a
    // fly-in would fight the auto-rotate that starts on the same frame.
    this.globe.pointOfView(
      {
        lat: config.globe.initialLat,
        lng: config.globe.initialLng,
        altitude: config.globe.initialAltitude,
      },
      0,
    );

    this.applyRotate(this.viewSettings.settings().rotate);
  }

  /** Keep the startup veil up until the painted Earth is actually on screen. */
  private async revealAfterFirstPaint(): Promise<void> {
    const token = ++this.revealToken;
    await afterPaint();
    if (token !== this.revealToken || !this.globe) {
      return;
    }
    this.sceneReady.set(true);
    this.globeReady.set(true);
  }

  /**
   * globe.gl rebuilds label text as soon as the size accessor changes, and its
   * own transition always scales the group back to 1. Hover instead tweens the
   * live objects so the grow and shrink can be seen.
   */
  private applyMarkerSizes(): void {
    if (!this.globe) {
      return;
    }
    if (this.viewSettings.settings().moon) {
      const scale = (point: object) =>
        isEmptyMoonLanding(point as LocationAggregate) ? MOON_EMPTY_SCALE : 1;
      this.globe
        .labelSize((point) => MOON_LABEL_SIZE * scale(point))
        .labelDotRadius((point) => MOON_DOT_RADIUS * scale(point));
      return;
    }
    const globe = this.config().globe;
    const size = (point: object) => markerSize((point as LocationAggregate).count, globe);
    this.globe.labelSize(size).labelDotRadius(size);
  }

  private setHovered(key: string | null): void {
    if (key === this.hoveredKey || !this.globe) {
      return;
    }
    this.hoveredKey = key;
    this.hoverOrigin.clear();
    for (const location of this.renderedLocations) {
      const label = boundObject(location, '__threeObjLabel');
      if (!label) {
        continue;
      }
      setLabelOutlineVisible(label, this.labelOutlineVisible(location));
      const halo = boundObject(location, '__threeObjCustom');
      this.hoverOrigin.set(location.key, {
        scale: label.scale.x,
        color: markerMaterial(label)?.color.clone() ?? new Color(),
        haloScale: halo?.scale.x ?? this.haloRadius(location),
        haloColor: halo ? markerMaterial(halo)?.color.clone() ?? null : null,
        radius: positionOf(label)?.length() ?? null,
        haloRadius: halo ? positionOf(halo)?.length() ?? null : null,
      });
    }
    this.hoverStarted = performance.now();
    this.cancelHoverFrame();
    this.stepHover();
  }

  private stepHover(): void {
    if (!this.globe) {
      return;
    }
    const elapsed = performance.now() - this.hoverStarted;
    const t = Math.min(1, elapsed / HOVER_MS);
    const eased = 1 - (1 - t) ** 3;
    const config = this.config();
    const largestFill = locationFillColor(this.countRange.max, this.countRange, config.colors);
    const globeRadius = this.globe.getGlobeRadius();
    const liftAltitude = this.topLabelAltitude() + HOVER_LIFT_ALTITUDE;

    for (const location of this.renderedLocations) {
      const origin = this.hoverOrigin.get(location.key);
      const label = boundObject(location, '__threeObjLabel');
      if (!origin || !label) {
        continue;
      }
      const hovered = location.key === this.hoveredKey;
      const targetScale = hovered ? this.hoverScale(location) : 1;
      const scale = origin.scale + (targetScale - origin.scale) * eased;
      label.scale.setScalar(scale);

      const restAltitude = this.labelAltitude(location);
      const targetAltitude = hovered && !isEmptyMoonLanding(location) ? liftAltitude : restAltitude;
      setRadius(label, origin.radius, globeRadius * (1 + targetAltitude), eased);

      const fill = this.locationColor(location);
      const marker = markerMaterial(label);
      const hoverFill = isEmptyMoonLanding(location) ? fill : largestFill;
      marker?.color.copy(origin.color).lerp(new Color(hovered ? hoverFill : fill), eased);

      const halo = boundObject(location, '__threeObjCustom');
      if (!halo) {
        continue;
      }
      const baseHalo = this.haloRadius(location);
      const targetHalo = baseHalo * targetScale;
      halo.scale.setScalar(origin.haloScale + (targetHalo - origin.haloScale) * eased);
      setRadius(halo, origin.haloRadius, globeRadius * (1 + targetAltitude * GLOW_ALTITUDE_RATIO), eased);
      if (origin.haloColor) {
        markerMaterial(halo)?.color.copy(origin.haloColor).lerp(new Color(config.glow.color), eased);
      }
    }

    if (t < 1) {
      this.hoverFrame = requestAnimationFrame(() => this.stepHover());
    } else {
      this.hoverFrame = 0;
    }
  }

  private hoverScale(location: LocationAggregate): number {
    if (isEmptyMoonLanding(location)) {
      return 1;
    }
    const globe = this.config().globe;
    const rest = isMoonLocation(location) ? MOON_LABEL_SIZE : markerSize(location.count, globe);
    return (globe.labelMaxSize * HOVER_MAX_SIZE_RATIO) / rest;
  }

  private labelAltitude(location: LocationAggregate): number {
    return isEmptyMoonLanding(location)
      ? MOON_LABEL_ALTITUDE
      : markerAltitude(location.count, this.countRange, this.config().colors);
  }

  private topLabelAltitude(): number {
    let top = 0;
    for (const location of this.renderedLocations) {
      top = Math.max(top, this.labelAltitude(location));
    }
    return top;
  }

  private locationColor(location: LocationAggregate): string {
    if (isEmptyMoonLanding(location)) {
      return MOON_EMPTY_MARKER_COLOR;
    }
    return locationFillColor(location.count, this.countRange, this.config().colors);
  }

  /** Moon names keep their rim on. Earth names show it only while hovered. */
  private labelOutlineVisible(location: LocationAggregate): boolean {
    return isMoonLocation(location) || location.key === this.hoveredKey;
  }

  private haloRadius(location: LocationAggregate): number {
    const config = this.config();
    const size = isMoonLocation(location) ? MOON_LABEL_SIZE : markerSize(location.count, config.globe);
    const radians = (size * Math.PI) / 180;
    return (this.globe?.getGlobeRadius() ?? 0) * radians * config.glow.sizeScale;
  }

  private cancelHoverFrame(): void {
    if (this.hoverFrame !== 0) {
      cancelAnimationFrame(this.hoverFrame);
      this.hoverFrame = 0;
    }
  }

  private readonly placeHalo = (object: Object3D, datum: object): void => {
    const location = datum as LocationAggregate;
    const altitude =
      markerAltitude(location.count, this.countRange, this.config().colors) * GLOW_ALTITUDE_RATIO;
    Object.assign(
      object.position,
      this.globe?.getCoords(location.lat, location.lng, altitude) ?? {},
    );
    object.scale.setScalar(this.haloRadius(location));
    // Lay the disc flat on the sphere, matching the dot's orientation.
    object.lookAt(0, 0, 0);
  };

  private renderLocations(locations: readonly LocationAggregate[]): void {
    // Read outside the locations effect. Clouds and day/night share that signal,
    // and a fresh labelsData call disposes the text geometry the outlines use.
    const moon = untracked(() => this.viewSettings.settings().moon);
    const rendered = moon ? moonLocations(locations) : earthLocations(locations);
    this.renderedLocations = rendered;
    // Identity landings share Earth's count ramp, so one astronaut is the
    // small-city pink instead of the only (and therefore largest) site.
    this.countRange = locationCountRange(moon ? earthLocations(locations) : rendered);
    // Markers appear at their final size and place instead of easing in.
    this.globe?.labelsTransitionDuration(0);
    this.globe?.labelsData([...rendered]);
    this.scheduleOutlines();
    this.renderGlow(moon ? [] : rendered);
    const arcEndpoints = moon ? rendered.filter((location) => location.count > 0) : rendered;
    if (moon ? arcEndpoints.length < 2 : new Set(arcEndpoints.map(({ countryCode }) => countryCode)).size < 2) {
      this.arcs = [];
      this.globe?.arcsData([]);
    }
  }

  /**
   * globe.gl builds and rebuilds label meshes on a debounced update, after
   * labelsData returns. Keep syncing for a short window so the outlines catch
   * the new meshes and letters.
   */
  private scheduleOutlines(): void {
    this.cancelOutlineFrame();
    let remaining = OUTLINE_SYNC_FRAMES;
    const step = () => {
      this.outlineFrame = 0;
      if (!this.globe) {
        return;
      }
      this.syncOutlines(this.renderedLocations);
      remaining -= 1;
      if (remaining > 0) {
        this.outlineFrame = requestAnimationFrame(step);
      }
    };
    this.outlineFrame = requestAnimationFrame(step);
  }

  private cancelOutlineFrame(): void {
    if (this.outlineFrame !== 0) {
      cancelAnimationFrame(this.outlineFrame);
      this.outlineFrame = 0;
    }
  }

  private syncOutlines(locations: readonly LocationAggregate[]): void {
    const seen = new Set<Object3D>();
    for (const location of locations) {
      const label = boundObject(location, '__threeObjLabel');
      if (!label) {
        continue;
      }
      if (this.outlineMaterial) {
        syncLabelOutline(
          label,
          this.outlineMaterial,
          this.labelOutlineVisible(location),
          isMoonLocation(location) ? MOON_LANDMARK_OUTLINE_Z : undefined,
        );
      }
      seen.add(label);
    }
    for (const label of this.outlinedLabels) {
      if (!seen.has(label)) {
        disposeLabelOutline(label);
      }
    }
    this.outlinedLabels.clear();
    for (const label of seen) {
      this.outlinedLabels.add(label);
    }
  }

  private applyView(settings: ViewSettings): void {
    this.applyRotate(settings.rotate);
    this.applyArcs(settings.arcs);
    if (this.needsTextureVeil(settings)) {
      void this.applyImageryVeiled(settings);
      return;
    }
    void this.applyImagery(settings);
    this.shownView = settings;
  }

  /** The Earth/Moon switch replaces the whole surface. Cover that hitch. */
  private needsTextureVeil(settings: ViewSettings): boolean {
    const shown = this.shownView;
    return shown !== null && shown.moon !== settings.moon;
  }

  private async applyImageryVeiled(settings: ViewSettings): Promise<void> {
    const token = ++this.swapToken;
    const started = Date.now();
    this.swapping.set(true);
    // Finish the ramp in before the upload blocks the main thread.
    await delay(SWAP_RAMP_MS);
    await afterPaint();
    if (token !== this.swapToken || !this.globe) {
      return;
    }
    await this.applyImagery(settings);
    if (token !== this.swapToken || !this.globe) {
      return;
    }
    this.shownView = settings;
    // The sky loader and the GPU upload land on the following frames.
    await afterPaint();
    await afterPaint();
    await delay(SWAP_MIN_MS - (Date.now() - started));
    if (token !== this.swapToken) {
      return;
    }
    this.swapping.set(false);
  }

  private applyImagery(settings: ViewSettings): Promise<void> {
    const pending: Promise<void>[] = [];
    if (settings.moon) {
      pending.push(this.applyDayNight(false));
      pending.push(this.applyMoon(true));
      pending.push(this.applyMoonDayNight(settings.dayNight));
    } else {
      pending.push(this.applyMoonDayNight(false));
      pending.push(this.applyMoon(false));
      pending.push(this.applyDayNight(settings.dayNight));
    }
    pending.push(this.applyClouds(!settings.moon && settings.clouds));
    this.applySky(settings);
    return Promise.all(pending).then(() => undefined);
  }

  /** Earth stays on the plain star field. The Moon shows the Milky Way only while Clouds is on. */
  private applySky(settings: ViewSettings): void {
    if (!this.globe) {
      return;
    }
    const texture =
      settings.moon && settings.clouds ? NIGHT_SKY_MILKY_WAY_TEXTURE : NIGHT_SKY_TEXTURE;
    const url = this.assetUrl(texture);
    if (url === this.skyUrl) {
      return;
    }
    this.skyUrl = url;
    this.globe.backgroundImageUrl(url);
  }

  private applyMoon(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.moonRequest += 1;
      const changed = this.moonOn;
      this.moonOn = false;
      if (this.defaultGlobeMaterial && this.globe) {
        this.globe.globeMaterial(this.defaultGlobeMaterial);
      }
      this.globe?.showAtmosphere(true).showGraticules(false);
      if (changed) {
        this.dismissTooltip();
        this.arcs = [];
        this.globe?.arcsData([]);
        this.applyMarkerSizes();
        this.renderLocations(this.locations());
        this.resetViewpoint(false);
      }
      return Promise.resolve();
    }

    const changed = !this.moonOn;
    this.moonOn = true;
    this.globe?.showAtmosphere(false).showGraticules(true);
    if (changed) {
      this.dismissTooltip();
      this.arcs = [];
      this.globe?.arcsData([]);
      this.applyMarkerSizes();
      this.renderLocations(this.locations());
      this.resetViewpoint(true);
    }
    if (this.moonMaterial && this.globe && !this.viewSettings.settings().dayNight) {
      this.globe.globeMaterial(this.moonMaterial);
      return Promise.resolve();
    }
    const request = ++this.moonRequest;
    return this.showMoon(request);
  }

  /** Each switch back to Earth or the Moon opens on that globe's default view. */
  private resetViewpoint(moon: boolean): void {
    if (!this.globe) {
      return;
    }
    const globe = this.config().globe;
    const luna24 = MOON_LANDING_SITES.find((site) => site.key === 'moon:luna-24');
    this.globe.pointOfView(
      {
        lat: moon && luna24 ? luna24.lat : globe.initialLat,
        lng: moon && luna24 ? luna24.lng : globe.initialLng,
        altitude: globe.initialAltitude,
      },
      0,
    );
  }

  private async showMoon(request: number): Promise<void> {
    const material = await this.ensureMoon();
    if (
      !material ||
      request !== this.moonRequest ||
      !this.viewSettings.settings().moon ||
      !this.globe
    ) {
      return;
    }
    if (this.viewSettings.settings().dayNight) {
      return;
    }
    this.globe.globeMaterial(material);
  }

  private async ensureMoon(): Promise<MeshPhongMaterial | null> {
    if (this.moonMaterial) {
      return this.moonMaterial;
    }
    if (!this.moonPromise) {
      this.moonPromise = this.createMoonMaterial().catch((error: unknown) => {
        this.moonPromise = null;
        console.warn('Identity Globe could not load the lunar textures.', error);
        return null;
      });
    }
    return this.moonPromise;
  }

  private async createMoonMaterial(): Promise<MeshPhongMaterial | null> {
    if (!this.globe) {
      return null;
    }
    this.defaultGlobeMaterial ??= this.globe.globeMaterial();
    const { MeshPhongMaterial, SRGBColorSpace, TextureLoader } = await import('three');
    const loader = new TextureLoader();
    const [surface, bump] = await Promise.all([
      loader.loadAsync(this.assetUrl(MOON_SURFACE_TEXTURE)),
      loader.loadAsync(this.assetUrl(MOON_BUMP_TEXTURE)),
    ]);
    surface.colorSpace = SRGBColorSpace;
    if (!this.globe) {
      surface.dispose();
      bump.dispose();
      return null;
    }
    this.moonTextures = [surface, bump];
    this.moonMaterial = new MeshPhongMaterial({
      map: surface,
      bumpMap: bump,
      bumpScale: 3,
    });
    return this.moonMaterial;
  }

  /** Resume or pause spin without calling pointOfView, so zoom and bearing stay. */
  private applyRotate(enabled: boolean): void {
    if (!this.globe) {
      return;
    }
    const controls = this.globe.controls();
    controls.autoRotate = enabled;
    controls.autoRotateSpeed = this.config().globe.autoRotateSpeed;
  }

  private applyArcs(enabled: boolean): void {
    if (!enabled) {
      this.stopArcSpawner();
      this.arcs = [];
      this.globe?.arcsData([]);
      return;
    }
    if (this.arcTimer === null) {
      this.startArcSpawner();
    }
  }

  private applyClouds(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.cloudsRequest += 1;
      if (this.clouds) {
        this.clouds.visible = false;
      }
      this.stopEffectsIfIdle();
      return Promise.resolve();
    }
    if (this.clouds) {
      this.clouds.visible = true;
      this.startEffects();
      return Promise.resolve();
    }
    const request = ++this.cloudsRequest;
    return this.showClouds(request);
  }

  private async showClouds(request: number): Promise<void> {
    const mesh = await this.ensureClouds();
    if (!mesh || request !== this.cloudsRequest || !this.viewSettings.settings().clouds) {
      return;
    }
    mesh.visible = true;
    this.startEffects();
  }

  private async ensureClouds(): Promise<Mesh | null> {
    if (this.clouds) {
      return this.clouds;
    }
    if (!this.cloudsPromise) {
      this.cloudsPromise = this.createClouds().catch((error: unknown) => {
        this.cloudsPromise = null;
        console.warn('Identity Globe could not load the clouds overlay.', error);
        return null;
      });
    }
    return this.cloudsPromise;
  }

  private async createClouds(): Promise<Mesh | null> {
    if (!this.globe) {
      return null;
    }
    const { Mesh, MeshPhongMaterial, SphereGeometry, TextureLoader } = await import('three');
    const texture = await new TextureLoader().loadAsync(this.assetUrl(CLOUDS_TEXTURE));
    if (!this.globe) {
      texture.dispose();
      return null;
    }
    const mesh = new Mesh(
      new SphereGeometry(this.globe.getGlobeRadius() * (1 + CLOUDS_ALTITUDE), 64, 64),
      new MeshPhongMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    mesh.visible = false;
    this.globe.scene().add(mesh);
    this.clouds = mesh;
    return mesh;
  }

  private applyDayNight(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.dayNightRequest += 1;
      this.dayNightOn = false;
      if (this.defaultGlobeMaterial && this.globe) {
        this.globe.globeMaterial(this.defaultGlobeMaterial);
      }
      this.stopEffectsIfIdle();
      return Promise.resolve();
    }
    if (this.dayNight && this.globe) {
      this.dayNightOn = true;
      this.globe.globeMaterial(this.dayNight.material);
      this.syncDayNight();
      this.startEffects();
      return Promise.resolve();
    }
    const request = ++this.dayNightRequest;
    return this.showDayNight(request);
  }

  private async showDayNight(request: number): Promise<void> {
    const material = await this.ensureDayNight();
    if (!material || request !== this.dayNightRequest || !this.viewSettings.settings().dayNight || !this.globe) {
      return;
    }
    this.dayNightOn = true;
    this.globe.globeMaterial(material.material);
    this.syncDayNight();
    this.startEffects();
  }

  private async ensureDayNight(): Promise<DayNightMaterial | null> {
    if (this.dayNight) {
      return this.dayNight;
    }
    if (!this.dayNightPromise) {
      this.dayNightPromise = this.createDayNight().catch((error: unknown) => {
        this.dayNightPromise = null;
        console.warn('Identity Globe could not load the day and night textures.', error);
        return null;
      });
    }
    return this.dayNightPromise;
  }

  private async createDayNight(): Promise<DayNightMaterial | null> {
    if (!this.globe) {
      return null;
    }
    const current = this.globe.globeMaterial();
    this.defaultGlobeMaterial ??= current;
    const { MeshPhongMaterial, SRGBColorSpace, TextureLoader } = await import('three');
    const loader = new TextureLoader();
    const nightTexture = await loader.loadAsync(this.assetUrl(EARTH_NIGHT_TEXTURE));
    nightTexture.colorSpace = SRGBColorSpace;
    // Daytime is the same Blue Marble already on the globe when this toggle is off.
    let dayTexture = current instanceof MeshPhongMaterial ? current.map : null;
    const ownsDayTexture = !dayTexture;
    if (!dayTexture) {
      dayTexture = await loader.loadAsync(this.assetUrl(EARTH_DAY_TEXTURE));
      dayTexture.colorSpace = SRGBColorSpace;
    }
    if (!this.globe) {
      nightTexture.dispose();
      if (ownsDayTexture) {
        dayTexture.dispose();
      }
      return null;
    }
    this.dayNightTextures = ownsDayTexture ? [dayTexture, nightTexture] : [nightTexture];
    this.dayNight = createDayNightMaterial(dayTexture, nightTexture);
    return this.dayNight;
  }

  private syncDayNight(): void {
    if (!this.dayNight || !this.globe) {
      return;
    }
    const [lng, lat] = sunPosition(new Date());
    this.dayNight.sunPosition.set(lng, lat);
    const pov = this.globe.pointOfView();
    this.dayNight.globeRotation.set(pov.lng, pov.lat);
  }

  private startEffects(): void {
    if (this.effectsFrame !== 0) {
      return;
    }
    const tick = () => {
      this.effectsFrame = requestAnimationFrame(tick);
      if (this.clouds?.visible) {
        this.clouds.rotation.y += (CLOUDS_DEGREES_PER_FRAME * Math.PI) / 180;
      }
      if (this.dayNightOn) {
        this.syncDayNight();
      }
      if (this.moonDayNightOn) {
        this.syncMoonDayNight();
      }
    };
    this.effectsFrame = requestAnimationFrame(tick);
  }

  private stopEffectsIfIdle(): void {
    if ((this.clouds?.visible ?? false) || this.dayNightOn || this.moonDayNightOn || this.effectsFrame === 0) {
      return;
    }
    cancelAnimationFrame(this.effectsFrame);
    this.effectsFrame = 0;
  }

  private stopArcSpawner(): void {
    if (this.arcTimer) {
      clearInterval(this.arcTimer);
      this.arcTimer = null;
    }
  }

  private startArcSpawner(): void {
    const config = this.config();
    this.arcTimer = setInterval(() => {
      const moon = this.viewSettings.settings().moon;
      const pool = moon ? moonLocations(this.locations()) : earthLocations(this.locations());
      const pair = moon
        ? sampleSiteArcPair(pool, { weightByIdentityCount: config.arcs.weightByIdentityCount })
        : sampleArcPair(pool, { weightByIdentityCount: config.arcs.weightByIdentityCount });
      if (!pair || !this.globe) {
        return;
      }

      this.arcs = [
        ...this.arcs.slice(-(config.arcs.maxConcurrent - 1)),
        {
          startLat: pair.start.lat,
          startLng: pair.start.lng,
          endLat: pair.end.lat,
          endLng: pair.end.lng,
        },
      ];
      this.globe.arcsData(this.arcs);
    }, config.arcs.spawnIntervalMs);
  }

  private searchUrl(
    location: LocationAggregate,
    override: Record<string, readonly string[]>,
  ): string | null {
    const query = buildIdentitySearchQuery(
      location.rawLocations ?? [],
      this.facetSelection(),
      this.settingsService.settings(),
      override,
    );
    return buildIdentitySearchUrl(this.pageRoute(), query);
  }

  /**
   * Soft additive halo behind each dot. three-globe's label layer paints one
   * flat color per marker, so the glow is a separate layer: one shared
   * radial-gradient texture on a unit disc, scaled to the same marker size so
   * halo and dot stay locked together.
   *
   * Every halo takes the same fixed tint. Blending is additive, so the tint
   * sets intensity; reusing each city's ramp color would make the largest
   * cities glow faintest, since they sit at the dark end of the ramp.
   *
   * The disc is tangent to the globe like the dot rather than camera-facing. A
   * camera-facing sprite crosses the dot's plane, and the intersection shows up
   * as a hard line bisecting every marker.
   */
  private async addGlowLayer(): Promise<void> {
    const config = this.config();
    if (!config.glow.enabled || !this.globe) {
      return;
    }

    const canvas = createGlowCanvas();
    if (!canvas) {
      return;
    }

    const { AdditiveBlending, CanvasTexture, CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial } =
      await import('three');
    if (!this.globe) {
      return;
    }

    const texture = new CanvasTexture(canvas);
    this.glowTexture = texture;
    const geometry = new CircleGeometry(1, GLOW_SEGMENTS);
    this.glowGeometry = geometry;

    this.globe
      .customThreeObject(() => {
        const material = new MeshBasicMaterial({
          map: texture,
          color: config.glow.color,
          blending: AdditiveBlending,
          opacity: config.glow.opacity,
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
        });
        this.glowMaterials.push(material);

        return new Mesh(geometry, material);
      })
      .customThreeObjectUpdate(this.placeHalo);

    this.renderGlow(this.viewSettings.settings().moon ? [] : earthLocations(this.locations()));
  }

  private renderGlow(locations: readonly LocationAggregate[]): void {
    if (!this.glowTexture || !this.globe) {
      return;
    }

    // globe.gl rebuilds every sprite on a data change, so retire the previous
    // materials once the new ones are on screen.
    const stale = this.glowMaterials;
    this.glowMaterials = [];
    this.globe.customLayerData([...locations]);
    for (const material of stale) {
      material.dispose();
    }
  }

  private observeSize(): void {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || !this.globe) {
        return;
      }
      this.globe.width(entry.contentRect.width).height(entry.contentRect.height);
    });
    this.resizeObserver.observe(this.container.nativeElement);
  }

  private assetUrl(path: string): string {
    return new URL(path, document.baseURI).toString();
  }

  private destroyGlobe(): void {
    this.cancelHoverFrame();
    this.stopArcSpawner();
    if (this.effectsFrame !== 0) {
      cancelAnimationFrame(this.effectsFrame);
      this.effectsFrame = 0;
    }
    this.cancelOutlineFrame();
    for (const label of this.outlinedLabels) {
      disposeLabelOutline(label);
    }
    this.swapToken += 1;
    this.revealToken += 1;
    this.outlinedLabels.clear();
    this.outlineMaterial?.dispose();
    this.outlineMaterial = null;
    this.resizeObserver?.disconnect();
    if (this.defaultGlobeMaterial && this.globe) {
      this.globe.globeMaterial(this.defaultGlobeMaterial);
    }
    this.disposeClouds();
    this.disposeDayNight();
    this.disposeMoonDayNight();
    this.disposeMoon();
    for (const material of this.glowMaterials) {
      material.dispose();
    }
    this.glowMaterials = [];
    this.glowGeometry?.dispose();
    this.glowGeometry = null;
    this.glowTexture?.dispose();
    this.glowTexture = null;
    this.globe?._destructor();
    this.globe = null;
  }

  private disposeClouds(): void {
    if (!this.clouds) {
      return;
    }
    this.globe?.scene().remove(this.clouds);
    this.clouds.geometry.dispose();
    const material = this.clouds.material as MeshPhongMaterial;
    material.map?.dispose();
    material.dispose();
    this.clouds = null;
  }

  private disposeDayNight(): void {
    this.dayNight?.material.dispose();
    this.dayNight = null;
    for (const texture of this.dayNightTextures) {
      texture.dispose();
    }
    this.dayNightTextures = [];
  }

  private applyMoonDayNight(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.moonDayNightRequest += 1;
      this.moonDayNightOn = false;
      if (this.moonOn && this.moonMaterial && this.globe) {
        this.globe.globeMaterial(this.moonMaterial);
      }
      this.stopEffectsIfIdle();
      return Promise.resolve();
    }
    if (this.moonDayNight && this.globe) {
      this.moonDayNightOn = true;
      this.globe.globeMaterial(this.moonDayNight.material);
      this.syncMoonDayNight();
      this.startEffects();
      return Promise.resolve();
    }
    const request = ++this.moonDayNightRequest;
    return this.showMoonDayNight(request);
  }

  private async showMoonDayNight(request: number): Promise<void> {
    const material = await this.ensureMoonDayNight();
    const settings = this.viewSettings.settings();
    if (!material || request !== this.moonDayNightRequest || !settings.dayNight || !settings.moon || !this.globe) {
      return;
    }
    this.moonDayNightOn = true;
    this.globe.globeMaterial(material.material);
    this.syncMoonDayNight();
    this.startEffects();
  }

  private async ensureMoonDayNight(): Promise<DayNightMaterial | null> {
    if (this.moonDayNight) {
      return this.moonDayNight;
    }
    if (!this.moonDayNightPromise) {
      this.moonDayNightPromise = this.createMoonDayNight().catch((error: unknown) => {
        this.moonDayNightPromise = null;
        console.warn('Identity Globe could not load the lunar day and night texture.', error);
        return null;
      });
    }
    return this.moonDayNightPromise;
  }

  private async createMoonDayNight(): Promise<DayNightMaterial | null> {
    if (!this.globe) {
      return null;
    }
    const { SRGBColorSpace, TextureLoader } = await import('three');
    const surface = await new TextureLoader().loadAsync(this.assetUrl(MOON_SURFACE_TEXTURE));
    surface.colorSpace = SRGBColorSpace;
    if (!this.globe) {
      surface.dispose();
      return null;
    }
    this.moonDayNightTextures = [surface];
    this.moonDayNight = createDayNightMaterial(surface, surface, MOON_NIGHT_SCALE);
    return this.moonDayNight;
  }

  private syncMoonDayNight(): void {
    if (!this.moonDayNight || !this.globe) {
      return;
    }
    const [lng, lat] = moonSunPosition(new Date());
    this.moonDayNight.sunPosition.set(lng, lat);
    const pov = this.globe.pointOfView();
    this.moonDayNight.globeRotation.set(pov.lng, pov.lat);
  }

  private disposeMoonDayNight(): void {
    this.moonDayNight?.material.dispose();
    this.moonDayNight = null;
    for (const texture of this.moonDayNightTextures) {
      texture.dispose();
    }
    this.moonDayNightTextures = [];
  }

  private disposeMoon(): void {
    this.moonMaterial?.dispose();
    this.moonMaterial = null;
    for (const texture of this.moonTextures) {
      texture.dispose();
    }
    this.moonTextures = [];
  }
}

function boundObject(
  location: LocationAggregate,
  key: '__threeObjLabel' | '__threeObjCustom',
): Object3D | undefined {
  return (location as BoundLocation)[key];
}

/** Dot and label share one material; the halo carries its own. */
function markerMaterial(object: Object3D): MeshBasicMaterial | null {
  const carrier = object.children[0] ?? object;
  const material = (carrier as Mesh).material;
  if (!material || Array.isArray(material)) {
    return null;
  }
  return material as MeshBasicMaterial;
}

/**
 * Radial white-to-transparent halo, tinted per city by the sprite material.
 * Returns null when no 2D canvas is available (jsdom), so the glow degrades to
 * plain dots instead of throwing during rendering.
 */
function createGlowCanvas(): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = GLOW_TEXTURE_SIZE;
  canvas.height = GLOW_TEXTURE_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const center = GLOW_TEXTURE_SIZE / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.55)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);

  return canvas;
}

function positionOf(object: Object3D): Object3D['position'] | undefined {
  return (object as Partial<Object3D>).position;
}

/** Slide an object along its ray from the globe center, easing from its hover start. */
function setRadius(object: Object3D, from: number | null, to: number, eased: number): void {
  const position = positionOf(object);
  const current = position?.length() ?? 0;
  if (!position || from === null || current === 0) {
    return;
  }
  position.multiplyScalar((from + (to - from) * eased) / current);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Resolves after the browser has painted, so a blur is visible before a long upload. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    const backup = setTimeout(finish, 50);
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        clearTimeout(backup);
        finish();
      });
    });
  });
}
