import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, MONO } from '../theme';

/** Screen header: back button, title, optional action buttons [{ label, onPress, color }]. */
export default function Header({ title, onBack, actions = [] }) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onBack} hitSlop={12} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}>
        <Text style={styles.btnText}>‹ BACK</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          hitSlop={8}
          style={({ pressed }) => [styles.btn, a.color && { borderColor: a.color }, pressed && { opacity: 0.5 }]}
        >
          <Text style={[styles.btnText, a.color && { color: a.color }]}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 28,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.bg,
  },
  title: { flex: 1, color: C.text, fontFamily: MONO, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  btn: { borderWidth: 1, borderColor: C.faint, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 10 },
  btnText: { color: C.text, fontFamily: MONO, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});
