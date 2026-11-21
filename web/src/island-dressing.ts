import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRIDGE, surfaceHeight, type Solid } from './world';

export type Dress = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw?: number) => void;

function colored(geometry: THREE.BufferGeometry, tint: string) {
  const mesh = geometry.index ? geometry.toNonIndexed() : geometry;
  const color = new THREE.Color(tint), colors = new Float32Array(mesh.getAttribute('position').count*3);
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
  return mesh.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Three silhouettes, using the same planting sites and budget as the original forest. */
export function trees() {
  const trunk = () => colored(new THREE.CylinderGeometry(.10, .18, 1.48, 5).translate(0, .73, 0), '#725d49');
  const cedar = mergeGeometries([
    trunk(),
    colored(new THREE.ConeGeometry(.75, 1.30, 7).translate(0, 1.13, 0), '#315c4d'),
    colored(new THREE.ConeGeometry(.60, 1.24, 7).rotateY(.4).translate(.05, 1.66, 0), '#41775a'),
    colored(new THREE.ConeGeometry(.40, 1.12, 7).translate(.08, 2.15, -.03), '#609265'),
  ]);
  // Broad, offset pads and an exposed trunk read as wind-shaped coastal pines.
  const pine = mergeGeometries([
    trunk(),
    colored(new THREE.CylinderGeometry(.08, .12, .95, 5).rotateZ(-.85).translate(.25, 1.23, 0), '#725d49'),
    colored(new THREE.IcosahedronGeometry(1, 0).scale(.82, .31, .66).translate(-.34, 1.46, .08), '#365f50'),
    colored(new THREE.IcosahedronGeometry(1, 0).rotateY(.5).scale(.88, .37, .64).translate(.39, 1.83, -.02), '#528464'),
    colored(new THREE.IcosahedronGeometry(1, 0).scale(.59, .28, .54).translate(.16, 2.10, -.08), '#76a071'),
  ]);
  const broadleaf = mergeGeometries([
    trunk(),
    colored(new THREE.IcosahedronGeometry(1, 1).scale(.65, .69, .69).translate(-.32, 1.30, .05), '#527d50'),
    colored(new THREE.IcosahedronGeometry(1, 0).scale(.76, .66, .71).translate(.31, 1.62, -.08), '#6d995c'),
    colored(new THREE.IcosahedronGeometry(1, 0).scale(.62, .55, .61).translate(-.06, 2.02, .02), '#92b674'),
  ]);
  return [cedar, pine, broadleaf];
}

/** Stay inside the existing torii solids, especially above the flyable lower lintel. */
export function toriiDressing(s: Solid, add: Dress, red: THREE.Material, ink: THREE.Material, bronze: THREE.Material) {
  if (s.kind === 'cyl') {
    const height = s.y1-s.y0;
    add(new THREE.CylinderGeometry(s.r*.96, s.r, height, 16), red, s.x, (s.y0+s.y1)/2, s.z);
    const footTop = Math.min(5, s.y1), footBottom = Math.max(-2, s.y0);
    if (footTop > footBottom) add(new THREE.CylinderGeometry(s.r, s.r, footTop-footBottom, 16), ink, s.x, (footTop+footBottom)/2, s.z);
    add(new THREE.CylinderGeometry(s.r*.98, s.r*.98, 1.2, 16), bronze, s.x, s.y1-2, s.z);
  } else if (s.kind === 'box') {
    if (s.hy < 3) {
      add(new THREE.BoxGeometry(s.hx*2, s.hy*2, s.hz*2), red, s.x, s.y, s.z, s.yaw);
      return;
    }
    // The solid is rectangular. A shallow sweep keeps the visible top less than
    // one metre from its collision envelope (inside the aircraft's 2m margin).
    const curve = (x: number) => s.hy*.20*Math.abs(x/s.hx)**3;
    const beam = (bottom: number, top: number, depth: number) => {
      const shape = new THREE.Shape();
      for (let i = 0; i <= 12; i++) {
        const x = -s.hx+2*s.hx*i/12, y = top+curve(x);
        if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      for (let i = 12; i >= 0; i--) {
        const x = -s.hx+2*s.hx*i/12;
        shape.lineTo(x, bottom+curve(x));
      }
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth/2);
    };
    add(beam(-s.hy, s.hy*.54, s.hz*1.74), red, s.x, s.y, s.z, s.yaw);
    add(beam(s.hy*.54, s.hy*.80, s.hz*2), ink, s.x, s.y, s.z, s.yaw);
    add(beam(s.hy*.39, s.hy*.54, s.hz*1.80), bronze, s.x, s.y, s.z, s.yaw);
  }
}

/** Low timber halls: broad eaves and open-looking bays, never taller than the supplied solid. */
export function shrineDressing(s: Solid, add: Dress, red: THREE.Material, ink: THREE.Material, timber: THREE.Material, paper: THREE.Material) {
  if (s.kind === 'cyl') {
    add(new THREE.CylinderGeometry(s.r, s.r, s.y1-s.y0, 8), timber, s.x, (s.y0+s.y1)/2, s.z);
    return;
  }
  if (s.kind !== 'box') return;
  const at = (geometry: THREE.BufferGeometry, material: THREE.Material, side: number, height: number, along: number) =>
    add(geometry, material, s.x+side*Math.cos(s.yaw)+along*Math.sin(s.yaw), height,
      s.z-side*Math.sin(s.yaw)+along*Math.cos(s.yaw), s.yaw);
  if (s.hy < 3) {
    at(new THREE.BoxGeometry(s.hx*2, s.hy*2, s.hz*2), timber, 0, s.y, 0);
    return;
  }
  const base = s.y-s.hy, ridge = s.y+s.hy, eave = ridge-Math.min(1.5, s.hy*.4);
  const wallX = Math.max(.1, s.hx-.8), wallZ = Math.max(.1, s.hz-.8);
  at(new THREE.BoxGeometry(wallX*2, eave-base, wallZ*2), paper, 0, (base+eave)/2, 0);
  const roof = new THREE.Shape().moveTo(-s.hx, 0).lineTo(0, ridge-eave).lineTo(s.hx, 0)
    .lineTo(s.hx, -.7).lineTo(0, ridge-eave-.7).lineTo(-s.hx, -.7).closePath();
  at(new THREE.ExtrudeGeometry(roof, { depth: s.hz*2, bevelEnabled: false }).translate(0, 0, -s.hz), ink, 0, eave, 0);
  for (const side of [-1, -.5, 0, .5, 1]) for (const face of [-1, 1]) {
    const height = eave-base;
    at(new THREE.BoxGeometry(.65, height, .6), red, side*wallX, base+height/2, face*wallZ);
  }
  for (const face of [-1, 1]) {
    at(new THREE.BoxGeometry(wallX*2, .8, .7), red, 0, eave-.7, face*wallZ);
    at(new THREE.BoxGeometry(wallX*2, 1.2, .7), timber, 0, base+.6, face*wallZ);
  }
}

/** Stone cable anchor, fully contained by the existing small deck solid. */
export function bridgeAnchorDressing(s: Extract<Solid, { kind: 'box' }>, add: Dress, stone: THREE.Material, ink: THREE.Material, metal: THREE.Material) {
  const bottom = s.y-s.hy, top = s.y+s.hy, footing = bottom+3.8, cap = top-.5;
  // The dark footing emerges just above the soil; the pale body sits under a chamfered coping.
  add(new THREE.BoxGeometry(s.hx*2, footing-bottom, s.hz*2), ink, s.x, (bottom+footing)/2, s.z);
  add(new THREE.BoxGeometry(s.hx*2-.12, cap-footing, s.hz*2), stone, s.x, (footing+cap)/2, s.z);
  const coping = new THREE.BoxGeometry(s.hx*2, top-cap, s.hz*2), vertices = coping.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) if (vertices.getY(i) > 0) {
    vertices.setX(i, vertices.getX(i)-Math.sign(vertices.getX(i))*.25);
    vertices.setZ(i, vertices.getZ(i)-Math.sign(vertices.getZ(i))*.25);
  }
  coping.computeVertexNormals();
  add(coping, stone, s.x, (cap+top)/2, s.z);
  // A flush metal socket faces the tower where its red cable enters the block.
  const inward = s.x < BRIDGE.x ? 1 : -1;
  add(new THREE.BoxGeometry(.04, 1.2, 2.6), ink, s.x+inward*(s.hx-.04), top-.7, s.z);
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(.13, .13, .04, 6).rotateZ(Math.PI/2), metal,
      s.x+inward*(s.hx-.02), top-.7, s.z+side*.95);
  }
}

