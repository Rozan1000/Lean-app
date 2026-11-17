import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { C, MONO } from '../theme';
import { deleteRide, loadRide, rideFileUri } from '../storage';
import { rideViewerHtml } from '../rideViewerHtml';
import Header from './Header';

const pad = (n) => String(n).padStart(2, '0');

/** Map with the route, lean chart and the "lean at this point" cursor (rendered in a WebView). */
export default function RideDetail({ rideId, settings, onBack, onDeleted }) {
  const [ride, setRide] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    loadRide(rideId)
      .then((r) => alive && setRide(r))
      .catch((e) => alive && setError(String(e && e.message ? e.message : e)));
    return () => {
      alive = false;
    };
  }, [rideId]);

  const html = useMemo(() => (ride ? rideViewerHtml(ride, settings) : null), [ride, settings]);

  const title = useMemo(() => {
    if (!ride) return 'RIDE';
    const d = new Date(ride.startedAt);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [ride]);

  const onExport = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(rideFileUri(rideId), { mimeType: 'application/json', dialogTitle: 'Export ride' });
      } else {
        Alert.alert('Export', 'Sharing is not available on this device.');
      }
    } catch (e) {
      Alert.alert('Export failed', String(e && e.message ? e.message : e));
    }
  };

  const onDelete = () =>
    Alert.alert('Delete ride?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRide(rideId);
          onDeleted();
        },
      },
    ]);

  return (
    <View style={styles.root}>
      <Header
        title={title}
        onBack={onBack}
        actions={[
          { label: 'EXPORT', onPress: onExport },
          { label: 'DEL', onPress: onDelete, color: C.danger },
        ]}
      />
      {error ? (
        <Text style={styles.msg}>Could not open this ride.{'\n'}{error}</Text>
      ) : !html ? (
        <ActivityIndicator color={C.text} style={{ marginTop: 60 }} />
      ) : (
        <WebView
          style={styles.web}
          originWhitelist={['*']}
          source={{ html }}
          javaScriptEnabled
          domStorageEnabled
          overScrollMode="never"
          setBuiltInZoomControls={false}
          androidLayerType="hardware"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  web: { flex: 1, backgroundColor: C.bg },
  msg: { color: C.dim, fontFamily: MONO, fontSize: 14, lineHeight: 22, textAlign: 'center', margin: 30 },
});
