/**
 * Lean-angle estimator (pure JS, no React / native imports, so it can be simulated in Node).
 *
 * Same idea as published smartphone methods (gyro roll rate fused with a drift-free
 * "steady-state" lean):
 *
 *   1. FAST PATH  – integrate the gyroscope's roll rate. Immune to bumps, but drifts.
 *   2. SLOW PATH  – an absolute reference that pulls the drift out:
 *        a) riding (GPS speed > ~15 km/h): physics of a balanced turn,
 *              sin(lean) = speed * yawRate / g
 *           refined above ~12° with the accelerometer (|a| = g / cos(lean)), which also
 *           captures the extra lean caused by tyre width;
 *        b) standing still / slow and straight: plain accelerometer tilt.
 *   3. GYRO BIAS  – re-learned every time the bike stands still, because phone gyros drift
 *      as they heat up in the sun. A wrong bias is what leaves the reading "stuck" in a lean.
 *
 * Conventions: lean in radians, + = right. Accelerometer input must be the "up" vector in g
 * (at rest it points away from the ground). Gyro in rad/s, device frame, right-handed.
 */

const G = 9.81;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lpf = (dt, tau) => 1 - Math.exp(-dt / tau);

export const FILTER_DEFAULTS = {
  gpsFusion: true, // use GPS speed x yaw rate as the riding reference
  autoBias: true, // re-learn gyro bias whenever the bike stands still
  accTau: 0.25, // s, accelerometer low-pass (engine vibration, potholes)
  yawTau: 0.5, // s, yaw-rate low-pass
  rollTau: 0.3, // s, roll-rate low-pass (used to detect quick direction changes)
  biasKi: 0.01, // 1/s², slow roll-bias learning while riding (integral feedback)
  yawBiasTau: 30, // s, yaw-bias learning from GPS course while riding
  maxBias: 0.06, // rad/s per-axis limit for any learned bias
  refTauRiding: 2.5, // s, how fast the riding reference corrects the gyro
  refTauStill: 1.0, // s, how fast the accelerometer corrects when stopped / straight
  biasTau: 4.0, // s, gyro bias learning at standstill
  minFusionSpeed: 4.0, // m/s (~15 km/h)
  maxLean: 1.25, // rad (~72°) hard limit
  calDelay: 0.35, // s to wait after the button press (finger shake)
  calWindow: 1.5, // s of averaging
};

