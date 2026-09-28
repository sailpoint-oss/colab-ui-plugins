import type { LocationAggregate } from './models';
import {
  MOON_EMPTY_MARKER_COLOR,
  MOON_LANDING_SITES,
  earthLocations,
  isEmptyMoonLanding,
  isMoonLocation,
  moonLocations,
} from './moon-landing-sites';

const AUSTIN: LocationAggregate = {
  key: '4671654',
  displayName: 'Austin',
  lat: 30.2672,
  lng: -97.7431,
  countryCode: 'US',
  count: 2,
  breakdown: { Engineering: 2 },
};

const APOLLO_17: LocationAggregate = {
  key: 'moon:apollo-17',
  displayName: 'Apollo 17',
  lat: 20.18935,
  lng: 30.76996,
  countryCode: 'ZZ',
  count: 1,
  breakdown: { 'Space Exploration': 1 },
  rawLocations: ['Apollo 17'],
};

describe('Moon landing sites', () => {
  it('includes American, Soviet, and Chinese sites including Chang’e 5 and 6', () => {
    expect(new Set(MOON_LANDING_SITES.flatMap(({ agency }) => (agency ? [agency] : [])))).toEqual(
      new Set(['NASA', 'Soviet Space Program', 'CNSA']),
    );
    expect(MOON_LANDING_SITES.map(({ label }) => label)).toEqual(
      expect.arrayContaining([
        "Chang'e 5",
        "Chang'e 6",
        'Tycho Crater',
        'Clavius Crater',
        'Plato Crater',
        'Tsiolkovskiy Crater',
        'Korolev Crater',
        'Moscoviense Sea',
      ]),
    );
  });

  it('keeps lunar identities off Earth', () => {
    expect(earthLocations([AUSTIN, APOLLO_17])).toEqual([AUSTIN]);
    expect(isMoonLocation(APOLLO_17)).toBe(true);
  });

  it('shows every landing and merges identities into matching sites', () => {
    const moon = moonLocations([AUSTIN, APOLLO_17]);
    expect(moon).toHaveLength(MOON_LANDING_SITES.length);
    expect(moon.find(({ key }) => key === APOLLO_17.key)).toMatchObject({
      count: 1,
      breakdown: { 'Space Exploration': 1 },
      rawLocations: ['Apollo 17'],
    });
    expect(moon.find(({ key }) => key === 'moon:apollo-11')).toMatchObject({
      count: 0,
      breakdown: {},
    });
  });

  it('marks only unoccupied landings as empty landmarks', () => {
    const empty = moonLocations([]).find(({ key }) => key === 'moon:luna-2');
    expect(empty && isEmptyMoonLanding(empty)).toBe(true);
    expect(isEmptyMoonLanding(APOLLO_17)).toBe(false);
    expect(isEmptyMoonLanding(AUSTIN)).toBe(false);
    expect(MOON_EMPTY_MARKER_COLOR).toMatch(/^#[0-9a-f]{6}$/);
  });
});
