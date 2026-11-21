import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAY, BAY_ARMS, BRIDGE, CEILING, COVE, GRID, MEADOW, MIST, PIER, ROAD, SHRINE, VALLEY, WATERFALL, gateDirection, groundHeight, landmarks, launch, mist, pathHits, solids, surfaceHeight, terrainHeight, throughGate, touching, woods, wrap, type Gate, type Spot } from './world';

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

test('the harbor opens to the sea and the pier is a solid obstacle', () => {
  for (let z = COVE.z-COVE.rz+24; z < launch.z; z += 12) assert.ok(surfaceHeight(COVE.x, z) <= 0);
  assert.ok(surfaceHeight(PIER.x, PIER.z0) > 0, 'pier connects to shore');
  const pier = { x: PIER.x, y: PIER.height, z: (PIER.z0+PIER.z1)/2 };
  assert.ok(surfaceHeight(pier.x, pier.z) < 0);
  assert.equal(touching(pier, 2), 'structure');
  assert.equal(touching({ ...pier, y: 12 }, 2), null);
  assert.ok(surfaceHeight(WATERFALL.x, WATERFALL.z0) > 90);
  assert.ok(surfaceHeight(WATERFALL.x, WATERFALL.z1) < 0);
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

test('the path ahead sees a thin beam from any distance and stays clear through an opening', () => {
  const torii = landmarks.find(l => l.id === 'torii')!, bridge = landmarks.find(l => l.id === 'bridge')!;
  const beam = torii.solids.find(s => s.kind === 'box')!, forward = gateDirection(torii.gate);
  assert.ok(beam.kind === 'box');
  for (let back = 6; back <= 44; back += .7) {
    const from = { x: beam.x-forward.x*back, y: beam.y, z: beam.z-forward.z*back };
    assert.equal(pathHits(from, forward, 44.6, 2), 'structure', `beam missed from ${back} m`);
  }
  for (const { gate } of [torii, bridge]) for (let back = 0; back <= 160; back += 7) assert.equal(pathHits(at(gate, -back, 0, 0), gateDirection(gate), 65, 2), null);
  assert.equal(pathHits({ x: launch.x, y: 20, z: launch.z }, { x: 0, y: -.5, z: -Math.sqrt(.75) }, 65, 2), 'ground');
});

const walk = (path: readonly Spot[], step: number): Spot[] => path.slice(1).flatMap((b, i) => {
  const a = path[i], count = Math.ceil(Math.hypot(b.x-a.x, b.z-a.z)/step);
  return Array.from({ length: count }, (_, j) => ({ x: a.x+(b.x-a.x)*j/count, z: a.z+(b.z-a.z)*j/count }));
});

test('the bridge deck lands on the ground at both ends, with open water under the span', () => {
  const top = BRIDGE.deck+2.5, bridge = landmarks.find(l => l.id === 'bridge')!;
  for (const [end, inland] of [[BRIDGE.ends[0], -1], [BRIDGE.ends[1], 1]]) for (const side of [-9, 0, 9]) {
    const ground = surfaceHeight(end, BRIDGE.z+side), beyond = surfaceHeight(end+12*inland, BRIDGE.z+side);
    assert.ok(ground > top-1 && ground < top+.5 && Math.abs(beyond-top) < 1, `deck end at ${end}, ${side} meets ground at ${ground}, then ${beyond}`);
  }
  // No road covers the east end, so the islet turf closes over the deck's end face instead of leaving a lip.
  for (const side of [-9, -4.5, 0, 4.5, 9]) {
    const z = BRIDGE.z+side, over = (x: number) => surfaceHeight(x, z)-top;
    for (let x = BRIDGE.ends[1]-3; x <= BRIDGE.ends[1]+12; x += 3) assert.ok(over(x) > .1 && over(x) < .6, `turf over the east deck end at ${x}, ${z}: ${over(x)}`);
    assert.ok(over(BRIDGE.ends[1]-12) < -.3, `deck clear of the turf at ${z}: ${over(BRIDGE.ends[1]-12)}`);
  }
  assert.ok(bridge.solids.every(s => s.look !== 'steel'), 'no abutment blocks');
  const anchors = bridge.solids.filter(s => s.kind === 'box' && s.look === 'deck' && s.hx < 10);
  assert.equal(anchors.length, 4);
  for (const s of anchors) if (s.kind === 'box') {
    const ground = surfaceHeight(s.x, s.z);
    assert.ok(s.y-s.hy < ground-1 && s.y+s.hy > ground+2 && s.y+s.hy < ground+5, `anchor at ${s.x}, ${s.z} sits in ground at ${ground}`);
  }
  for (let x = BRIDGE.towers[0]; x <= BRIDGE.towers[1]; x += 6) assert.ok(surfaceHeight(x, BRIDGE.z) < 0);
  assert.deepEqual(ROAD[0], { x: BRIDGE.ends[0], z: BRIDGE.z });
  const road = walk(ROAD, 12);
  for (const [i, p] of road.entries()) {
    assert.ok(surfaceHeight(p.x, p.z) > 10 && woods(p.x, p.z) < .05, `road at ${p.x}, ${p.z}`);
    if (i) assert.ok(Math.abs(surfaceHeight(p.x, p.z)-surfaceHeight(road[i-1].x, road[i-1].z)) < 3, `road steps at ${p.x}, ${p.z}`);
  }
});

test('the torii stands in a shallow bay between two arms of land, in front of a low shrine', () => {
  const { gate } = landmarks.find(l => l.id === 'torii')!;
  for (let x = gate.x-50; x <= SHRINE.x-85; x += 5) for (const dz of [-60, 0, 60]) {
    const bed = terrainHeight(x, gate.z+dz);
    assert.ok(bed < 1 && bed > -4, `tidal flat at ${x}, ${dz}: ${bed}`);
  }
  assert.ok(terrainHeight(gate.x-250, gate.z) < -20, 'deep water outside the bay');
  for (const arm of BAY_ARMS) {
    for (const p of walk(arm, 10)) assert.ok(surfaceHeight(p.x, p.z) > 2 && surfaceHeight(p.x, p.z) < 20, `arm at ${p.x}, ${p.z}`);
    assert.ok(Math.abs(arm.at(-1)!.z-BAY.z) > 120, 'the arms leave the torii approach open');
  }
  const shrine = solids.filter(s => s.look === 'shrine' || s.look === 'stilt');
  assert.ok(shrine.length > 10 && SHRINE.z === gate.z && SHRINE.yaw === gate.yaw && SHRINE.x-gate.x > 160);
  for (const s of shrine) assert.ok((s.kind === 'cyl' ? s.y1 : s.kind === 'box' ? s.y+s.hy : Infinity) <= 17);
  assert.equal(touching({ x: SHRINE.x-24, y: 4, z: SHRINE.z }, 2), 'structure');
  // Straight on through the torii, over the shrine roofs and up the valley.
  for (let x = gate.x-300; x < VALLEY[0].x; x += 4) assert.equal(touching({ x, y: 30, z: gate.z }, 6), null, `torii line blocked at ${x}`);
});

test('a valley runs from the shrine to the open meadow, and the meadow to the bridge', () => {
  const floor = walk(VALLEY, 10);
  for (const [i, p] of floor.entries()) {
    const ground = surfaceHeight(p.x, p.z);
    assert.ok(ground > 2 && ground < 32, `valley floor at ${p.x}, ${p.z}: ${ground}`);
    assert.equal(touching({ ...p, y: ground+22 }, 12), null);
    for (const side of [-40, 40]) assert.ok(woods(p.x, p.z+side) < .5 && woods(p.x, p.z) < .02, `trees on the valley floor at ${p.x}`);
    if (i) assert.ok(Math.abs(ground-surfaceHeight(floor[i-1].x, floor[i-1].z)) < 3);
  }
  const mid = VALLEY[2];
  assert.ok(surfaceHeight(mid.x, mid.z-220) > 60 && surfaceHeight(mid.x, mid.z+220) > 60, 'the valley has sides');
  for (let x = VALLEY.at(-1)!.x; x <= BRIDGE.ends[0]; x += 10) {
    const z = MEADOW.z+(BRIDGE.z-MEADOW.z)*(x-420)/(BRIDGE.ends[0]-420);
    assert.equal(touching({ x, y: surfaceHeight(x, z)+15, z }, 8), null);
    if (x > 600) assert.ok(woods(x, z) < .02, `trees on the meadow at ${x}`);
  }
});

test('woods fade between forest and open ground with no edge', () => {
  let dense = 0, open = 0, land = 0;
  const gentle = (x: number, z: number) => { const h = terrainHeight(x, z); return h > 14 && h < 130; };
  for (let x = -1300; x <= 1200; x += 9) for (let z = -1200; z <= 1200; z += 9) {
    const here = woods(x, z);
    assert.ok(here >= 0 && here <= 1);
    if (terrainHeight(x, z) < 5) { assert.ok(here < .2); continue; }
    land++; if (here > .7) dense++; if (here < .05) open++;
    if (!gentle(x, z)) continue;
    for (const [dx, dz] of [[6, 0], [0, 6]]) if (gentle(x+dx, z+dz))
      assert.ok(Math.abs(woods(x+dx, z+dz)-here) < .15, `woods jump at ${x}, ${z}`);
  }
  assert.ok(dense/land > .15 && open/land > .3, `dense ${dense/land}, open ${open/land}`);
});
