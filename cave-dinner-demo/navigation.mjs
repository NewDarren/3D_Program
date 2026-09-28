/**
 * First-person navigation in X/Z space. All units use the scene's world units.
 * Allowed rectangles form one union: their shared edges are not collision walls.
 * Obstacles are conservatively expanded by the visitor's radius.
 */
const EPSILON = 1e-8;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distanceSquared(a, b) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }
function pointSegmentDistanceSquared(point, a, b) {
  const length = distanceSquared(a, b);
  if (length < EPSILON) return distanceSquared(point, a);
  const t = clamp(((point.x - a.x) * (b.x - a.x) + (point.z - a.z) * (b.z - a.z)) / length, 0, 1);
  return distanceSquared(point, { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
}
function cross(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); }
function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (Math.abs(abC) < EPSILON && pointSegmentDistanceSquared(c, a, b) < EPSILON)
    || (Math.abs(abD) < EPSILON && pointSegmentDistanceSquared(d, a, b) < EPSILON)
    || (Math.abs(cdA) < EPSILON && pointSegmentDistanceSquared(a, c, d) < EPSILON)
    || (Math.abs(cdB) < EPSILON && pointSegmentDistanceSquared(b, c, d) < EPSILON);
}
function segmentDistanceSquared(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistanceSquared(a, c, d), pointSegmentDistanceSquared(b, c, d),
    pointSegmentDistanceSquared(c, a, b), pointSegmentDistanceSquared(d, a, b));
}
function validPoint(point) { return point && Number.isFinite(point.x) && Number.isFinite(point.z); }
function inside(point, box, epsilon = 0) {
  return point.x >= box.minX - epsilon && point.x <= box.maxX + epsilon
    && point.z >= box.minZ - epsilon && point.z <= box.maxZ + epsilon;
}
function validateBox(box, name) {
  if (![box.minX, box.maxX, box.minZ, box.maxZ].every(Number.isFinite)
    || box.minX >= box.maxX || box.minZ >= box.maxZ) throw new TypeError(`${name} must have finite, ordered bounds.`);
}

// Remove parts of each rectangle edge which face the interior of another area.
// This is the exact exposed boundary of the union, including concave door corners.
function unionBoundary(areas) {
  const segments = [];
  for (let index = 0; index < areas.length; index++) {
    const rectangle = areas[index];
    const sides = [
      { axis: 'x', fixed: rectangle.minZ, start: rectangle.minX, end: rectangle.maxX, direction: -1 },
      { axis: 'x', fixed: rectangle.maxZ, start: rectangle.minX, end: rectangle.maxX, direction: 1 },
      { axis: 'z', fixed: rectangle.minX, start: rectangle.minZ, end: rectangle.maxZ, direction: -1 },
      { axis: 'z', fixed: rectangle.maxX, start: rectangle.minZ, end: rectangle.maxZ, direction: 1 },
    ];
    for (const side of sides) {
      let remaining = [[side.start, side.end]];
      for (let otherIndex = 0; otherIndex < areas.length; otherIndex++) {
        if (index === otherIndex) continue;
        const other = areas[otherIndex];
        const perpendicularMin = side.axis === 'x' ? other.minZ : other.minX;
        const perpendicularMax = side.axis === 'x' ? other.maxZ : other.maxX;
        const coversOutside = side.direction < 0
          ? perpendicularMin < side.fixed - EPSILON && perpendicularMax >= side.fixed - EPSILON
          : perpendicularMax > side.fixed + EPSILON && perpendicularMin <= side.fixed + EPSILON;
        if (!coversOutside) continue;
        const cutMin = side.axis === 'x' ? other.minX : other.minZ;
        const cutMax = side.axis === 'x' ? other.maxX : other.maxZ;
        const next = [];
        for (const [start, end] of remaining) {
          if (cutMax <= start || cutMin >= end) { next.push([start, end]); continue; }
          if (cutMin > start) next.push([start, Math.min(cutMin, end)]);
          if (cutMax < end) next.push([Math.max(cutMax, start), end]);
        }
        remaining = next;
      }
      for (const [start, end] of remaining) {
        if (end - start <= EPSILON) continue;
        segments.push(side.axis === 'x'
          ? [{ x: start, z: side.fixed }, { x: end, z: side.fixed }]
          : [{ x: side.fixed, z: start }, { x: side.fixed, z: end }]);
      }
    }
  }
  return segments;
}

