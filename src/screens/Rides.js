import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, MONO, speedFactor, speedLabel } from '../theme';
import Header from './Header';

const pad = (n) => String(n).padStart(2, '0');
const dateText = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const durText = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${pad(m)}m` : `${m}m ${pad(s % 60)}s`;
};

export default function Rides({ rides, settings, onOpen, onBack }) {
  const k = speedFactor(settings);
  const distUnit = settings.speedUnit === 'mph' ? 'mi' : 'km';
  return (
    <View style={styles.root}>
      <Header title={`RIDES (${rides.length})`} onBack={onBack} />
      <FlatList
        data={rides}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No rides yet.{'\n'}Press START REC on the dashboard.</Text>
        }
        renderItem={({ item }) => {
          const st = item.stats || {};
          return (
            <Pressable onPress={() => onOpen(item.id)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.5 }]}>
              <View style={styles.cardTop}>
                <Text style={styles.date}>{dateText(item.startedAt)}</Text>
                <Text style={styles.dur}>{durText((item.endedAt || item.startedAt) - item.startedAt)}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.stat}>
                  {st.distanceKm != null ? `${(st.distanceKm * k).toFixed(1)} ${distUnit}` : '—'}
                </Text>
                <Text style={styles.stat}>L {Math.round(st.maxLeanLeft || 0)}°</Text>
                <Text style={styles.stat}>R {Math.round(st.maxLeanRight || 0)}°</Text>
                <Text style={styles.stat}>
                  {Math.round((st.maxSpeedKmh || 0) * k)} {speedLabel(settings)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  list: { padding: 12, gap: 10 },
  empty: { color: C.dim, fontFamily: MONO, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 60 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 12, backgroundColor: C.panel },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  date: { color: C.text, fontFamily: MONO, fontSize: 15, fontWeight: '700' },
  dur: { color: C.dim, fontFamily: MONO, fontSize: 14 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { color: C.text, fontFamily: MONO, fontSize: 14 },
});
