const fs = require('fs');
const path = require('path');
const { delaunay } = require('./delaunay');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'pareto_result.json'), 'utf-8'));
const sols = raw.solutions;
const conv = raw.convergence;

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

const SIGMA = 0.22, LAMBDA = 0.01;
const phi = d2 => Math.exp(-d2 / (2 * SIGMA * SIGMA));
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
function inTri(px, py, p0, p1, p2) {
  const d = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
  if (Math.abs(d) < 1e-18) return false;
  const s = ((p1[1] - p0[1]) * (px - p0[0]) + (p0[0] - p1[0]) * (py - p0[1])) / d;
  const t = ((p0[1] - p2[1]) * (px - p0[0]) + (p2[0] - p0[0]) * (py - p0[1])) / d;
  return s >= 0 && t >= 0 && s + t <= 1;
}
const inHull = (px, py) => tris.some(([a, b, c]) => inTri(px, py, pts2d[a], pts2d[b], pts2d[c]));

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
    row.push(inHull(ix / GRID, iy / GRID) ? evalRBF(ix / GRID, iy / GRID) : NaN);
  }
  gridZ.push(row);
}

const norm3 = sols.map(s => {
  const v = [s.objectives[0], s.objectives[1], s.objectives[2] * 100];
  return v.map((val, m) => (val - oMin[m]) / ((oMax[m] - oMin[m]) || 1));
});
let iA = 0, iB = 0;
for (let i = 1; i < sols.length; i++) {
  if (norm3[i][0] < norm3[iA][0]) iA = i;
  if (norm3[i][0] > norm3[iB][0]) iB = i;
}
const A0 = norm3[iA], B0 = norm3[iB];
const AB0 = B0.map((b, k) => b - A0[k]);
const abLen2 = AB0.reduce((s, v) => s + v * v, 0);
const dists = norm3.map(P => {
  const AP = P.map((p, k) => p - A0[k]);
  const t = AP.reduce((s, v, k) => s + v * AB0[k], 0) / abLen2;
  const proj = A0.map((a, k) => a + t * AB0[k]);
  return Math.sqrt(P.reduce((s, p, k) => s + (p - proj[k]) ** 2, 0));
});
const kneeIdx = dists.map((d, i) => [d, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]);

const hovertext = sols.map(s =>
  '成本: ' + s.objectives[0].toFixed(0) + ' 万元<br>碳排: ' + s.objectives[1].toFixed(1) +
  ' 吨<br>未覆盖: ' + (s.objectives[2] * 100).toFixed(1) + '%<br>RDC: ' + (s.rdc.join('/') || '无') +
  '<br>前置仓: ' + (s.fc.join('/') || '无') + '<br>车辆: ' + s.vehicle.join(',')
);

