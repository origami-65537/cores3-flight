import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3 } from 'three';
import { coastMeshes } from './island-meshes';
import { COVE, WATERFALL, surfaceHeight } from './world';

test('the faceted coast and cliffs match the collision surface', () => {
  const [land] = coastMeshes();
  const down = new Vector3(0, -1, 0);
  for (const [x, z] of [[-573, 823], [-249, 653], [WATERFALL.x, WATERFALL.z0+43], [44, -288]]) {
    const ray = new Raycaster(new Vector3(x, 650, z), down);
    const hit = ray.intersectObject(land)[0];
    assert.ok(hit, `no land at ${x}, ${z}`);
    assert.ok(Math.abs(hit.point.y-surfaceHeight(x, z)) < .001, `height mismatch at ${x}, ${z}`);
  }
  const bay = new Raycaster(new Vector3(COVE.x, 650, COVE.z), down);
  assert.equal(bay.intersectObject(land).length, 0);
});
