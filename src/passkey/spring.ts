/**
 * A spring, written as a CSS `linear()` easing.
 *
 * The box's push used to overshoot by having a keyframe past its place and another back
 * at it — which is two moves, and reads as one: out, then in again. A spring is a single
 * move whose curve happens to pass the target and come back, so there is nothing to see
 * but the push.
 *
 * `bounce` is the Apple-style parameter rather than a damping ratio: 0 is critically
 * damped and stops dead, 0.5 carries well past and returns. It maps to a damping ratio of
 * 1 - bounce, which is what the oscillator below is actually solving.
 */
export function springEasing(bounce: number, durationMs: number, samples = 48): string {
  const zeta = Math.max(0.04, Math.min(1, 1 - bounce));
  const seconds = durationMs / 1000;
  // Chosen so the spring has actually stopped by the end of its own duration. Without
  // that the curve is still moving when the time runs out, and pinning the last point to
  // 1 turns the remainder into a jump — exactly the second move this was meant to remove.
  //
  // Underdamped, the envelope is e^(-zeta * omega * t), so zeta * omega * seconds = 3.9
  // leaves it within 2%. Critically damped there is a (1 + omega * t) term pulling the
  // other way and the same 3.9 leaves it 9% short — a pixel and a half of snap at the
  // end, which is worst at bounce 0, the setting that is meant to be the quiet one.
  const omega = (zeta >= 0.99 ? 6 : 3.9) / (zeta * seconds);
  const damped = omega * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));

  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * seconds;
    const decay = Math.exp(-zeta * omega * t);
    const value = zeta < 1
      ? 1 - decay * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t))
      : 1 - decay * (1 + omega * t);        // critically damped: no overshoot at all
    points.push(value.toFixed(4));
  }
  // pinned at both ends: by here the spring has settled, so this only tidies away the
  // last fraction of a percent rather than papering over a live oscillation
  points[0] = "0";
  points[points.length - 1] = "1";
  return `linear(${points.join(",")})`;
}
