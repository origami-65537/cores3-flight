import { test } from 'node:test';
import * as a from 'node:assert/strict';
import { FEEL, fovFromSpeed, chimePitch, nearMiss } from './feel';
test('FOV clamps cruise and boost and interpolates', () => {
  a.equal(fovFromSpeed(0),60); a.equal(fovFromSpeed(88),75); a.equal(fovFromSpeed(200),75);
  a.equal(fovFromSpeed((37.2+88)/2),67.5);
});
test('chime starts at base, rises and caps', () => {
  a.equal(chimePitch(0),FEEL.audio.basePitch); a.equal(chimePitch(1),FEEL.audio.basePitch);
  a.ok(chimePitch(2)>chimePitch(1)); a.equal(chimePitch(100),chimePitch(13));
});
test('near misses exclude crashes, contact and outside distances', () => {
  a.equal(nearMiss(3,9),true); a.equal(nearMiss(0,9),false); a.equal(nearMiss(-1,9),false);
  a.equal(nearMiss(9,9),false); a.equal(nearMiss(3,9,true),false);
  a.equal([].some(x=>nearMiss(x,9)),false);
});
