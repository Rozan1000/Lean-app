/**
 * Persistence.
 *   settings + calibration + ride index  -> AsyncStorage (small values)
 *   each ride                            -> one JSON file in <documents>/rides/
 *
 * RIDE FILE
 *   {
 *     id: "ride_1794300000000",
 *     startedAt: 1794300000000,            // epoch ms
 *     endedAt:   1794303600000,
 *     sampleRateHz: 5,
 *     stats: { maxLeanLeft, maxLeanRight, maxSpeedKmh, distanceKm },
 *     samples: [ { t, lat, lon, spd, lean }, ... ]
 *   }
 *   t = epoch ms, spd = km/h (always metric in the file), lean = degrees, negative = left.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const SETTINGS_KEY = 'lean_settings_v1';
const CAL_KEY = 'lean_calibration_v1';
const INDEX_KEY = 'lean_ride_index_v1';

export const DEFAULT_SETTINGS = {
  speedUnit: 'kmh', // kmh | mph
  gpsFusion: true, // correct the gyro with GPS speed while riding
  autoBias: true, // re-learn gyro bias at every stop
  keepCalibration: true, // remember the mount position between app starts
  smoothing: 'med', // low | med | high
  warnDeg: 30, // amber from this lean
  dangerDeg: 45, // red from this lean
  logHz: 5, // ride log samples per second
  swapSides: false, // flip left / right
};

export const SMOOTHING = { low: 0.6, med: 0.35, high: 0.18 };

const readJson = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
};
const writeJson = (key, value) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

export const loadSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_KEY, {})) });
export const saveSettings = (s) => writeJson(SETTINGS_KEY, s);

export const loadCalibration = () => readJson(CAL_KEY, null);
export const saveCalibration = (c) => writeJson(CAL_KEY, c);

/* ───────── rides ───────── */

const ridesDir = () => {
  const dir = new Directory(Paths.document, 'rides');
  if (!dir.exists) dir.create();
  return dir;
};
const rideFile = (id) => new File(ridesDir(), `${id}.json`);

const toRad = (d) => (d * Math.PI) / 180;
export function distanceKm(samples) {
  let km = 0;
  let prev = null;
  for (const p of samples) {
    if (p.lat == null || p.lon == null) continue;
    if (prev && (prev.lat !== p.lat || prev.lon !== p.lon)) {
      const dLat = toRad(p.lat - prev.lat);
      const dLon = toRad(p.lon - prev.lon);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(prev.lat)) * Math.cos(toRad(p.lat)) * Math.sin(dLon / 2) ** 2;
      km += 12742 * Math.asin(Math.sqrt(a));
    }
    prev = p;
  }
  return km;
}

const summary = (ride) => ({
  id: ride.id,
  startedAt: ride.startedAt,
  endedAt: ride.endedAt,
  count: ride.samples.length,
  stats: ride.stats,
});

export const listRides = async () =>
  (await readJson(INDEX_KEY, [])).sort((a, b) => b.startedAt - a.startedAt);

/** Writes the ride file and updates the index. Safe to call repeatedly (checkpoints). */
export async function saveRide(ride) {
  const file = rideFile(ride.id);
  if (!file.exists) file.create();
  await file.write(JSON.stringify(ride));
  const index = (await readJson(INDEX_KEY, [])).filter((r) => r.id !== ride.id);
  index.push(summary(ride));
  await writeJson(INDEX_KEY, index);
}

export async function loadRide(id) {
  return JSON.parse(await rideFile(id).text());
}

export async function deleteRide(id) {
  try {
    const file = rideFile(id);
    if (file.exists) file.delete();
  } catch (e) {
    // already gone
  }
  const index = (await readJson(INDEX_KEY, [])).filter((r) => r.id !== id);
  await writeJson(INDEX_KEY, index);
}

export const rideFileUri = (id) => rideFile(id).uri;

/** v1.0 kept rides directly in AsyncStorage under "ride_<timestamp>". Move them to files. */
export async function migrateOldRides() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => /^ride_\d+$/.test(k));
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const ride = JSON.parse(raw);
        if (ride && Array.isArray(ride.samples)) {
          ride.stats = { ...ride.stats, distanceKm: distanceKm(ride.samples) };
          await saveRide(ride);
        }
      }
      await AsyncStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('Ride migration failed', e);
  }
}
