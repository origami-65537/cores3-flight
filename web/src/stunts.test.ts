import a from 'node:assert/strict';
import test from 'node:test';
import { Aerobatics, HoldDetector, STUNT, steepness, turnFactor, type Hold, type TrickKind } from './stunts';

const DT = 1/60, deg = (n:number) => n*Math.PI/180;
const none:Hold = {roll:0, pitch:0};
/** Flies the attitude model through a list of [seconds, hold] phases and reports what happened. */
function fly(phases:[number,Partial<Hold>][], speed=50, controls={roll:0, climb:0}) {
  const aero = new Aerobatics();
  let attitude = {heading:0, pitch:0, bank:0}, altitude = 0, maxPitch = 0, maxBank = 0, stalled = false;
  const tricks:TrickKind[] = [];
  for (const [seconds,hold] of phases) for (let t = 0; t < seconds-1e-9; t += DT) {
    const step = aero.step(attitude,{...controls, hold:{...none,...hold}, speed, bankResponse:12, pitchResponse:9},DT);
    attitude = step; tricks.push(...step.tricks);
    altitude += Math.sin(attitude.pitch)*speed*DT;
    maxPitch = Math.max(maxPitch,Math.abs(attitude.pitch)); maxBank = Math.max(maxBank,Math.abs(attitude.bank));
    stalled ||= aero.stalled;
  }
  return {...attitude, tricks, altitude, maxPitch, maxBank, stalled, active:aero.active(attitude), view:aero.view};
}
const near = (actual:number, expected:number, tolerance:number, label:string) => a.ok(Math.abs(actual-expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('a hold starts at 50 degrees, ends below 38 and follows one axis at a time', () => {
  const holds = new HoldDetector();
  a.deepEqual(holds.update(45,0), none);
  a.deepEqual(holds.update(50,0), {roll:1, pitch:0});
  a.deepEqual(holds.update(40,70), {roll:1, pitch:0});
  a.deepEqual(holds.update(37,10), none);
  a.deepEqual(holds.update(0,-55), {roll:0, pitch:-1});
  a.deepEqual(holds.update(0,55), {roll:0, pitch:1});
  holds.reset();
  a.deepEqual(holds.update(-60,20), {roll:-1, pitch:0});
});

test('without a hold the plane keeps its normal 45 degree bank and 28 degree pitch limits', () => {
  const flight = fly([[2,{}]],50,{roll:1, climb:1});
  near(flight.bank,-STUNT.limits.bank,.001,'bank'); near(flight.pitch,STUNT.limits.pitch,.001,'pitch');
  a.deepEqual(flight.tricks, []); a.equal(flight.active, false);
});

test('the plane rolls only while the roll is held, and each full turn is one barrel roll', () => {
  const turn = 2*Math.PI/STUNT.roll.rate;
  const once = fly([[turn,{roll:1}],[1,{}]]);
  a.deepEqual(once.tricks, ['barrelRoll']); near(once.bank,0,.01,'level after one roll');
  a.deepEqual(fly([[turn*3,{roll:-1}],[1,{}]]).tricks, ['barrelRoll','barrelRoll','barrelRoll']);
  const early = fly([[turn*.4,{roll:1}],[1,{}]]);
  a.deepEqual(early.tricks, [], 'let go before halfway: the plane rolls back');
  near(early.bank,0,.01,'level after rolling back'); a.ok(early.maxBank < deg(160));
  a.deepEqual(fly([[turn*.6,{roll:1}],[1,{}]]).tricks, ['barrelRoll'], 'let go past halfway: the roll finishes');
  const stopped = fly([[turn*.25,{roll:1}],[.05,{}]]);
  a.ok(stopped.maxBank < deg(95), 'rotation stops when the hold ends');
});

test('a held pull flies a full loop that closes at its entry height on the same heading', () => {
  const turn = 2*Math.PI/STUNT.loop.rate;
  const loop = fly([[turn,{pitch:1}],[1,{}]]);
  a.deepEqual(loop.tricks, ['loop']);
  near(loop.heading,0,1e-9,'heading'); near(loop.pitch,0,.01,'pitch'); near(loop.altitude,0,3,'altitude');
  near(loop.maxPitch,2*Math.PI-STUNT.limits.pitch,.1,'went all the way round');
});

test('a pull below 35 m/s stalls: the nose stays inside the normal limit and nothing scores', () => {
  const slow = fly([[3,{pitch:1}]],30);
  a.equal(slow.stalled, true); a.deepEqual(slow.tricks, []);
  a.ok(slow.maxPitch <= STUNT.limits.pitch+.01);
  a.equal(fly([[.5,{pitch:1}]],36).stalled, false);
});

test('a push held to inverted and let go is a split S: opposite heading, upright, about 40 m lower', () => {
  const half = Math.PI/STUNT.loop.rate;
  const split = fly([[half,{pitch:-1}],[1.5,{}]],52);
  a.deepEqual(split.tricks, ['splitS']);
  near(split.heading,Math.PI,1e-9,'heading reversed'); near(split.bank,0,.02,'upright'); near(split.pitch,0,.02,'level');
  near(split.altitude,-2*52/STUNT.loop.rate,3,'height lost'); near(split.view,0,.05,'camera has come round');
  const justReleased = fly([[half,{pitch:-1}],[DT,{}]],52);
  a.deepEqual(justReleased.tricks, [], 'it scores only once the plane is upright again');
  near(Math.abs(justReleased.bank),Math.PI,.3,'inverted on the new heading'); near(Math.abs(justReleased.view),Math.PI,.2,'camera has not cut');
});

test('other half turns reverse the plane without scoring, and a shallow push just dives', () => {
  const half = Math.PI/STUNT.loop.rate;
  const immelmann = fly([[half,{pitch:1}],[1.5,{}]]);
  a.deepEqual(immelmann.tricks, []); near(immelmann.heading,Math.PI,1e-9,'heading');
  const shortPush = fly([[half*.6,{pitch:-1}],[1.5,{}]]);
  a.deepEqual(shortPush.tricks, [], 'reversed before 135 degrees'); near(shortPush.heading,Math.PI,1e-9,'heading');
  const dive = fly([[half*.4,{pitch:-1}],[1.5,{}]]);
  a.deepEqual(dive.tricks, []); near(dive.heading,0,1e-9,'heading'); near(dive.pitch,0,.01,'pulled out');
  a.deepEqual(fly([[half*1.7,{pitch:-1}],[1.5,{}]]).tricks, ['loop'], 'let go in the last quarter: the outside loop finishes');
});

test('turning reverses on the back of a loop and steep flight trades speed for height', () => {
  a.equal(turnFactor(0), 1); a.equal(turnFactor(STUNT.limits.pitch), 1); a.equal(turnFactor(Math.PI), -1);
  near(turnFactor(Math.PI/2),0,1e-9,'vertical');
  a.equal(steepness(0), 0); a.equal(steepness(-STUNT.limits.pitch), 0);
  a.ok(steepness(Math.PI/2) > .5); a.ok(steepness(-Math.PI/2) < -.5);
  near(steepness(deg(170)),0,1e-9,'inverted and nearly level');
});
