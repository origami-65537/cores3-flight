// The island: terrain, landmark structures and their fly-through openings, as plain numbers.
// The scene is built from this data, so what the player sees is what they can hit.
export interface Point { x: number; y: number; z: number }
export type Look = 'rock' | 'white' | 'red' | 'vermilion' | 'steel' | 'deck' | 'tower' | 'house' | 'wood' | 'shrine' | 'stilt';
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
export interface Spot { readonly x: number; readonly z: number }
/** Distance from a point to a path, and how far along the path (0 to 1) the nearest point lies. */
function alongPath(path: readonly Spot[], x: number, z: number): [distance: number, fraction: number] {
  let best = Infinity, fraction = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i-1], dx = path[i].x-a.x, dz = path[i].z-a.z;
    const t = clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)), d = Math.hypot(x-a.x-dx*t, z-a.z-dz*t);
    if (d < best) { best = d; fraction = (i-1+t)/(path.length-1); }
  }
  return [best, fraction];
}

const BRIDGE_DECK = 60;
export const launch: Readonly<Point & { heading: number }> = { x: 0, y: 95, z: 1500, heading: 0 };
export const VOLCANO = { x: -120, z: -260, rim: 330, floor: 262, rimRadius: 100, floorRadius: 42, skirt: 560, yaw: .1 } as const;
export const ISLET = { x: 1560, z: 60, r: 175, h: BRIDGE_DECK+2.7 } as const;
export const CAPE = { angle: Math.PI/2-.35, reach: 250, width: .13 } as const;
export const COVE = { x: -110, z: 1020, rx: 340, rz: 365 } as const;
export const WATERFALL = { x: 170, z0: 697, z1: 835, width: 26 } as const;
export const PIER = { x: -235, z0: 652, z1: 784, width: 16, height: 4 } as const;
export const TOWN = { x: 640, z: -430, yaw: -.98, ground: 14, radius: 210 } as const;
export const BRIDGE = { x: 1280, z: 60, deck: BRIDGE_DECK, towerHeight: 125, towers: [1195, 1365], ends: [1085, 1485] } as const;
/** Open grass that climbs east to the clifftop the bridge leaves from. */
export const MEADOW = { x: 860, z: 80, rx: 460, rz: 330, low: 26, top: BRIDGE.deck+2.3 } as const;
/** The road from the west end of the bridge deck down to the town; it lies on the land surface. */
export const ROAD: readonly Spot[] = [{ x: 1085, z: 60 }, { x: 1010, z: 62 }, { x: 930, z: 40 }, { x: 850, z: -20 }, { x: 790, z: -110 }, { x: 750, z: -200 }, { x: 715, z: -270 }];
/** The torii stands in a shallow tidal bay between two low arms of land. */
export const BAY = { x: -1010, z: 150, rx: 250, rz: 225, bed: -2.2 } as const;
export const BAY_ARMS: readonly (readonly Spot[])[] = [
  [{ x: -885, z: -85 }, { x: -1000, z: -72 }, { x: -1082, z: -8 }],
  [{ x: -955, z: 405 }, { x: -1040, z: 365 }, { x: -1088, z: 305 }],
];
/** The shrine on the shore behind the torii, on the torii's axis; its front faces the torii. */
export const SHRINE = { x: -890, z: 150, yaw: Math.PI/2 } as const;
/** The floor of the valley from the shrine past the south foot of the volcano to the meadow. */
export const VALLEY: readonly Spot[] = [{ x: -840, z: 150 }, { x: -650, z: 235 }, { x: -420, z: 215 }, { x: -200, z: 290 }, { x: 40, z: 275 }, { x: 230, z: 215 }, { x: 420, z: 175 }];
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
const meadow = (x: number, z: number) => smooth(1, .6, Math.hypot((x-MEADOW.x)/MEADOW.rx, (z-MEADOW.z)/MEADOW.rz)+.09*hills(x*1.5, z*1.5+700)*smooth(1000, 800, x));
function arms(x: number, z: number): [height: number, crest: number] {
  let height = -30, crest = 0;
  for (const arm of BAY_ARMS) {
    const [d, t] = alongPath(arm, x, z), top = (15-8*t)*(1+.3*hills(x*3, z*3)), reach = 78-34*t;
    height = Math.max(height, -30+(top+30)*smooth(reach*1.5, 6, d));
    crest = Math.max(crest, smooth(reach*.6, 6, d));
  }
  return [height, crest];
}
function shelf(x: number, z: number, cx: number, cz: number, rx: number, rz: number, height: number) {
  const u = (x-cx)/rx, v = (z-cz)/rz, angle = Math.atan2(v, u);
  const r = Math.hypot(u, v)+.07*Math.sin(5*angle)+.035*Math.cos(9*angle);
  return height*smooth(1.22, .88, r)+height*.17*smooth(1.45, .6, r);
}
/** Height of the land or seabed at a point; the sea surface is y = 0. */
export function terrainHeight(x: number, z: number): number {
  const shore = coast(Math.atan2(z, x))-Math.hypot(x, z);
  const inlet = (Math.hypot((x-COVE.x)/COVE.rx, (z-COVE.z)/COVE.rz)-1)*COVE.rx;
  const inland = Math.min(shore, inlet);
  let h = inland < 0 ? Math.max(-30, inland*.12)
    : 8*smooth(0, 55, inland)+smooth(30, 320, inland)*(40+34*hills(x, z)+80*bump(x, z, -560, 400, 260));
  if (inland > 0) {
    const terraces = Math.max(
      shelf(x, z, -525, 734, 176, 112, 105)+28*bump(x, z, -535, 754, 115),
      shelf(x, z, 212, 615, 204, 140, 100)+30*bump(x, z, 330, 579, 152),
      shelf(x, z, 405, 963, 135, 107, 61),
    );
    h = Math.max(h, (terraces+4*hills(x, z))*smooth(6, 61, inland));
  }
  const open = meadow(x, z);
  if (open > 0) {
    const grass = MEADOW.low+(MEADOW.top-MEADOW.low)*smooth(520, 1080, x)+(5*hills(x, z)+3.5*hills(x*2.6+90, z*2.6))*smooth(1060, 900, x);
    h += (grass*smooth(0, 45, inland)-h)*open;
  }
  const town = smooth(TOWN.radius, TOWN.radius*.6, Math.hypot(x-TOWN.x, z-TOWN.z));
  h += (TOWN.ground-h)*town;
  const v = Math.hypot(x-VOLCANO.x, z-VOLCANO.z);
  if (v < VOLCANO.skirt) {
    const near = smooth(VOLCANO.skirt, 220, v);
    const angle = Math.atan2(z-VOLCANO.z, x-VOLCANO.x);
    const [side] = local(x-VOLCANO.x, z-VOLCANO.z, VOLCANO.yaw);
    const folds = (22*Math.sin(5*angle+.4)+11*Math.sin(9*angle+1.2))*smooth(47, 96, Math.abs(side));
    const cone = v > VOLCANO.rimRadius
      ? VOLCANO.rim*(1-smooth(VOLCANO.rimRadius, VOLCANO.skirt, v))**1.15
      : VOLCANO.rim-(VOLCANO.rim-VOLCANO.floor)*smooth(VOLCANO.rimRadius, VOLCANO.floorRadius, v);
    const summit = 96*Math.max(0, 1-Math.hypot((x-44)/165, (z+288)/178))**1.28;
    h = Math.max(h*(1-near), cone+summit+folds*smooth(48, 132, v)*smooth(VOLCANO.skirt, 215, v));
    // A straight breach through the summit: fly in one side of the crater and out the other.
    h = Math.min(h, VOLCANO.floor+Math.max(0, Math.abs(side)-30)*1.3);
  }
  const [fromFloor, way] = alongPath(VALLEY, x, z);
  if (fromFloor < 300) h -= Math.max(0, h-5-19*way-3*hills(x*2, z*2))*smooth(230+70*hills(x*1.3, z*1.3+500), 30, fromFloor);
  const around = Math.atan2(z-ISLET.z, x-ISLET.x);
  const islet = Math.hypot(x-ISLET.x, z-ISLET.z)/(ISLET.r*(1+.1*Math.cos(2*around)*Math.sin(around+.6)+.05*Math.sin(5*around)));
  const outerRock = Math.hypot((x+972)/107, (z-1025)/76);
  // The islet is a flat-topped hill whose turf closes over the last few metres of the bridge deck.
  h = Math.max(h, islet < 1 ? ISLET.h*smooth(1, .5, islet)+12*bump(x, z, ISLET.x+45, ISLET.z+10, 52) : Math.max(-30, (1-islet)*ISLET.r*.12),
    outerRock < 1 ? 31*(1-outerRock**3) : Math.max(-30, (1-outerRock)*9));
  const bay = Math.hypot((x-BAY.x)/BAY.rx, (z-BAY.z)/BAY.rz);
  if (bay < 1.6) {
    const bars = 2.6*smooth(.35, .9, Math.sin(x*.045+2*Math.sin(z*.021))*Math.cos(z*.038+.6))*smooth(-1085, -960, x);
    h = Math.max(h, -30+(30+BAY.bed+bars)*smooth(1, .62, bay), arms(x, z)[0]);
  }
  return h;
}
/** The grid the land is drawn on: `terrainHeight` at each vertex, two flat triangles per cell. */
export const GRID = { x0: -1700, x1: 1900, z0: -1600, z1: 1700, step: 12 };
/** Height of the drawn land surface, so what the plane hits is what the player sees. */
export function surfaceHeight(x: number, z: number): number {
  const { x0, x1, z0, z1, step } = GRID;
  if (x <= x0 || x >= x1 || z <= z0 || z >= z1) return terrainHeight(x, z);
  const column = Math.floor((x-x0)/step), row = Math.floor((z-z0)/step), left = x0+column*step, near = z0+row*step, u = (x-left)/step, v = (z-near)/step;
  const side = terrainHeight(left+step, near), far = terrainHeight(left, near+step);
  if (u+v <= 1) { const corner = terrainHeight(left, near); return corner+u*(side-corner)+v*(far-corner); }
  const corner = terrainHeight(left+step, near+step);
  return corner+(1-u)*(far-corner)+(1-v)*(side-corner);
}
export const groundHeight = (x: number, z: number) => Math.max(0, surfaceHeight(x, z));
/** True where open water is drawn, rather than land. */
export const overSea = (x: number, z: number) => surfaceHeight(x, z) < 0;

