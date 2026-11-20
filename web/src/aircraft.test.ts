import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3 } from 'three';
import { buildAircraft } from './aircraft';

test('both wings and the tail expose upper surfaces to the chase camera', () => {
  const { model } = buildAircraft();
  model.updateMatrixWorld(true);
  const down = new Vector3(0, -1, 0);
  for (const [x, z] of [[-6, 0], [6, 0], [-1.7, 3.7], [1.7, 3.7]]) {
    const ray = new Raycaster(new Vector3(x, 5, z), down);
    assert.ok(ray.intersectObject(model, true).length > 0, `missing outward-facing surface at ${x}, ${z}`);
  }
});

test('the propeller spins only for positive airspeed and returns to a still pose', () => {
  const { model, updatePropeller } = buildAircraft();
  const rotor = model.getObjectByName('propeller')!;
  const blur = model.getObjectByName('propeller blur')!;
  const restingAngle = rotor.rotation.z;
  assert.ok(rotor.position.z < 0, 'the propeller belongs on the nose');
  assert.equal(blur.visible, false);
  updatePropeller(.02, 37.2);
  assert.notEqual(rotor.rotation.z, restingAngle);
  assert.equal(blur.visible, true);
  updatePropeller(.02, 0);
  assert.equal(rotor.rotation.z, restingAngle);
  assert.equal(blur.visible, false);
});
