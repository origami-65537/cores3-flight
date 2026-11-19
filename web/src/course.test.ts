import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCourse, crossGate, isNearCourse, launch } from './course';

test('the first rings are on the launch line and the course tightens gradually', () => {
  const gates = buildCourse();
  assert.equal(gates.length, 40);
  for (const gate of gates.slice(0,2)) {
    assert.equal(crossGate(gate, launch, {...launch,z:gate.z-1}), 'hit');
  }
  for (let i=1; i<gates.length; i++) {
    const prev = gates[i-1], gate = gates[i];
    assert.ok(gate.z < prev.z);
    assert.ok(Math.hypot(gate.x-prev.x,gate.y-prev.y)/(prev.z-gate.z) < .4);
    assert.ok(prev.radius-gate.radius >= 0 && prev.radius-gate.radius < 1);
  }
  assert.ok(gates.at(-1)!.radius < gates[0].radius);
});

test('a forward crossing scores at the interpolated point inside the opening', () => {
  const gate = {x:0,y:50,z:0,radius:20};
  assert.equal(crossGate(gate, {x:-21,y:50,z:10}, {x:21,y:50,z:-10}), 'hit');
  assert.equal(crossGate(gate, {x:0,y:50,z:10}, {x:0,y:50,z:0}), 'hit');
  assert.equal(crossGate(gate, {x:0,y:70,z:10}, {x:0,y:70,z:-10}), 'miss');
  assert.equal(crossGate(gate, {x:0,y:50,z:-10}, {x:0,y:50,z:10}), null);
  assert.equal(crossGate(gate, {x:0,y:50,z:10}, {x:0,y:50,z:1}), null);
  assert.equal(crossGate(gate, {x:0,y:50,z:0}, {x:0,y:50,z:-1}), null);
});

test('obstacle clearance protects the practice area and the route between gates', () => {
  const gates = [{x:0,y:65,z:-550,radius:22},{x:0,y:65,z:-800,radius:22}];
  assert.equal(isNearCourse(gates,470,launch.z,20), true);
  assert.equal(isNearCourse(gates,550,launch.z,20), false);
  const z = (gates[0].z+gates[1].z)/2;
  assert.equal(isNearCourse(gates, 43, z, 20), true);
  assert.equal(isNearCourse(gates, 55, z, 20), false);
  assert.equal(isNearCourse(gates, gates.at(-1)!.x, gates.at(-1)!.z, 20), true);
});
