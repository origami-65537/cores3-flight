// The island: terrain, landmark structures and their fly-through openings, as plain numbers.
// The scene is built from this data, so what the player sees is what they can hit.
export interface Point { x: number; y: number; z: number }
export type Look = 'rock' | 'white' | 'red' | 'vermilion' | 'steel' | 'deck' | 'tower' | 'house';
// yaw turns a shape around the vertical axis like a heading: its local z axis is the way through.
export type Solid =
  | { kind: 'cyl'; look: Look; x: number; z: number; r: number; y0: number; y1: number }
  | { kind: 'box'; look: Look; x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw: number }
  | { kind: 'arch'; look: Look; x: number; y: number; z: number; yaw: number; depth: number; outer: readonly [number, number]; inner: readonly [number, number] };
// An opening to fly through, in either direction. Round openings are the upper half of an ellipse standing on y.
export interface Gate extends Point { yaw: number; halfWidth: number; halfHeight: number; round?: boolean }
export type LandmarkId = 'lighthouse' | 'bridge' | 'torii' | 'volcano' | 'towers';
export interface Landmark { id: LandmarkId; gate: Gate; solids: Solid[] }

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (from: number, to: number, n: number) => { const t = clamp((n-from)/(to-from)); return t*t*(3-2*t); };
const bump = (x: number, z: number, cx: number, cz: number, r: number) => Math.exp(-((x-cx)**2+(z-cz)**2)/(r*r));
const local = (dx: number, dz: number, yaw: number): [number, number] => [dx*Math.cos(yaw)-dz*Math.sin(yaw), dx*Math.sin(yaw)+dz*Math.cos(yaw)];
const offset = (x: number, z: number, yaw: number, side: number, along = 0) => ({ x: x+side*Math.cos(yaw)+along*Math.sin(yaw), z: z-side*Math.sin(yaw)+along*Math.cos(yaw) });

export const launch: Readonly<Point & { heading: number }> = { x: 0, y: 95, z: 1500, heading: 0 };
export const VOLCANO = { x: -120, z: -260, rim: 330, floor: 262, rimRadius: 100, floorRadius: 42, skirt: 560, yaw: .1 } as const;
export const ISLET = { x: 1560, z: 60, r: 175, h: 58 } as const;
export const CAPE = { angle: Math.PI/2-.35, reach: 250, width: .13 } as const;
export const TOWN = { x: 640, z: -430, yaw: -.98, ground: 14, radius: 210 } as const;
export const BRIDGE = { x: 1280, z: 60, deck: 60, towerHeight: 125, towers: [1195, 1365], ends: [1085, 1485] } as const;
// Sea mist closes in past `start`; at `end` the flight carries on from the far side of the island.
export const MIST = { start: 1900, end: 2550 } as const;
export const CEILING = 650;

function coast(angle: number) {
  const cape = Math.atan2(Math.sin(angle-CAPE.angle), Math.cos(angle-CAPE.angle))/CAPE.width;
  return 1020+130*Math.sin(3*angle+.6)+70*Math.sin(5*angle+2.2)+40*Math.sin(8*angle)+CAPE.reach*Math.exp(-cape*cape);
}
function hills(x: number, z: number) {
  return (Math.sin(x*.0061+1.3)*Math.cos(z*.0057-.4)+.5*Math.sin(x*.013+z*.011+2.1)+.25*Math.sin(x*.031-z*.027))/1.75;
}
/** Height of the land or seabed at a point; the sea surface is y = 0. */
export function terrainHeight(x: number, z: number): number {
  const inland = coast(Math.atan2(z, x))-Math.hypot(x, z);
  let h = inland < 0 ? Math.max(-30, inland*.12)
    : 6*smooth(0, 50, inland)+smooth(30, 320, inland)*(40+34*hills(x, z)+95*bump(x, z, -560, 430, 260)+30*bump(x, z, 300, 870, 120));
  const town = smooth(TOWN.radius, TOWN.radius*.6, Math.hypot(x-TOWN.x, z-TOWN.z));
  h += (TOWN.ground-h)*town;
  const v = Math.hypot(x-VOLCANO.x, z-VOLCANO.z);
  if (v < VOLCANO.skirt) {
    const near = smooth(VOLCANO.skirt, 220, v);
    const cone = v > VOLCANO.rimRadius
      ? VOLCANO.rim*(1-smooth(VOLCANO.rimRadius, VOLCANO.skirt, v))**1.15
      : VOLCANO.rim-(VOLCANO.rim-VOLCANO.floor)*smooth(VOLCANO.rimRadius, VOLCANO.floorRadius, v);
    h = Math.max(h*(1-near), cone);
    // A straight breach through the summit: fly in one side of the crater and out the other.
    const [side] = local(x-VOLCANO.x, z-VOLCANO.z, VOLCANO.yaw);
    h = Math.min(h, VOLCANO.floor+Math.max(0, Math.abs(side)-30)*1.3);
  }
  const islet = Math.hypot(x-ISLET.x, z-ISLET.z)/ISLET.r;
  return Math.max(h, islet < 1 ? ISLET.h*(1-islet*islet) : Math.max(-30, (1-islet)*ISLET.r*.12));
}
export const groundHeight = (x: number, z: number) => Math.max(0, terrainHeight(x, z));

