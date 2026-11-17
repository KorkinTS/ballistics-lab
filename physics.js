"use strict";

function solveFlight({ angle, speed, height, gravity, coefficient = 0 }) {
  const radians = angle * Math.PI / 180;
  const vx = Math.abs(angle) === 90 ? 0 : speed * Math.cos(radians);
  const vy = speed * Math.sin(radians);
  const g = gravity;
  const k = coefficient;

  function rawPosition(t) {
    if (k === 0) {
      return { t, x: vx * t, y: height + t * (vy - g * t / 2) };
    }
    const z = k * t;
    const A = -Math.expm1(-z) / k;
    // Taylor expansion avoids subtracting almost equal values near k*t = 0.
    const B = z < 0.01
      ? t * t * (1 / 2 - z * (1 / 6 - z * (1 / 24 - z * (1 / 120 - z / 720))))
      : (t - A) / k;
    return { t, x: vx * A, y: height + vy * A - g * B };
  }

  let apexTime = Math.max(0, vy / g);
  if (k > 0 && apexTime > 0) apexTime = Math.log1p(k * apexTime) / k;
  let duration = 0;
  if (height > 0 || vy > 0) {
    const root = Math.hypot(vy, Math.sqrt(2 * g * height));
    const idealTime = vy >= 0 ? (vy + root) / g : (2 * height) / (root - vy);
    duration = idealTime;
    if (k > 0) {
      let low = apexTime;
      let high = idealTime;
      while (rawPosition(high).y > 0) high *= 2;
      for (let iteration = 0; iteration < 72; iteration++) {
        const mid = (low + high) / 2;
        if (rawPosition(mid).y > 0) low = mid;
        else high = mid;
      }
      duration = (low + high) / 2;
    }
  }

  function position(t) {
    const point = rawPosition(Math.max(0, Math.min(duration, t)));
    return { ...point, y: point.t === duration ? 0 : Math.max(0, point.y) };
  }

  return { duration, apexTime, peak: position(apexTime).y, range: position(duration).x, position };
}

if (typeof module !== "undefined") module.exports = { solveFlight };