function crossesBox(a, b, box) {
  let first = 0, last = 1;
  for (const [axis, minKey, maxKey] of [['x', 'minX', 'maxX'], ['z', 'minZ', 'maxZ']]) {
    const delta = b[axis] - a[axis];
    const min = box[minKey] + EPSILON, max = box[maxKey] - EPSILON;
    if (Math.abs(delta) < EPSILON) {
      if (a[axis] <= min || a[axis] >= max) return false;
      continue;
    }
    const near = (min - a[axis]) / delta, far = (max - a[axis]) / delta;
    first = Math.max(first, Math.min(near, far));
    last = Math.min(last, Math.max(near, far));
    if (first > last) return false;
  }
  return first <= last;
}

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const items = this.items;
    items.push(item);
    let current = items.length - 1;
    while (current > 0) {
      const parent = (current - 1) >> 1;
      if (items[parent].score <= item.score) break;
      items[current] = items[parent]; current = parent;
    }
    items[current] = item;
  }
  pop() {
    const items = this.items, first = items[0], tail = items.pop();
    if (items.length) {
      let current = 0;
      while (true) {
        const left = current * 2 + 1, right = left + 1;
        if (left >= items.length) break;
        const child = right < items.length && items[right].score < items[left].score ? right : left;
        if (items[child].score >= tail.score) break;
        items[current] = items[child]; current = child;
      }
      items[current] = tail;
    }
    return first;
  }
  get size() { return this.items.length; }
}

/** Collapse grid turns into the longest collision-free straight segments. */
export function simplifyPath(points, isClear) {
  if (points.length < 3) return points.map(point => ({ x: point.x, z: point.z }));
  const result = [{ x: points[0].x, z: points[0].z }];
  let current = 0;
  while (current < points.length - 1) {
    let next = points.length - 1;
    while (next > current + 1 && !isClear(points[current], points[next])) next--;
    result.push({ x: points[next].x, z: points[next].z }); current = next;
  }
  return result;
}

/**
 * @param {{areas:Array,obstacles?:Array,radius?:number,gridStep?:number,maxNodes?:number}} config
 * @returns {{canStand:Function,canTraverse:Function,move:Function,findPath:Function}}
 * Paths include both exact endpoints; [] means unreachable or invalid endpoint.
 */
