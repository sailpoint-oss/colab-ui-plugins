import {
  extractIdentityId,
  LocationAggregator,
} from './location-aggregator';
import { createLocationMatcher } from './location-matcher';
import {
  gazetteerCityKey,
  UNKNOWN_COUNTRY_CODE,
  UNKNOWN_LOCATION_KEY,
  type GazetteerCity,
} from './models';
import { DEFAULT_OPERATOR_SETTINGS } from './operator-settings';

const AUSTIN: GazetteerCity = {
  id: '4671654',
  displayName: 'Austin',
  cityNorm: 'austin',
  admin1Norm: 'texas',
  admin1CodeNorm: 'tx',
  countryNorm: 'united states',
  countryCode: 'US',
  lat: 30.26715,
  lng: -97.74306,
};

const PUNE: GazetteerCity = {
  id: '1259229',
  displayName: 'Pune',
  cityNorm: 'pune',
  admin1Norm: 'maharashtra',
  admin1CodeNorm: 'mh',
  countryNorm: 'india',
  countryCode: 'IN',
  lat: 18.51957,
  lng: 73.85535,
};

const AUSTIN_KEY = gazetteerCityKey(AUSTIN);
const PUNE_KEY = gazetteerCityKey(PUNE);

function hit(id: string, city?: unknown, department?: unknown): Record<string, unknown> {
  return { id, name: `Identity ${id}`, attributes: { city, department } };
}

function createAggregator(): LocationAggregator {
  return new LocationAggregator(createLocationMatcher([AUSTIN, PUNE]), DEFAULT_OPERATOR_SETTINGS);
}

