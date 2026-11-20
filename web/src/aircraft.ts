import * as THREE from 'three';

const RED = '#d62d31', SCARLET = '#e84743', SHADOW = '#a5202a', IVORY = '#fff4dc', CREAM = '#e8d5be';
const DEFAULT_PROP_ANGLE = Math.PI/5;
type Point = readonly [x: number, y: number, z: number];
type Paint = (station: number, facet: number) => string;

function loft(rings: Point[][], paint: Paint, mirrored = false) {
  const positions: number[] = [], colors: number[] = [], color = new THREE.Color();
  const facets = rings[0].length;
  const triangle = (a: Point, b: Point, c: Point, tint: string) => {
    positions.push(...a, ...(mirrored ? c : b), ...(mirrored ? b : c));
    color.set(tint);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < rings.length-1; i++) for (let j = 0; j < facets; j++) {
    const next = (j+1)%facets;
    const a = rings[i][j], b = rings[i][next], c = rings[i+1][j], d = rings[i+1][next];
    const tint = paint(i, j);
    triangle(a, b, c, tint); triangle(b, d, c, tint);
  }
  for (const [end, flip] of [[0, true], [rings.length-1, false]] as const) {
    const ring = rings[end];
    for (let j = 1; j < facets-1; j++) {
      triangle(ring[0], ring[j+(flip ? 1 : 0)], ring[j+(flip ? 0 : 1)], paint(Math.min(end, rings.length-2), j));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

type Frame = readonly [z: number, centerY: number, width: number, height: number];
function fuselage(frames: readonly Frame[], paint: Paint, sides = 12) {
  return loft(frames.map(([z, y, width, height]) => Array.from({ length: sides }, (_, i): Point => {
    const angle = ((i+.5)/sides)*Math.PI*2;
    return [Math.cos(angle)*width, y+Math.sin(angle)*height, z];
  })), paint);
}

type WingStation = readonly [span: number, y: number, leading: number, trailing: number, thickness: number];
const PROFILE = [[0, -.01], [.14, .055], [.38, .074], [.72, .05], [.91, .021], [1, 0], [.73, -.028], [.31, -.034], [.10, -.027]];
function wing(stations: readonly WingStation[], side: number, paint: Paint) {
  const rings = stations.map(([span, y, leading, trailing, thickness]) => PROFILE.map(([chord, h]): Point =>
    [span*side, y+h*thickness, THREE.MathUtils.lerp(leading, trailing, chord)]));
  return loft(rings, paint, side < 0);
}

const MAIN_WING: readonly WingStation[] = [
  [0, -.43, -1.72, 1.57, 3.25],
  [1.28, -.43, -1.75, 1.59, 3.15],
  [3.9, -.32, -1.58, 1.43, 2.5],
  [5.83, -.21, -1.33, 1.17, 1.9],
  [6.92, -.16, -1.14, .98, 1.62],
  [7.38, -.13, -.91, .64, 1.15],
  [7.52, -.12, -.65, .28, .6],
];
const TAIL: readonly WingStation[] = [
  [0, .13, 2.61, 4.38, 1.16],
  [1.91, .15, 3.03, 4.38, .88],
  [2.28, .16, 3.22, 4.22, .64],
  [2.46, .17, 3.44, 4.03, .4],
];
const FIN: readonly WingStation[] = [
  [0, 0, 2.18, 4.41, 1.65],
  [.55, 0, 2.99, 4.42, 1.4],
  [1.49, 0, 3.48, 4.34, .92],
  [1.88, 0, 3.72, 4.26, .65],
  [2.03, 0, 3.86, 4.15, .36],
];

/** Model coordinates match the flight pose: nose along -Z, up along +Y. */
export function buildAircraft() {
  const model = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .46 });
  const red = new THREE.MeshStandardMaterial({ color: RED, roughness: .44 });
  const ivory = new THREE.MeshStandardMaterial({ color: IVORY, roughness: .56 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1e252c', roughness: .92 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9c9ba0', metalness: .18, roughness: .47 });
  const glass = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0xabbccd });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent = model) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); parent.add(mesh);
    return mesh;
  };

  add(fuselage([
    [-4.04, .02, .46, .46], [-3.79, -.01, .73, .69], [-3.15, -.035, .91, .87],
    [-1.87, 0, 1.06, .96], [-.53, .035, 1.08, .99], [.93, .065, .97, .87],
    [2.38, .095, .70, .62], [3.41, .13, .46, .41], [4.24, .18, .25, .25], [4.49, .18, .11, .13],
  ], (i, j) => {
    if (i === 1) return j > 5 ? CREAM : IVORY;
    if (j === 6 || j === 10) return i >= 3 ? IVORY : RED;
    return j < 5 ? (j === 2 ? SCARLET : RED) : j > 5 && j < 10 ? SHADOW : RED;
  }), paint);

  const frames: readonly Frame[] = [
    [-2.12, .65, .54, .30], [-1.45, .82, .77, .70], [-1.33, .83, .79, .72],
    [.04, .88, .75, .76], [.19, .875, .72, .74], [1.18, .72, .61, .55], [1.66, .60, .44, .29],
  ];
  add(fuselage(frames, (station, face) => {
    if (station === 1 || station === 3 || face >= 5) return '#ae2329';
    if (face === 2) return '#456474';
    return face === 1 || face === 3 ? '#314b58' : '#263842';
  }), glass);
  add(fuselage([
    [-2.15, .64, .51, .27], [-1.44, .56, .82, .33], [.13, .56, .81, .35], [1.15, .49, .68, .36], [1.68, .38, .47, .32],
  ], () => RED), paint);

  for (const side of [-1, 1]) {
    add(wing(MAIN_WING, side, (station, face) => {
      const redPanel = station === 0 || station >= 3 || face === 0 || face === 4;
      return redPanel ? (face > 4 ? SHADOW : SCARLET) : (face > 4 ? CREAM : IVORY);
    }), paint);
    add(wing(TAIL, side, (station, face) => station >= 1 || face === 0 || face === 4 ? RED : face > 4 ? CREAM : IVORY), paint);
    const leg = new THREE.Vector3(side*.42, -.70, .15);
    const wheel = new THREE.Vector3(side*1.29, -1.30, -.12);
    const axle = wheel.clone().sub(leg);
    const fairing = add(new THREE.CylinderGeometry(.12, .21, axle.length(), 6), ivory, ...leg.clone().addScaledVector(axle, .5));
    fairing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axle.normalize());
    add(new THREE.CylinderGeometry(.43, .43, .28, 12).rotateZ(Math.PI/2), rubber, ...wheel);
    add(new THREE.CylinderGeometry(.18, .18, .3, 9).rotateZ(Math.PI/2), metal, ...wheel);
  }
  add(wing(FIN, 1, (station, face) => face === 0 || station === 3 ? IVORY : face >= 5 ? RED : SCARLET).rotateZ(Math.PI/2), paint, 0, .23);
  add(new THREE.CylinderGeometry(.18, .18, .15, 9).rotateZ(Math.PI/2), rubber, 0, -.26, 3.92);
  add(new THREE.ConeGeometry(.44, .78, 12).rotateX(-Math.PI/2), red, 0, .03, -4.32);

  const propeller = new THREE.Group();
  propeller.name = 'propeller';
  propeller.position.set(0, .03, -4.16); model.add(propeller);
  const blades = new THREE.MeshStandardMaterial({ color: '#252a32', roughness: .72, transparent: true });
  const tips = new THREE.MeshStandardMaterial({ color: IVORY, roughness: .7, transparent: true });
  for (const direction of [-1, 1]) {
    const blade = add(new THREE.BoxGeometry(.24, 1.44, .065), blades, direction*.06, direction*.83, 0, propeller);
    blade.rotation.z = -.11;
    const tip = add(new THREE.BoxGeometry(.23, .22, .065), tips, direction*.14, direction*1.62, 0, propeller);
    tip.rotation.z = -.11;
  }
  propeller.rotation.z = DEFAULT_PROP_ANGLE;
  const blur = add(new THREE.RingGeometry(.29, 1.75, 28), new THREE.MeshBasicMaterial({
    color: '#b2c6d0', transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide,
  }), 0, .03, -4.19);
  blur.name = 'propeller blur';
  blur.visible = false;

  function updatePropeller(dt: number, airspeed: number) {
    const moving = airspeed > 0;
    if (moving) propeller.rotation.z = (propeller.rotation.z+dt*(24+airspeed*.56))%(Math.PI*2);
    else propeller.rotation.z = DEFAULT_PROP_ANGLE;
    blur.visible = moving;
    blades.opacity = moving ? .49 : 1;
    tips.opacity = moving ? .37 : 1;
  }

  return { model, updatePropeller };
}
