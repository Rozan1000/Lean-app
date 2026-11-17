import { Platform } from 'react-native';

export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const C = {
  bg: '#000000',
  panel: '#0A0A0A',
  line: '#222222',
  text: '#F5F5F5',
  dim: '#8A8A8A',
  faint: '#555555',
  ok: '#00E676',
  warn: '#FFB000',
  danger: '#FF3B30',
};

export const leanColor = (deg, settings) =>
  deg >= settings.dangerDeg ? C.danger : deg >= settings.warnDeg ? C.warn : C.text;

export const speedFactor = (settings) => (settings.speedUnit === 'mph' ? 0.621371 : 1);
export const speedLabel = (settings) => (settings.speedUnit === 'mph' ? 'mph' : 'km/h');
