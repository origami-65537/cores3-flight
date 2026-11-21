import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRIDGE, type Solid } from './world';

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
    const curve = (x: number) => s.hy*.68*Math.abs(x/s.hx)**3;
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
    add(beam(-s.hy, s.hy*.04, s.hz*1.74), red, s.x, s.y, s.z, s.yaw);
    add(beam(s.hy*.04, s.hy*.30, s.hz*2), ink, s.x, s.y, s.z, s.yaw);
    add(beam(-s.hy*.11, s.hy*.04, s.hz*1.80), bronze, s.x, s.y, s.z, s.yaw);
  }
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
  // Flush trim, not new barriers: both strips sit inside the existing deck solid.
  for (const side of [-8.4, 8.4]) {
    add(new THREE.BoxGeometry(end-start, .32, .8), edging, (start+end)/2, BRIDGE.deck+2.32, BRIDGE.z+side);
  }
}
