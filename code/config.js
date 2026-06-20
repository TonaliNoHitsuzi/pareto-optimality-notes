const cities = [
  { name: '上海', lat: 31.2304, lon: 121.4737, demand: 3500 },
  { name: '杭州', lat: 30.2741, lon: 120.1551, demand: 2200 },
  { name: '苏州', lat: 31.2989, lon: 120.5853, demand: 2800 },
  { name: '南京', lat: 32.0603, lon: 118.7969, demand: 2000 },
  { name: '宁波', lat: 29.8683, lon: 121.5440, demand: 1800 },
];

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const N = cities.length;
const dist = [];
for (let i = 0; i < N; i++) {
  dist.push([]);
  for (let j = 0; j < N; j++) {
    dist[i].push(Math.round(haversine(cities[i].lat, cities[i].lon, cities[j].lat, cities[j].lon)));
  }
}

const PARAMS = {
  C_rdc: 2500,
  C_fc: 400,
  c_fuel: 0.003,
  c_elec: 0.004,
  e_fuel: 0.0015,
  e_elec: 0.0003,
  R: 180,
  Q_max: 5000,
  B: 15000,
  delta: 1.5,
};

module.exports = { cities, dist, PARAMS, N };
