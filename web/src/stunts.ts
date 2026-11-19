export const STUNT = {
  // Degrees, degrees per second and milliseconds of CoreS3 motion; tune after device playtests.
  flick: { rate:250, rollSwing:40, pitchSwing:45, windowMs:350, returnMs:300, returnFraction:.5, outward:25, crossAxis:.6, direction:8, restRate:80, armTilt:20, armRate:120 },
  barrelRoll: { seconds:.7, points:100, sink:3, corkscrew:2 },
  loop: { seconds:2, points:300, minSpeed:35, topSpeed:.75 },
  splitS: { seconds:1.6, points:250, drop:40 },
  stall: { seconds:2.2, drop:35, hang:.3, exitSpeed:.55 },
  // The chase camera follows more tightly during a trick so the plane stays in frame.
  cameraSmoothing:10,
} as const;

export type Gesture = 'twistLeft' | 'twistRight' | 'pull' | 'push';
export const GESTURES: readonly Gesture[] = ['twistLeft','twistRight','pull','push'];
/** Centered device tilt in degrees (roll: right edge down, pitch: top edge up) and its rates in degrees per second. */
export interface MotionSample { t:number; roll:number; pitch:number; rollRate:number; pitchRate:number }
type Axis = 'roll' | 'pitch';
interface Candidate { axis:Axis; sign:number; start:number; rest:number; otherRest:number; peak:number; peakAt:number; peakRate:number; otherPeak:number }
export interface Flick { gesture:Gesture; rate:number; swing:number; t:number }

export class FlickDetector {
  armed = false;
  last?: Flick;
  rejected = '';
  counts: Record<Gesture,number> = {twistLeft:0,twistRight:0,pull:0,push:0};
  private rest = {roll:0,pitch:0};
  private candidate?: Candidate;
  get progress() { return this.candidate && {axis:this.candidate.axis, swing:this.candidate.peak*(this.candidate.sign||1), rate:this.candidate.peakRate}; }
  reset() { this.armed = false; this.candidate = undefined; }
  private fail(reason:string) { this.rejected = reason; this.reset(); return null; }
  update(s:MotionSample): Gesture | null {
    const F = STUNT.flick;
    const rollRate = Math.abs(s.rollRate), pitchRate = Math.abs(s.pitchRate);
    if (!this.candidate) {
      if (rollRate < F.restRate) this.rest.roll = s.roll;
      if (pitchRate < F.restRate) this.rest.pitch = s.pitch;
    }
    if (!this.armed) {
      // A new flick is accepted only after the device has settled near neutral.
      this.armed = Math.max(Math.abs(s.roll),Math.abs(s.pitch)) < F.armTilt && Math.max(rollRate,pitchRate) < F.armRate;
      return null;
    }
    let c = this.candidate;
    if (!c) {
      if (Math.max(rollRate,pitchRate) < F.rate) return null;
      const axis:Axis = rollRate >= pitchRate ? 'roll' : 'pitch', other:Axis = axis === 'roll' ? 'pitch' : 'roll';
      c = this.candidate = {axis, sign:0, start:s.t, rest:this.rest[axis], otherRest:this.rest[other], peak:0, peakAt:s.t, peakRate:0, otherPeak:0};
    }
    const other:Axis = c.axis === 'roll' ? 'pitch' : 'roll';
    const moved = s[c.axis]-c.rest;
    // Direction comes from the measured tilt, so the gyro only has to report how fast the device moved.
    if (!c.sign && Math.abs(moved) >= F.direction) c.sign = Math.sign(moved);
    const swing = moved*c.sign;
    c.peakRate = Math.max(c.peakRate, c.axis === 'roll' ? rollRate : pitchRate);
    c.otherPeak = Math.max(c.otherPeak, Math.abs(s[other]-c.otherRest));
    if (swing > c.peak) { c.peak = swing; c.peakAt = s.t; }
    const reached = c.peak >= (c.axis === 'roll' ? F.rollSwing : F.pitchSwing);
    if (!reached) return s.t-c.start > F.windowMs ? this.fail(`${c.axis}: swing ${c.peak.toFixed(0)}° too small`) : null;
    if (c.otherPeak > c.peak*F.crossAxis) return this.fail(`${c.axis}: two axes moved`);
    if (c.rest*c.sign+c.peak < F.outward) return this.fail(`${c.axis}: ended near neutral`);
    if (c.axis === 'roll') {
      // A twist counts only when it snaps back; a held bank is steering.
      if (s.t-c.peakAt > F.returnMs) return this.fail('roll: held, not flicked');
      if (swing > c.peak*F.returnFraction) return null;
    }
    const gesture:Gesture = c.axis === 'roll' ? (c.sign > 0 ? 'twistRight' : 'twistLeft') : c.sign > 0 ? 'pull' : 'push';
    this.last = {gesture, rate:c.peakRate, swing:c.peak, t:s.t};
    this.counts[gesture]++; this.rejected = ''; this.reset();
    return gesture;
  }
}

