export const FEEL = {
  fov: { cruise:60, max:75, cruiseSpeed:37.2, maxSpeed:88, smoothing:4 },
  camera: { smoothing:5, pullback:4, shake:.12, rushSmoothing:6 },
  response: { device:20, bank:12, keyboardBank:5, pitch:9, keyboardPitch:4, turn:.9 },
  audio: { wind:.055, chime:.12, whoosh:.09, boost:.09, smoothing:.12, basePitch:660, streakStep:2, maxStreak:12 },
  hitstopMs:50, particleCount:60, particleSeconds:1, particleSpeed:34,
  flyThroughPoints:100, rearmDistance:260, clearance:2, lookAheadSeconds:1.2, radarRange:1500,
  nearMiss: { ground:9, structure:12, cooldownMs:1800 },
  // Heights are metres above the crash line. Skimming pays more the lower the plane flies, up to the height where PULL UP starts.
  skim: { ceiling:10, warn:2.5, points:[10,40], hiss:.07 },
  deviceCueCooldownMs:2000,
  scenery: { trees:925, rocks:240, clouds:24 },
  speedLines: { count:36, opacity:.35, length:8 },
} as const;
const clamp = (n:number) => Math.max(0,Math.min(1,n));
export function fovFromSpeed(speed:number) {
  return FEEL.fov.cruise+(FEEL.fov.max-FEEL.fov.cruise)*clamp((speed-FEEL.fov.cruiseSpeed)/(FEEL.fov.maxSpeed-FEEL.fov.cruiseSpeed));
}
export function chimePitch(streak:number) {
  return FEEL.audio.basePitch*2**(Math.max(0,Math.min(FEEL.audio.maxStreak,streak-1))*FEEL.audio.streakStep/12);
}
export function nearMiss(clearance:number, limit:number, crashed=false) {
  return !crashed && clearance>0 && clearance<limit;
}
/** How deep into the skimming band the plane is: 0 outside it, rising to 1 at the height where the PULL UP warning starts. */
export function skimDepth(height:number) {
  const {ceiling,warn}=FEEL.skim;
  return height>0 && height<ceiling ? Math.max(.01,clamp((ceiling-height)/(ceiling-warn))) : 0;
}
/** Points per second earned at a skimming depth. */
export function skimPoints(depth:number) {
  const [low,high]=FEEL.skim.points;
  return depth>0 ? low+(high-low)*clamp(depth) : 0;
}
