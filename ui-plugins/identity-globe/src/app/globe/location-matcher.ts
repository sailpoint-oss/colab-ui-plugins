/**
 * Maps untrusted `attributes.city` strings onto bundled gazetteer cities
 * (FR-4). Anything that is missing, malformed, unmatched, or ambiguous resolves
 * to the single North Pole bucket instead of a guessed coordinate.
 */

import type { GazetteerCity } from './models';

/** Why a location string did not resolve to a gazetteer city. */
export type UnknownLocationReason =
  | 'missing'
  | 'not-a-string'
  | 'empty'
  | 'unparseable'
  | 'unmatched'
  | 'ambiguous';

export type LocationMatch =
  | { readonly kind: 'city'; readonly city: GazetteerCity }
  | { readonly kind: 'unknown'; readonly reason: UnknownLocationReason };

export interface LocationMatcher {
  /** Cities indexed from the gazetteer. */
  readonly cityCount: number;
  match(rawLocation: unknown): LocationMatch;
}

/**
 * Raised when the bundled gazetteer is missing, malformed, or empty. A silent
 * empty globe is not an acceptable outcome (NFR-R3), so callers must surface
 * this as a build or test failure.
 */
export class GazetteerError extends Error {
  override readonly name = 'GazetteerError';
}

/**
 * Country spellings treated as equivalent while matching. The first entry of
 * each group is the ISO 3166-1 alpha-2 code.
 */
const COUNTRY_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['us', 'usa', 'united states', 'united states of america'],
  ['ca', 'can', 'canada'],
  ['mx', 'mex', 'mexico'],
  ['in', 'ind', 'india'],
  ['il', 'isr', 'israel'],
  ['gb', 'gbr', 'uk', 'united kingdom', 'great britain', 'england'],
  ['fr', 'fra', 'france'],
  ['nl', 'nld', 'netherlands', 'holland'],
  ['jp', 'jpn', 'japan'],
  ['au', 'aus', 'australia'],
  ['de', 'deu', 'germany'],
  ['ie', 'irl', 'ireland'],
  ['es', 'esp', 'spain'],
  ['it', 'ita', 'italy'],
  ['br', 'bra', 'brazil'],
  ['sg', 'sgp', 'singapore'],
  ['cn', 'chn', 'china'],
  ['kr', 'kor', 'south korea'],
  ['ph', 'phl', 'philippines'],
  ['pl', 'pol', 'poland'],
];

/**
 * US state and Canadian province code/name pairs. Tenant strings use codes
 * (`Austin, TX, USA`) while gazetteer dumps may store either form.
 */
const ADMIN1_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['al', 'alabama'], ['ak', 'alaska'], ['az', 'arizona'], ['ar', 'arkansas'],
  ['ca', 'california'], ['co', 'colorado'], ['ct', 'connecticut'], ['de', 'delaware'],
  ['dc', 'district of columbia', 'washington dc'], ['fl', 'florida'], ['ga', 'georgia'],
  ['hi', 'hawaii'], ['id', 'idaho'], ['il', 'illinois'], ['in', 'indiana'], ['ia', 'iowa'],
  ['ks', 'kansas'], ['ky', 'kentucky'], ['la', 'louisiana'], ['me', 'maine'],
  ['md', 'maryland'], ['ma', 'massachusetts'], ['mi', 'michigan'], ['mn', 'minnesota'],
  ['ms', 'mississippi'], ['mo', 'missouri'], ['mt', 'montana'], ['ne', 'nebraska'],
  ['nv', 'nevada'], ['nh', 'new hampshire'], ['nj', 'new jersey'], ['nm', 'new mexico'],
  ['ny', 'new york'], ['nc', 'north carolina'], ['nd', 'north dakota'], ['oh', 'ohio'],
  ['ok', 'oklahoma'], ['or', 'oregon'], ['pa', 'pennsylvania'], ['ri', 'rhode island'],
  ['sc', 'south carolina'], ['sd', 'south dakota'], ['tn', 'tennessee'], ['tx', 'texas'],
  ['ut', 'utah'], ['vt', 'vermont'], ['va', 'virginia'], ['wa', 'washington'],
  ['wv', 'west virginia'], ['wi', 'wisconsin'], ['wy', 'wyoming'],
  ['ab', 'alberta'], ['bc', 'british columbia'], ['mb', 'manitoba'],
  ['nb', 'new brunswick'], ['nl', 'newfoundland and labrador'], ['ns', 'nova scotia'],
  ['nt', 'northwest territories'], ['nu', 'nunavut'], ['on', 'ontario'],
  ['pe', 'prince edward island'], ['qc', 'quebec'], ['sk', 'saskatchewan'], ['yt', 'yukon'],
];