export function createLeanFilter(options = {}) {
  const opts = { ...FILTER_DEFAULTS, ...options };
  const s = {
    t: null, // last gyro timestamp (s)
    acc: [0, 0, 1],
    accT: null,
    accCount: 0,
    bias: [0, 0, 0],
    up: [0, 0, 1],
    right: [1, 0, 0],
    fwd: [0, 1, 0],
    lean: 0,
    yawLP: 0,
    rollLP: 0,
    speed: 0,
    speedAt: -1e9,
    heading: null, // last GPS course (deg)
    headingAt: 0,
    yawInt: 0, // gyro yaw (earth vertical) integrated since the last GPS fix
    calibrated: false,
    needAccInit: false, // restored calibration: take first lean from accelerometer
    cal: null, // running calibration window
    source: 'NONE', // which reference is active: GPS | ACC | GYRO | NONE
  };

  function setAxes(upRaw) {
    const up = normalize(upRaw);
    // Which screen axis is the bike's left-right axis? Works for portrait, upside-down
    // portrait and both landscape directions.
    const seed =
      Math.abs(up[1]) >= Math.abs(up[0])
        ? [Math.sign(up[1]) || 1, 0, 0]
        : [0, -(Math.sign(up[0]) || 1), 0];
    const d = dot(seed, up);
    const right = normalize([seed[0] - d * up[0], seed[1] - d * up[1], seed[2] - d * up[2]]);
    s.up = up;
    s.right = right;
    s.fwd = cross(up, right);
  }

  function addBias(axis, amount) {
    s.bias = [0, 1, 2].map((i) =>
      clamp(s.bias[i] + axis[i] * amount, -opts.maxBias, opts.maxBias)
    );
  }

  function finishCalibration() {
    const c = s.cal;
    s.cal = null;
    if (!c || c.nAcc < 5 || c.nGyro < 5) return false;
    setAxes([c.acc[0] / c.nAcc, c.acc[1] / c.nAcc, c.acc[2] / c.nAcc]);
    const mean = [c.gyro[0] / c.nGyro, c.gyro[1] / c.nGyro, c.gyro[2] / c.nGyro];
    const variance = c.gyroSq / c.nGyro - dot(mean, mean);
    const speedKnown = s.t - s.speedAt < 3;
    // Only trust the averaged gyro as "bias" if the bike really was still.
    if (variance < 0.03 * 0.03 * 3 && (!speedKnown || s.speed < 1)) s.bias = mean;
    s.lean = 0;
    s.yawLP = 0;
    s.rollLP = 0;
    s.yawInt = 0;
    s.heading = null;
    s.calibrated = true;
    s.needAccInit = false;
    return true;
  }

  return {
    opts,

    /** Begin a "hold still" zeroing window. The current position becomes 0°. */
    startCalibration() {
      const t = s.t ?? 0;
      s.cal = {
        from: t + opts.calDelay,
        until: t + opts.calDelay + opts.calWindow,
        acc: [0, 0, 0],
        nAcc: 0,
        gyro: [0, 0, 0],
        gyroSq: 0,
        nGyro: 0,
      };
    },
    isCalibrating: () => !!s.cal,
    isCalibrated: () => s.calibrated,

    /** Save / restore the mount orientation so the app does not need re-zeroing every start. */
    getCalibration: () =>
      s.calibrated ? { up: s.up, right: s.right, fwd: s.fwd, bias: s.bias } : null,
    setCalibration(c) {
      if (!c || !c.up || !c.right || !c.fwd) return;
      s.up = c.up;
      s.right = c.right;
      s.fwd = c.fwd;
      if (c.bias) s.bias = c.bias;
      s.calibrated = true;
      s.needAccInit = true;
      s.cal = null;
    },

    /**
     * GPS fix: speed in m/s and course over ground in degrees (clockwise from north), or
     * null when unknown. Comparing the course change with what the gyro measured over the
     * same second reveals the gyro's yaw bias, which otherwise corrupts the riding reference.
     */
    setGps(mps, headingDeg) {
      const t = s.t ?? 0;
      const dtFix = t - s.headingAt;
      if (
        s.calibrated &&
        headingDeg != null &&
        headingDeg >= 0 &&
        s.heading != null &&
        mps > 6 &&
        s.speed > 6 &&
        dtFix > 0.3 &&
        dtFix < 2.5
      ) {
        let dH = headingDeg - s.heading;
        dH = ((((dH + 180) % 360) + 360) % 360) - 180;
        if (Math.abs(dH) < 40) {
          const gpsYaw = (-dH * Math.PI) / 180; // clockwise course change = negative yaw
          const err = (s.yawInt - gpsYaw) / dtFix; // rad/s the gyro over-reads
          const k = clamp(dtFix / opts.yawBiasTau, 0, 0.2) * clamp(1 - Math.abs(err) / 0.15, 0, 1);
          addBias(s.up, k * err);
        }
      }
      s.heading = headingDeg != null && headingDeg >= 0 ? headingDeg : null;
      s.headingAt = t;
      s.yawInt = 0;
      s.speed = mps;
      s.speedAt = t;
    },

    /** Accelerometer sample: "up" vector in g, device frame. tSec optional. */
    onAccel(x, y, z, tSec) {
      const dt = s.accT != null && tSec != null ? clamp(tSec - s.accT, 0.001, 0.1) : 0.02;
      if (tSec != null) s.accT = tSec;
      const k = s.accCount < 5 ? 1 : lpf(dt, opts.accTau);
      s.acc = [
        s.acc[0] + k * (x - s.acc[0]),
        s.acc[1] + k * (y - s.acc[1]),
        s.acc[2] + k * (z - s.acc[2]),
      ];
      s.accCount += 1;
      const c = s.cal;
      if (c && s.t != null && s.t >= c.from) {
        c.acc[0] += x;
        c.acc[1] += y;
        c.acc[2] += z;
        c.nAcc += 1;
      }
      if (s.needAccInit && s.accCount > 25) {
        s.lean = Math.atan2(-dot(s.acc, s.right), dot(s.acc, s.up));
        s.needAccInit = false;
      }
    },

    /** Gyroscope sample in rad/s, device frame. tSec = timestamp in seconds. */
    onGyro(x, y, z, tSec) {
      let dt = s.t != null ? tSec - s.t : 0;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.1) dt = 0.1;
      s.t = tSec;
      const raw = [x, y, z];

      const c = s.cal;
      if (c) {
        if (tSec >= c.from) {
          c.gyro[0] += x;
          c.gyro[1] += y;
          c.gyro[2] += z;
          c.gyroSq += dot(raw, raw);
          c.nGyro += 1;
        }
        if (tSec >= c.until) finishCalibration();
      }
      if (!s.calibrated || dt === 0) return;

      const w = [x - s.bias[0], y - s.bias[1], z - s.bias[2]];
      const rollRate = dot(w, s.fwd);
      const yawRate = dot(w, s.up);
      s.yawLP += lpf(dt, opts.yawTau) * (yawRate - s.yawLP);
      s.rollLP += lpf(dt, opts.rollTau) * (rollRate - s.rollLP);
      // yaw about the true vertical (the bike's own "up" is tilted by the lean)
      s.yawInt += (Math.cos(s.lean) * yawRate - Math.sin(s.lean) * dot(w, s.right)) * dt;

      // 1) fast path
      s.lean += rollRate * dt;

      // 2) slow path
      const ay = dot(s.acc, s.right);
      const az = dot(s.acc, s.up);
      const m = Math.hypot(ay, az); // load in the bike's left-right plane: 1 g upright, g/cos(lean) in a turn
      const gTotal = len(s.acc);
      const accTilt = Math.atan2(-ay, az);
      const speedKnown = tSec - s.speedAt < 3;
      const v = s.speed;
      const viaAcc = (sign) => sign * Math.acos(clamp(1 / m, -1, 1)) + accTilt;

      let ref = null;
      let tau = opts.refTauStill;
      let source = 'GYRO';

      if (speedKnown && v < 0.7) {
        // standing still: gravity alone tells the tilt
        if (Math.abs(gTotal - 1) < 0.05) {
          ref = accTilt;
          source = 'ACC';
        }
      } else if (opts.gpsFusion && speedKnown && v > opts.minFusionSpeed) {
        // balanced turn: sin(lean) = v * yawRate / g   (right turn = negative yaw about "up")
        const kin = Math.asin(clamp((-v * s.yawLP) / G, -0.94, 0.94));
        ref = kin;
        source = 'GPS';
        // Above ~12° the accelerometer gives a better steady-state angle and includes the
        // tyre-width effect: the resultant force is tilted acos(g/|a|) from vertical and
        // accTilt from the bike's own "up".
        if (Math.abs(kin) > 0.21 && m > 1.02) {
          const alt = viaAcc(Math.sign(kin));
          if (Math.abs(alt - kin) < 0.21) ref = alt; // sanity: must agree within 12°
        }
        tau = opts.refTauRiding;
      } else if (Math.abs(m - 1) < 0.03 && Math.abs(gTotal - 1) < 0.06) {
        // no usable GPS: the load is ~1 g, so the bike is (nearly) not cornering
        ref = accTilt;
        tau = 1.5;
        source = 'ACC';
      } else if (m > 1.04 && Math.abs(s.yawLP) > 0.08) {
        // no usable GPS, clearly cornering: lean from the cornering load
        ref = viaAcc(-Math.sign(s.yawLP));
        tau = opts.refTauRiding;
        source = 'ACC';
      }

      if (ref != null) {
        // trust the reference less while the bike is being flicked over (it lags)
        const steady = 1 / (1 + (s.rollLP / 0.12) ** 2);
        const e = ref - s.lean;
        s.lean += steady * lpf(dt, tau) * e;
        // integral feedback: a persistent error means the roll gyro has a bias
        // (only with the GPS reference, the others are not accurate enough for that)
        if (source === 'GPS') addBias(s.fwd, -opts.biasKi * steady * e * dt);
      }
      s.source = source;
      s.lean = clamp(s.lean, -opts.maxLean, opts.maxLean);

      // 3) gyro bias on all axes, when GPS confirms the bike is standing still
      if (
        opts.autoBias &&
        speedKnown &&
        v < 0.7 &&
        len(w) < 0.15 &&
        Math.abs(gTotal - 1) < 0.04
      ) {
        const k = lpf(dt, opts.biasTau);
        s.bias = [
          s.bias[0] + k * (x - s.bias[0]),
          s.bias[1] + k * (y - s.bias[1]),
          s.bias[2] + k * (z - s.bias[2]),
        ];
      }
    },

    getLeanDeg: () => (s.lean * 180) / Math.PI,
    getSource: () => (s.calibrated ? s.source : 'NONE'),
    _state: s,
  };
}
