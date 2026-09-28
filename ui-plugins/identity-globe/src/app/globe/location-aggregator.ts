/**
 * Folds Search hits into per-location identity counts and department
 * histograms (FR-3, FR-9).
 *
 * The aggregator keeps only what the globe draws: location key, coordinates,
 * country, count, and department histogram. Names and emails are never
 * retained (NFR-P4), and identity ids are held only to count each identity
 * once across pages (EC-10).
 */

import type { LocationMatcher } from './location-matcher';
import {
  gazetteerCityKey,
  UNKNOWN_COUNTRY_CODE,
  UNKNOWN_BREAKDOWN_LABEL,
  UNKNOWN_LOCATION_KEY,
  UNKNOWN_LOCATION_LABEL,
  UNKNOWN_LOCATION_LAT,
  UNKNOWN_LOCATION_LNG,
  type IdentityFact,
  type LocationAggregate,
} from './models';

import type { OperatorSettings } from './operator-settings';

/** Result of folding a single hit into the aggregates. */
export type AggregateOutcome =
  /** Counted at a gazetteer city or the unknown bucket. */
  | 'counted'
  /** Identity id was already counted on an earlier hit or page (EC-10). */
  | 'duplicate'
  /** Hit had no usable id, so it cannot be de-duplicated or paged (EC-8). */
  | 'skipped';

/** Per-page merge tally for the progress affordance and non-blocking errors. */
export interface PageMergeSummary {
  readonly counted: number;
  readonly duplicates: number;
  readonly skipped: number;
}

interface LocationBucket {
  readonly key: string;
  readonly displayName: string;
  readonly lat: number;
  readonly lng: number;
  readonly countryCode: string;
  count: number;
  readonly breakdown: Map<string, number>;
  readonly rawLocations: Set<string>;
}

export class LocationAggregator {
  private readonly buckets = new Map<string, LocationBucket>();
  private readonly countedIds = new Set<string>();
  private readonly facts: IdentityFact[] = [];

  constructor(
    private readonly matcher: LocationMatcher,
    private readonly settings: OperatorSettings,
  ) {}

  /** Identities counted across every merged page. */
  get identityCount(): number {
    return this.countedIds.size;
  }

  /** Locations currently plotted, including the unknown bucket. */
  get locationCount(): number {
    return this.buckets.size;
  }

  /** Fold one Search hit into the aggregates. */
  add(hit: unknown): AggregateOutcome {
    const identityId = extractIdentityId(hit);
    if (!identityId) {
      return 'skipped';
    }

    if (this.countedIds.has(identityId)) {
      return 'duplicate';
    }

    this.countedIds.add(identityId);

    const bucket = this.resolveBucket(hit);
    bucket.count += 1;

    const breakdown = extractText(hit, this.settings.breakdownAttribute, UNKNOWN_BREAKDOWN_LABEL);
    bucket.breakdown.set(breakdown, (bucket.breakdown.get(breakdown) ?? 0) + 1);
    const rawLocation = extractText(hit, this.settings.locationAttribute, '');
    if (rawLocation) {
      bucket.rawLocations.add(rawLocation);
    }
    
    const facets: Record<string, string> = {};
    for (const facet of this.settings.facets) {
      facets[facet.selectionKey] = extractText(hit, facet.attribute, UNKNOWN_BREAKDOWN_LABEL);
    }

    this.facts.push({
      locationKey: bucket.key,
      rawLocation,
      breakdown,
      facets,
      countryCode: bucket.countryCode,
    });

    return 'counted';
  }

  /** Fold one Search page into the aggregates. */
  addPage(hits: readonly unknown[]): PageMergeSummary {
    let counted = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const hit of hits) {
      switch (this.add(hit)) {
        case 'counted':
          counted += 1;
          break;
        case 'duplicate':
          duplicates += 1;
          break;
        case 'skipped':
          skipped += 1;
          break;
      }
    }

    return { counted, duplicates, skipped };
  }

  /**
   * Immutable view of the aggregates, largest location first. Ties break on key
   * so globe layers and tests see a stable order.
   */
  snapshot(): readonly LocationAggregate[] {
    return [...this.buckets.values()]
      .map(toAggregate)
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  }

  /** Minimal identity rows used for client-side faceting. */
  factsSnapshot(): readonly IdentityFact[] {
    return [...this.facts];
  }

  /** Single aggregate by key, for tooltip lookups. */
  get(key: string): LocationAggregate | undefined {
    const bucket = this.buckets.get(key);
    return bucket ? toAggregate(bucket) : undefined;
  }

  private resolveBucket(hit: unknown): LocationBucket {
    const match = this.matcher.match(extractAttribute(hit, this.settings.locationAttribute));

    if (match.kind === 'city') {
      const key = gazetteerCityKey(match.city);
      return this.bucketFor(key, {
        key,
        displayName: match.city.displayName,
        lat: match.city.lat,
        lng: match.city.lng,
        countryCode: match.city.countryCode,
      });
    }

    return this.bucketFor(UNKNOWN_LOCATION_KEY, {
      key: UNKNOWN_LOCATION_KEY,
      displayName: UNKNOWN_LOCATION_LABEL,
      lat: UNKNOWN_LOCATION_LAT,
      lng: UNKNOWN_LOCATION_LNG,
      countryCode: UNKNOWN_COUNTRY_CODE,
    });
  }

  private bucketFor(
    key: string,
    seed: Omit<LocationBucket, 'count' | 'breakdown' | 'rawLocations'>,
  ): LocationBucket {
    const existing = this.buckets.get(key);
    if (existing) {
      return existing;
    }

    const bucket: LocationBucket = {
      ...seed,
      count: 0,
      breakdown: new Map<string, number>(),
      rawLocations: new Set<string>(),
    };
    this.buckets.set(key, bucket);
    return bucket;
  }
}

/** Read the identity id used for de-duplication and `searchAfter` paging. */
export function extractIdentityId(hit: unknown): string | null {
  const record = asRecord(hit);
  if (!record) {
    return null;
  }

  const id = record['id'];
  if (typeof id !== 'string') {
    return null;
  }

  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractAttribute(
  hit: unknown,
  attribute: string,
): unknown {
  const record = asRecord(hit);
  if (!record) {
    return undefined;
  }

  const attributes = asRecord(record['attributes']);
  const nested = attributes?.[attribute];
  return nested === undefined ? record[`attributes.${attribute}`] : nested;
}

function extractText(
  hit: unknown,
  attribute: string,
  fallback: string,
): string {
  const value = extractAttribute(hit, attribute);
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim() || fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toAggregate(bucket: LocationBucket): LocationAggregate {
  return {
    key: bucket.key,
    displayName: bucket.displayName,
    lat: bucket.lat,
    lng: bucket.lng,
    countryCode: bucket.countryCode,
    count: bucket.count,
    breakdown: Object.fromEntries(
      [...bucket.breakdown.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
    ),
    rawLocations: [...bucket.rawLocations].sort(),
  };
}