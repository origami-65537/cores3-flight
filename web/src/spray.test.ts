import { test } from 'node:test';
import * as a from 'node:assert/strict';
import * as THREE from 'three';
import { SeaSpray, sprayRate } from './spray';

test('spray emission is off at zero, readable at moderate skim and monotonic',()=>{
  a.equal(sprayRate(0),0);
  a.ok(sprayRate(.3)>=80);
  a.ok(sprayRate(.3)<sprayRate(.6));
  a.ok(sprayRate(.6)<sprayRate(1));
  a.equal(sprayRate(-1),0); a.equal(sprayRate(2),sprayRate(1));
  a.equal(sprayRate(NaN),0); a.equal(sprayRate(Infinity),0);
});

test('pooled spray drains without emission and clears on reset',()=>{
  const spray=new SeaSpray(new THREE.Scene());
  const position=new THREE.Vector3(0,4,0), forward=new THREE.Vector3(0,0,-1);
  const alpha=spray.points.geometry.getAttribute('alpha');
  spray.update(.05,0,position,forward,40,768);
  a.ok(Array.from(alpha.array).every(x=>x===0));
  spray.update(.05,1,position,forward,40,768);
  a.ok(Array.from(alpha.array).some(x=>x>0));
  for(let i=0;i<30;i++)spray.update(.05,0,position,forward,40,768);
  a.ok(Array.from(alpha.array).every(x=>x===0));
  spray.update(.05,1,position,forward,40,768);
  spray.reset();
  a.ok(Array.from(alpha.array).every(x=>x===0));
});
