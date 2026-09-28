/**
 * Pure domain types for the Identity Globe feature.
 *
 * Nothing in this layer may import Angular, the DOM, globe.gl, or the SailPoint
 * SDK so that matching, aggregation, and arc sampling stay unit-testable.
 */

/** Bucket that collects every identity whose location cannot be resolved (FR-4). */
export const UNKNOWN_LOCATION_KEY = 'unknown:north-pole';

/** Globe label and tooltip title for the unknown bucket (FR-25). */
export const UNKNOWN_LOCATION_LABEL = 'Unknown';

/** Latitude of the unknown bucket (North Pole). */
export const UNKNOWN_LOCATION_LAT = 90;

/** Longitude of the unknown bucket (North Pole). */
export const UNKNOWN_LOCATION_LNG = 0;

/**
 * Sentinel ISO country for the unknown bucket. It never equals a real country
 * code, so pole-to-city arcs are legal while pole-to-pole cannot occur (FR-6).
 */
export const UNKNOWN_COUNTRY_CODE = 'ZZ';

/** Histogram key used when the breakdown attribute is missing or empty (FR-9). */
export const UNKNOWN_BREAKDOWN_LABEL = 'Unknown';

/**
 * One record of the bundled GeoNames-derived gazetteer. Extra fields on the
 * asset are tolerated and ignored so the compile script can evolve.
 */
export interface GazetteerCity {
  /** Stable gazetteer id (GeoNames id). Derived from the other fields when absent. */
  readonly id?: string;
  /** Canonical city name for globe labels — city only, never a full address. */
  readonly displayName: string;
  /** Lowercased city / ascii name used for matching. */
  readonly cityNorm: string;
  /** Lowercased admin1 name (for example `texas`); may be empty. */
  readonly admin1Norm?: string;
  /** Lowercased admin1 code (for example `tx`); may be empty. */
  readonly admin1CodeNorm?: string;
  /** Lowercased country name and/or ISO2 used for matching. */
  readonly countryNorm?: string;
  /** ISO 3166-1 alpha-2 code. Required for the arc country filter. */
  readonly countryCode: string;
  /** WGS84 latitude. */
  readonly lat: number;
  /** WGS84 longitude. */
  readonly lng: number;
  /** GeoNames population. Used by the demo CSV generator; the matcher ignores it. */
  readonly population?: number;
  /** Extra spellings the compile script wants matched (alternate names). */
  readonly aliases?: readonly string[];
}

/** Aggregated identities for one gazetteer city or the unknown bucket. */
export interface LocationAggregate {
  /** Stable gazetteer key, or {@link UNKNOWN_LOCATION_KEY}. */
  readonly key: string;
  /** City name only, or {@link UNKNOWN_LOCATION_LABEL}. */
  readonly displayName: string;
  readonly lat: number;
  readonly lng: number;
  /** ISO 3166-1 alpha-2, or {@link UNKNOWN_COUNTRY_CODE}. */
  readonly countryCode: string;
  /** Identity count at this location; always >= 1 while the aggregate exists. */
  readonly count: number;
  /** Breakdown histogram. Missing or empty values are counted as `Unknown`. */
  readonly breakdown: Record<string, number>;
  /** Distinct Search location values represented by this point. */
  readonly rawLocations?: readonly string[];
}

/** Minimal per-identity row retained for client-side faceting (FR-30). */
export interface IdentityFact {
  readonly locationKey: string;
  readonly rawLocation: string;
  readonly breakdown: string;
  readonly facets: Record<string, string>;
  /** Gazetteer country used only by decorative arc filtering. */
  readonly countryCode: string;
}

export type FacetSelection = Record<string, readonly string[]>;

export interface FacetOption {
  readonly label: string;
  readonly count: number;
}

export type FacetOptions = Record<string, readonly FacetOption[]>;

/**
 * Shape of one `POST /search/v1` identity hit. Every field is optional because
 * tenant documents are untrusted input (EC-8, EC-9, AC-20).
 */
export interface SearchIdentityHit {
  readonly id?: string;
  readonly name?: string;
  readonly attributes?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * Stable aggregate key for a gazetteer city. Prefers the gazetteer id and falls
 * back to a deterministic composite so a gazetteer without ids still merges
 * identities into one point per city.
 */
export function gazetteerCityKey(city: GazetteerCity): string {
  const id = city.id?.trim();
  if (id) {
    return id;
  }

  return `${city.countryCode}:${city.admin1CodeNorm ?? city.admin1Norm ?? ''}:${city.cityNorm}`.toLowerCase();
}
