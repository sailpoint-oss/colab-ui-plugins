/**
 * Picks endpoints for the decorative arcs (FR-6).
 *
 * Arcs are illustrative only — they never encode manager, access, or any other
 * real relationship. Endpoint probability is weighted by identity count, and
 * both ends must sit in different ISO countries. The North Pole bucket uses the
 * sentinel country `ZZ`, so pole-to-city pairs are legal.
 */

import type { LocationAggregate } from './models';

export interface ArcPair {
  readonly start: LocationAggregate;
  readonly end: LocationAggregate;
}

export interface ArcSamplerOptions {
  /** Injectable uniform source in `[0, 1)`. Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Mirrors `arcs.weightByIdentityCount`; uniform endpoints when `false`. */
  readonly weightByIdentityCount?: boolean;
}

/** Locations that can host an arc endpoint: plotted with at least one identity. */
export function arcEligibleLocations(locations: readonly LocationAggregate[]): readonly LocationAggregate[] {
  return locations.filter((location) => Number.isFinite(location.count) && location.count > 0);
}

/**
 * True when at least two countries have identities. A single-country tenant
 * draws no arcs at all (FR-6, AC-8, EC-12).
 */
export function canSampleArcs(locations: readonly LocationAggregate[]): boolean {
  const countries = new Set<string>();

  for (const location of arcEligibleLocations(locations)) {
    countries.add(location.countryCode);
    if (countries.size > 1) {
      return true;
    }
  }

  return false;
}

/**
 * Sample one cross-country arc, or `null` when fewer than two countries are
 * populated. The start is drawn from every eligible location; the end is drawn
 * only from locations in a different country, so a same-country pair can never
 * be produced.
 */
export function sampleArcPair(
  locations: readonly LocationAggregate[],
  options: ArcSamplerOptions = {},
): ArcPair | null {
  const eligible = arcEligibleLocations(locations);
  if (!canSampleArcs(eligible)) {
    return null;
  }

  const random = options.random ?? Math.random;
  const weighted = options.weightByIdentityCount ?? true;

  const start = pickWeighted(eligible, random, weighted);
  if (!start) {
    return null;
  }

  const crossCountry = eligible.filter((location) => location.countryCode !== start.countryCode);
  const end = pickWeighted(crossCountry, random, weighted);
  if (!end) {
    return null;
  }

  return { start, end };
}

/**
 * Sample an arc between two different occupied sites. Moon landings share one
 * country, so the cross-country rule would draw nothing.
 */
export function sampleSiteArcPair(
  locations: readonly LocationAggregate[],
  options: ArcSamplerOptions = {},
): ArcPair | null {
  const eligible = arcEligibleLocations(locations);
  if (eligible.length < 2) {
    return null;
  }

  const random = options.random ?? Math.random;
  const weighted = options.weightByIdentityCount ?? true;
  const start = pickWeighted(eligible, random, weighted);
  if (!start) {
    return null;
  }

  const others = eligible.filter((location) => location.key !== start.key);
  const end = pickWeighted(others, random, weighted);
  if (!end) {
    return null;
  }

  return { start, end };
}

function pickWeighted(
  pool: readonly LocationAggregate[],
  random: () => number,
  weighted: boolean,
): LocationAggregate | null {
  if (pool.length === 0) {
    return null;
  }

  const total = weighted ? pool.reduce((sum, location) => sum + location.count, 0) : pool.length;
  if (total <= 0) {
    return null;
  }

  let target = clampUnit(random()) * total;
  for (const location of pool) {
    target -= weighted ? location.count : 1;
    if (target < 0) {
      return location;
    }
  }

  return pool[pool.length - 1];
}

/** Keep an injected or misbehaving random source inside `[0, 1)`. */
function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.min(value, 1 - Number.EPSILON);
}