/** The town road flares into the west deck, with no wall or in-flight route marker. */
export function roadDressing(path: readonly { x: number; z: number }[], add: Dress, material: THREE.Material, deckColor: THREE.Color) {
  const points: THREE.Vector2[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = new THREE.Vector2(path[i-1].x, path[i-1].z), b = new THREE.Vector2(path[i].x, path[i].z);
    const steps = Math.max(1, Math.ceil(a.distanceTo(b)/3));
    for (let j = 0; j < steps; j++) points.push(a.clone().lerp(b, j/steps));
  }
  if (!points.length) return;
  points.push(new THREE.Vector2(path[path.length-1].x, path[path.length-1].z));
  const positions: number[] = [], colors: number[] = [];
  let distance = 0;
  const rows = points.map((p, i) => {
    if (i > 0) distance += p.distanceTo(points[i-1]);
    const flare = 1-THREE.MathUtils.smoothstep(distance, 0, 80);
    const width = THREE.MathUtils.lerp(3.5, 9, flare);
    const tangent = points[Math.min(i+1, points.length-1)].clone().sub(points[Math.max(0, i-1)]).normalize();
    // The first cross-section is exactly parallel to the 18m deck's end face.
    tangent.lerp(new THREE.Vector2(-1, 0), 1-THREE.MathUtils.smoothstep(distance, 0, 24)).normalize();
    // Hold the exact deck tint at the join, then soften into the original pale road.
    const tint = new THREE.Color(0xa5a795).lerp(deckColor, 1-THREE.MathUtils.smoothstep(distance, 12, 100));
    const row = [-1, 0, 1].map(side => {
      const x = p.x-tangent.y*width*side, z = p.y+tangent.x*width*side;
      const y = THREE.MathUtils.lerp(surfaceHeight(x, z)+.12, BRIDGE.deck+2.52,
        1-THREE.MathUtils.smoothstep(distance, 0, 12));
      return [x, y, z];
    });
    return { points: row, tint };
  });
  for (let i = 1; i < rows.length; i++) for (let j = 0; j < 2; j++) {
    for (const [row, column] of [[i-1, j], [i-1, j+1], [i, j], [i-1, j+1], [i, j+1], [i, j]]) {
      positions.push(...rows[row].points[column]); colors.push(...rows[row].tint.toArray());
    }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  add(geometry, material, 0, 0, 0);
}

/** Fine suspenders above the deck leave the broad under-bridge opening completely clear. */
export function bridgeDressing(add: Dress, cable: THREE.Material, edging: THREE.Material) {
  const [west, east] = BRIDGE.towers, [start, end] = BRIDGE.ends;
  const top = BRIDGE.towerHeight-2, deck = BRIDGE.deck+3, middle = (west+east)/2;
  for (const side of [-12, 12]) for (let i = 1; i < 16; i++) {
    const x = west+(east-west)*i/16;
    // Match the piecewise-linear main cable drawn by Island, not a different parabola.
    const cableHeight = (j: number) => j === 0 || j === 8 ? top
      : deck+8+(top-deck-8)*(((west+(east-west)*j/8)-middle)/(east-middle))**2;
    const t = i/2, height = THREE.MathUtils.lerp(cableHeight(Math.floor(t)), cableHeight(Math.ceil(t)), t%1);
    add(new THREE.CylinderGeometry(.18, .18, height-deck, 4), cable, x, (height+deck)/2, BRIDGE.z+side);
  }
  // Surface inlay, not a barrier. Lift 1cm above the deck to avoid burial/z-fighting.
  for (const side of [-8.4, 8.4]) {
    add(new THREE.BoxGeometry(end-start, .02, .8), edging, (start+end)/2, BRIDGE.deck+2.52, BRIDGE.z+side);
  }
}
