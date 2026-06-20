const fs = require('fs');
const path = require('path');
const { delaunay } = require('./delaunay');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'pareto_result.json'), 'utf-8'));
const sols = raw.solutions;

const x = sols.map(s => s.objectives[0]);
const y = sols.map(s => s.objectives[1]);
const z = sols.map(s => s.objectives[2] * 100);

const oMin = [Math.min(...x), Math.min(...y), Math.min(...z)];
const oMax = [Math.max(...x), Math.max(...y), Math.max(...z)];

const pts2d = sols.map((s, i) => [
  (s.objectives[0] - oMin[0]) / ((oMax[0] - oMin[0]) || 1) + (i + 1) * 1e-9,
  (s.objectives[1] - oMin[1]) / ((oMax[1] - oMin[1]) || 1),
]);
const tris = delaunay(pts2d);

// ---- 高斯消元解 Ax=b ----
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const diag = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

// ---- 高斯 RBF 插值 ----
const SIGMA = 0.22, LAMBDA = 0.01;
const phi = (d2) => Math.exp(-d2 / (2 * SIGMA * SIGMA));
const rbfW = (() => {
  const n = pts2d.length;
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const dx = pts2d[i][0] - pts2d[j][0], dy = pts2d[i][1] - pts2d[j][1];
      return phi(dx * dx + dy * dy) + (i === j ? LAMBDA : 0);
    })
  );
  return solve(A, z);
})();
const evalRBF = (px, py) => {
  let sum = 0;
  for (let i = 0; i < pts2d.length; i++) {
    const dx = px - pts2d[i][0], dy = py - pts2d[i][1];
    sum += rbfW[i] * phi(dx * dx + dy * dy);
  }
  return sum;
};

// ---- 点在三角形内（重心坐标）----
function inTri(px, py, p0, p1, p2) {
  const d = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
  if (Math.abs(d) < 1e-18) return false;
  const s = ((p1[1] - p0[1]) * (px - p0[0]) + (p0[0] - p1[0]) * (py - p0[1])) / d;
  const t = ((p0[1] - p2[1]) * (px - p0[0]) + (p2[0] - p0[0]) * (py - p0[1])) / d;
  return s >= 0 && t >= 0 && s + t <= 1;
}
const inHull = (px, py) => {
  for (const [a, b, c] of tris)
    if (inTri(px, py, pts2d[a], pts2d[b], pts2d[c])) return true;
  return false;
};

// ---- 规则网格采样 ----
const GRID = 55;
const gridXReal = [], gridYReal = [];
for (let i = 0; i <= GRID; i++) {
  gridXReal.push((i / GRID) * (oMax[0] - oMin[0]) + oMin[0]);
  gridYReal.push((i / GRID) * (oMax[1] - oMin[1]) + oMin[1]);
}
const gridZ = [];
for (let iy = 0; iy <= GRID; iy++) {
  const row = [];
  for (let ix = 0; ix <= GRID; ix++) {
    const nx = ix / GRID, ny = iy / GRID;
    row.push(inHull(nx, ny) ? evalRBF(nx, ny) : NaN);
  }
  gridZ.push(row);
}

// ---- 拐点 ----
const norm3 = sols.map(s => {
  const v = [s.objectives[0], s.objectives[1], s.objectives[2] * 100];
  return v.map((val, m) => (val - oMin[m]) / ((oMax[m] - oMin[m]) || 1));
});
let iA = 0, iB = 0;
for (let i = 1; i < sols.length; i++) {
  if (norm3[i][0] < norm3[iA][0]) iA = i;
  if (norm3[i][0] > norm3[iB][0]) iB = i;
}
const A = norm3[iA], Bv = norm3[iB];
const AB = Bv.map((b, k) => b - A[k]);
const abLen2 = AB.reduce((s, v) => s + v * v, 0);
const dists = norm3.map(P => {
  const AP = P.map((p, k) => p - A[k]);
  const t = AP.reduce((s, v, k) => s + v * AB[k], 0) / abLen2;
  const proj = A.map((a, k) => a + t * AB[k]);
  return Math.sqrt(P.reduce((s, p, k) => s + (p - proj[k]) ** 2, 0));
});
const kneeIdx = dists.map((d, i) => [d, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]);