function build(): Landmark[] {
  const cape = coast(CAPE.angle), capeX = Math.cos(CAPE.angle), capeZ = Math.sin(CAPE.angle);
  const light = { x: capeX*(cape-75), z: capeZ*(cape-75) }, lightBase = terrainHeight(light.x, light.z);
  const arch = { x: capeX*(cape+150), z: capeZ*(cape+150), yaw: -.9 };
  const stacks = ([[70, 60, 13, 44], [-85, 20, 10, 30], [120, -70, 16, 58], [-140, -95, 9, 24]] as const)
    .map(([side, along, r, h]): Solid => ({ kind: 'cyl', look: 'rock', ...offset(arch.x, arch.z, arch.yaw, side, along), r, y0: -30, y1: h }));
  const torii = { x: -1090, z: 150, yaw: Math.PI/2 };
  const post = (side: number): Solid => ({ kind: 'cyl', look: 'vermilion', ...offset(torii.x, torii.z, torii.yaw, side), r: 4.5, y0: -30, y1: 76 });
  const beam = (y: number, hx: number, hy: number, hz: number): Solid => ({ kind: 'box', look: 'vermilion', x: torii.x, y, z: torii.z, hx, hy, hz, yaw: torii.yaw });
  const tower = (side: number, height: number): Solid => ({ kind: 'box', look: 'tower', ...offset(TOWN.x, TOWN.z, TOWN.yaw, side), y: TOWN.ground+height/2-4, hx: 22, hy: height/2+4, hz: 22, yaw: TOWN.yaw });
  const houses = Array.from({ length: 16 }, (_, i): Solid => {
    const side = (i%2 ? 1 : -1)*(95+(i*37)%60), along = -110+(i*53)%220, h = 7+(i*5)%12;
    const at = offset(TOWN.x, TOWN.z, TOWN.yaw, side, along), ground = terrainHeight(at.x, at.z);
    return { kind: 'box', look: 'house', ...at, y: ground+h/2-2, hx: 9+i%3*3, hy: h/2+2, hz: 8+i%4*2, yaw: TOWN.yaw+(i%3)*.3 };
  });
  const { x: bx, z: bz, deck, towerHeight } = BRIDGE;
  const bridge: Solid[] = [{ kind: 'box', look: 'deck', x: (BRIDGE.ends[0]+BRIDGE.ends[1])/2, y: deck, z: bz, hx: (BRIDGE.ends[1]-BRIDGE.ends[0])/2, hy: 2.5, hz: 9, yaw: 0 }];
  for (const x of BRIDGE.towers) {
    for (const side of [-12, 12]) bridge.push({ kind: 'box', look: 'red', x, y: (towerHeight-30)/2, z: bz+side, hx: 4, hy: (towerHeight+30)/2, hz: 3.5, yaw: 0 });
    for (const y of [deck-9, 96, towerHeight-3]) bridge.push({ kind: 'box', look: 'red', x, y, z: bz, hx: 3, hy: 3, hz: 12, yaw: 0 });
  }
  for (const x of BRIDGE.ends) {
    const ground = terrainHeight(x, bz);
    bridge.push({ kind: 'box', look: 'steel', x, y: (ground-6+deck-2.5)/2, z: bz, hx: 7, hy: (deck-2.5-ground+6)/2, hz: 9, yaw: 0 });
  }
  return [
    { id: 'lighthouse', gate: { x: arch.x, y: 0, z: arch.z, yaw: arch.yaw, halfWidth: 28, halfHeight: 49, round: true },
      solids: [{ kind: 'cyl', look: 'white', x: light.x, z: light.z, r: 8, y0: lightBase-4, y1: lightBase+82 },
        { kind: 'arch', look: 'rock', x: arch.x, y: 0, z: arch.z, yaw: arch.yaw, depth: 28, outer: [64, 80], inner: [30, 52] }, ...stacks] },
    { id: 'bridge', gate: { x: bx, y: (deck-2.5)/2+1, z: bz, yaw: 0, halfWidth: 78, halfHeight: (deck-2.5)/2-1 }, solids: bridge },
    { id: 'torii', gate: { x: torii.x, y: 29.5, z: torii.z, yaw: torii.yaw, halfWidth: 23, halfHeight: 27.5 },
      solids: [post(-28), post(28), beam(60, 34, 2.5, 2.5), beam(78, 42, 4, 4.5)] },
    { id: 'volcano', gate: { x: VOLCANO.x, y: (VOLCANO.floor+VOLCANO.rim)/2, z: VOLCANO.z, yaw: VOLCANO.yaw, halfWidth: 45, halfHeight: (VOLCANO.rim-VOLCANO.floor)/2 }, solids: [] },
    { id: 'towers', gate: { x: TOWN.x, y: TOWN.ground+47, z: TOWN.z, yaw: TOWN.yaw, halfWidth: 28, halfHeight: 43 },
      solids: [tower(-52, 170), tower(52, 140), { kind: 'box', look: 'steel', x: TOWN.x, y: TOWN.ground+96, z: TOWN.z, hx: 30, hy: 5, hz: 6, yaw: TOWN.yaw }, ...houses] },
  ];
}
export const landmarks: readonly Landmark[] = build();
export const solids: readonly Solid[] = landmarks.flatMap(l => l.solids);

