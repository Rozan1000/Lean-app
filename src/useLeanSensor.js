import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { createLeanFilter } from './leanFilter';
import { loadCalibration, saveCalibration } from './storage';

const SENSOR_INTERVAL_MS = 20; // 50 Hz
// expo-sensors reports g on both platforms, but iOS points the vector down at rest and
// Android points it up. The filter wants "up".
const ACC_SIGN = Platform.OS === 'ios' ? -1 : 1;

export function useLeanSensor(settings, settingsReady) {
  const filter = useRef(null);
  if (!filter.current) filter.current = createLeanFilter();
  const f = filter.current;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const wasCalibrating = useRef(false);

  // settings -> filter
  useEffect(() => {
    f.opts.gpsFusion = settings.gpsFusion;
    f.opts.autoBias = settings.autoBias;
  }, [f, settings.gpsFusion, settings.autoBias]);

  useEffect(() => {
    if (!settingsReady) return undefined;
    let cancelled = false;
    let accSub;
    let gyroSub;

    (async () => {
      // Restore the saved mount position, otherwise zero automatically after start.
      const saved = settingsRef.current.keepCalibration ? await loadCalibration() : null;
      if (cancelled) return;
      if (saved) f.setCalibration(saved);

      Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
      Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);

      accSub = Accelerometer.addListener(({ x, y, z, timestamp }) => {
        let ax = x * ACC_SIGN;
        let ay = y * ACC_SIGN;
        let az = z * ACC_SIGN;
        if (Math.hypot(ax, ay, az) > 4) {
          // tolerate m/s² instead of g
          ax /= 9.81;
          ay /= 9.81;
          az /= 9.81;
        }
        f.onAccel(ax, ay, az, Number.isFinite(timestamp) ? timestamp : undefined);
      });

      let first = true;
      gyroSub = Gyroscope.addListener(({ x, y, z, timestamp }) => {
        f.onGyro(x, y, z, Number.isFinite(timestamp) ? timestamp : Date.now() / 1000);
        if (first) {
          first = false;
          if (!f.isCalibrated()) f.startCalibration();
        }
        // persist the result of a finished calibration
        const calibrating = f.isCalibrating();
        if (wasCalibrating.current && !calibrating && settingsRef.current.keepCalibration) {
          const c = f.getCalibration();
          if (c) saveCalibration(c);
        }
        wasCalibrating.current = calibrating;
      });
    })();

    return () => {
      cancelled = true;
      if (accSub) accSub.remove();
      if (gyroSub) gyroSub.remove();
    };
  }, [f, settingsReady]);

  const calibrate = useCallback(() => f.startCalibration(), [f]);
  const getLeanDeg = useCallback(
    () => (settingsRef.current.swapSides ? -f.getLeanDeg() : f.getLeanDeg()),
    [f]
  );
  const setGps = useCallback((mps, heading) => f.setGps(mps, heading), [f]);
  const isCalibrating = useCallback(() => f.isCalibrating(), [f]);
  const getSource = useCallback(() => f.getSource(), [f]);

  return { getLeanDeg, calibrate, isCalibrating, getSource, setGps };
}
