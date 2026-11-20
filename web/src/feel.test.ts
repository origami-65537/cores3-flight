import { test } from 'node:test';
import * as a from 'node:assert/strict';
import { FEEL, fovFromSpeed, chimePitch, nearMiss, skimDepth, skimPoints } from './feel';
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
test('skimming pays only inside the band and most just above the warning height', () => {
  const {ceiling,warn,points:[low,high]}=FEEL.skim;
  a.equal(skimDepth(ceiling),0); a.equal(skimDepth(ceiling+20),0); a.equal(skimDepth(0),0); a.equal(skimDepth(-1),0);
  a.ok(skimDepth(ceiling-.001)>0); a.equal(skimDepth(warn),1); a.equal(skimDepth(warn/2),1);
  a.ok(skimDepth(4)>skimDepth(8));
  a.equal(skimPoints(0),0); a.equal(skimPoints(1),high); a.ok(skimPoints(skimDepth(ceiling-.001))>=low);
  a.ok(skimPoints(skimDepth(4))>skimPoints(skimDepth(8)));
});
