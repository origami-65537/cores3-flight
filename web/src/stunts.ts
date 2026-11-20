/**
 * Player-driven aerobatics. Holding the controller past the normal tilt range keeps the plane rotating
 * about that axis; letting go stops the rotation and the normal 45° bank / 28° pitch limits apply again.
 */
export const STUNT = {
  // Device tilt in degrees. 30° is already full normal deflection, so a hold has to go clearly past it.
  // A roll needs a deeper tilt than a pull or push: hard turns already lean the device well past 50°.
  // floor is the lowest the roll threshold may come down to for a pose centred off level; below it a hard turn would roll.
  hold: { roll:{ start:65, release:50, floor:45 }, pitch:{ start:50, release:38 } },
  limits: { bank:.78, pitch:.49 },
  // Rates are radians per second while held: one roll takes 1.2 s, one loop 2.4 s.
  roll: { rate:5.2, points:100 },
  loop: { rate:2.6, points:300, minSpeed:35 },
  // A push has to carry the nose at least this far round for the reversal to count.
  splitS: { points:250, minTurn:Math.PI*.75 },
  gravity:18,
  cameraSmoothing:10, viewSmoothing:3,
} as const;

const TAU = Math.PI*2, HALF = Math.PI/2;
// How close to its target an angle has to be to count as settled; damping never quite reaches it.
const SETTLED = .05, SLACK = .1;
const damp = (from:number, to:number, rate:number, dt:number) => from+(to-from)*(1-Math.exp(-rate*dt));
const clamp = (n:number, limit:number) => Math.max(-limit,Math.min(limit,n));

export type TrickKind = 'barrelRoll' | 'loop' | 'splitS';
export const TRICK_NAMES: Record<TrickKind,string> = {barrelRoll:'BARREL ROLL', loop:'LOOP', splitS:'SPLIT S'};
export const trickPoints = (kind:TrickKind) => kind === 'barrelRoll' ? STUNT.roll.points : kind === 'loop' ? STUNT.loop.points : STUNT.splitS.points;

/** Which axis, if any, is held past the normal tilt range: roll > 0 is right, pitch > 0 is a pull. */
export interface Hold { roll:number; pitch:number }
export class HoldDetector {
  private axis: 'roll' | 'pitch' | null = null;
  private sign = 0;
  reset() { this.axis = null; }
  /**
   * Tilt in degrees from the centred pose. One axis at a time: a hard pull also disturbs the other reading.
   * rollReach is the largest roll the device can report on the side it is tilted to: it reports at most 90° from level,
   * so a pose centred off level leaves less than that, and the roll threshold comes down (as far as its floor) to stay reachable.
   */
  update(roll:number, pitch:number, rollReach=90): Hold {
    const rollStart = Math.max(STUNT.hold.roll.floor,Math.min(STUNT.hold.roll.start,rollReach-10));
    const H = {roll:{start:rollStart, release:rollStart-(STUNT.hold.roll.start-STUNT.hold.roll.release)}, pitch:STUNT.hold.pitch}, tilt = {roll, pitch};
    if (this.axis && tilt[this.axis]*this.sign < H[this.axis].release) this.axis = null;
    if (!this.axis) {
      // How far each axis is past its own threshold; the one further past wins.
      const past = (axis:'roll'|'pitch') => Math.abs(tilt[axis])/H[axis].start;
      const axis = past('roll') >= past('pitch') ? 'roll' : 'pitch';
      if (past(axis) >= 1) { this.axis = axis; this.sign = Math.sign(tilt[axis]); }
    }
    return {roll:this.axis === 'roll' ? this.sign : 0, pitch:this.axis === 'pitch' ? this.sign : 0};
  }
}

/** Share of the turn rate that banking gives at this pitch: 1 in normal flight, reversed when flying on the plane's back. */
export const turnFactor = (pitch:number) => clamp(Math.cos(pitch)/Math.cos(STUNT.limits.pitch),1);
/** How much steeper than the normal pitch limit the flight path is, as a vertical fraction: climbing bleeds speed, diving adds it. */
export function steepness(pitch:number) {
  const vertical = Math.sin(pitch);
  return vertical-clamp(vertical,Math.sin(STUNT.limits.pitch));
}

