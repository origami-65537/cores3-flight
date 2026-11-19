export const FEEL = {
  fov: { cruise:60, max:75, cruiseSpeed:37.2, maxSpeed:88, smoothing:4 },
  camera: { smoothing:5, pullback:4, shake:.12, boostSmoothing:6 },
  response: { device:20, bank:12, keyboardBank:5, pitch:9, keyboardPitch:4, turn:.9 },
  audio: { wind:.055, chime:.12, whoosh:.09, boost:.09, smoothing:.12, basePitch:660, streakStep:2, maxStreak:12 },
  hitstopMs:50, ringPulseSeconds:.3, particleCount:24, particleSeconds:.5, particleSpeed:15,
  nearMiss: { ground:9, pillar:12, cooldownMs:1800 },
  deviceCueCooldownMs:2000,
  scenery: { trees:650, rocks:280, clouds:90 },
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