const COUNTRY_ALIASES = buildAliasIndex(COUNTRY_ALIAS_GROUPS);
const ADMIN1_ALIASES = buildAliasIndex(ADMIN1_ALIAS_GROUPS);

const ISO2_PATTERN = /^[a-z]{2}$/;

interface IndexedCity {
  readonly city: GazetteerCity;
  readonly countryTokens: ReadonlySet<string>;
  readonly admin1Tokens: ReadonlySet<string>;
}

/**
 * Lowercase, strip diacritics and punctuation, and collapse whitespace so
 * `Ramat-Gan`, `U.S.A.`, and `  austin ` compare predictably.
 */
function normalizeLocationToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'`’]/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate the bundled gazetteer asset. Accepts a bare array or an object with
 * a `cities` array so the compile script can add attribution metadata.
 *
 * @throws {GazetteerError} When the asset is not usable.
 */
export function parseGazetteer(raw: unknown): readonly GazetteerCity[] {
  const entries = asCityArray(raw);
  if (!entries) {
    throw new GazetteerError('gazetteer must be an array of cities or an object with a cities array');
  }

  if (entries.length === 0) {
    throw new GazetteerError('gazetteer contains no cities');
  }

  const cities: GazetteerCity[] = [];
  const problems: string[] = [];

  entries.forEach((entry, index) => {
    const record = asRecord(entry);
    if (!record) {
      problems.push(`cities[${index}] must be an object`);
      return;
    }

    const displayName = asNonEmptyString(record['displayName']);
    const countryCode = asNonEmptyString(record['countryCode']);
    const lat = asCoordinate(record['lat'], 90);
    const lng = asCoordinate(record['lng'], 180);

    if (!displayName) {
      problems.push(`cities[${index}].displayName must be a non-empty string`);
    }

    if (!countryCode || !ISO2_PATTERN.test(countryCode.toLowerCase())) {
      problems.push(`cities[${index}].countryCode must be an ISO 3166-1 alpha-2 code`);
    }

    if (lat === null) {
      problems.push(`cities[${index}].lat must be a number between -90 and 90`);
    }

    if (lng === null) {
      problems.push(`cities[${index}].lng must be a number between -180 and 180`);
    }

    if (!displayName || !countryCode || lat === null || lng === null) {
      return;
    }

    cities.push({
      id: asNonEmptyString(record['id']) ?? undefined,
      displayName,
      cityNorm: asNonEmptyString(record['cityNorm']) ?? displayName,
      admin1Norm: asNonEmptyString(record['admin1Norm']) ?? undefined,
      admin1CodeNorm: asNonEmptyString(record['admin1CodeNorm']) ?? undefined,
      countryNorm: asNonEmptyString(record['countryNorm']) ?? undefined,
      countryCode: countryCode.toUpperCase(),
      lat,
      lng,
      population: asPopulation(record['population']),
      aliases: asStringArray(record['aliases']),
    });
  });

  if (problems.length > 0) {
    throw new GazetteerError(`gazetteer has invalid records: ${problems.slice(0, 5).join('; ')}`);
  }

  return cities;
}

/**
 * Build a matcher over gazetteer records.
 *
 * @throws {GazetteerError} When no cities are supplied (NFR-R3).
 */