export function createNavigator({ areas, obstacles = [], radius = 0.23, gridStep = 0.28, maxNodes = 40000 }) {
  if (!Array.isArray(areas) || !areas.length) throw new TypeError('At least one walkable area is required.');
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(gridStep) || gridStep <= 0) {
    throw new TypeError('Visitor radius and path grid step must be positive finite numbers.');
  }
  const allowed = areas.map(area => { validateBox(area, 'Walkable area'); return { ...area }; });
  const boundary = unionBoundary(allowed), radiusSquared = radius ** 2;
  const occupied = obstacles.map(obstacle => {
    if (obstacle.type === 'circle') {
      if (!validPoint(obstacle) || !Number.isFinite(obstacle.r) || obstacle.r < 0) throw new TypeError('Invalid circular obstacle.');
      return { ...obstacle, r: obstacle.r + radius };
    }
    if (obstacle.type !== 'box') throw new TypeError(`Unknown obstacle type: ${obstacle.type}`);
    validateBox(obstacle, 'Obstacle');
    return { type: 'box', minX: obstacle.minX - radius, maxX: obstacle.maxX + radius,
      minZ: obstacle.minZ - radius, maxZ: obstacle.maxZ + radius };
  });
  function canStand(x, z) {
    const point = { x, z };
    if (!validPoint(point) || !allowed.some(area => inside(point, area, EPSILON))) return false;
    if (boundary.some(([a, b]) => pointSegmentDistanceSquared(point, a, b) < radiusSquared - EPSILON)) return false;
    return !occupied.some(obstacle => obstacle.type === 'circle'
      ? distanceSquared(point, obstacle) < obstacle.r ** 2 - EPSILON
      : x > obstacle.minX + EPSILON && x < obstacle.maxX - EPSILON
        && z > obstacle.minZ + EPSILON && z < obstacle.maxZ - EPSILON);
  }
  function canTraverse(from, to) {
    if (!validPoint(from) || !validPoint(to) || !canStand(from.x, from.z) || !canStand(to.x, to.z)) return false;
    if (boundary.some(([a, b]) => segmentDistanceSquared(from, to, a, b) < radiusSquared - EPSILON)) return false;
    return !occupied.some(obstacle => obstacle.type === 'circle'
      ? pointSegmentDistanceSquared(obstacle, from, to) < obstacle.r ** 2 - EPSILON
      : crossesBox(from, to, obstacle));
  }
  function move(position, dx, dz) {
    if (!validPoint(position) || !Number.isFinite(dx) || !Number.isFinite(dz)) throw new TypeError('Movement must contain finite coordinates.');
    let point = { x: position.x, z: position.z }, blocked = false;
    if (!canStand(point.x, point.z)) return { ...point, blocked: true };
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.min(radius * 0.5, 0.12)));
    const stepX = dx / count, stepZ = dz / count;
    for (let index = 0; index < count; index++) {
      const next = { x: point.x + stepX, z: point.z + stepZ };
      if (canTraverse(point, next)) { point = next; continue; }
      blocked = true;
      const axes = Math.abs(stepX) >= Math.abs(stepZ) ? ['x', 'z'] : ['z', 'x'];
      for (const axis of axes) {
        const slide = { ...point, [axis]: point[axis] + (axis === 'x' ? stepX : stepZ) };
        if (canTraverse(point, slide)) point = slide;
      }
    }
    return { ...point, blocked };
  }

  const minX = Math.min(...allowed.map(area => area.minX)) + radius;
  const minZ = Math.min(...allowed.map(area => area.minZ)) + radius;
  const width = Math.floor((Math.max(...allowed.map(area => area.maxX)) - radius - minX) / gridStep) + 1;
  const height = Math.floor((Math.max(...allowed.map(area => area.maxZ)) - radius - minZ) / gridStep) + 1;
  const gridCache = new Map();
  function gridPoint(id) {
    if (!gridCache.has(id)) {
      const point = { x: minX + (id % width) * gridStep, z: minZ + Math.floor(id / width) * gridStep };
      gridCache.set(id, canStand(point.x, point.z) ? point : null);
    }
    return gridCache.get(id);
  }
  function attachments(point) {
    const column = Math.round((point.x - minX) / gridStep), row = Math.round((point.z - minZ) / gridStep);
    const result = [], reach = Math.max(4, Math.ceil(radius * 3 / gridStep));
    for (let y = Math.max(0, row - reach); y <= Math.min(height - 1, row + reach); y++) {
      for (let x = Math.max(0, column - reach); x <= Math.min(width - 1, column + reach); x++) {
        const id = y * width + x, candidate = gridPoint(id);
        if (candidate && canTraverse(point, candidate)) result.push({ id, distance: Math.sqrt(distanceSquared(point, candidate)) });
      }
    }
    return result;
  }
  function findPath(start, target) {
    if (!validPoint(start) || !validPoint(target) || !canStand(start.x, start.z) || !canStand(target.x, target.z)) return [];
    if (distanceSquared(start, target) < EPSILON) return [{ x: start.x, z: start.z }];
    if (canTraverse(start, target)) return [{ x: start.x, z: start.z }, { x: target.x, z: target.z }];
    const starts = attachments(start), targets = new Map(attachments(target).map(item => [item.id, item.distance]));
    if (!starts.length || !targets.size) return [];
    const heap = new MinHeap(), cost = new Map(), previous = new Map(), visited = new Set();
    const heuristic = id => Math.sqrt(distanceSquared(gridPoint(id), target));
    for (const attached of starts) {
      cost.set(attached.id, attached.distance); previous.set(attached.id, -1);
      heap.push({ id: attached.id, score: attached.distance + heuristic(attached.id) });
    }
    while (heap.size && visited.size < maxNodes) {
      const { id } = heap.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      if (targets.has(id)) {
        const path = [{ x: target.x, z: target.z }];
        let current = id;
        while (current !== -1) { path.push(gridPoint(current)); current = previous.get(current); }
        path.push({ x: start.x, z: start.z }); path.reverse();
        return simplifyPath(path, canTraverse);
      }
      const point = gridPoint(id), column = id % width, row = Math.floor(id / width);
      for (let zOffset = -1; zOffset <= 1; zOffset++) {
        for (let xOffset = -1; xOffset <= 1; xOffset++) {
          if ((!xOffset && !zOffset) || column + xOffset < 0 || column + xOffset >= width
            || row + zOffset < 0 || row + zOffset >= height) continue;
          const nextId = id + xOffset + zOffset * width;
          if (visited.has(nextId)) continue;
          const next = gridPoint(nextId);
          if (!next || !canTraverse(point, next)) continue;
          const nextCost = cost.get(id) + gridStep * Math.hypot(xOffset, zOffset);
          if (nextCost >= (cost.get(nextId) ?? Infinity)) continue;
          cost.set(nextId, nextCost); previous.set(nextId, id);
          heap.push({ id: nextId, score: nextCost + heuristic(nextId) });
        }
      }
    }
    return [];
  }
  return { canStand, canTraverse, move, findPath };
}
