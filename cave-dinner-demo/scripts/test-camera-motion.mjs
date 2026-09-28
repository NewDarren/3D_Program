import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNavigator } from '../navigation.mjs';
import { roundWalkingPath, easeCamera } from '../camera-motion.mjs';
const manifest = JSON.parse(await readFile(new URL('../models/scene-manifest.json', import.meta.url)));
const navigator = createNavigator(manifest.navigation);
const views = Object.entries(manifest.views).filter(([key]) => key !== 'overview');
for (const [fromName, from] of views) for (const [toName, to] of views) {
  const original = navigator.findPath({x:from.pos[0],z:from.pos[2]}, {x:to.pos[0],z:to.pos[2]});
  assert(original.length, `${fromName} -> ${toName} has route`);
  const rounded = roundWalkingPath(original, navigator);
  assert.deepEqual(rounded[0], original[0]); assert.deepEqual(rounded.at(-1), original.at(-1));
  for (let i=1; i<rounded.length; i++) assert(navigator.canTraverse(rounded[i-1], rounded[i]), `${fromName} -> ${toName} collision`);
}
assert.equal(easeCamera(0),0); assert.equal(easeCamera(1),1);
for (let i=1;i<=100;i++) assert(easeCamera(i/100)>=easeCamera((i-1)/100));
console.log('PASS: all 16 walking-view pairs remain collision-safe after corner rounding; easing endpoints and monotonicity.');
