import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { C, MONO, leanColor, speedFactor, speedLabel } from '../theme';

const BIKE_W = 130;
const BIKE_H = 170;

/** Motorcycle seen from behind; pivots on the tyre contact patch. */
function BikeRear({ angle, color }) {
  const transform = [
    { translateY: BIKE_H / 2 },
    { rotate: `${angle}deg` },
    { translateY: -BIKE_H / 2 },
  ];
  return (
    <View style={styles.bikeWrap}>
      <View style={[styles.bike, { transform }]}>
        <View style={[styles.helmet, { borderColor: color }]} />
        <View style={[styles.bars, { backgroundColor: color }]} />
        <View style={[styles.torso, { borderColor: color }]} />
        <View style={[styles.tail, { borderColor: color }]}>
          <View style={styles.tailLight} />
        </View>
        <View style={[styles.tyre, { borderColor: color }]} />
      </View>
      <View style={styles.ground} />
    </View>
  );
}

const SOURCE_TEXT = {
  GPS: 'FUSION GPS',
  ACC: 'FUSION ACC',
  GYRO: 'GYRO ONLY',
  NONE: 'NOT ZEROED',
};

export default function Dashboard({
  view,
  settings,
  gpsStatus,
  recording,
  onCalibrate,
  onToggleRecording,
  onOpenRides,
  onOpenSettings,
}) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const absLean = Math.abs(view.lean);
  const color = leanColor(absLean, settings);
  const side = absLean < 1 ? '' : view.lean < 0 ? 'L' : 'R';
  const bigFont = Math.min(width, height) * (landscape ? 0.5 : 0.42);
  const speed = view.speed * speedFactor(settings);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.label}>SPEED</Text>
          <Text style={styles.speed}>
            {speed.toFixed(0)}
            <Text style={styles.unit}> {speedLabel(settings)}</Text>
          </Text>
        </View>
        <View style={styles.statusCol}>
          <Text style={[styles.status, { color: gpsStatus === 'OK' ? C.ok : C.warn }]}>
            GPS {gpsStatus}
          </Text>
          <Text style={[styles.status, { color: view.source === 'GPS' || view.source === 'ACC' ? C.dim : C.warn }]}>
            {SOURCE_TEXT[view.source] || view.source}
          </Text>
          <Text style={[styles.status, { color: recording ? C.danger : C.faint }]}>
            {recording ? `● REC ${view.samples}` : '○ IDLE'}
          </Text>
        </View>
      </View>

      <View style={[styles.center, landscape && styles.centerLandscape]}>
        <BikeRear angle={view.lean} color={color} />
        <View style={styles.readout}>
          {view.calibrating ? (
            <Text style={styles.calText}>HOLD STILL{'\n'}ZEROING…</Text>
          ) : (
            <>
              <Text
                style={[styles.lean, { color, fontSize: bigFont, lineHeight: bigFont * 1.05 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {absLean.toFixed(0)}°
              </Text>
              <Text style={[styles.side, { color }]}>{side || '—'}</Text>
            </>
          )}
          <View style={styles.maxRow}>
            <Text style={styles.max}>MAX L {view.maxL.toFixed(0)}°</Text>
            <Text style={styles.max}>MAX R {view.maxR.toFixed(0)}°</Text>
          </View>
        </View>
      </View>

      <View style={styles.buttons}>
        <Pressable onPress={onCalibrate} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <Text style={styles.btnText}>CALIBRATE</Text>
          <Text style={styles.btnHint}>set 0° · bike upright</Text>
        </Pressable>
        <Pressable
          onPress={onToggleRecording}
          style={({ pressed }) => [
            styles.btn,
            recording ? styles.btnStop : styles.btnRec,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.btnText, { color: recording ? '#000' : C.danger }]}>
            {recording ? 'STOP' : 'START REC'}
          </Text>
          <Text style={[styles.btnHint, recording && { color: '#000' }]}>
            {recording ? 'save ride' : 'log GPS + lean'}
          </Text>
        </Pressable>
        <View style={styles.sideCol}>
          <Pressable onPress={onOpenRides} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
            <Text style={styles.smallText}>RIDES</Text>
          </Pressable>
          <Pressable onPress={onOpenSettings} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
            <Text style={styles.smallText}>SETUP</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 20 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 8,
  },
  label: { color: C.dim, fontFamily: MONO, fontSize: 12, letterSpacing: 2 },
  speed: { color: C.text, fontFamily: MONO, fontSize: 44, fontWeight: '700' },
  unit: { color: C.dim, fontSize: 16, fontWeight: '400' },
  statusCol: { alignItems: 'flex-end', gap: 4 },
  status: { fontFamily: MONO, fontSize: 13, letterSpacing: 1, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerLandscape: { flexDirection: 'row', justifyContent: 'space-evenly' },
  readout: { alignItems: 'center' },
  lean: { fontFamily: MONO, fontWeight: '800', fontVariant: ['tabular-nums'] },
  side: { fontFamily: MONO, fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  calText: {
    color: C.warn,
    fontFamily: MONO,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
    marginVertical: 24,
  },
  maxRow: { flexDirection: 'row', gap: 24, marginTop: 8 },
  max: { color: '#999', fontFamily: MONO, fontSize: 16, letterSpacing: 1 },

  bikeWrap: { width: BIKE_W + 60, height: BIKE_H + 8, alignItems: 'center' },
  bike: { width: BIKE_W, height: BIKE_H, alignItems: 'center' },
  ground: { width: '100%', height: 2, backgroundColor: '#333' },
  helmet: { position: 'absolute', top: 0, width: 34, height: 34, borderRadius: 17, borderWidth: 3, backgroundColor: '#000' },
  bars: { position: 'absolute', top: 50, width: BIKE_W, height: 5, borderRadius: 2 },
  torso: { position: 'absolute', top: 32, width: 62, height: 56, borderRadius: 14, borderWidth: 3, backgroundColor: '#000' },
  tail: {
    position: 'absolute',
    top: 84,
    width: 46,
    height: 30,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tailLight: { width: 22, height: 6, borderRadius: 3, backgroundColor: C.danger },
  tyre: { position: 'absolute', bottom: 0, width: 30, height: 64, borderRadius: 15, borderWidth: 3, backgroundColor: '#111' },

  buttons: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    minHeight: 84,
    borderWidth: 2,
    borderColor: C.text,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panel,
  },
  btnRec: { borderColor: C.danger },
  btnStop: { borderColor: C.danger, backgroundColor: C.danger },
  pressed: { opacity: 0.5 },
  btnText: { color: C.text, fontFamily: MONO, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  btnHint: { color: C.dim, fontFamily: MONO, fontSize: 10, marginTop: 4, letterSpacing: 1 },
  sideCol: { width: 76, gap: 8 },
  smallBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.faint,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panel,
  },
  smallText: { color: C.text, fontFamily: MONO, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});
