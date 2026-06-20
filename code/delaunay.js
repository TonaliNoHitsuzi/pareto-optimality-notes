function delaunay(points) {
  const n = points.length;
  if (n < 3) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const dx = (maxX - minX) || 1, dy = (maxY - minY) || 1;
  const dmax = Math.max(dx, dy);
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;

  const pts = points.map((p, i) => ({ x: p[0], y: p[1], id: i }));
  pts.push({ x: mx - 20 * dmax, y: my - dmax, id: -1 });
  pts.push({ x: mx, y: my + 20 * dmax, id: -1 });
  pts.push({ x: mx + 20 * dmax, y: my - dmax, id: -1 });
  const S1 = n, S2 = n + 1, S3 = n + 2;

  const orient = (a, b, c) =>
    (pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) -
    (pts[c].x - pts[a].x) * (pts[b].y - pts[a].y);

  const inCircle = (a, b, c, d) => {
    const ax = pts[a].x - pts[d].x, ay = pts[a].y - pts[d].y;
    const bx = pts[b].x - pts[d].x, by = pts[b].y - pts[d].y;
    const cx = pts[c].x - pts[d].x, cy = pts[c].y - pts[d].y;
    return (ax * ax + ay * ay) * (bx * cy - cx * by)
      - (bx * bx + by * by) * (ax * cy - cx * ay)
      + (cx * cx + cy * cy) * (ax * by - bx * ay) > 0;
  };

  let tris = [orient(S1, S2, S3) > 0 ? [S1, S2, S3] : [S1, S3, S2]];

  for (let p = 0; p < n; p++) {
    const bad = [];
    const good = [];
    for (const t of tris) {
      if (inCircle(t[0], t[1], t[2], p)) bad.push(t);
      else good.push(t);
    }
    const edgeCount = new Map();
    for (const t of bad) {
      for (let e = 0; e < 3; e++) {
        const a = t[e], b = t[(e + 1) % 3];
        const key = a < b ? a + '_' + b : b + '_' + a;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      }
    }
    for (const t of bad) {
      for (let e = 0; e < 3; e++) {
        const a = t[e], b = t[(e + 1) % 3];
        const key = a < b ? a + '_' + b : b + '_' + a;
        if (edgeCount.get(key) === 1) {
          good.push(orient(a, b, p) > 0 ? [a, b, p] : [a, p, b]);
        }
      }
    }
    tris = good;
  }

  const result = [];
  for (const t of tris) {
    if (t[0] < n && t[1] < n && t[2] < n) result.push([t[0], t[1], t[2]]);
  }
  return result;
}

module.exports = { delaunay };
