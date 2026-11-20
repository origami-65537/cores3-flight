import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CEILING, GRID, MIST, gateDirection, groundHeight, landmarks, launch, mist, terrainHeight, throughGate, touching, wrap, type Gate } from './world';

const at = (gate: Gate, along: number, side = 0, up = 0) => {
  const d = gateDirection(gate);
  return { x: gate.x+d.x*along-d.z*side, y: gate.y+up, z: gate.z+d.z*along+d.x*side };
};

test('the world is a small island in open sea with room to take off', () => {
  for (let angle = 0; angle < 6.28; angle += .1) {
    assert.ok(terrainHeight(Math.cos(angle)*1800, Math.sin(angle)*1800) < 0);
    assert.ok(terrainHeight(Math.cos(angle)*600, Math.sin(angle)*600) > 0);
  }
  let peak = 0;
  for (let x = -1400; x <= 1800; x += 20) for (let z = -1400; z <= 1400; z += 20) peak = Math.max(peak, terrainHeight(x, z));
  assert.ok(peak > 250 && peak < CEILING-200);
  for (let ahead = 0; ahead < 400; ahead += 5) assert.equal(touching({ ...launch, z: launch.z-ahead }, 30), null);
});

test('there are three to five landmarks, spread out, each with a clear way through', () => {
  assert.ok(landmarks.length >= 3 && landmarks.length <= 5);
  for (const [i, a] of landmarks.entries()) for (const b of landmarks.slice(i+1)) assert.ok(Math.hypot(a.gate.x-b.gate.x, a.gate.z-b.gate.z) > 500);
  for (const { id, gate } of landmarks) {
    const mid = gate.round ? gate.halfHeight*.4 : 0;
    for (const [side, up] of [[0, mid], [gate.halfWidth*.55, mid], [-gate.halfWidth*.55, mid], [0, mid+gate.halfHeight*.35], [0, mid-gate.halfHeight*.25]]) {
      for (let along = -160; along <= 160; along += 2) assert.equal(touching(at(gate, along, side, up), 2), null, `${id} blocked at ${along}, ${side}, ${up}`);
      assert.ok(throughGate(gate, at(gate, -1, side, up), at(gate, 1, side, up)), id);
      assert.ok(throughGate(gate, at(gate, 1, side, up), at(gate, -1, side, up)), `${id} backwards`);
    }
  }
});

test('only a pass inside the opening counts', () => {
  for (const { id, gate } of landmarks) {
    assert.equal(throughGate(gate, at(gate, -1, gate.halfWidth+3, gate.round ? 10 : 0), at(gate, 1, gate.halfWidth+3, gate.round ? 10 : 0)), false, id);
    assert.equal(throughGate(gate, at(gate, -1, 0, gate.halfHeight+3), at(gate, 1, 0, gate.halfHeight+3)), false, id);
    assert.equal(throughGate(gate, at(gate, -9, 0, 5), at(gate, -1, 0, 5)), false, id);
  }
});

test('structures and the ground are solid', () => {
  const [lighthouse, bridge, torii, , towers] = landmarks;
  const tower = lighthouse.solids[0];
  assert.equal(touching({ x: tower.x, y: groundHeight(tower.x, tower.z)+40, z: tower.z }, 2), 'structure');
  assert.equal(touching({ x: lighthouse.gate.x, y: 70, z: lighthouse.gate.z }, 2), 'structure');
  assert.equal(touching({ x: bridge.gate.x, y: 60, z: bridge.gate.z }, 2), 'structure');
  assert.equal(touching({ x: bridge.gate.x, y: 75, z: bridge.gate.z }, 2), null);
  assert.equal(touching({ x: torii.gate.x, y: 60, z: torii.gate.z }, 2), 'structure');
  assert.equal(touching({ x: towers.gate.x, y: 110, z: towers.gate.z }, 2), 'structure');
  assert.equal(touching({ x: 0, y: 1, z: 1700 }, 2), 'ground');
  assert.equal(touching({ x: -560, y: groundHeight(-560, 430)+1, z: 430 }, 2), 'ground');
});

test('flying out into the mist brings the plane back from the other side', () => {
  assert.equal(mist(0, 0), 0);
  assert.equal(mist(launch.x, launch.z), 0);
  assert.equal(mist(MIST.end, 0), 1);
  assert.equal(wrap(MIST.end-1, 0), null);
  const back = wrap(MIST.end+1, 300)!;
  assert.ok(back.x < 0 && back.z < 0);
  assert.equal(wrap(back.x, back.z), null);
  assert.equal(mist(back.x, back.z) > .8, true);
});

test('the ground the plane hits is the drawn surface, not the smooth height under it', () => {
  const { x0, z0, step } = GRID;
  for (const [column, row] of [[133, 94], [140, 110], [60, 150], [250, 139]]) {
    const x = x0+column*step, z = z0+row*step, corners = [terrainHeight(x, z), terrainHeight(x+step, z), terrainHeight(x, z+step), terrainHeight(x+step, z+step)];
    if (Math.min(...corners) <= 0) continue;
    assert.ok(Math.abs(groundHeight(x+.001, z+.001)-corners[0]) < .1);
    assert.ok(Math.abs(groundHeight(x+step/2, z+step/2)-(corners[1]+corners[2])/2) < 1e-6);
    assert.ok(Math.abs(groundHeight(x+step-.001, z+step-.001)-corners[3]) < .1);
  }
  const rim = { x: -98, z: -466 }, drawn = groundHeight(rim.x, rim.z);
  assert.ok(terrainHeight(rim.x, rim.z)-drawn > 5);
  assert.equal(touching({ ...rim, y: drawn+3 }, 2), null);
  assert.equal(touching({ ...rim, y: drawn+1 }, 2), 'ground');
});
