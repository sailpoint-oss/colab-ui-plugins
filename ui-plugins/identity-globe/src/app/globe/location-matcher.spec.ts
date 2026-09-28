import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLocationMatcher, GazetteerError, parseGazetteer } from './location-matcher';
import type { GazetteerCity } from './models';

const AUSTIN_TX: GazetteerCity = {
  id: '4671654',
  displayName: 'Austin',
  cityNorm: 'austin',
  admin1Norm: 'texas',
  admin1CodeNorm: 'tx',
  countryNorm: 'united states',
  countryCode: 'US',
  lat: 30.26715,
  lng: -97.74306,
  population: 964254,
};

const AUSTIN_MN: GazetteerCity = {
  id: '5024719',
  displayName: 'Austin',
  cityNorm: 'austin',
  admin1Norm: 'minnesota',
  admin1CodeNorm: 'mn',
  countryNorm: 'united states',
  countryCode: 'US',
  lat: 43.6666,
  lng: -92.9746,
  population: 24718,
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
  population: 2935744,
};

const LONDON_GB: GazetteerCity = {
  id: '2643743',
  displayName: 'London',
  cityNorm: 'london',
  admin1Norm: 'england',
  admin1CodeNorm: 'eng',
  countryNorm: 'united kingdom',
  countryCode: 'GB',
  lat: 51.50853,
  lng: -0.12574,
  population: 8961989,
};

const LONDON_ON: GazetteerCity = {
  id: '6058560',
  displayName: 'London',
  cityNorm: 'london',
  admin1Norm: 'ontario',
  admin1CodeNorm: 'on',
  countryNorm: 'canada',
  countryCode: 'CA',
  lat: 42.98339,
  lng: -81.23304,
  population: 346765,
};

const ZURICH: GazetteerCity = {
  id: '2657896',
  displayName: 'Zürich',
  cityNorm: 'zurich',
  countryCode: 'CH',
  lat: 47.36667,
  lng: 8.55,
};

const GAZETTEER = [AUSTIN_TX, AUSTIN_MN, PUNE, LONDON_GB, LONDON_ON, ZURICH];

describe('createLocationMatcher', () => {
  const matcher = createLocationMatcher(GAZETTEER);

  it('maps a canonical City, Region, Country string to one city', () => {
    expect(matcher.match('Austin, TX, USA')).toEqual({ kind: 'city', city: AUSTIN_TX });
    expect(matcher.match('Austin, Texas, United States')).toEqual({ kind: 'city', city: AUSTIN_TX });
    expect(matcher.match('  austin ,  tx ,  usa  ')).toEqual({ kind: 'city', city: AUSTIN_TX });
  });

  it('exposes the city name only as the display label', () => {
    const match = matcher.match('Austin, TX, USA');

    expect(match.kind === 'city' && match.city.displayName).toBe('Austin');
  });

  it('matches a City, Region string without a country', () => {
    expect(matcher.match('Austin, TX')).toEqual({ kind: 'city', city: AUSTIN_TX });
    expect(matcher.match('London, Ontario')).toEqual({ kind: 'city', city: LONDON_ON });
  });

  it('matches a bare city name that is unique in the gazetteer', () => {
    expect(matcher.match('Pune')).toEqual({ kind: 'city', city: PUNE });
    expect(matcher.match('pune')).toEqual({ kind: 'city', city: PUNE });
  });

  it('sends an ambiguous bare city to the unknown bucket', () => {
    expect(matcher.match('London')).toEqual({ kind: 'unknown', reason: 'ambiguous' });
    expect(matcher.match('Austin')).toEqual({ kind: 'unknown', reason: 'ambiguous' });
  });

  it('disambiguates same-name cities by region and country', () => {
    expect(matcher.match('London, England, GB')).toEqual({ kind: 'city', city: LONDON_GB });
    expect(matcher.match('London, ON, Canada')).toEqual({ kind: 'city', city: LONDON_ON });
    expect(matcher.match('Austin, MN, USA')).toEqual({ kind: 'city', city: AUSTIN_MN });
  });

  it('ignores qualifier segments that match nothing in the gazetteer', () => {
    expect(matcher.match('Austin, Travis County, TX, USA')).toEqual({ kind: 'city', city: AUSTIN_TX });
    expect(matcher.match('Pune, Maharashtra, India')).toEqual({ kind: 'city', city: PUNE });
  });

  it('matches names with diacritics and punctuation', () => {
    expect(matcher.match('Zürich')).toEqual({ kind: 'city', city: ZURICH });
    expect(matcher.match('Austin, TX, U.S.A.')).toEqual({ kind: 'city', city: AUSTIN_TX });
  });

  it('buckets missing, empty, unparseable, and unmatched locations', () => {
    expect(matcher.match(undefined)).toEqual({ kind: 'unknown', reason: 'missing' });
    expect(matcher.match(null)).toEqual({ kind: 'unknown', reason: 'missing' });
    expect(matcher.match('')).toEqual({ kind: 'unknown', reason: 'empty' });
    expect(matcher.match('   ')).toEqual({ kind: 'unknown', reason: 'empty' });
    expect(matcher.match(', ,')).toEqual({ kind: 'unknown', reason: 'unparseable' });
    expect(matcher.match('Atlantis, Ocean')).toEqual({ kind: 'unknown', reason: 'unmatched' });
  });

  it('buckets non-string location values', () => {
    expect(matcher.match({ city: 'Austin' })).toEqual({ kind: 'unknown', reason: 'not-a-string' });
    expect(matcher.match(['Austin', 'TX'])).toEqual({ kind: 'unknown', reason: 'not-a-string' });
    expect(matcher.match(42)).toEqual({ kind: 'unknown', reason: 'not-a-string' });
  });

  it('refuses to build a matcher without cities', () => {
    expect(() => createLocationMatcher([])).toThrow(GazetteerError);
  });
});

