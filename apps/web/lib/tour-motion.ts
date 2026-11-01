/** One time-based progress value drives the camera, object, and copy. */
export function followProgress(current: number, target: number, delta: number, reduced: boolean): number {
  if (reduced || Math.abs(target - current) < 0.0001) return target;
  return current + (target - current) * (1 - Math.exp(-11 * Math.min(0.05, Math.max(0.001, delta))));
}

/** Fit measured screenshot dimensions inside a fraction of the scene viewport. */
export function fitCaptureDistance(width: number, height: number, aspect: number, fov: number, fillX: number, fillY: number): number {
  const tangent = Math.tan(fov * Math.PI / 360);
  return Math.max(height / (2 * tangent * fillY), width / (2 * tangent * Math.max(0.1, aspect) * fillX));
}
