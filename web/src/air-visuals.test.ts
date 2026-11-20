import { test } from 'node:test';
import { strict as a } from 'node:assert';
import * as THREE from 'three';
import { AirVisuals, recycleTracer, tracerStyle } from './air-visuals';

test('lift warms and brightens tracers, distance fades the volume boundary',() => {
  a.ok(tracerStyle(15,0).brightness>tracerStyle(0,0).brightness);
  a.equal(tracerStyle(15,0).warmth,1);
  a.equal(tracerStyle(0,0).warmth,0);
  a.equal(tracerStyle(15,250).brightness,0);
  a.equal(tracerStyle(-5,500).brightness,0);
  a.equal(tracerStyle(100,0).warmth,1);
});

test('recycles outside the volume and far behind, not nearby or ahead',() => {
  const center={x:0,y:100,z:0}, forward={x:0,y:0,z:-1};
  a.equal(recycleTracer(center,center,forward),false);
  a.equal(recycleTracer({x:0,y:100,z:-200},center,forward),false);
  a.equal(recycleTracer({x:0,y:100,z:101},center,forward),true);
  a.equal(recycleTracer({x:251,y:100,z:0},center,forward),true);
  a.equal(recycleTracer({x:Infinity,y:0,z:0},center,forward),true);
});

test('quality limits the pool, coast cushion vanishes away from shore and reduced motion hides both',() => {
  const scene=new THREE.Scene(), visuals=new AirVisuals(scene), forward={x:0,y:0,z:-1};
  const [tracers,cushion]=scene.children as THREE.LineSegments[];
  visuals.update(.016,0,{x:0,y:8,z:900},forward,1,true);
  a.equal(cushion.visible,true);
  a.equal(tracers.geometry.drawRange.count,3200);
  a.ok(Array.from(tracers.geometry.attributes.position.array).every(Number.isFinite));
  visuals.update(.016,1,{x:0,y:180,z:1500},forward,.55,true);
  a.equal(cushion.visible,false);
  a.equal(tracers.geometry.drawRange.count,968);
  visuals.update(.016,2,{x:0,y:8,z:900},forward,1,false);
  a.equal(tracers.visible,false);
  a.equal(cushion.visible,false);
});
