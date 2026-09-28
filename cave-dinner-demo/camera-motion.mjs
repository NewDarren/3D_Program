// Rounded walking paths remain inside the same collision envelope as manual walking.
export const easeCamera = t => t * t * t * (t * (t * 6 - 15) + 10);
export function roundWalkingPath(points, navigator) {
  if (points.length < 3) return points;
  const result = [points[0]];
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const ab = Math.hypot(a.x - b.x, a.z - b.z), bc = Math.hypot(c.x - b.x, c.z - b.z);
    let rounded = null;
    for (const radius of [0.85, 0.45, 0.2, 0.08]) {
      const trim = Math.min(radius, ab * 0.4, bc * 0.4);
      const entry = mix(b, a, trim / (ab || 1)), exit = mix(b, c, trim / (bc || 1));
      const curve = Array.from({ length: 17 }, (_, n) => {
        const t = n / 16;
        return mix(mix(entry, b, t), mix(b, exit, t), t);
      });
      const candidate = [result.at(-1), ...curve, c];
      if (candidate.every(p => navigator.canStand(p.x, p.z)) && candidate.slice(1).every((p, j) => navigator.canTraverse(candidate[j], p))) {
        rounded = curve; break;
      }
    }
    result.push(...(rounded || [b]));
  }
  result.push(points.at(-1));
  // Cross-corner trimming is checked again after all corners are combined.
  return result.slice(1).every((p, i) => navigator.canTraverse(result[i], p)) ? result : points;
}