describe('parseGazetteer', () => {
  const record = {
    displayName: 'Austin',
    cityNorm: 'austin',
    admin1Norm: 'texas',
    admin1CodeNorm: 'tx',
    countryNorm: 'united states',
    countryCode: 'us',
    lat: 30.26715,
    lng: -97.74306,
    population: 964254,
  };

  it('accepts a bare array and normalizes the country code', () => {
    const [city] = parseGazetteer([record]);

    expect(city.countryCode).toBe('US');
    expect(city.displayName).toBe('Austin');
  });

  it('accepts a wrapper object with attribution metadata and extra fields', () => {
    const cities = parseGazetteer({
      attribution: 'GeoNames CC BY 4.0',
      cities: [{ ...record, timezone: 'America/Chicago' }],
    });

    expect(cities).toHaveLength(1);
    expect(cities[0].lat).toBeCloseTo(30.26715);
  });

  it('fails loudly when the asset is missing, empty, or the wrong shape', () => {
    expect(() => parseGazetteer(undefined)).toThrow(GazetteerError);
    expect(() => parseGazetteer({})).toThrow(GazetteerError);
    expect(() => parseGazetteer([])).toThrow(/no cities/);
  });

  it('rejects records with an unusable name, country, or coordinates', () => {
    expect(() => parseGazetteer([{ ...record, displayName: '' }])).toThrow(/displayName/);
    expect(() => parseGazetteer([{ ...record, countryCode: 'USA' }])).toThrow(/countryCode/);
    expect(() => parseGazetteer([{ ...record, lat: 120 }])).toThrow(/lat/);
    expect(() => parseGazetteer([{ ...record, lng: 'west' }])).toThrow(/lng/);
  });
});

// A missing or unusable gazetteer must fail here rather than ship a silent
// empty globe (NFR-R3, EC-13).
describe('bundled gazetteer asset', () => {
  const matcher = createLocationMatcher(
    parseGazetteer(JSON.parse(readFileSync(join(process.cwd(), 'public/assets/geo/cities.json'), 'utf-8')) as unknown),
  );

  it('covers the demo office footprint', () => {
    expect(matcher.cityCount).toBeGreaterThan(1000);

    const offices: readonly (readonly [string, string, string])[] = [
      ['Austin, TX, USA', 'Austin', 'US'],
      ['Pune, MH, India', 'Pune', 'IN'],
      ['Toronto, ON, Canada', 'Toronto', 'CA'],
      ['Mexico City, Mexico', 'Mexico City', 'MX'],
      ['Ramat Gan, Israel', 'Ramat Gan', 'IL'],
      ['London, England, United Kingdom', 'London', 'GB'],
      ['Paris, France', 'Paris', 'FR'],
      ['Amsterdam, Netherlands', 'Amsterdam', 'NL'],
      ['Tokyo, Japan', 'Tokyo', 'JP'],
      ['Sydney, NSW, Australia', 'Sydney', 'AU'],
    ];

    for (const [location, displayName, countryCode] of offices) {
      const match = matcher.match(location);

      expect(match.kind === 'city' && match.city.displayName).toBe(displayName);
      expect(match.kind === 'city' && match.city.countryCode).toBe(countryCode);
    }
  });

  it('resolves a bare city name that is unique in the real gazetteer', () => {
    expect(matcher.match('Pune')).toMatchObject({ kind: 'city', city: { countryCode: 'IN' } });
  });
});
