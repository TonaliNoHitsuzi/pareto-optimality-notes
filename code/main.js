const fs = require('fs');
const path = require('path');
const { cities, dist, PARAMS, N } = require('./config');
const { run } = require('./nsga2');

const t0 = Date.now();
const { pareto, convergence } = run({ pop: 100, gen: 500 });
const dt = Date.now() - t0;

const objMin = [Infinity, Infinity, Infinity];
const objMax = [-Infinity, -Infinity, -Infinity];
for (const s of pareto) {
  for (let m = 0; m < 3; m++) {
    objMin[m] = Math.min(objMin[m], s.objectives[m]);
    objMax[m] = Math.max(objMax[m], s.objectives[m]);
  }
}

console.log('====== NSGA-II 求解完成 ======');
console.log(`耗时: ${dt} ms | 帕累托最优解数: ${pareto.length}`);
console.log('目标值范围 (f1 成本/万元, f2 碳排/吨, f3 未覆盖率):');
console.log(`  f1: ${objMin[0].toFixed(1)} ~ ${objMax[0].toFixed(1)}`);
console.log(`  f2: ${objMin[1].toFixed(2)} ~ ${objMax[1].toFixed(2)}`);
console.log(`  f3: ${(objMin[2] * 100).toFixed(1)}% ~ ${(objMax[2] * 100).toFixed(1)}%`);
console.log('\n--- 代表性解（按成本升序，取前5）---');
const sorted = [...pareto].sort((a, b) => a.objectives[0] - b.objectives[0]);
for (const s of sorted.slice(0, 5)) {
  const rdc = s.rdc.map((v, i) => (v ? cities[i].name : null)).filter(Boolean).join('/');
  const fc = s.fc.map((v, i) => (v ? cities[i].name : null)).filter(Boolean).join('/') || '无';
  const elec = s.vehicle.reduce((a, b) => a + b, 0);
  console.log(
    `  成本=${s.objectives[0].toFixed(0)} 碳排=${s.objectives[1].toFixed(1)} 未覆盖=${(s.objectives[2] * 100).toFixed(0)}%` +
    ` | RDC:${rdc} 前置仓:${fc} 电动车线路:${elec}/5`
  );
}

const decode = s => ({
  rdc: s.rdc.map((v, i) => (v ? cities[i].name : null)).filter(Boolean),
  fc: s.fc.map((v, i) => (v ? cities[i].name : null)).filter(Boolean),
  assign: s.assign.map((a, i) => `${cities[i].name}←${cities[a].name}`),
  vehicle: s.vehicle.map((v, i) => `${cities[i].name}:${v ? '电' : '油'}`),
  objectives: s.objectives.map(v => Number(v.toFixed(4))),
});

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    elapsedMs: dt,
    popSize: 100,
    generations: 500,
    params: PARAMS,
  },
  cities: cities.map(c => ({ name: c.name, lat: c.lat, lon: c.lon, demand: c.demand })),
  dist,
  solutions: sorted.map(decode),
  convergence,
};

const outPath = path.join(__dirname, 'pareto_result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
console.log(`\n结果已写入: ${outPath}`);
