/**
 * LEAN — motorcycle lean-angle dashboard and ride recorder (Expo / React Native).
 *
 *   App.js                    navigation, recording, wiring
 *   src/leanFilter.js         the lean-angle estimator (gyro + GPS + accelerometer fusion)
 *   src/useLeanSensor.js      feeds the estimator from the phone's sensors
 *   src/useGps.js             GPS speed / position / course
 *   src/storage.js            settings, calibration, ride files (data format documented there)
 *   src/rideViewerHtml.js     route map + lean chart shown in the ride detail
 *   src/screens/*             Dashboard, Rides, RideDetail, Settings
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, StatusBar, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';

import { useLeanSensor } from './src/useLeanSensor';
import { useGps } from './src/useGps';
import {
  DEFAULT_SETTINGS,
  SMOOTHING,
  distanceKm,
  listRides,
  loadSettings,
  migrateOldRides,
  saveRide,
  saveSettings,
} from './src/storage';
import Dashboard from './src/screens/Dashboard';
import Rides from './src/screens/Rides';
import RideDetail from './src/screens/RideDetail';
import Settings from './src/screens/Settings';

const UI_INTERVAL_MS = 50; // 20 Hz screen refresh
const CHECKPOINT_MS = 60000; // while recording, save to disk once a minute
const round1 = (v) => Math.round(v * 10) / 10;

export default function App() {
  useKeepAwake(); // the screen must never sleep on the handlebars

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [screen, setScreen] = useState({ name: 'dash' }); // dash | rides | ride | settings
  const [rides, setRides] = useState([]);
  const [recording, setRecording] = useState(false);
  const [view, setView] = useState({
    lean: 0, speed: 0, maxL: 0, maxR: 0, samples: 0, calibrating: false, source: 'NONE',
  });

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const shown = useRef({ lean: 0, maxL: 0, maxR: 0 }).current;
  const ride = useRef(null);

  const { getLeanDeg, calibrate, isCalibrating, getSource, setGps } = useLeanSensor(settings, settingsReady);
  const { fix, status: gpsStatus } = useGps(setGps);

  const refreshRides = useCallback(async () => setRides(await listRides()), []);

  // startup: settings, old-format rides, ride list
  useEffect(() => {
    (async () => {
      setSettings(await loadSettings());
      setSettingsReady(true);
      await migrateOldRides();
      await refreshRides();
    })();
  }, [refreshRides]);

  const changeSettings = useCallback((next) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // screen refresh loop
  useEffect(() => {
    const id = setInterval(() => {
      const k = SMOOTHING[settingsRef.current.smoothing] || SMOOTHING.med;
      shown.lean += k * (getLeanDeg() - shown.lean);
      if (shown.lean < -shown.maxL) shown.maxL = -shown.lean;
      if (shown.lean > shown.maxR) shown.maxR = shown.lean;
      setView({
        lean: shown.lean,
        speed: fix.speedKmh,
        maxL: shown.maxL,
        maxR: shown.maxR,
        samples: ride.current ? ride.current.samples.length : 0,
        calibrating: isCalibrating(),
        source: getSource(),
      });
    }, UI_INTERVAL_MS);
    return () => clearInterval(id);
  }, [getLeanDeg, isCalibrating, getSource, fix, shown]);

  // ride logging loop
  useEffect(() => {
    if (!recording) return undefined;
    const logId = setInterval(() => {
      const r = ride.current;
      if (!r) return;
      const lean = round1(shown.lean);
      const spd = round1(fix.speedKmh);
      r.samples.push({ t: Date.now(), lat: fix.lat, lon: fix.lon, spd, lean });
      if (-lean > r.stats.maxLeanLeft) r.stats.maxLeanLeft = -lean;
      if (lean > r.stats.maxLeanRight) r.stats.maxLeanRight = lean;
      if (spd > r.stats.maxSpeedKmh) r.stats.maxSpeedKmh = spd;
    }, Math.round(1000 / (settings.logHz || 5)));
    // periodic checkpoint so a crash or dead battery does not lose the whole ride
    const saveId = setInterval(() => {
      const r = ride.current;
      if (!r || !r.samples.length) return;
      r.endedAt = Date.now();
      r.stats.distanceKm = distanceKm(r.samples);
      saveRide(r).catch(() => {});
    }, CHECKPOINT_MS);
    return () => {
      clearInterval(logId);
      clearInterval(saveId);
    };
  }, [recording, settings.logHz, fix, shown]);

  const onCalibrate = useCallback(() => {
    calibrate();
    shown.lean = 0;
    shown.maxL = 0;
    shown.maxR = 0;
  }, [calibrate, shown]);

  const startRecording = () => {
    const now = Date.now();
    ride.current = {
      id: `ride_${now}`,
      startedAt: now,
      endedAt: null,
      sampleRateHz: settings.logHz || 5,
      stats: { maxLeanLeft: 0, maxLeanRight: 0, maxSpeedKmh: 0, distanceKm: 0 },
      samples: [],
    };
    shown.maxL = 0;
    shown.maxR = 0;
    setRecording(true);
  };

  const stopRecording = async () => {
    setRecording(false);
    const r = ride.current;
    ride.current = null;
    if (!r) return;
    if (!r.samples.length) return;
    r.endedAt = Date.now();
    r.stats.distanceKm = distanceKm(r.samples);
    try {
      await saveRide(r);
      await refreshRides();
      Alert.alert(
        'Ride saved',
        `${r.stats.distanceKm.toFixed(1)} km · ${r.samples.length} samples\n` +
          `Max lean  L ${r.stats.maxLeanLeft.toFixed(0)}°  R ${r.stats.maxLeanRight.toFixed(0)}°`,
        [
          { text: 'OK' },
          { text: 'Open map', onPress: () => setScreen({ name: 'ride', id: r.id }) },
        ]
      );
    } catch (e) {
      Alert.alert('Saving failed', String(e && e.message ? e.message : e));
    }
  };

  // Android back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'dash') return false;
      setScreen(screen.name === 'ride' ? { name: 'rides' } : { name: 'dash' });
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  let body;
  if (screen.name === 'settings') {
    body = <Settings settings={settings} onChange={changeSettings} onBack={() => setScreen({ name: 'dash' })} />;
  } else if (screen.name === 'rides') {
    body = (
      <Rides
        rides={rides}
        settings={settings}
        onOpen={(id) => setScreen({ name: 'ride', id })}
        onBack={() => setScreen({ name: 'dash' })}
      />
    );
  } else if (screen.name === 'ride') {
    body = (
      <RideDetail
        rideId={screen.id}
        settings={settings}
        onBack={() => setScreen({ name: 'rides' })}
        onDeleted={async () => {
          await refreshRides();
          setScreen({ name: 'rides' });
        }}
      />
    );
  } else {
    body = (
      <Dashboard
        view={view}
        settings={settings}
        gpsStatus={gpsStatus}
        recording={recording}
        onCalibrate={onCalibrate}
        onToggleRecording={recording ? stopRecording : startRecording}
        onOpenRides={() => {
          refreshRides();
          setScreen({ name: 'rides' });
        }}
        onOpenSettings={() => setScreen({ name: 'settings' })}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      {body}
    </View>
  );
}
