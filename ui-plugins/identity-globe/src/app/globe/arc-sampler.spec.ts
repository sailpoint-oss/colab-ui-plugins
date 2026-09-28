import { arcEligibleLocations, canSampleArcs, sampleArcPair, sampleSiteArcPair } from './arc-sampler';
import { UNKNOWN_COUNTRY_CODE, UNKNOWN_LOCATION_KEY, type LocationAggregate } from './models';

function location(key: string, countryCode: string, count: number): LocationAggregate {
  return {
    key,
    displayName: key,
    lat: 0,
    lng: 0,
    countryCode,
    count,
    breakdown: { Unknown: count },
  };
}

const AUSTIN = location('austin', 'US', 500);
const SEATTLE = location('seattle', 'US', 120);
const TORONTO = location('toronto', 'CA', 40);
const PUNE = location('pune', 'IN', 500);
const UNKNOWN = location(UNKNOWN_LOCATION_KEY, UNKNOWN_COUNTRY_CODE, 25);

/** Deterministic uniform sequence (mulberry32) so weighting assertions are reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe('sampleArcPair', () => {
  it('never pairs two locations in the same country', () => {
    const random = seededRandom(7);
    const locations = [AUSTIN, SEATTLE, TORONTO, PUNE];

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const pair = sampleArcPair(locations, { random });

      expect(pair).not.toBeNull();
      expect(pair?.start.countryCode).not.toBe(pair?.end.countryCode);
    }
  });

  it('allows cross-country pairs such as US and CA', () => {
    const random = seededRandom(3);
    const pairs = new Set<string>();

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const pair = sampleArcPair([AUSTIN, TORONTO], { random });
      pairs.add(`${pair?.start.key}->${pair?.end.key}`);
    }

    expect(pairs).toEqual(new Set(['austin->toronto', 'toronto->austin']));
  });

  it('allows the North Pole bucket to pair with a real country', () => {
    const random = seededRandom(11);
    const seen = new Set<string>();

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const pair = sampleArcPair([AUSTIN, UNKNOWN], { random });
      seen.add(`${pair?.start.countryCode}->${pair?.end.countryCode}`);
    }

    expect(seen).toEqual(new Set(['US->ZZ', 'ZZ->US']));
  });

  it('draws no arcs when only one country has identities', () => {
    expect(sampleArcPair([AUSTIN, SEATTLE])).toBeNull();
    expect(sampleArcPair([AUSTIN])).toBeNull();
    expect(sampleArcPair([])).toBeNull();
    expect(canSampleArcs([AUSTIN, SEATTLE])).toBe(false);
    expect(canSampleArcs([AUSTIN, PUNE])).toBe(true);
  });

  it('ignores locations with no identities', () => {
    const empty = location('empty', 'FR', 0);

    expect(arcEligibleLocations([AUSTIN, empty])).toEqual([AUSTIN]);
    expect(sampleArcPair([AUSTIN, empty])).toBeNull();
  });

  it('favors higher-count locations as endpoints', () => {
    const random = seededRandom(21);
    const locations = [AUSTIN, SEATTLE, PUNE];
    const endpointCounts = new Map<string, number>();

    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const pair = sampleArcPair(locations, { random });
      for (const endpoint of [pair?.start.key, pair?.end.key]) {
        if (endpoint) {
          endpointCounts.set(endpoint, (endpointCounts.get(endpoint) ?? 0) + 1);
        }
      }
    }

    expect(endpointCounts.get('austin') ?? 0).toBeGreaterThan((endpointCounts.get('seattle') ?? 0) * 2);
    expect(endpointCounts.get('seattle') ?? 0).toBeGreaterThan(0);
  });

  it('samples uniformly when count weighting is disabled', () => {
    const random = seededRandom(5);
    const locations = [AUSTIN, SEATTLE, PUNE];
    let seattleStarts = 0;
    let austinStarts = 0;

    for (let attempt = 0; attempt < 900; attempt += 1) {
      const pair = sampleArcPair(locations, { random, weightByIdentityCount: false });
      if (pair?.start.key === 'seattle') {
        seattleStarts += 1;
      }

      if (pair?.start.key === 'austin') {
        austinStarts += 1;
      }
    }

    expect(seattleStarts).toBeGreaterThan(200);
    expect(austinStarts).toBeGreaterThan(200);
  });

  it('tolerates a random source outside [0, 1)', () => {
    const locations = [AUSTIN, PUNE];

    expect(sampleArcPair(locations, { random: () => 0 })).toEqual({ start: AUSTIN, end: PUNE });
    expect(sampleArcPair(locations, { random: () => 1.5 })).toEqual({ start: PUNE, end: AUSTIN });
    expect(sampleArcPair(locations, { random: () => Number.NaN })).toEqual({ start: AUSTIN, end: PUNE });
  });
});

describe('sampleSiteArcPair', () => {
  it('connects two occupied sites in the same country', () => {
    const apollo11 = location('moon:apollo-11', 'ZZ', 2);
    const apollo17 = location('moon:apollo-17', 'ZZ', 2);

    const pair = sampleSiteArcPair([apollo11, apollo17], { random: () => 0 });

    expect(pair?.start.key).not.toBe(pair?.end.key);
    expect([pair?.start.key, pair?.end.key].sort()).toEqual(['moon:apollo-11', 'moon:apollo-17']);
  });

  it('draws nothing when fewer than two sites have identities', () => {
    expect(sampleSiteArcPair([location('moon:apollo-11', 'ZZ', 2)])).toBeNull();
    expect(sampleSiteArcPair([location('moon:apollo-11', 'ZZ', 0), location('moon:luna-2', 'ZZ', 0)])).toBeNull();
  });
});
