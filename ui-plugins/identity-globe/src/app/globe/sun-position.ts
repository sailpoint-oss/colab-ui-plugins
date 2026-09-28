const DAY_MS = 86_400_000;

function normalizeLongitude(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * Subsolar longitude and latitude in degrees at `date`.
 *
 * Longitude is negative west. This is the visual terminator used by the day
 * and night shader, accurate to about a degree: equation of time plus a
 * sinusoidal declination. It is the current time, not an animated cycle.
 */
/** Mean synodic month. Sunlight takes this long to circle the tidally locked Moon. */
const SYNODIC_MONTH_MS = 29.530588853 * DAY_MS;

/**
 * New moon of 6 January 2000, 18:14 UTC. Mean phases are counted from here.
 * The real phase drifts by less than a day over the years this approximation covers.
 */
const MEAN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

/**
 * Subsolar longitude and latitude on the Moon.
 *
 * Tidal locking keeps one face toward Earth. It does not keep one face toward
 * the Sun: the terminator travels all the way around during a lunar day. At a
 * new moon the near side (longitude 0) is dark, so the subsolar longitude is
 * 180°. At full moon it is about 0°. Latitude stays within roughly 1.5° of the
 * equator, so it is treated as 0.
 */
export function moonSunPosition(date: Date): readonly [lng: number, lat: number] {
  const cycles = (date.getTime() - MEAN_NEW_MOON_MS) / SYNODIC_MONTH_MS;
  const phase = ((cycles % 1) + 1) % 1;
  return [normalizeLongitude(180 - 360 * phase), 0];
}

export function sunPosition(date: Date): readonly [lng: number, lat: number] {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - yearStart) / DAY_MS;
  const seasonal = ((360 / 365) * (dayOfYear - 81) * Math.PI) / 180;
  const equationOfTimeMinutes =
    9.87 * Math.sin(2 * seasonal) - 7.53 * Math.cos(seasonal) - 1.5 * Math.sin(seasonal);
  const hours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + date.getUTCMilliseconds() / 3_600_000;
  const lng = normalizeLongitude(-15 * (hours - 12) - equationOfTimeMinutes / 4);
  const lat = 23.44 * Math.sin(seasonal);
  return [lng, lat];
}