export type TrickKind = 'barrelRoll' | 'loop' | 'splitS' | 'stall';
export interface Trick { kind:TrickKind; dir:1|-1; t:number }
/** Offsets a trick adds to the flight model at normalized time u: radians, metres and speed factors. */
export interface TrickFrame { pitch:number; roll:number; yaw:number; speed:number; climb:number; drop:number; side:number; lift:number }
export const TRICK_NAMES: Record<TrickKind,string> = {barrelRoll:'BARREL ROLL', loop:'LOOP', splitS:'SPLIT S', stall:'STALL'};
export const trickSeconds = (kind:TrickKind) => STUNT[kind].seconds;
export const trickPoints = (kind:TrickKind) => kind === 'stall' ? 0 : STUNT[kind].points;
export function trickFor(gesture:Gesture, speed:number): Trick {
  if (gesture === 'pull') return {kind:speed >= STUNT.loop.minSpeed ? 'loop' : 'stall', dir:1, t:0};
  if (gesture === 'push') return {kind:'splitS', dir:1, t:0};
  return {kind:'barrelRoll', dir:gesture === 'twistRight' ? 1 : -1, t:0};
}
const clamp01 = (n:number) => Math.max(0,Math.min(1,n));
const smooth = (n:number) => { const u = clamp01(n); return u*u*(3-2*u); };
const TAU = Math.PI*2;
export function trickFrame(kind:TrickKind, dir:number, at:number): TrickFrame {
  const u = clamp01(at), f:TrickFrame = {pitch:0,roll:0,yaw:0,speed:1,climb:1,drop:0,side:0,lift:0};
  if (kind === 'barrelRoll') {
    const e = smooth(u), angle = TAU*e, B = STUNT.barrelRoll;
    f.roll = -dir*angle; f.drop = B.sink*e;
    f.side = dir*B.corkscrew*Math.sin(angle); f.lift = B.corkscrew*(1-Math.cos(angle));
  } else if (kind === 'loop') {
    // Symmetric in time, so the loop closes at its entry height.
    f.pitch = TAU*u-.35*Math.sin(TAU*u);
    f.speed = 1-(1-STUNT.loop.topSpeed)*(1-Math.cos(f.pitch))/2;
  } else if (kind === 'splitS') {
    const pull = Math.PI*smooth((u-.12)/.88);
    f.roll = -dir*Math.PI*smooth(u/.45); f.pitch = -pull; f.yaw = Math.PI*smooth(u);
    // Half roll, then half loop down: the height lost is fixed, the horizontal reach follows speed.
    f.climb = 0; f.drop = STUNT.splitS.drop/2*(1-Math.cos(pull));
  } else {
    const S = STUNT.stall;
    f.pitch = u < S.hang ? 1.15*smooth(u/S.hang) : u < .7 ? 1.15-2.05*smooth((u-S.hang)/(.7-S.hang)) : -.9*(1-smooth((u-.7)/.3));
    f.speed = u < .75 ? 1-.7*smooth(u/.35) : .3+(S.exitSpeed-.3)*smooth((u-.75)/.25);
    f.drop = S.drop*smooth((u-S.hang)/(1-S.hang));
  }
  return f;
}
/** Advances a trick by dt seconds and returns its pose and the distance flown this step. */
export function stepTrick(trick:Trick, dt:number, heading:number, pitch:number, speed:number) {
  const seconds = trickSeconds(trick.kind), before = trickFrame(trick.kind,trick.dir,trick.t/seconds);
  trick.t = Math.min(seconds,trick.t+dt);
  const frame = trickFrame(trick.kind,trick.dir,trick.t/seconds), angle = pitch+frame.pitch, distance = speed*frame.speed*dt;
  return {frame, done:trick.t >= seconds, dx:-Math.sin(heading)*Math.cos(angle)*distance, dy:Math.sin(angle)*distance*frame.climb-(frame.drop-before.drop), dz:-Math.cos(heading)*Math.cos(angle)*distance};
}
