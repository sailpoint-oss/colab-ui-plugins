import landingSites from '../../../public/assets/moon/landing-sites.json' with { type: 'json' };

import type { LocationAggregate } from './models';

export interface MoonLandingSite {
  readonly key: `moon:${string}`;
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  readonly program: string;
  readonly agency: 'NASA' | 'Soviet Space Program' | 'CNSA' | null;
  readonly date: string | null;
  readonly url: string;
}

export type MoonLocation = LocationAggregate & {
  readonly landingSite: MoonLandingSite;
};

export const MOON_COUNTRY_CODE = 'ZZ';

/** One muted gray for every empty landing site, whichever nation flew it. */
export const MOON_EMPTY_MARKER_COLOR = '#c5cad1';

const AGENCIES = ['NASA', 'Soviet Space Program', 'CNSA'] as const;

type Agency = (typeof AGENCIES)[number];

interface LandingSiteRecord {
  readonly id: string;
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  readonly program: string;
  readonly agency: string | null;
  readonly date: string | null;
  readonly url: string;
}

export const MOON_LANDING_SITES: readonly MoonLandingSite[] = landingSites.map(toSite);

const MOON_KEYS = new Set(MOON_LANDING_SITES.map(({ key }) => key));

export function isMoonLocation(location: LocationAggregate): location is MoonLocation {
  return MOON_KEYS.has(location.key as MoonLandingSite['key']);
}

/** A plotted landing with nobody assigned. These stay landmarks, not cities. */
export function isEmptyMoonLanding(location: LocationAggregate): boolean {
  return isMoonLocation(location) && location.count <= 0;
}

export function earthLocations(locations: readonly LocationAggregate[]): readonly LocationAggregate[] {
  return locations.filter((location) => !isMoonLocation(location));
}

export function moonLocations(locations: readonly LocationAggregate[]): readonly MoonLocation[] {
  const identities = new Map(
    locations.filter(isMoonLocation).map((location) => [location.key, location]),
  );
  return MOON_LANDING_SITES.map((landingSite) => {
    const aggregate = identities.get(landingSite.key);
    return {
      key: landingSite.key,
      displayName: landingSite.label,
      lat: landingSite.lat,
      lng: landingSite.lng,
      countryCode: MOON_COUNTRY_CODE,
      count: aggregate?.count ?? 0,
      breakdown: aggregate?.breakdown ?? {},
      rawLocations: aggregate?.rawLocations ?? [],
      landingSite,
    };
  });
}

function toSite(record: LandingSiteRecord): MoonLandingSite {
  if (!isAgency(record.agency)) {
    throw new Error(`Unknown lunar agency: ${String(record.agency)}`);
  }

  return {
    key: `moon:${record.id}`,
    label: record.label,
    lat: record.lat,
    lng: record.lng,
    program: record.program,
    agency: record.agency,
    date: record.date,
    url: record.url,
  };
}

function isAgency(value: string | null): value is Agency | null {
  return value === null || (AGENCIES as readonly string[]).includes(value);
}