function build(): Landmark[] {
  const light = { x: -539, z: 782 }, lightBase = surfaceHeight(light.x, light.z);
  const arch = { x: 226, z: 1143, yaw: .12 };
  const stacks = ([[70, 60, 19, 31], [-85, 20, 13, 21], [120, -70, 21, 39], [-140, -95, 14, 16]] as const)
    .map(([side, along, r, h]): Solid => ({ kind: 'cyl', look: 'rock', ...offset(arch.x, arch.z, arch.yaw, side, along), r, y0: -30, y1: h }));
  const torii = { x: -1090, z: 150, yaw: Math.PI/2 };
  const post = (side: number): Solid => ({ kind: 'cyl', look: 'vermilion', ...offset(torii.x, torii.z, torii.yaw, side), r: 4.5, y0: -30, y1: 76 });
  // Each main post is braced by a short sleeve post in front and behind, tied to it by a rail.
  const sleeves = [-28, 28].flatMap((side): Solid[] => [
    ...[-11, 11].map((along): Solid => ({ kind: 'cyl', look: 'vermilion', ...offset(torii.x, torii.z, torii.yaw, side, along), r: 2.4, y0: -8, y1: 31 })),
    { kind: 'box', look: 'vermilion', ...offset(torii.x, torii.z, torii.yaw, side), y: 24, hx: 1.3, hy: 1.3, hz: 12.5, yaw: torii.yaw },
  ]);
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
  // Low anchor blocks set into the ground where the cables come down beside each deck end.
  for (const x of BRIDGE.ends) for (const side of [-12, 12]) bridge.push({ kind: 'box', look: 'deck', x, y: deck+2.5, z: bz+side, hx: 5, hy: 3.5, hz: 2.5, yaw: 0 });
  return [
    { id: 'lighthouse', gate: { x: arch.x, y: 0, z: arch.z, yaw: arch.yaw, halfWidth: 28, halfHeight: 49, round: true },
      solids: [{ kind: 'cyl', look: 'white', x: light.x, z: light.z, r: 12, y0: lightBase-4, y1: lightBase+77 },
        { kind: 'arch', look: 'rock', x: arch.x, y: 0, z: arch.z, yaw: arch.yaw, depth: 28, outer: [64, 80], inner: [30, 52] }, ...stacks] },
    { id: 'bridge', gate: { x: bx, y: (deck-2.5)/2+1, z: bz, yaw: 0, halfWidth: 78, halfHeight: (deck-2.5)/2-1 }, solids: bridge },
    { id: 'torii', gate: { x: torii.x, y: 29.5, z: torii.z, yaw: torii.yaw, halfWidth: 23, halfHeight: 27.5 },
      solids: [post(-28), post(28), beam(60, 34, 2.5, 2.5), beam(78, 42, 4, 4.5), ...sleeves] },
    { id: 'volcano', gate: { x: VOLCANO.x, y: (VOLCANO.floor+VOLCANO.rim)/2, z: VOLCANO.z, yaw: VOLCANO.yaw, halfWidth: 45, halfHeight: (VOLCANO.rim-VOLCANO.floor)/2 }, solids: [] },
    { id: 'towers', gate: { x: TOWN.x, y: TOWN.ground+47, z: TOWN.z, yaw: TOWN.yaw, halfWidth: 28, halfHeight: 43 },
      solids: [tower(-52, 170), tower(52, 140), { kind: 'box', look: 'steel', x: TOWN.x, y: TOWN.ground+96, z: TOWN.z, hx: 30, hy: 5, hz: 6, yaw: TOWN.yaw }, ...houses] },
  ];
}
export const landmarks: readonly Landmark[] = build();

