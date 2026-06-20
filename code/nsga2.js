const { cities, dist, PARAMS, N } = require('./config');

const cloneShell = ind => ({
  rdc: [...ind.rdc],
  fc: [...ind.fc],
  assign: [...ind.assign],
  vehicle: [...ind.vehicle],
});

function randomInd() {
  return {
    rdc: Array.from({ length: N }, () => (Math.random() < 0.5 ? 1 : 0)),
    fc: Array.from({ length: N }, () => (Math.random() < 0.5 ? 1 : 0)),
    assign: Array.from({ length: N }, () => Math.floor(Math.random() * N)),
    vehicle: Array.from({ length: N }, () => (Math.random() < 0.5 ? 1 : 0)),
  };
}

function repair(ind) {
  if (ind.rdc.every(v => v === 0)) {
    ind.rdc[Math.floor(Math.random() * N)] = 1;
  }
  for (let i = 0; i < N; i++) {
    if (!ind.rdc[ind.assign[i]]) {
      let best = -1, bestD = Infinity;
      for (let j = 0; j < N; j++) {
        if (ind.rdc[j] && dist[j][i] < bestD) { bestD = dist[j][i]; best = j; }
      }
      ind.assign[i] = best;
    }
  }
}

function evaluate(ind) {
  let f1 = 0, f2 = 0;
  for (let j = 0; j < N; j++) {
    if (ind.rdc[j]) f1 += PARAMS.C_rdc;
    if (ind.fc[j]) f1 += PARAMS.C_fc;
  }
  for (let i = 0; i < N; i++) {
    const j = ind.assign[i];
    const d = dist[j][i];
    const q = cities[i].demand;
    const c_u = ind.vehicle[i] ? PARAMS.c_elec : PARAMS.c_fuel;
    const e_u = ind.vehicle[i] ? PARAMS.e_elec : PARAMS.e_fuel;
    const gamma = ind.fc[i] ? 1 : PARAMS.delta;
    f1 += q * d * c_u * gamma;
    f2 += q * d * e_u;
  }
  let wcov = 0, tq = 0;
  for (let i = 0; i < N; i++) {
    const d = dist[ind.assign[i]][i];
    let p;
    if (ind.fc[i] && d <= PARAMS.R) p = 1.0;
    else if (!ind.fc[i] && d <= PARAMS.R) p = 0.5;
    else p = 0.3;
    wcov += cities[i].demand * p;
    tq += cities[i].demand;
  }
  const f3 = 1 - wcov / tq;

  const v1 = Math.max(0, f1 - PARAMS.B);
  const load = new Array(N).fill(0);
  for (let i = 0; i < N; i++) load[ind.assign[i]] += cities[i].demand;
  let v2 = 0;
  for (let j = 0; j < N; j++) {
    if (ind.rdc[j]) v2 += Math.max(0, load[j] - PARAMS.Q_max);
  }
  ind.objectives = [f1, f2, f3];
  ind.violation = v1 + v2;
}

function dominates(a, b) {
  const fa = a.violation === 0, fb = b.violation === 0;
  if (fa && !fb) return true;
  if (!fa && fb) return false;
  if (!fa && !fb) return a.violation < b.violation;
  let better = false;
  for (let m = 0; m < 3; m++) {
    if (a.objectives[m] > b.objectives[m]) return false;
    if (a.objectives[m] < b.objectives[m]) better = true;
  }
  return better;
}

function fastNonDominatedSort(pop) {
  const n = pop.length;
  const S = Array.from({ length: n }, () => []);
  const nd = new Array(n).fill(0);
  const fronts = [[]];
  for (let p = 0; p < n; p++) {
    for (let q = 0; q < n; q++) {
      if (p === q) continue;
      if (dominates(pop[p], pop[q])) S[p].push(q);
      else if (dominates(pop[q], pop[p])) nd[p]++;
    }
    if (nd[p] === 0) { pop[p].rank = 0; fronts[0].push(p); }
  }
  let i = 0;
  while (fronts[i].length > 0) {
    const next = [];
    for (const p of fronts[i]) {
      for (const q of S[p]) {
        if (--nd[q] === 0) { pop[q].rank = i + 1; next.push(q); }
      }
    }
    i++;
    fronts.push(next);
  }
  return fronts;
}

function crowdingDistance(front, pop) {
  const m = front.length;
  if (m <= 2) { for (const idx of front) pop[idx].crowding = Infinity; return; }
  for (const idx of front) pop[idx].crowding = 0;
  for (let obj = 0; obj < 3; obj++) {
    const sorted = [...front].sort((a, b) => pop[a].objectives[obj] - pop[b].objectives[obj]);
    pop[sorted[0]].crowding = Infinity;
    pop[sorted[m - 1]].crowding = Infinity;
    const min = pop[sorted[0]].objectives[obj];
    const max = pop[sorted[m - 1]].objectives[obj];
    const range = max - min || 1;
    for (let i = 1; i < m - 1; i++) {
      pop[sorted[i]].crowding +=
        (pop[sorted[i + 1]].objectives[obj] - pop[sorted[i - 1]].objectives[obj]) / range;
    }
  }
}