describe('LocationAggregator', () => {
  it('merges identities from separate pages into one location', () => {
    const aggregator = createAggregator();

    aggregator.addPage([hit('a', 'Austin, TX, USA', 'Engineering')]);
    const afterFirstPage = aggregator.get(AUSTIN_KEY);

    aggregator.addPage([hit('b', 'Austin, TX, USA', 'Engineering'), hit('c', 'austin, tx, usa', 'Sales')]);
    const afterSecondPage = aggregator.get(AUSTIN_KEY);

    expect(afterFirstPage?.count).toBe(1);
    expect(afterSecondPage?.count).toBe(3);
    expect(afterSecondPage?.breakdown).toEqual({ Engineering: 2, Sales: 1 });
    expect(aggregator.locationCount).toBe(1);
    expect(aggregator.identityCount).toBe(3);
  });

  it('reports a merge summary per page', () => {
    const aggregator = createAggregator();

    const summary = aggregator.addPage([
      hit('a', 'Austin, TX, USA'),
      hit('a', 'Austin, TX, USA'),
      { name: 'no id here' },
    ]);

    expect(summary).toEqual({ counted: 1, duplicates: 1, skipped: 1 });
  });

  it('counts a duplicate identity id only once', () => {
    const aggregator = createAggregator();

    expect(aggregator.add(hit('a', 'Austin, TX, USA', 'Engineering'))).toBe('counted');
    expect(aggregator.add(hit('a', 'Pune, MH, India', 'Sales'))).toBe('duplicate');

    expect(aggregator.identityCount).toBe(1);
    expect(aggregator.snapshot()).toHaveLength(1);
    expect(aggregator.get(AUSTIN_KEY)?.breakdown).toEqual({ Engineering: 1 });
  });

  it('skips hits without a usable id', () => {
    const aggregator = createAggregator();

    expect(aggregator.add({ attributes: { city: 'Austin, TX, USA' } })).toBe('skipped');
    expect(aggregator.add({ id: '   ', attributes: { city: 'Austin, TX, USA' } })).toBe('skipped');
    expect(aggregator.add({ id: 42 })).toBe('skipped');
    expect(aggregator.add(null)).toBe('skipped');

    expect(aggregator.identityCount).toBe(0);
    expect(aggregator.snapshot()).toEqual([]);
  });

  it('collects every unresolvable location in one North Pole bucket', () => {
    const aggregator = createAggregator();

    aggregator.addPage([
      hit('a'),
      hit('b', ''),
      hit('c', 'Atlantis, Ocean'),
      hit('d', { city: 'Austin' }),
      hit('e', ['Austin', 'TX']),
    ]);

    expect(aggregator.snapshot()).toEqual([
      {
        key: UNKNOWN_LOCATION_KEY,
        displayName: 'Unknown',
        lat: 90,
        lng: 0,
        countryCode: UNKNOWN_COUNTRY_CODE,
        count: 5,
        breakdown: { Unknown: 5 },
        rawLocations: ['Atlantis, Ocean'],
      },
    ]);
  });

  it('counts missing, blank, and non-string departments as Unknown', () => {
    const aggregator = createAggregator();

    aggregator.addPage([
      hit('a', 'Pune, MH, India'),
      hit('b', 'Pune, MH, India', '   '),
      hit('c', 'Pune, MH, India', { name: 'Engineering' }),
      hit('d', 'Pune, MH, India', '  Engineering  '),
    ]);

    const pune = aggregator.get(PUNE_KEY);

    expect(pune?.breakdown).toEqual({ Unknown: 3, Engineering: 1 });
    expect(sumValues(pune?.breakdown ?? {})).toBe(pune?.count);
  });

  it('keeps only aggregate fields and ignores extra hit attributes', () => {
    const aggregator = createAggregator();

    aggregator.add({
      id: 'a',
      name: 'Ada Lovelace',
      attributes: {
        city: 'Austin, TX, USA',
        department: 'Engineering',
        email: 'ada@example.invalid',
        manager: 'someone-else',
      },
      extra: { nested: true },
    });

    const [austin] = aggregator.snapshot();

    expect(Object.keys(austin).sort()).toEqual([
      'breakdown',
      'count',
      'countryCode',
      'displayName',
      'key',
      'lat',
      'lng',
      'rawLocations',
    ]);
    expect(JSON.stringify(austin)).not.toContain('Ada');
  });

  it('retains only the slim facet fact after de-duplication', () => {
    const aggregator = createAggregator();
    aggregator.add({
      id: 'secret-id',
      name: 'Ada Lovelace',
      email: 'ada@example.invalid',
      attributes: {
        city: 'Austin, TX, USA',
        country: 'USA',
        department: 'Engineering',
        title: 'Senior Software Engineer',
      },
    });

    expect(aggregator.factsSnapshot()).toEqual([
      {
        locationKey: AUSTIN_KEY,
        rawLocation: 'Austin, TX, USA',
        breakdown: 'Engineering',
        facets: {
          countries: 'USA',
          departments: 'Engineering',
          titles: 'Senior Software Engineer',
        },
        countryCode: 'US',
      },
    ]);
    expect(JSON.stringify(aggregator.factsSnapshot())).not.toContain('Ada');
    expect(JSON.stringify(aggregator.factsSnapshot())).not.toContain('secret-id');
  });

  it('sorts the snapshot by identity count', () => {
    const aggregator = createAggregator();

    aggregator.addPage([
      hit('a', 'Pune, MH, India'),
      hit('b', 'Pune, MH, India'),
      hit('c', 'Austin, TX, USA'),
      hit('d', 'nowhere at all'),
    ]);

    expect(aggregator.snapshot().map((aggregate) => [aggregate.displayName, aggregate.count])).toEqual([
      ['Pune', 2],
      ['Austin', 1],
      ['Unknown', 1],
    ]);
  });

  it('stores a hostile department name as data without polluting prototypes', () => {
    const aggregator = createAggregator();

    aggregator.addPage([
      hit('a', 'Austin, TX, USA', '__proto__'),
      hit('b', 'Austin, TX, USA', '<script>alert(1)</script>'),
    ]);

    const breakdown = aggregator.get(AUSTIN_KEY)?.breakdown ?? {};

    expect(Object.hasOwn(breakdown, '__proto__')).toBe(true);
    expect(Object.hasOwn(breakdown, '<script>alert(1)</script>')).toBe(true);
    expect(({} as Record<string, unknown>)['__proto__']).toBe(Object.prototype);
  });
});

describe('hit extraction', () => {
  it('returns null for ids the loader cannot page on', () => {
    expect(extractIdentityId({ id: ' abc ' })).toBe('abc');
    expect(extractIdentityId({ id: '' })).toBeNull();
    expect(extractIdentityId('not-a-hit')).toBeNull();
  });
});

function sumValues(histogram: Record<string, number>): number {
  return Object.values(histogram).reduce((total, value) => total + value, 0);
}