function harbor(): Solid[] {
  const cottages = [
    [-300, 681, 14, 16], [-261, 657, 15, 23], [-221, 647, 13, 19], [-184, 630, 15, 24],
    [-145, 630, 12, 17], [-264, 616, 12, 16], [-224, 597, 14, 19], [-188, 588, 12, 17],
  ];
  const buildings: Solid[] = cottages.map(([x, z, hx, height], i) => {
    const ground = surfaceHeight(x, z);
    return { kind: 'box', look: 'house', x, y: ground+height/2-2, z, hx, hy: height/2+2, hz: 10, yaw: -.24+i%3*.14 };
  });
  const { x, z0, z1, width, height } = PIER;
  buildings.push({ kind: 'box', look: 'wood', x, y: height, z: (z0+z1)/2, hx: width/2, hy: 1.7, hz: (z1-z0)/2, yaw: 0 });
  for (let z = z0+3; z < z1; z += 23) for (const dx of [-width*.39, width*.39]) {
    buildings.push({ kind: 'cyl', look: 'wood', x: x+dx, z, r: 1.35, y0: -25, y1: height+3 });
  }
  return buildings;
}
/** The shrine as plain volumes: a deck on posts over the tidal flat, a stage reaching toward the torii, low halls on the shore. */
function shrine(): Solid[] {
  const { x, z, yaw } = SHRINE, deck = 4.4;
  // `along` is positive inland and negative toward the torii.
  const box = (look: Look, side: number, along: number, hx: number, hz: number, y0: number, y1: number): Solid =>
    ({ kind: 'box', look, ...offset(x, z, yaw, side, along), y: (y0+y1)/2, hx, hy: (y1-y0)/2, hz, yaw });
  const parts: Solid[] = [
    box('shrine', 0, -24, 38, 20, deck-1.2, deck), box('shrine', 0, -62, 6, 18, deck-1.2, deck),
    box('shrine', 0, 12, 21, 12, 1, 17), box('shrine', -50, -8, 11, 9, 1, 12.5), box('shrine', 50, -8, 11, 9, 1, 12.5),
    box('shrine', -30, 4, 9, 2.5, deck, 9), box('shrine', 30, 4, 9, 2.5, deck, 9),
  ];
  const stilt = (side: number, along: number) => parts.push({ kind: 'cyl', look: 'stilt', ...offset(x, z, yaw, side, along), r: .9, y0: -6, y1: deck-1.2 });
  for (let along = -40; along <= -8; along += 16) for (let side = -32; side <= 32; side += 16) stilt(side, along);
  for (let along = -76; along <= -52; along += 12) for (const side of [-4.5, 4.5]) stilt(side, along);
  return parts;
}
export const solids: readonly Solid[] = [...landmarks.flatMap(l => l.solids), ...harbor(), ...shrine()];

