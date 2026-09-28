import {
  aggregateFilteredFacts,
  buildFacetOptions,
  EMPTY_FACET_SELECTION,
  filterFacts,
} from './facet-filter';
import type { IdentityFact, LocationAggregate } from './models';
import { DEFAULT_OPERATOR_SETTINGS } from './operator-settings';

const FACTS: readonly IdentityFact[] = [
  fact('austin', 'Austin, TX, USA', 'USA', 'Engineering', 'Software Engineer', 'US'),
  fact('austin', 'Austin, TX, USA', 'USA', 'Sales', 'Account Executive', 'US'),
  fact('pole', 'Unrecognised office', 'USA', 'Engineering', 'Engineering Manager', 'ZZ'),
  fact('pune', 'Pune, Maharashtra, India', 'India', 'Engineering', 'Software Engineer', 'IN'),
  fact('pune', 'Pune, Maharashtra, India', 'India', 'Finance', 'Financial Analyst', 'IN'),
  fact('pune', 'Pune, Maharashtra, India', 'Unknown', 'Finance', 'Financial Analyst', 'IN'),
];

const LOCATIONS: readonly LocationAggregate[] = [
  aggregate('austin', 'Austin', 30, -97, 'US'),
  aggregate('pole', 'Unknown', 90, 0, 'ZZ'),
  aggregate('pune', 'Pune', 18, 73, 'IN'),
];

describe('facet filtering', () => {
  it('treats empty groups as all, ORs within a group, and ANDs across groups', () => {
    expect(filterFacts(FACTS, EMPTY_FACET_SELECTION)).toHaveLength(6);
    expect(
      filterFacts(FACTS, {
        countries: ['USA'],
        departments: ['Engineering', 'Sales'],
        titles: [],
      }),
    ).toHaveLength(3);
    expect(
      filterFacts(FACTS, {
        countries: ['India'],
        departments: ['Engineering'],
        titles: ['Software Engineer'],
      }),
    ).toEqual([FACTS[3]]);
  });

  it('uses the identity country independently of the matched plot country', () => {
    const usa = filterFacts(FACTS, {
      countries: ['USA'],
      departments: [],
      titles: [],
    });
    expect(usa.map(({ locationKey }) => locationKey)).toContain('pole');
  });

  it('builds a filtered location snapshot and department pie', () => {
    const filtered = filterFacts(FACTS, {
      countries: [],
      departments: ['Engineering'],
      titles: [],
    });

    expect(aggregateFilteredFacts(filtered, LOCATIONS)).toEqual([
      expect.objectContaining({
        key: 'austin',
        count: 1,
        breakdown: { Engineering: 1 },
        rawLocations: ['Austin, TX, USA'],
      }),
      expect.objectContaining({ key: 'pole', count: 1 }),
      expect.objectContaining({ key: 'pune', count: 1 }),
    ]);
  });

  it('computes each facet against the other selected groups and omits Unknown country', () => {
    const options = buildFacetOptions(FACTS, {
      countries: ['USA'],
      departments: ['Engineering'],
      titles: [],
    }, DEFAULT_OPERATOR_SETTINGS);

    expect(options['countries']).toEqual([
      { label: 'India', count: 1 },
      { label: 'USA', count: 2 },
    ]);
    expect(options['departments']).toEqual([
      { label: 'Engineering', count: 2 },
      { label: 'Finance', count: 0 },
      { label: 'Sales', count: 1 },
    ]);
    expect(options['titles']).toEqual([
      { label: 'Account Executive', count: 0 },
      { label: 'Engineering Manager', count: 1 },
      { label: 'Financial Analyst', count: 0 },
      { label: 'Software Engineer', count: 1 },
    ]);
  });
});

function fact(
  locationKey: string,
  rawLocation: string,
  country: string,
  department: string,
  title: string,
  countryCode = 'US',
): IdentityFact {
  return { locationKey, rawLocation, breakdown: department, facets: { countries: country, departments: department, titles: title }, countryCode };
}

function aggregate(
  key: string,
  displayName: string,
  lat: number,
  lng: number,
  countryCode: string,
): LocationAggregate {
  return { key, displayName, lat, lng, countryCode, count: 0, breakdown: {}, rawLocations: [] };
}
