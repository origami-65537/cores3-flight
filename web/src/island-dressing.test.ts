import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { bridgeDressing, toriiDressing, type Dress } from './island-dressing';
import { landmarks } from './world';

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