export function createLocationMatcher(cities: readonly GazetteerCity[]): LocationMatcher {
  if (cities.length === 0) {
    throw new GazetteerError('gazetteer contains no cities');
  }

  const byCityName = new Map<string, IndexedCity[]>();

  for (const city of cities) {
    const indexed: IndexedCity = {
      city,
      countryTokens: expandTokens([city.countryCode, city.countryNorm], COUNTRY_ALIASES),
      admin1Tokens: expandTokens([city.admin1CodeNorm, city.admin1Norm], ADMIN1_ALIASES),
    };

    for (const name of [city.cityNorm, city.displayName, ...(city.aliases ?? [])]) {
      const token = normalizeLocationToken(name);
      if (!token) {
        continue;
      }

      const bucket = byCityName.get(token);
      if (bucket) {
        if (!bucket.includes(indexed)) {
          bucket.push(indexed);
        }
      } else {
        byCityName.set(token, [indexed]);
      }
    }
  }

  return {
    cityCount: cities.length,
    match: (rawLocation: unknown): LocationMatch => matchLocation(rawLocation, byCityName),
  };
}

function matchLocation(rawLocation: unknown, byCityName: ReadonlyMap<string, IndexedCity[]>): LocationMatch {
  if (rawLocation === undefined || rawLocation === null) {
    return { kind: 'unknown', reason: 'missing' };
  }

  if (typeof rawLocation !== 'string') {
    return { kind: 'unknown', reason: 'not-a-string' };
  }

  if (rawLocation.trim().length === 0) {
    return { kind: 'unknown', reason: 'empty' };
  }

  const segments = rawLocation
    .split(',')
    .map(normalizeLocationToken)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { kind: 'unknown', reason: 'unparseable' };
  }

  const [cityToken, ...qualifiers] = segments;
  const candidates = byCityName.get(cityToken);
  if (!candidates || candidates.length === 0) {
    return { kind: 'unknown', reason: 'unmatched' };
  }

  const narrowed = narrowCandidates(candidates, qualifiers);
  if (narrowed.length === 1) {
    return { kind: 'city', city: narrowed[0].city };
  }

  return { kind: 'unknown', reason: 'ambiguous' };
}

/**
 * Apply `City, Region, Country` qualifiers. The trailing segment is tried as a
 * country first, then as a region. Qualifiers that match nothing are ignored so
 * extra segments (`Austin, Travis County, TX, USA`) do not force the pole,
 * while a city name that stays ambiguous does (FR-4).
 */
function narrowCandidates(candidates: readonly IndexedCity[], qualifiers: readonly string[]): readonly IndexedCity[] {
  if (qualifiers.length === 0 || candidates.length === 1) {
    return candidates;
  }

  let pool = candidates;
  let regionTokens = qualifiers;

  const countryToken = qualifiers[qualifiers.length - 1];
  const byCountry = pool.filter((entry) => entry.countryTokens.has(countryToken));
  if (byCountry.length > 0) {
    pool = byCountry;
    regionTokens = qualifiers.slice(0, -1);
  }

  for (const token of regionTokens) {
    if (pool.length === 1) {
      break;
    }

    const byRegion = pool.filter((entry) => entry.admin1Tokens.has(token));
    if (byRegion.length > 0) {
      pool = byRegion;
    }
  }

  return pool;
}

function buildAliasIndex(groups: readonly (readonly string[])[]): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, readonly string[]>();

  for (const group of groups) {
    const normalized = group.map(normalizeLocationToken).filter((token) => token.length > 0);
    for (const token of normalized) {
      index.set(token, normalized);
    }
  }

  return index;
}

/** Normalize gazetteer tokens and add every documented equivalent spelling. */
function expandTokens(
  values: readonly (string | undefined)[],
  aliases: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> {
  const tokens = new Set<string>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    const token = normalizeLocationToken(value);
    if (!token) {
      continue;
    }

    tokens.add(token);
    for (const alias of aliases.get(token) ?? []) {
      tokens.add(alias);
    }
  }

  return tokens;
}

function asCityArray(raw: unknown): readonly unknown[] | null {
  if (Array.isArray(raw)) {
    return raw;
  }

  const record = asRecord(raw);
  const cities = record?.['cities'];
  return Array.isArray(cities) ? cities : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asCoordinate(value: unknown, bound: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > bound) {
    return null;
  }

  return value;
}

function asPopulation(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function asStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
}