const darkAxis = { color: '#bbb', gridcolor: '#3a3a5e', zerolinecolor: '#444' };
const darkPaper = { paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1f1f3a', font: { color: '#eee' } };

const surfaceCfg = {
  traces: [
    {
      type: 'surface', x: gridXReal, y: gridYReal, z: gridZ,
      colorscale: 'Viridis', cmin: oMin[2], cmax: oMax[2], opacity: 0.92,
      showscale: false, hoverinfo: 'skip', name: '前沿曲面',
      contours: { z: { show: true, usecolormap: true, highlightcolor: '#fff', project: { z: true } } },
      lighting: { ambient: 0.55, diffuse: 0.85, specular: 0.15, roughness: 0.6 },
    },
    {
      type: 'scatter3d', mode: 'markers', x, y, z, text: hovertext, hoverinfo: 'text', name: '帕累托解',
      marker: { size: 4, color: z, colorscale: 'Viridis', cmin: oMin[2], cmax: oMax[2],
        opacity: 0.95, line: { width: 0.5, color: '#222' }, showscale: true,
        colorbar: { title: '未覆盖率 %', x: 1.1, thickness: 13 } },
    },
    {
      type: 'scatter3d', mode: 'markers+text', name: '拐点',
      x: kneeIdx.map(i => x[i]), y: kneeIdx.map(i => y[i]), z: kneeIdx.map(i => z[i]),
      marker: { size: 12, color: '#ff4444', symbol: 'x', line: { width: 2 } },
      text: kneeIdx.map(() => '拐点'), textposition: 'top center', textfont: { color: '#ff6b6b', size: 12 },
      hovertext: kneeIdx.map(i => hovertext[i]), hoverinfo: 'text',
    },
  ],
  layout: Object.assign({}, darkPaper, {
    title: { text: '三维帕累托前沿曲面（RBF 平滑 · 可拖拽旋转）', font: { size: 17 } },
    scene: {
      xaxis: Object.assign({ title: '总成本 (万元)' }, darkAxis),
      yaxis: Object.assign({ title: '碳排放 (吨)' }, darkAxis),
      zaxis: Object.assign({ title: '未覆盖率 (%)' }, darkAxis),
      camera: { eye: { x: 1.8, y: -1.6, z: 0.85 } },
    },
    legend: { x: 0.02, y: 0.98, font: { color: '#eee' } },
    margin: { l: 0, r: 0, t: 45, b: 0 },
  }),
};

function make2D(xi, yi, xname, yname) {
  const scale = v => (yi === 2 ? v * 100 : v);
  return {
    traces: [
      {
        type: 'scatter', mode: 'markers', text: hovertext, hoverinfo: 'text', name: '帕累托解',
        x: sols.map(s => s.objectives[xi]), y: sols.map(s => scale(s.objectives[yi])),
        marker: { size: 8, color: z, colorscale: 'Viridis', cmin: oMin[2], cmax: oMax[2],
          opacity: 0.9, line: { width: 0.5, color: '#222' }, showscale: false },
      },
      {
        type: 'scatter', mode: 'markers', name: '拐点',
        x: kneeIdx.map(i => sols[i].objectives[xi]), y: kneeIdx.map(i => scale(sols[i].objectives[yi])),
        marker: { size: 14, color: '#ff4444', symbol: 'x', line: { width: 2 } },
      },
    ],
    layout: Object.assign({}, darkPaper, {
      xaxis: Object.assign({ title: xname }, darkAxis),
      yaxis: Object.assign({ title: yname }, darkAxis),
      margin: { l: 60, r: 15, t: 10, b: 50 }, showlegend: false,
    }),
  };
}

function normSeries(arr) {
  const vals = arr.filter(v => v != null);
  const mx = Math.max(...vals), mn = Math.min(...vals);
  return arr.map(v => (v == null ? null : (v - mn) / ((mx - mn) || 1)));
}
const convCfg = {
  traces: ['min 成本', 'min 碳排', 'min 未覆盖率'].map((name, m) => ({
    type: 'scatter', mode: 'lines', name,
    x: conv.gen, y: normSeries(conv.minF[m]),
    line: { width: 2 }, hovertemplate: '代数 %{x}<br>' + name + ' (归一化) %{y:.3f}<extra></extra>',
  })),
  layout: Object.assign({}, darkPaper, {
    title: { text: '收敛曲线（各目标最优值，归一化至 0–1）', font: { size: 15 } },
    xaxis: Object.assign({ title: '代数' }, darkAxis),
    yaxis: Object.assign({ title: '归一化值', range: [0, 1.05] }, darkAxis),
    legend: { x: 0.02, y: 0.02, bgcolor: 'rgba(0,0,0,0.3)' },
    margin: { l: 55, r: 20, t: 40, b: 45 },
  }),
};

const CONFIG = {
  surface: surfaceCfg,
  p1: make2D(0, 1, '总成本 (万元)', '碳排放 (吨)'),
  p2: make2D(0, 2, '总成本 (万元)', '未覆盖率 (%)'),
  p3: make2D(1, 2, '碳排放 (吨)', '未覆盖率 (%)'),
  conv: convCfg,
};

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>帕累托前沿综合可视化 · 长三角绿色物流网络</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Microsoft YaHei",sans-serif;background:#1a1a2e;color:#eee;padding:14px}
  h1{text-align:center;font-size:20px;margin-bottom:4px}
  .info{text-align:center;font-size:13px;color:#888;margin-bottom:14px}
  b{color:#91bfdb}
  .card{background:#1f1f3a;border-radius:8px;padding:6px;margin-bottom:16px;border:1px solid #2a2a4e}
  #surface{width:100%;height:600px}
  .row{display:flex;gap:10px}
  .proj{flex:1;height:290px}
  #conv{width:100%;height:300px}
  h2{font-size:14px;color:#aaa;margin:6px 4px}
</style></head>
<body>
  <h1>长三角绿色物流网络 · 帕累托前沿综合可视化</h1>
  <div class="info">帕累托最优解 <b>${sols.length}</b> 个 ·
    <span style="color:#ff6b6b">✕ 拐点</span> · 颜色 = 未覆盖率（Viridis，低→高）</div>

  <div class="card"><div id="surface"></div></div>

  <h2>二维投影（两两目标权衡）</h2>
  <div class="row">
    <div class="card proj" id="p1"></div>
    <div class="card proj" id="p2"></div>
    <div class="card proj" id="p3"></div>
  </div>

  <h2>收敛过程</h2>
  <div class="card"><div id="conv"></div></div>

  <script>
  var CFG = ${JSON.stringify(CONFIG)};
  Plotly.newPlot('surface', CFG.surface.traces, CFG.surface.layout, {responsive:true});
  ['p1','p2','p3'].forEach(function(id){ Plotly.newPlot(id, CFG[id].traces, CFG[id].layout, {responsive:true}); });
  Plotly.newPlot('conv', CFG.conv.traces, CFG.conv.layout, {responsive:true});
  </script>
</body></html>`;

fs.writeFileSync(path.join(__dirname, 'pareto_visualization.html'), html, 'utf-8');
console.log('综合可视化已生成: ' + path.join(__dirname, 'pareto_visualization.html'));