/** How thickly trees grow at a point, from 0 (open ground) to 1 (dense forest); it fades with no edges. */
export function woods(x: number, z: number): number {
  const h = terrainHeight(x, z);
  if (h <= 3) return 0;
  const [fromFloor] = alongPath(VALLEY, x, z);
  const patch = .5+.5*hills(x*1.7+300, z*1.7-200);
  // Forest gathers on the south-west hills, the valley sides and behind the shrine, and thins out eastward.
  const cover = .62*patch+.4*smooth(520, -150, x)+.45*bump(x, z, -560, 420, 320)+.7*bump(x, z, SHRINE.x+120, SHRINE.z, 160)
    +.28*smooth(30, 120, fromFloor)*smooth(430, 200, fromFloor)+.45*arms(x, z)[1];
  const clear = (1-meadow(x, z))*smooth(15+25*patch, 90+60*patch, fromFloor)*(1-.85*smooth(-600, -860, z))
    *smooth(TOWN.radius*.8, TOWN.radius*1.5, Math.hypot(x-TOWN.x, z-TOWN.z));
  return clamp(smooth(.42, .95, cover)*clear*smooth(3, 11, h)*smooth(190, 140, h));
}

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
/** What a straight path of `distance` from `from` along the unit vector `direction` runs into first, checked closely enough that no beam is stepped over. */
export function pathHits(from: Point, direction: Point, distance: number, margin: number): 'ground' | 'structure' | null {
  for (let d = margin; d <= distance; d += margin*1.5) {
    const hit = touching({ x: from.x+direction.x*d, y: from.y+direction.y*d, z: from.z+direction.z*d }, margin);
    if (hit) return hit;
  }
  return null;
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
