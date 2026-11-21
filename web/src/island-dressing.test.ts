import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { bridgeAnchorDressing, bridgeDressing, roadDressing, toriiDressing, type Dress } from './island-dressing';
import { BRIDGE, ROAD, landmarks } from './world';

test('the flared road meets the full deck width, perpendicular and flush', () => {
  const material = new THREE.MeshBasicMaterial();
  roadDressing(ROAD, geometry => {
    const vertices = geometry.getAttribute('position'), seam: THREE.Vector3[] = [];
    for (let i = 0; i < vertices.count; i++) if (Math.abs(vertices.getX(i)-BRIDGE.ends[0]) < 1e-4) {
      seam.push(new THREE.Vector3().fromBufferAttribute(vertices, i));
    }
    assert.ok(seam.length >= 3);
    assert.equal(Math.min(...seam.map(p => p.z)), BRIDGE.z-9);
    assert.equal(Math.max(...seam.map(p => p.z)), BRIDGE.z+9);
    for (const p of seam) assert.ok(Math.abs(p.y-(BRIDGE.deck+2.52)) < 1e-4);
    geometry.dispose();
  }, material);
  material.dispose();
});

test('the four stone anchors and metal sockets stay within the original collision blocks', () => {
  const material = new THREE.MeshBasicMaterial();
  const anchors = landmarks.find(l => l.id === 'bridge')!.solids.filter(s => s.kind === 'box' && s.look === 'deck' && s.hx < 10);
  assert.equal(anchors.length, 4);
  for (const s of anchors) if (s.kind === 'box') {
    const envelope = new THREE.Box3(new THREE.Vector3(s.x-s.hx, s.y-s.hy, s.z-s.hz), new THREE.Vector3(s.x+s.hx, s.y+s.hy, s.z+s.hz));
    envelope.expandByScalar(1e-4);
    const add: Dress = (geometry, _material, x, y, z) => {
      geometry.translate(x, y, z); geometry.computeBoundingBox();
      assert.ok(envelope.containsBox(geometry.boundingBox!), `anchor at ${s.x}, ${s.z} exceeds its collision envelope`);
      geometry.dispose();
    };
    bridgeAnchorDressing(s, add, material, material, material);
  }
  material.dispose();
});

test('the swept torii cap stays within aircraft clearance of the solid top', () => {
  const lintel = landmarks.find(l => l.id === 'torii')!.solids.find(s => s.kind === 'box' && s.hy >= 3)!;
  assert.equal(lintel.kind, 'box');
  if (lintel.kind !== 'box') return;
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), meshes: THREE.Mesh[] = [];
  toriiDressing(lintel, geometry => meshes.push(new THREE.Mesh(geometry, material)), material, material, material);
  for (const fraction of [-.98, -.5, 0, .5, .98]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(lintel.hx*fraction, lintel.hy+5, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes)[0];
    assert.ok(hit);
    assert.ok(lintel.hy-hit.point.y <= 1, `invisible upper collision gap at ${fraction}`);
  }
  for (const mesh of meshes) mesh.geometry.dispose();
  material.dispose();
});

test('torii and bridge dressing leave the flight openings clear edge to edge', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const id of ['torii', 'bridge']) {
    const landmark = landmarks.find(l => l.id === id)!, meshes: THREE.Mesh[] = [];
    const add: Dress = (geometry, material, x, y, z, yaw = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.updateMatrixWorld();
      meshes.push(mesh);
    };
    if (id === 'bridge') bridgeDressing(add, material, material);
    else for (const solid of landmark.solids) toriiDressing(solid, add, material, material, material);
    const gate = landmark.gate, direction = new THREE.Vector3(-Math.sin(gate.yaw), 0, -Math.cos(gate.yaw));
    for (const side of [-.98, 0, .98]) for (const up of [-.98, 0, .98]) {
      const center = new THREE.Vector3(gate.x+Math.cos(gate.yaw)*gate.halfWidth*side,
        gate.y+gate.halfHeight*up, gate.z-Math.sin(gate.yaw)*gate.halfWidth*side);
      const ray = new THREE.Raycaster(center.addScaledVector(direction, -100), direction, 0, 200);
      assert.equal(ray.intersectObjects(meshes).length, 0, `${id} dressing blocks the opening at ${side}, ${up}`);
    }
    for (const mesh of meshes) mesh.geometry.dispose();
  }
  material.dispose();
});
