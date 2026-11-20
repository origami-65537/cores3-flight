import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR, Momentum, coastEffect, rush, updraft, wind } from './air';
import { Aerobatics, STUNT, steepness } from './stunts';
import { VOLCANO, groundHeight, launch } from './world';

const cruise = 37.2, dt = 1/60;
function fly(momentum:Momentum, speed:number, pitch:number, seconds:number, coast = 0) {
  let pulledOut = false;
  for (let t = 0; t < seconds; t += dt) { const next = momentum.step(speed,pitch,cruise,coast,dt); speed = next.speed; pulledOut ||= next.pulledOut; }
  return { speed, pulledOut };
}
const above = (x:number, z:number, height:number) => ({ x, y:groundHeight(x,z)+height, z });

test('level flight holds the cruise speed', () => {
  assert.ok(Math.abs(fly(new Momentum(),cruise,0,5).speed-cruise) < .01);
});

test('a dive builds speed, pulling out adds a surge, and the speed is carried into level flight', () => {
  const momentum = new Momentum(), dive = fly(momentum,cruise,-STUNT.limits.pitch,4);
  assert.ok(dive.speed > cruise+30 && !dive.pulledOut);
  const out = fly(momentum,dive.speed,.05,AIR.pullOut.seconds);
  assert.ok(out.pulledOut && out.speed > dive.speed+5);
  const later = fly(momentum,out.speed,0,3);
  assert.ok(later.speed > cruise+12 && later.speed < out.speed);
});

test('a dive gains speed one and a half times as fast as the same climb loses it', () => {
  const gain = new Momentum().step(cruise,-STUNT.limits.pitch,cruise,0,dt).speed-cruise;
  const loss = cruise-new Momentum().step(cruise,STUNT.limits.pitch,cruise,0,dt).speed;
  assert.ok(Math.abs(gain/loss-1.5) < 1e-6);
  assert.ok(Math.abs(gain/dt-AIR.dive*Math.sin(STUNT.limits.pitch)) < 1e-6);
});

test('letting the nose ease back to level after a dive gives the surge too', () => {
  const momentum = new Momentum(), dive = fly(momentum,cruise,-STUNT.limits.pitch,4);
  let speed = dive.speed, pitch = -STUNT.limits.pitch, pulledOut = false;
  for (let t = 0; t < 2; t += dt) { pitch -= pitch*(1-Math.exp(-4*dt)); const next = momentum.step(speed,pitch,cruise,0,dt); speed = next.speed; pulledOut ||= next.pulledOut; }
  assert.ok(pitch < 0 && pulledOut);
});

test('a shallow dip gives no surge', () => {
  const momentum = new Momentum(), dip = fly(momentum,cruise,-.2,2);
  assert.equal(fly(momentum,dip.speed,.05,1).pulledOut, false);
});

test('a steady climb costs speed but never stops the plane, and speed stays under the limit', () => {
  const climb = fly(new Momentum(),cruise,STUNT.limits.pitch,20).speed;
  assert.ok(climb < STUNT.loop.minSpeed && climb > 22);
  assert.ok(fly(new Momentum(),cruise,-STUNT.limits.pitch,60).speed <= AIR.maxSpeed);
});

test('a loop held from cruise speed still completes', () => {
  const aero = new Aerobatics(), momentum = new Momentum(), tricks:string[] = [];
  let attitude = { heading:0, pitch:0, bank:0 }, speed = cruise;
  for (let t = 0; t < 4; t += dt) {
    const flown = aero.step(attitude,{ roll:0, climb:0, hold:{ roll:0, pitch:1 }, speed, bankResponse:5, pitchResponse:4 },dt);
    attitude = flown; tricks.push(...flown.tricks);
    speed = momentum.step(speed,attitude.pitch,cruise,0,dt,true).speed-STUNT.gravity*steepness(attitude.pitch)*dt;
  }
  assert.deepEqual(tricks, ['loop']);
});

test('holding the nose further down after a dive gives no surge and keeps the height lost', () => {
  const momentum = new Momentum(), dive = fly(momentum,cruise,-STUNT.limits.pitch,4);
  let speed = dive.speed, pulledOut = false;
  for (let t = 0; t < .5; t += dt) { const next = momentum.step(speed,-1.2,cruise,0,dt,true); speed = next.speed; pulledOut ||= next.pulledOut; }
  assert.equal(pulledOut, false);
  assert.ok(fly(momentum,speed,.05,AIR.pullOut.seconds).pulledOut);
});

test('flying low along the coast raises the cruise speed', () => {
  assert.ok(fly(new Momentum(),cruise,0,10,1).speed > cruise+10);
});

test('air rises on the volcano slopes, most on the windward side, and not over the open sea or high above the ground', () => {
  const side = (angle:number, height:number) => updraft(above(VOLCANO.x+300*Math.cos(angle),VOLCANO.z+300*Math.sin(angle),height));
  const windward = Math.atan2(-AIR.wind.z,-AIR.wind.x);
  assert.ok(side(windward,40) > 8);
  assert.ok(side(windward+Math.PI,40) > 2 && side(windward+Math.PI,40) < side(windward,40)*.6);
  assert.equal(side(windward,300), 0);
  assert.equal(updraft({ x:launch.x, y:40, z:launch.z }), 0);
});

test('hot air rises over the crater', () => {
  assert.ok(updraft({ x:VOLCANO.x, y:VOLCANO.rim+80, z:VOLCANO.z }) > 13);
  assert.equal(updraft({ x:VOLCANO.x, y:640, z:VOLCANO.z }), 0);
});

test('the wind blows one way, is weak near the surface and behind high ground', () => {
  const high = wind({ x:launch.x, y:200, z:launch.z },0), low = wind({ x:launch.x, y:6, z:launch.z },0);
  assert.ok(Math.abs(Math.hypot(high.x,high.z)-AIR.wind.speed) < AIR.wind.speed*AIR.wind.gust+.01);
  assert.ok(Math.abs(high.x*AIR.wind.z-high.z*AIR.wind.x) < 1e-9 && high.x*AIR.wind.x > 0);
  assert.ok(Math.hypot(low.x,low.z) < Math.hypot(high.x,high.z)*.35);
  const lee = { x:VOLCANO.x+AIR.wind.x*260, y:260, z:VOLCANO.z+AIR.wind.z*260 }, open = { ...lee, y:520 };
  assert.ok(Math.hypot(wind(lee,0).x,wind(lee,0).z) < Math.hypot(wind(open,0).x,wind(open,0).z)*.5);
});

test('the coast favours low flying only close to the surface near the shore', () => {
  const shore = { x:-900, z:0 };
  assert.ok(coastEffect({ ...shore, y:groundHeight(shore.x,shore.z)+6 }) > .9);
  assert.equal(coastEffect({ ...shore, y:groundHeight(shore.x,shore.z)+60 }), 0);
  assert.equal(coastEffect({ x:launch.x, y:6, z:launch.z+300 }), 0);
  assert.equal(coastEffect(above(VOLCANO.x+300,VOLCANO.z,6)), 0);
});

test('the rush of air fades in with speed', () => {
  assert.equal(rush(cruise), 0); assert.equal(rush(AIR.maxSpeed), 1);
});