export interface Attitude { heading:number; pitch:number; bank:number }
export interface FlightInput { roll:number; climb:number; hold:Hold; speed:number; bankResponse:number; pitchResponse:number }
const wrap = (angle:number) => angle-TAU*Math.round(angle/TAU);
export class Aerobatics {
  /** Camera yaw left over from a reversal; it eases back to zero so the view swings round instead of cutting. */
  view = 0;
  /** A pull that was refused because the plane is too slow to go over the top. */
  stalled = false;
  private rollHold = 0;
  private pitchHold = 0;
  // Rotation actually flown since the plane last settled. Re-labelling the attitude never adds to it.
  private rolled = 0;
  private looped = 0;
  private reversal = false;
  reset() { this.view = this.rollHold = this.pitchHold = this.rolled = this.looped = 0; this.stalled = this.reversal = false; }
  /** True while the plane is outside its normal attitude limits. */
  active(a:Attitude) {
    const L = STUNT.limits;
    return !!(this.rollHold || this.pitchHold) || Math.abs(a.bank) > L.bank+SETTLED || Math.abs(a.pitch) > L.pitch+SETTLED;
  }
  /** Advances bank and pitch (and heading on a reversal). Returns the new attitude and the tricks completed this step. */
  step(a:Attitude, input:FlightInput, dt:number): Attitude & {tricks:TrickKind[]} {
    const L = STUNT.limits, tricks:TrickKind[] = [];
    let {heading,pitch,bank} = a;

    // Bank and pitch are kept within half a turn of level, so letting go always settles the nearer way round.
    const rollHold = Math.sign(input.hold.roll);
    const bankBefore = bank;
    const bankTarget = -input.roll*L.bank;
    if (rollHold) bank -= rollHold*STUNT.roll.rate*dt;
    else bank = damp(bank,bankTarget,input.bankResponse,dt);
    this.rolled += bank-bankBefore; bank = wrap(bank);
    this.rollHold = rollHold;
    // A held roll counts at the full turn. One that is let go is judged once the plane has settled, on the rotation it really flew:
    // it may end anywhere inside the normal bank limit, so up to that much short of a full turn still counts.
    const settledBank = !rollHold && Math.abs(bank-bankTarget) <= SETTLED;
    if (rollHold ? Math.abs(this.rolled) >= TAU : settledBank && Math.abs(this.rolled) >= TAU-L.bank-SLACK) { tricks.push('barrelRoll'); this.rolled -= Math.sign(this.rolled)*TAU; }
    if (settledBank) this.rolled = 0;

    let pitchHold = Math.sign(input.hold.pitch);
    this.stalled = pitchHold > 0 && pitch >= -L.pitch && pitch < HALF && input.speed < STUNT.loop.minSpeed;
    if (this.stalled) pitchHold = 0;
    const pitchTarget = input.climb*L.pitch;
    let flown = 0;
    if (pitchHold) flown = pitchHold*STUNT.loop.rate*dt;
    else if (this.pitchHold && Math.abs(pitch) > HALF) {
      // Let go past vertical: the same attitude seen from the opposite heading is upside down, and the normal bank control rolls it upright.
      // A split S needs the nose pushed at least minTurn below level, however the push started.
      this.reversal = this.looped < 0 && (pitch < 0 ? -pitch : TAU-pitch) >= STUNT.splitS.minTurn;
      this.view -= Math.sign(this.looped)*Math.PI;
      heading += Math.PI; pitch = Math.sign(pitch)*Math.PI-pitch; bank = wrap(bank+Math.PI);
      this.looped = 0;
    } else flown = damp(pitch,pitchTarget,input.pitchResponse,dt)-pitch;
    pitch += flown; this.looped += flown;
    pitch = wrap(pitch);
    this.pitchHold = pitchHold;
    const settledPitch = !pitchHold && Math.abs(pitch-pitchTarget) <= SETTLED;
    if (pitchHold ? Math.abs(this.looped) >= TAU : settledPitch && Math.abs(this.looped) >= TAU-L.pitch-SLACK) { tricks.push('loop'); this.looped -= Math.sign(this.looped)*TAU; }
    if (settledPitch) this.looped = 0;

    // A split S counts once the plane is upright again on the new heading.
    if (this.reversal && !this.active({heading,pitch,bank})) { tricks.push('splitS'); this.reversal = false; }
    this.view = damp(this.view,0,STUNT.viewSmoothing,dt);
    return {heading,pitch,bank,tricks};
  }
}
