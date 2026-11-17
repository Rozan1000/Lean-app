# Lean

Motorcycle lean-angle dashboard and ride recorder (Expo / React Native, Android).

- Live lean angle, speed, max left / right
- Ride recording with a route map coloured by lean, a lean chart, and a cursor to read the lean at any point
- Settings: units, colour thresholds, smoothing, log rate, measurement options

## Download

Every push to `main` builds the app and publishes it under **Releases** as `lean.apk`.

## How the lean angle is measured

The gyroscope's roll rate is integrated (fast, immune to bumps) and continuously corrected by a
drift-free reference: GPS speed x turn rate while riding (`sin(lean) = v * yawRate / g`, refined
with the accelerometer above ~12 degrees) and plain gravity when the bike stands still. Gyro bias
is re-learned at every stop and, more slowly, while riding. See `src/leanFilter.js`.

## Build on your own computer

Needs Node.js 22+, JDK 17 and the Android SDK.

    npm install && npm run generate && npx expo prebuild -p android && cd android && ./gradlew assembleRelease

`npm run generate` creates `src/leafletBundle.js` (map library) and the icons in `assets/`.

## Ride file format

One JSON file per ride, documented at the top of `src/storage.js`.
