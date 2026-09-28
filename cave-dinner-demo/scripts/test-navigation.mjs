import assert from 'node:assert/strict';
import { createNavigator } from '../navigation.mjs';

const radius = 0.23;
const room = { minX: -6.6, maxX: 6.6, minZ: -9.3, maxZ: 10.7 };
const court = { minX: -9.5, maxX: 9.5, minZ: 10.5, maxZ: 18.5 };
const tables = [
  { type: 'circle', x: 3.25, z: 3.4, r: 1.55 },
  { type: 'circle', x: 3.8, z: -2.2, r: 1.5 },
  { type: 'box', minX: -5, maxX: -3, minZ: 4.475, maxZ: 5.525 },
];
const walls = [
  { type: 'box', minX: -9.5, maxX: 0.6, minZ: 10.55, maxZ: 10.85 },
  { type: 'box', minX: 2.7, maxX: 9.5, minZ: 10.55, maxZ: 10.85 },
];
const navigation = createNavigator({ areas: [room, court], obstacles: [...walls, ...tables], radius });

function checkPath(path, start, target, nav = navigation) {
  assert.ok(path.length >= 2, 'Reachable target should yield a path');
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), target);
  for (let index = 1; index < path.length; index++) {
    assert.ok(nav.canTraverse(path[index - 1], path[index]), 'Every final straight path segment must clear geometry');
    // Independent table clearance check across the output route.
    for (let sample = 0; sample <= 20; sample++) {
      const t = sample / 20;
      const point = { x: path[index - 1].x * (1 - t) + path[index].x * t,
        z: path[index - 1].z * (1 - t) + path[index].z * t };
      if (nav === navigation) for (const table of tables.filter(item => item.type === 'circle')) {
        assert.ok(Math.hypot(point.x - table.x, point.z - table.z) >= table.r + radius - 1e-6,
          'Visitor body must remain clear of round tables');
      }
    }
  }
}

assert.equal(navigation.canStand(0, 0), true);
assert.equal(navigation.canStand(6.5, 0), false, 'Body radius must stay within rock wall');
assert.equal(navigation.canStand(3.25, 3.4), false, 'Table center is occupied');
assert.equal(navigation.canStand(-3.1, 5.65), false, 'Visitor cannot clip rectangular furniture corner');
assert.equal(navigation.canStand(NaN, 0), false);

const wallHit = navigation.move({ x: 0, z: 0 }, -20, 0);
assert.ok(wallHit.blocked && wallHit.x >= room.minX + radius - 1e-6, 'Large input must stop at rock wall');
const tableHit = navigation.move({ x: 0, z: 3.4 }, 6, 0);
assert.ok(tableHit.blocked && tableHit.x <= 3.25 - 1.55 - radius + 1e-6, 'Large input cannot tunnel through table');
const slide = navigation.move({ x: 6.3, z: 0 }, 1.5, -2);
assert.ok(slide.blocked && slide.z < -1.9 && slide.x <= 6.37 + 1e-6, 'Wall contact should preserve tangential movement');

assert.equal(navigation.canStand(1.65, 10.7), true, 'Area seam inside doorway remains walkable');
assert.equal(navigation.canStand(0.7, 10.7), false, 'Door jamb includes body clearance');
const enter = navigation.move({ x: 1.65, z: 14 }, 0, -7);
assert.equal(enter.blocked, false);
assert.ok(Math.abs(enter.z - 7) < 1e-6, 'Full entry should cross courtyard, doorway and room');
const wrongEntrance = navigation.move({ x: -2, z: 14 }, 0, -7);
assert.ok(wrongEntrance.blocked && wrongEntrance.z >= 10.85 + radius - 1e-6,
  'The front wall remains solid outside the actual doorway');

const scenePath = navigation.findPath({ x: -2, z: 15 }, { x: 5.7, z: 1.4 });
checkPath(scenePath, { x: -2, z: 15 }, { x: 5.7, z: 1.4 });
const doorCrossing = scenePath.slice(1).map((point, index) => {
  const from = scenePath[index];
  if ((from.z - 10.7) * (point.z - 10.7) > 0 || Math.abs(from.z - point.z) < 1e-8) return null;
  return from.x + (point.x - from.x) * ((10.7 - from.z) / (point.z - from.z));
}).filter(value => value !== null);
assert.ok(doorCrossing.length === 1 && doorCrossing[0] >= 0.83 && doorCrossing[0] <= 2.47,
  'The output route must actually cross the front wall through its door opening');
checkPath(navigation.findPath({ x: 3.25, z: 6 }, { x: 3.25, z: 0.9 }), { x: 3.25, z: 6 }, { x: 3.25, z: 0.9 });
assert.deepEqual(navigation.findPath({ x: 0, z: 0 }, { x: 3.25, z: 3.4 }), [], 'Cannot route to an occupied table');

// Adjacent rectangles have no false collision at their shared seam, while a
// concave room corner still blocks a visitor whose center alone is inside.
const union = createNavigator({ areas: [
  { minX: -2, maxX: 2, minZ: -2, maxZ: 0 },
  { minX: -0.6, maxX: 0.6, minZ: 0, maxZ: 3 },
], radius });
assert.equal(union.canStand(0, 0), true);
assert.equal(union.canTraverse({ x: 0, z: -1 }, { x: 0, z: 2 }), true);
assert.equal(union.canStand(0.5, 0.05), false, 'Concave doorway shoulder must consider body radius');

const closed = createNavigator({ areas: [{ minX: -4, maxX: 4, minZ: -4, maxZ: 4 }], obstacles: [
  { type: 'box', minX: -0.1, maxX: 0.1, minZ: -4, maxZ: 4 },
], radius });
assert.deepEqual(closed.findPath({ x: -2, z: 0 }, { x: 2, z: 0 }), [], 'Closed partition must return unreachable');
assert.equal(closed.canTraverse({ x: -2, z: 0 }, { x: 2, z: 0 }), false, 'Thin walls cannot be skipped by a long segment');

const thinObstacle = createNavigator({ areas: [{ minX: -4, maxX: 4, minZ: -4, maxZ: 4 }],
  obstacles: [{ type: 'circle', x: 0.017, z: 0, r: 0.001 }], radius: 0.005 });
assert.equal(thinObstacle.canTraverse({ x: -1, z: 0 }, { x: 1, z: 0 }), false, 'Swept check catches sub-step geometry');

assert.throws(() => createNavigator({ areas: [], radius }), TypeError);
assert.throws(() => navigation.move({ x: 0, z: 0 }, Infinity, 0), TypeError);
console.log(`Navigation verified: solid walls, furniture, sliding, door clearance, union corners, routed exploration, unreachable spaces. Scene path: ${scenePath.length} waypoints.`);