function inside(s: Solid, p: Point, margin: number): boolean {
  if (s.kind === 'cyl') return p.y > s.y0-margin && p.y < s.y1+margin && Math.hypot(p.x-s.x, p.z-s.z) < s.r+margin;
  const [side, along] = local(p.x-s.x, p.z-s.z, s.yaw), y = p.y-s.y;
  if (s.kind === 'box') return Math.abs(side) < s.hx+margin && Math.abs(y) < s.hy+margin && Math.abs(along) < s.hz+margin;
  if (Math.abs(along) > s.depth/2+margin) return false;
  const within = ([w, h]: readonly [number, number], grow: number) => (side/(w+grow))**2+(Math.max(0, y)/(h+grow))**2 < 1;
  return within(s.outer, margin) && !within(s.inner, -margin);
}
/** What a point closer than `margin` to the land, the sea or a structure is touching. */
export function touching(p: Point, margin: number): 'ground' | 'structure' | null {
  if (p.y < groundHeight(p.x, p.z)+margin) return 'ground';
  return solids.some(s => inside(s, p, margin)) ? 'structure' : null;
}
export function nearStructure(p: Point, margin: number) { return solids.some(s => inside(s, p, margin)); }

/** True when the move from `from` to `to` passes through the opening, in either direction. */
export function throughGate(gate: Gate, from: Point, to: Point): boolean {
  const [side0, along0] = local(from.x-gate.x, from.z-gate.z, gate.yaw), [side1, along1] = local(to.x-gate.x, to.z-gate.z, gate.yaw);
  if (along0 === along1 || along0*along1 > 0 || along1 === 0) return false;
  const t = along0/(along0-along1), side = side0+(side1-side0)*t, y = from.y+(to.y-from.y)*t-gate.y;
  return gate.round ? y > 0 && (side/gate.halfWidth)**2+(y/gate.halfHeight)**2 < 1 : Math.abs(side) < gate.halfWidth && Math.abs(y) < gate.halfHeight;
}
export function gateDirection(gate: Gate): Point { return { x: -Math.sin(gate.yaw), y: 0, z: -Math.cos(gate.yaw) }; }

/** 0 in clear air over the island, 1 where the sea mist is thickest. */
export function mist(x: number, z: number) { return smooth(MIST.start, MIST.end, Math.hypot(x, z)); }
/** Past the mist the plane comes back in from the opposite side, still flying the same way. */
export function wrap(x: number, z: number): { x: number; z: number } | null {
  return Math.hypot(x, z) > MIST.end ? { x: -x*.96, z: -z*.96 } : null;
}
