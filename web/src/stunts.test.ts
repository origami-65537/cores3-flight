import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { FlickDetector, STUNT, stepTrick, trickFor, trickFrame, trickPoints, type Gesture, type Trick } from './stunts';

/** Feeds 50 Hz samples of a tilt path given as [milliseconds, roll, pitch] keyframes and returns what fired. */
function play(detector:FlickDetector, keys:[number,number,number][], start=0) {
  const fired:Gesture[] = [];
  let previous = {roll:keys[0][1], pitch:keys[0][2]};
  for (let t = keys[0][0]; t <= keys[keys.length-1][0]; t += 20) {
    const i = Math.max(1, keys.findIndex(k => k[0] >= t)), [t0,r0,p0] = keys[i-1], [t1,r1,p1] = keys[i];
    const k = (t-t0)/(t1-t0), ease = k*k*(3-2*k), roll = r0+(r1-r0)*ease, pitch = p0+(p1-p0)*ease;
    const gesture = detector.update({t:start+t, roll, pitch, rollRate:(roll-previous.roll)/.02, pitchRate:(pitch-previous.pitch)/.02});
    if (gesture) fired.push(gesture);
    previous = {roll,pitch};
  }
  return fired;
}
const settle:[number,number,number][] = [[0,0,0],[200,0,0]];

test('quick twists that snap back are left and right flicks', () => {
  const detector = new FlickDetector();
  a.deepEqual(play(detector, [...settle,[340,50,0],[480,0,0],[700,0,0]]), ['twistRight']);
  a.deepEqual(play(detector, [...settle,[340,-50,0],[480,0,0],[700,0,0]], 1000), ['twistLeft']);
  a.deepEqual(detector.counts, {twistLeft:1,twistRight:1,pull:0,push:0});
  a.ok(detector.last!.rate > STUNT.flick.rate && detector.last!.swing >= STUNT.flick.rollSwing);
});

test('a quick pull toward you and a quick push away are separate flicks', () => {
  const detector = new FlickDetector();
  a.deepEqual(play(detector, [...settle,[360,0,55],[900,0,55]]), ['pull']);
  a.deepEqual(play(detector, [[0,0,55],[500,0,0],[700,0,0],[860,0,-55],[1200,0,-55]], 1000), ['push']);
});

test('steering, slow tilts and held banks never fire', () => {
  const detector = new FlickDetector();
  a.deepEqual(play(detector, [...settle,[1200,60,0],[2200,0,45],[3200,0,-45],[4200,0,0]]), []);
  a.deepEqual(play(detector, [...settle,[320,30,0],[600,-30,0],[900,30,20],[1200,0,0]], 5000), []);
  a.deepEqual(play(detector, [...settle,[340,50,0],[1200,50,0]], 7000), []);
  a.match(detector.rejected, /held/);
});

test('the swing back after a flick does not fire the opposite flick', () => {
  const detector = new FlickDetector();
  a.deepEqual(play(detector, [...settle,[360,0,55],[420,0,55],[560,0,-5],[900,0,0]]), ['pull']);
  a.deepEqual(play(detector, [[0,0,0],[100,0,0],[240,0,40],[380,0,-8],[700,0,0]], 2000), []);
  a.match(detector.rejected, /too small/);
});

test('a diagonal swing is not a flick', () => {
  const detector = new FlickDetector();
  a.deepEqual(play(detector, [...settle,[340,50,60],[480,0,0],[700,0,0]]), []);
  a.match(detector.rejected, /two axes/);
});

test('the next flick waits until the device is back near neutral', () => {
  const detector = new FlickDetector();
  a.deepEqual(play(detector, [...settle,[360,0,55],[500,0,30],[660,0,85],[900,0,85]]), ['pull']);
  a.equal(detector.armed, false);
  a.deepEqual(play(detector, [[0,0,85],[500,0,0],[700,0,0],[860,0,55],[1000,0,55]], 2000), ['pull']);
});

function fly(trick:Trick, speed:number) {
  const flight = {x:0, y:100, z:0, top:100, bottom:100, heading:.4};
  let done = false, frame = trickFrame(trick.kind,trick.dir,0);
  while (!done) {
    const step = stepTrick(trick, 1/60, flight.heading, 0, speed);
    flight.x += step.dx; flight.y += step.dy; flight.z += step.dz;
    flight.top = Math.max(flight.top,flight.y); flight.bottom = Math.min(flight.bottom,flight.y);
    done = step.done; frame = step.frame;
  }
  return {...flight, frame};
}

test('tricks map to gestures, and a loop needs speed', () => {
  a.deepEqual(trickFor('twistLeft',40), {kind:'barrelRoll',dir:-1,t:0});
  a.deepEqual(trickFor('twistRight',20), {kind:'barrelRoll',dir:1,t:0});
  a.equal(trickFor('pull',STUNT.loop.minSpeed).kind, 'loop');
  a.equal(trickFor('pull',STUNT.loop.minSpeed-.1).kind, 'stall');
  a.equal(trickFor('push',20).kind, 'splitS');
  a.deepEqual(['barrelRoll','loop','splitS','stall'].map(k => trickPoints(k as Trick['kind'])), [100,300,250,0]);
});

test('barrel roll turns once and sinks 3 m', () => {
  const end = fly(trickFor('twistRight',40), 40);
  a.ok(Math.abs(end.frame.roll+Math.PI*2) < 1e-9);
  a.ok(Math.abs(end.y-97) < .01);
  a.ok(Math.abs(end.frame.side) < 1e-9 && Math.abs(end.frame.lift) < 1e-9);
  a.ok(Math.abs(fly(trickFor('twistLeft',40), 40).frame.roll-Math.PI*2) < 1e-9);
});

test('loop is a full vertical circle that returns to its entry height', () => {
  const end = fly(trickFor('pull',40), 40);
  a.ok(Math.abs(end.frame.pitch-Math.PI*2) < 1e-9);
  a.ok(end.top > 115, `top ${end.top}`);
  a.ok(Math.abs(end.y-100) < 1, `exit ${end.y}`);
  a.equal(end.frame.speed, 1);
});

test('split S reverses direction and loses 40 m at any speed', () => {
  for (const speed of [25,40,66]) {
    const end = fly(trickFor('push',speed), speed);
    a.ok(Math.abs(end.y-60) < .01, `exit ${end.y}`);
    a.ok(Math.abs(end.frame.pitch+Math.PI) < 1e-9 && Math.abs(Math.abs(end.frame.roll)-Math.PI) < 1e-9 && Math.abs(end.frame.yaw-Math.PI) < 1e-9);
    a.equal(end.bottom, end.y);
  }
});

test('a slow loop stalls and falls', () => {
  const end = fly(trickFor('pull',30), 30);
  a.ok(end.top > 101 && end.top < 115);
  a.ok(end.y < 75, `exit ${end.y}`);
  a.ok(Math.abs(end.frame.pitch) < 1e-9);
  a.equal(end.frame.speed, STUNT.stall.exitSpeed);
});
