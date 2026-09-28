import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNavigator } from '../navigation.mjs';

const manifestPath = process.argv[2] || new URL('../models/scene-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const navigation = createNavigator(manifest.navigation);
const radius = manifest.navigation.radius;
const failures = [];
const summaries = [];
const asPoint = position => Array.isArray(position) ? { x: position[0], z: position[2] } : position;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function collisionReasons(point) {
  const matches = [];
  manifest.navigation.obstacles.forEach((obstacle, index) => {
    if (obstacle.type === 'circle') {
      const clearance = distance(point, obstacle) - obstacle.r - radius;
      if (clearance < -1e-7) matches.push(`obstacle[${index}] circle ${JSON.stringify(obstacle)} penetration=${(-clearance).toFixed(4)} m`);
    } else if (point.x > obstacle.minX - radius && point.x < obstacle.maxX + radius
      && point.z > obstacle.minZ - radius && point.z < obstacle.maxZ + radius) {
      matches.push(`obstacle[${index}] box ${JSON.stringify(obstacle)} (inflated by ${radius} m)`);
    }
  });
  return matches.length ? matches.join('; ') : 'walkable union boundary/body clearance';
}
function checkPoint(label, point) {
  if (!navigation.canStand(point.x, point.z)) failures.push(`${label} ${JSON.stringify(point)} invalid: ${collisionReasons(point)}`);
}
function checkPath(label, from, to) {
  const path = navigation.findPath(from, to);
  if (!path.length) {
    failures.push(`${label} no path: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    return [];
  }
  try { assert.deepEqual(path[0], from); assert.deepEqual(path.at(-1), to); }
  catch { failures.push(`${label} does not preserve exact endpoints`); }
  let length = 0;
  for (let index = 1; index < path.length; index++) {
    if (!navigation.canTraverse(path[index - 1], path[index])) failures.push(`${label} blocked path segment ${index - 1} -> ${index}`);
    length += distance(path[index - 1], path[index]);
  }
  summaries.push(`${label}: ${path.length} waypoints, ${length.toFixed(2)} m`);
  return path;
}

const views = Object.entries(manifest.views).filter(([name]) => name !== 'overview')
  .map(([name, view]) => [name, asPoint(view.pos)]);
for (const [name, point] of views) checkPoint(`view ${name}`, point);
for (const [name, comparison] of Object.entries(manifest.comparisons)) checkPoint(`comparison ${name}`, asPoint(comparison.pos));
manifest.tour.forEach((point, index) => checkPoint(`tour[${index}]`, point));
for (let index = 1; index < manifest.tour.length; index++) {
  const from = manifest.tour[index - 1], to = manifest.tour[index];
  if (!navigation.canTraverse(from, to)) failures.push(`tour segment[${index - 1}->${index}] collides: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
}
for (let start = 0; start < views.length; start++) {
  for (let target = start + 1; target < views.length; target++) {
    checkPath(`${views[start][0]} -> ${views[target][0]}`, views[start][1], views[target][1]);
    // Walking routes are expected to remain navigable in both directions.
    const reversed = navigation.findPath(views[target][1], views[start][1]);
    if (!reversed.length) failures.push(`reverse route ${views[target][0]} -> ${views[start][0]} unreachable`);
  }
}

const entrance = asPoint(manifest.views.entrance.pos), service = asPoint(manifest.views.service.pos);
const entranceToService = navigation.findPath(entrance, service);
const frontWallZ = 10.94;
const crossings = entranceToService.slice(1).flatMap((point, index) => {
  const from = entranceToService[index];
  if ((from.z - frontWallZ) * (point.z - frontWallZ) > 0 || Math.abs(from.z - point.z) < 1e-8) return [];
  return [from.x + (point.x - from.x) * ((frontWallZ - from.z) / (point.z - from.z))];
});
if (crossings.length !== 1 || crossings[0] < 0.565 + radius - 1e-6 || crossings[0] > 2.815 - radius + 1e-6) {
  failures.push(`entrance -> service must pass actual door; crossings x=${JSON.stringify(crossings)}`);
}
for (const wallX of [-4, -1, 4, 6]) {
  if (navigation.canTraverse({ x: wallX, z: 12.6 }, { x: wallX, z: 9.8 })) failures.push(`front wall penetrable at x=${wallX}`);
}

const hero = manifest.navigation.obstacles.find(obstacle => obstacle.type === 'circle'
  && Math.abs(obstacle.x - 3.25) < 0.01 && Math.abs(obstacle.z - 3.45) < 0.01);
assert.ok(hero, 'Main round table must have collision metadata');
const perimeter = [
  ['south', { x: hero.x, z: hero.z + 2.45 }],
  ['east', { x: 5.9, z: hero.z }],
  ['north', { x: hero.x, z: hero.z - 2.5 }],
  ['west', { x: 0.8, z: hero.z }],
];
for (const [name, point] of perimeter) checkPoint(`hero table ${name} approach`, point);
for (let index = 0; index < perimeter.length; index++) {
  const next = (index + 1) % perimeter.length;
  checkPath(`around hero ${perimeter[index][0]} -> ${perimeter[next][0]}`, perimeter[index][1], perimeter[next][1]);
}
if (navigation.canTraverse(perimeter[0][1], perimeter[2][1])) failures.push('Main table allows direct south-to-north traversal');
checkPath('detour across hero table', perimeter[0][1], perimeter[2][1]);

for (const summary of summaries) console.log(summary);
if (failures.length) {
  console.error(`\nSCENE NAVIGATION FAILED (${failures.length}):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`\nScene navigation verified: ${views.length} ground-level views, ${Object.keys(manifest.comparisons).length} comparison positions, ${manifest.tour.length} tour points, all view connections, actual doorway, and full main-table circuit.`);
}
