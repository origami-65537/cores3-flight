// The air over the island: wind, rising air and the speed the plane trades with height.
// Everything here follows from the terrain in world.ts, so where to climb, dive and stay low can be read off the landscape.
import { STUNT } from './stunts';
import { VOLCANO, terrainHeight, type Point } from './world';

export const AIR = {
  // Speed in m/s gained per second of pointing straight down; the normal pitch range reaches about half of that.
  gravity:15, thrust:.8, drag:.12, maxSpeed:95,
  // Levelling out of a dive that lost at least minDrop metres adds a surge on top of the speed the dive built.
  pullOut: { dive:-.1, minDrop:45, perMetre:.1, max:14, seconds:.5, forget:25 },
  // x, z is the unit direction the wind blows toward. It is weak close to the surface and behind higher ground.
  wind: { x:.8, z:-.6, speed:8, surface:.2, heights:[8,110], gust:.25, shelter:.75, upwind:[120,260], cover:50 },
  // Air rises over slopes, most on the side facing the wind, and fades out with height above the ground.
  updraft: { reach:60, slopes:[.18,.75], strength:13, lee:.4, heights:[230,110] },
  // Hot air stands over the crater up to just under the flight ceiling.
  thermal: { strength:15, radius:[150,60], top:[630,520] },
  // Low over the shallows and beaches the plane rides its own cushion of air: less drag and a higher cruise.
  coast: { heights:[28,8], seabed:[-29,-21], land:[16,8], speed:12, drag:.5 },
  // Speeds between which the rush of air (speed lines, camera pull-back) fades in.
  rush:[52,82],
} as const;

const clamp = (n:number, low:number, high:number) => Math.max(low,Math.min(high,n));
const smooth = (from:number, to:number, n:number) => { const t = clamp((n-from)/(to-from),0,1); return t*t*(3-2*t); };
const land = (x:number, z:number) => Math.max(0,terrainHeight(x,z));

/** Vertical speed of the air at a point in m/s; never downward. */
export function updraft(p:Point): number {
  const U = AIR.updraft, T = AIR.thermal, W = AIR.wind;
  const thermal = T.strength*smooth(T.radius[0],T.radius[1],Math.hypot(p.x-VOLCANO.x,p.z-VOLCANO.z))*smooth(T.top[0],T.top[1],p.y);
  const height = smooth(U.heights[0],U.heights[1],p.y-land(p.x,p.z));
  if (!height) return thermal;
  const dx = (land(p.x+U.reach,p.z)-land(p.x-U.reach,p.z))/(2*U.reach), dz = (land(p.x,p.z+U.reach)-land(p.x,p.z-U.reach))/(2*U.reach);
  const slope = Math.hypot(dx,dz);
  if (!slope) return thermal;
  const windward = Math.max(0,(dx*W.x+dz*W.z)/slope);
  return Math.max(thermal,U.strength*smooth(U.slopes[0],U.slopes[1],slope)*(U.lee+(1-U.lee)*windward)*height);
}

/** Horizontal velocity of the air at a point in m/s. `time` in seconds moves the gusts along. */
export function wind(p:Point, time:number): { x:number; z:number } {
  const W = AIR.wind;
  const low = W.surface+(1-W.surface)*smooth(W.heights[0],W.heights[1],p.y-land(p.x,p.z));
  const upwind = Math.max(...W.upwind.map(d => land(p.x-W.x*d,p.z-W.z*d)));
  const speed = W.speed*low*(1-W.shelter*smooth(0,W.cover,upwind-p.y))*(1+W.gust*Math.sin(time*.4+p.x*.003+p.z*.002));
  return { x:W.x*speed, z:W.z*speed };
}

/** 0 to 1: how much of the low-flying advantage of the coast the plane has at a point. */
export function coastEffect(p:Point): number {
  const C = AIR.coast, h = terrainHeight(p.x,p.z);
  return smooth(C.seabed[0],C.seabed[1],h)*smooth(C.land[0],C.land[1],h)*smooth(C.heights[0],C.heights[1],p.y-Math.max(0,h));
}

/** 0 to 1: how strongly the air rushes past at this speed. */
export const rush = (speed:number) => smooth(AIR.rush[0],AIR.rush[1],speed);

/** Airspeed: the engine holds a cruise speed, diving adds to it and climbing spends it. */
export class Momentum {
  private drop = 0;
  private surge = 0;
  reset() { this.drop = this.surge = 0; }
  /** `cruise` is the speed the throttle asks for and `coast` the result of coastEffect. `pulledOut` is true on the step a dive is levelled out. */
  step(speed:number, pitch:number, cruise:number, coast:number, dt:number): { speed:number; pulledOut:boolean } {
    const P = AIR.pullOut, C = AIR.coast, vertical = Math.sin(pitch), limit = Math.sin(STUNT.limits.pitch);
    const goal = cruise+coast*C.speed;
    const pull = speed > goal ? AIR.drag*(1-coast*(1-C.drag)) : AIR.thrust;
    // Past the normal pitch range the stunt rules take over the trade of speed for height.
    speed += (-AIR.gravity*clamp(vertical,-limit,limit)+(goal-speed)*pull)*dt;
    let pulledOut = false;
    if (vertical < P.dive) this.drop -= vertical*speed*dt;
    else if (vertical < 0) this.drop = Math.max(0,this.drop-P.forget*dt);
    else {
      if (this.drop >= P.minDrop) { this.surge += Math.min(P.max,this.drop*P.perMetre); pulledOut = true; }
      this.drop = 0;
    }
    const kick = Math.min(this.surge,P.max/P.seconds*dt);
    this.surge -= kick;
    return { speed:Math.min(AIR.maxSpeed,speed+kick), pulledOut };
  }
}