const randPick = pop => pop[Math.floor(Math.random() * pop.length)];
function tournament(a, b) {
  if (a.rank !== b.rank) return a.rank < b.rank ? a : b;
  return a.crowding > b.crowding ? a : b;
}

function crossover(p1, p2) {
  const c1 = cloneShell(p1), c2 = cloneShell(p2);
  for (const seg of ['rdc', 'fc', 'vehicle']) {
    for (let i = 0; i < N; i++) {
      if (Math.random() < 0.5) { c1[seg][i] = p1[seg][i]; c2[seg][i] = p2[seg][i]; }
      else { c1[seg][i] = p2[seg][i]; c2[seg][i] = p1[seg][i]; }
    }
  }
  const k = 1 + Math.floor(Math.random() * (N - 1));
  for (let i = 0; i < N; i++) {
    if (i < k) { c1.assign[i] = p1.assign[i]; c2.assign[i] = p2.assign[i]; }
    else { c1.assign[i] = p2.assign[i]; c2.assign[i] = p1.assign[i]; }
  }
  return [c1, c2];
}

function mutate(ind, pm) {
  for (const seg of ['rdc', 'fc', 'vehicle']) {
    for (let i = 0; i < N; i++) {
      if (Math.random() < pm) ind[seg][i] = 1 - ind[seg][i];
    }
  }
  for (let i = 0; i < N; i++) {
    if (Math.random() < pm) ind.assign[i] = Math.floor(Math.random() * N);
  }
}

function run(opts = {}) {
  const POP = opts.pop || 100;
  const GEN = opts.gen || 500;
  const PC = opts.pc ?? 0.9;
  const PM = opts.pm ?? 0.1;
  const M = 3;

  let P = [];
  for (let i = 0; i < POP; i++) {
    const ind = randomInd();
    repair(ind);
    evaluate(ind);
    P.push(ind);
  }
  let fronts = fastNonDominatedSort(P);
  for (const f of fronts) crowdingDistance(f, P);

  const conv = { gen: [0], minF: [[], [], []], front1: [] };
  const rec = (g) => {
    conv.gen.push(g);
    const f1 = fronts[0].map(i => P[i]).filter(x => x.violation === 0);
    for (let m = 0; m < M; m++) {
      conv.minF[m].push(f1.length ? Math.min(...f1.map(x => x.objectives[m])) : null);
    }
    conv.front1.push(f1.length);
  };

  for (let g = 1; g <= GEN; g++) {
    const Q = [];
    while (Q.length < POP) {
      const p1 = tournament(randPick(P), randPick(P));
      const p2 = tournament(randPick(P), randPick(P));
      let [c1, c2] = Math.random() < PC ? crossover(p1, p2) : [cloneShell(p1), cloneShell(p2)];
      mutate(c1, PM); mutate(c2, PM);
      repair(c1); repair(c2);
      evaluate(c1); evaluate(c2);
      Q.push(c1);
      if (Q.length < POP) Q.push(c2);
    }
    const R = P.concat(Q);
    fronts = fastNonDominatedSort(R);
    const newP = [];
    let i = 0;
    while (i < fronts.length && newP.length + fronts[i].length <= POP) {
      crowdingDistance(fronts[i], R);
      for (const idx of fronts[i]) newP.push(R[idx]);
      i++;
    }
    if (newP.length < POP && i < fronts.length) {
      crowdingDistance(fronts[i], R);
      const sorted = [...fronts[i]].sort((a, b) => R[b].crowding - R[a].crowding);
      const need = POP - newP.length;
      for (let k = 0; k < need; k++) newP.push(R[sorted[k]]);
    }
    P = newP;
    fronts = fastNonDominatedSort(P);
    rec(g);
  }

  const paretoIdx = fronts[0];
  const seen = new Set();
  const pareto = [];
  for (const idx of paretoIdx) {
    const ind = P[idx];
    if (ind.violation > 0) continue;
    const key = ind.objectives.map(v => v.toFixed(1)).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    pareto.push(cloneShell(ind));
    pareto[pareto.length - 1].objectives = [...ind.objectives];
    pareto[pareto.length - 1].violation = ind.violation;
  }
  return { pareto, convergence: conv };
}

module.exports = { run, evaluate, repair, dominates, fastNonDominatedSort, crowdingDistance };