const hovertext = sols.map(s =>
  '成本: ' + s.objectives[0].toFixed(0) + ' 万元<br>' +
  '碳排: ' + s.objectives[1].toFixed(1) + ' 吨<br>' +
  '未覆盖: ' + (s.objectives[2] * 100).toFixed(1) + '%<br>' +
  'RDC: ' + (s.rdc.join('/') || '无') + '<br>' +
  '前置仓: ' + (s.fc.join('/') || '无') + '<br>' +
  '车辆: ' + s.vehicle.join(',')
);

const surface = {
  type: 'surface', x: gridXReal, y: gridYReal, z: gridZ,
  colorscale: 'Viridis', cmin: oMin[2], cmax: oMax[2],
  opacity: 0.92, showscale: false, hoverinfo: 'skip', name: '前沿曲面',
  contours: { z: { show: true, usecolormap: true, highlightcolor: '#ffffff', project: { z: true } } },
  lighting: { ambient: 0.55, diffuse: 0.85, specular: 0.15, roughness: 0.6 },
};
const scatter = {
  type: 'scatter3d', mode: 'markers', x, y, z,
  marker: { size: 4, color: z, colorscale: 'Viridis', cmin: oMin[2], cmax: oMax[2],
    opacity: 0.95, line: { width: 0.5, color: '#222' }, showscale: true,
    colorbar: { title: '未覆盖率 %', x: 1.12, thickness: 14 } },
  text: hovertext, hoverinfo: 'text', name: '帕累托解',
};
const knee = {
  type: 'scatter3d', mode: 'markers+text',
  x: kneeIdx.map(i => x[i]), y: kneeIdx.map(i => y[i]), z: kneeIdx.map(i => z[i]),
  marker: { size: 12, color: '#ff4444', symbol: 'x', line: { width: 2 } },
  text: kneeIdx.map(() => '拐点'), textposition: 'top center',
  textfont: { color: '#ff6b6b', size: 13 },
  hovertext: kneeIdx.map(i => hovertext[i]), hoverinfo: 'text', name: '拐点',
};

const layout = {
  title: { text: '帕累托前沿曲面 · 长三角绿色物流网络', font: { size: 19 } },
  scene: {
    xaxis: { title: '总成本 (万元)', color: '#ccc' },
    yaxis: { title: '碳排放 (吨)', color: '#ccc' },
    zaxis: { title: '未覆盖率 (%)', color: '#ccc' },
    camera: { eye: { x: 1.8, y: -1.6, z: 0.85 } },
  },
  legend: { x: 0.02, y: 0.98, font: { color: '#eee', size: 12 } },
  paper_bgcolor: '#1a1a2e',
  font: { color: '#eee' },
  margin: { l: 0, r: 0, t: 50, b: 0 },
};

const traces = [surface, scatter, knee];
const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>帕累托前沿曲面（平滑）</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
  body{margin:0;font-family:"Microsoft YaHei",sans-serif;background:#1a1a2e;color:#eee;display:flex;flex-direction:column;align-items:center}
  .bar{padding:10px 20px;font-size:13px;color:#999}
  b{color:#91bfdb}
</style></head>
<body>
  <div class="bar">帕累托最优解 <b>${sols.length}</b> 个 · RBF 光滑曲面 · 底部等高线投影 ·
    <span style="color:#ff6b6b">✕ 拐点</span> · 可拖拽旋转 / 滚轮缩放</div>
  <div id="plot"></div>
  <script>
    Plotly.newPlot('plot', ${JSON.stringify(traces)}, ${JSON.stringify(layout)}, {responsive:true});
  </script>
</body></html>`;

const outPath = path.join(__dirname, 'pareto_surface.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log('平滑曲面渲染已生成: ' + outPath);
