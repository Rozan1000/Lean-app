import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, MONO } from '../theme';
import { DEFAULT_SETTINGS } from '../storage';
import Header from './Header';

function Row({ title, hint, options, value, onChange }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <View style={styles.seg}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              style={[styles.segBtn, on && styles.segOn]}
            >
              <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const ON_OFF = [
  { label: 'ON', value: true },
  { label: 'OFF', value: false },
];
const deg = (list) => list.map((v) => ({ label: `${v}°`, value: v }));

export default function Settings({ settings, onChange, onBack }) {
  const set = (key) => (value) => {
    const next = { ...settings, [key]: value };
    // keep the red threshold above the amber one
    if (next.dangerDeg <= next.warnDeg) {
      if (key === 'warnDeg') next.dangerDeg = Math.min(60, next.warnDeg + 10);
      else next.warnDeg = Math.max(15, next.dangerDeg - 10);
    }
    onChange(next);
  };

  return (
    <View style={styles.root}>
      <Header title="SETUP" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>MEASUREMENT</Text>
        <Row
          title="GPS correction"
          hint="While riding, the gyro is corrected with speed × turn rate, so the angle cannot stay stuck in a lean. Turn off only to compare."
          options={ON_OFF}
          value={settings.gpsFusion}
          onChange={set('gpsFusion')}
        />
        <Row
          title="Auto gyro zero at stops"
          hint="Re-learns the gyroscope offset every time the bike stands still (the sensor drifts as the phone heats up)."
          options={ON_OFF}
          value={settings.autoBias}
          onChange={set('autoBias')}
        />
        <Row
          title="Remember calibration"
          hint="Keeps the mount position between app starts. If OFF, the app zeroes itself on every start."
          options={ON_OFF}
          value={settings.keepCalibration}
          onChange={set('keepCalibration')}
        />
        <Row
          title="Swap left / right"
          hint="Use if the bike graphic leans the wrong way on your phone."
          options={ON_OFF}
          value={settings.swapSides}
          onChange={set('swapSides')}
        />

        <Text style={styles.section}>DISPLAY</Text>
        <Row
          title="Speed unit"
          options={[
            { label: 'km/h', value: 'kmh' },
            { label: 'mph', value: 'mph' },
          ]}
          value={settings.speedUnit}
          onChange={set('speedUnit')}
        />
        <Row
          title="Number smoothing"
          hint="LOW reacts fastest, HIGH is the calmest to read."
          options={[
            { label: 'LOW', value: 'low' },
            { label: 'MED', value: 'med' },
            { label: 'HIGH', value: 'high' },
          ]}
          value={settings.smoothing}
          onChange={set('smoothing')}
        />
        <Row title="Amber from" options={deg([20, 25, 30, 35, 40])} value={settings.warnDeg} onChange={set('warnDeg')} />
        <Row title="Red from" options={deg([35, 40, 45, 50, 55])} value={settings.dangerDeg} onChange={set('dangerDeg')} />

        <Text style={styles.section}>RECORDING</Text>
        <Row
          title="Log rate"
          hint="Samples per second. 5 Hz is about 1.3 MB per hour."
          options={[
            { label: '1 Hz', value: 1 },
            { label: '5 Hz', value: 5 },
            { label: '10 Hz', value: 10 },
          ]}
          value={settings.logHz}
          onChange={set('logHz')}
        />

        <Pressable onPress={() => onChange({ ...DEFAULT_SETTINGS })} style={styles.reset}>
          <Text style={styles.resetText}>RESTORE DEFAULTS</Text>
        </Pressable>
        <Text style={styles.about}>
          Lean 1.1 · angle = gyro roll rate, corrected by GPS speed × yaw rate while riding and by gravity when stopped.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { padding: 16, paddingBottom: 40 },
  section: { color: C.dim, fontFamily: MONO, fontSize: 12, letterSpacing: 3, marginTop: 14, marginBottom: 6 },
  row: { borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 12 },
  rowTitle: { color: C.text, fontFamily: MONO, fontSize: 16, fontWeight: '700' },
  rowHint: { color: C.dim, fontFamily: MONO, fontSize: 11, lineHeight: 16, marginTop: 4 },
  seg: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segBtn: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.faint,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panel,
  },
  segOn: { borderColor: C.text, backgroundColor: C.text },
  segText: { color: C.text, fontFamily: MONO, fontSize: 14, fontWeight: '700' },
  segTextOn: { color: '#000' },
  reset: {
    marginTop: 22,
    borderWidth: 1,
    borderColor: C.faint,
    borderRadius: 5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  resetText: { color: C.text, fontFamily: MONO, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  about: { color: C.faint, fontFamily: MONO, fontSize: 10, lineHeight: 15, marginTop: 16 },
});
