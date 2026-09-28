import { moonSunPosition, sunPosition } from './sun-position';

describe('sunPosition', () => {
  it('keeps the sun near the equator and the prime meridian at the March equinox noon', () => {
    const [lng, lat] = sunPosition(new Date('2026-03-20T12:00:00Z'));
    expect(lat).toBeGreaterThan(-2);
    expect(lat).toBeLessThan(2);
    expect(lng).toBeGreaterThan(-8);
    expect(lng).toBeLessThan(8);
  });

  it('puts the sun in the northern hemisphere at the June solstice', () => {
    const [, lat] = sunPosition(new Date('2026-06-21T12:00:00Z'));
    expect(lat).toBeGreaterThan(23);
    expect(lat).toBeLessThan(23.5);
  });

  it('puts the sun in the southern hemisphere at the December solstice', () => {
    const [, lat] = sunPosition(new Date('2026-12-21T12:00:00Z'));
    expect(lat).toBeLessThan(-23);
    expect(lat).toBeGreaterThan(-23.5);
  });

  it('puts the lunar subsolar point on the far side at the January 2000 new moon', () => {
    const [lng, lat] = moonSunPosition(new Date('2000-01-06T18:14:00Z'));
    expect(lat).toBe(0);
    expect(Math.abs(Math.abs(lng) - 180)).toBeLessThan(1);
  });

  it('lights the lunar near side half a month later', () => {
    const [lng] = moonSunPosition(new Date('2000-01-21T12:36:00Z'));
    expect(lng).toBeGreaterThan(-8);
    expect(lng).toBeLessThan(8);
  });

  it('walks the lunar terminator about twelve degrees per Earth day', () => {
    const [first] = moonSunPosition(new Date('2000-01-06T18:14:00Z'));
    const [next] = moonSunPosition(new Date('2000-01-07T18:14:00Z'));
    const travel = Math.abs(first - next);
    expect(travel).toBeGreaterThan(11);
    expect(travel).toBeLessThan(13);
  });

  it('moves the subsolar point west as the UTC hour advances', () => {
    const [noon] = sunPosition(new Date('2026-06-21T12:00:00Z'));
    const [evening] = sunPosition(new Date('2026-06-21T18:00:00Z'));
    expect(evening).toBeLessThan(noon);
    expect(evening).toBeGreaterThan(-96);
    expect(evening).toBeLessThan(-84);
  });
});