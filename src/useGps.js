import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

/** Live GPS fix kept in a ref (no re-render per fix). onFix(speedMps, headingDeg|null). */
export function useGps(onFix) {
  const fix = useRef({ lat: null, lon: null, speedKmh: 0, accuracy: null, t: 0 }).current;
  const [status, setStatus] = useState('WAIT'); // WAIT | OK | DENIED
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    let sub;
    let cancelled = false;
    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('DENIED');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        ({ coords, timestamp }) => {
          const mps = coords.speed != null && coords.speed > 0 ? coords.speed : 0;
          fix.lat = coords.latitude;
          fix.lon = coords.longitude;
          fix.accuracy = coords.accuracy;
          fix.speedKmh = mps * 3.6;
          fix.t = timestamp;
          // Only feed the lean filter with a trustworthy fix.
          if (coords.accuracy == null || coords.accuracy < 30) {
            const heading = coords.heading != null && coords.heading >= 0 ? coords.heading : null;
            if (onFixRef.current) onFixRef.current(mps, heading);
          }
          setStatus('OK');
        }
      );
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [fix]);

  return { fix, status };
}
