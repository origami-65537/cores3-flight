import * as THREE from 'three';
import { FEEL } from './feel';
import { BRIDGE, TOWN, VOLCANO, nearStructure, solids, terrainHeight, type Look, type Solid } from './world';

const EXTENT = { x0: -1700, x1: 1900, z0: -1600, z1: 1700, step: 12 };
const SKY = { clearNear: 700, clearFar: 5200, mistNear: 15, mistFar: 170, seconds: 2.5 };
// Each fly-through moves the island on to the next time of day.
const TIMES = [
  { sky: '#a6d2df', sea: '#3d8fae', sun: '#ffe6bd', sunLevel: 3, ambient: 2.4, night: 0, from: [-180, 300, 140] },
  { sky: '#f3b488', sea: '#58708f', sun: '#ff9c5a', sunLevel: 2.6, ambient: 1.8, night: .35, from: [-400, 110, 60] },
  { sky: '#1a2748', sea: '#14233f', sun: '#8fa8ff', sunLevel: .9, ambient: 1, night: 1, from: [200, 320, -160] },
  { sky: '#f2cdd6', sea: '#7f9fbd', sun: '#ffc9b0', sunLevel: 2.2, ambient: 2, night: .2, from: [420, 120, -40] },
] as const;
export const timesOfDay = TIMES.length;

const random = (i: number, salt: number) => { const n = Math.sin(i*127.1+salt*311.7)*43758.5453; return n-Math.floor(n); };
const slopeAt = (x: number, z: number) => Math.hypot(terrainHeight(x+4, z)-terrainHeight(x-4, z), terrainHeight(x, z+4)-terrainHeight(x, z-4))/8;
const volcanoDistance = (x: number, z: number) => Math.hypot(x-VOLCANO.x, z-VOLCANO.z);
const ramp = (from: number, to: number, n: number) => Math.max(0, Math.min(1, (n-from)/(to-from)));

function terrain() {
  const { x0, x1, z0, z1, step } = EXTENT, columns = Math.round((x1-x0)/step), rows = Math.round((z1-z0)/step);
  const positions = new Float32Array((columns+1)*(rows+1)*3), colors = new Float32Array(positions.length), index = new Uint32Array(columns*rows*6);
  const sand = new THREE.Color('#e4d6a4'), meadow = new THREE.Color('#77ad6c'), upland = new THREE.Color('#4f8a68'), cliff = new THREE.Color('#8c8a7c'), basalt = new THREE.Color('#514843'), color = new THREE.Color();
  for (let row = 0, at = 0; row <= rows; row++) for (let column = 0; column <= columns; column++, at += 3) {
    const x = x0+column*step, z = z0+row*step, h = terrainHeight(x, z);
    positions.set([x, h, z], at);
    if (h < 5) color.copy(sand);
    else {
      color.copy(meadow).lerp(upland, ramp(10, 110, h)).lerp(cliff, Math.max(ramp(.55, .9, slopeAt(x, z)), ramp(130, 175, h)));
      if (volcanoDistance(x, z) < VOLCANO.skirt) color.lerp(basalt, ramp(105, 200, h));
    }
    color.multiplyScalar(.94+.12*random(at, 1));
    colors.set([color.r, color.g, color.b], at);
  }
  for (let row = 0, at = 0; row < rows; row++) for (let column = 0; column < columns; column++, at += 6) {
    const a = row*(columns+1)+column, b = a+columns+1;
    index.set([a, b, a+1, a+1, b, b+1], at);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
}

function archGeometry(s: Extract<Solid, { kind: 'arch' }>) {
  const [outerWidth, outerHeight] = s.outer, [innerWidth, innerHeight] = s.inner, foot = -30, steps = 14;
  const shape = new THREE.Shape().moveTo(-outerWidth, foot);
  for (let i = 0; i <= steps; i++) shape.lineTo(-outerWidth*Math.cos(Math.PI*i/steps), outerHeight*Math.sin(Math.PI*i/steps));
  shape.lineTo(outerWidth, foot).lineTo(innerWidth, foot);
  for (let i = 0; i <= steps; i++) shape.lineTo(innerWidth*Math.cos(Math.PI*i/steps), innerHeight*Math.sin(Math.PI*i/steps));
  shape.lineTo(-innerWidth, foot);
  return new THREE.ExtrudeGeometry(shape, { depth: s.depth, bevelEnabled: false }).translate(0, 0, -s.depth/2);
}

export class Island {
  private readonly ambient = new THREE.HemisphereLight(0xe6f7ff, 0x4e7860, 2.4);
  private readonly sun = new THREE.DirectionalLight(0xffe6bd, 3);
  private readonly sky = new THREE.Color(TIMES[0].sky);
  private readonly fog = new THREE.Fog(TIMES[0].sky, SKY.clearNear, SKY.clearFar);
  private readonly sea = new THREE.MeshStandardMaterial({ color: TIMES[0].sea, roughness: .55 });
  private readonly glass = new THREE.MeshStandardMaterial({ color: 0x86aabb, metalness: .45, roughness: .3, emissive: 0xffd28a, emissiveIntensity: 0 });
  private readonly lamp = new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0xffe08a, emissiveIntensity: .4 });
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly target = new THREE.Color();
  private night = 0;

  constructor(private readonly scene: THREE.Scene) {
    scene.background = this.sky; scene.fog = this.fog;
    this.sun.position.fromArray(TIMES[0].from);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), this.sea); water.rotation.x = -Math.PI/2;
    scene.add(this.ambient, this.sun, water, terrain());
    const looks: Record<Look, THREE.Material> = {
      rock: new THREE.MeshStandardMaterial({ color: 0x8f8a78, flatShading: true, roughness: 1 }),
      white: new THREE.MeshStandardMaterial({ color: 0xf7f3e8, roughness: .7 }),
      red: new THREE.MeshStandardMaterial({ color: 0xd9502f, roughness: .6 }),
      vermilion: new THREE.MeshStandardMaterial({ color: 0xe2452c, roughness: .6 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8d979c, roughness: .6 }),
      deck: new THREE.MeshStandardMaterial({ color: 0x6d7478, roughness: .8 }),
      tower: this.glass,
      house: new THREE.MeshStandardMaterial({ color: 0xf3e9d2, roughness: .9 }),
    };
    const roof = new THREE.MeshStandardMaterial({ color: 0xc8643c, flatShading: true, roughness: .9 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw = 0) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = yaw; scene.add(mesh);
    };
    for (const s of solids) {
      if (s.kind === 'arch') add(archGeometry(s), looks[s.look], s.x, s.y, s.z, s.yaw);
      else if (s.kind === 'box') {
        add(new THREE.BoxGeometry(s.hx*2, s.hy*2, s.hz*2), looks[s.look], s.x, s.y, s.z, s.yaw);
        if (s.look === 'house') add(new THREE.ConeGeometry(Math.SQRT2, 5, 4).rotateY(Math.PI/4).scale(s.hx*1.1, 1, s.hz*1.1), roof, s.x, s.y+s.hy+2.5, s.z, s.yaw);
      } else if (s.look === 'white') {
        // Lighthouse: tapered tower, lamp room and roof, all inside the cylinder the plane can hit.
        const lampRoom = 6, cap = 6, shaft = s.y1-s.y0-lampRoom-cap;
        add(new THREE.CylinderGeometry(s.r*.62, s.r, shaft, 20), looks.white, s.x, s.y0+shaft/2, s.z);
        add(new THREE.CylinderGeometry(s.r*.8, s.r*.86, shaft*.2, 20), looks.red, s.x, s.y0+shaft*.55, s.z);
        add(new THREE.CylinderGeometry(s.r*.95, s.r*.95, 1.2, 20), looks.steel, s.x, s.y0+shaft, s.z);
        add(new THREE.CylinderGeometry(s.r*.55, s.r*.55, lampRoom, 12), this.lamp, s.x, s.y0+shaft+lampRoom/2, s.z);
        add(new THREE.ConeGeometry(s.r*.75, cap, 12), looks.red, s.x, s.y1-cap/2, s.z);
      } else {
        const rock = s.look === 'rock';
        add(new THREE.CylinderGeometry(s.r*(rock ? .6 : 1), s.r, s.y1-s.y0, rock ? 7 : 16), looks[s.look], s.x, (s.y0+s.y1)/2, s.z);
      }
    }
    // Suspension cables are thin dressing above the deck, not obstacles.
    const [west, east] = BRIDGE.towers, [start, end] = BRIDGE.ends, top = BRIDGE.towerHeight-2, deck = BRIDGE.deck+3, middle = (west+east)/2;
    for (const side of [-12, 12]) {
      const path = [new THREE.Vector3(start, deck, BRIDGE.z+side), new THREE.Vector3(west, top, BRIDGE.z+side)];
      for (let i = 1; i < 8; i++) { const x = west+(east-west)*i/8; path.push(new THREE.Vector3(x, deck+8+(top-deck-8)*((x-middle)/(east-middle))**2, BRIDGE.z+side)); }
      path.push(new THREE.Vector3(east, top, BRIDGE.z+side), new THREE.Vector3(end, deck, BRIDGE.z+side));
      for (let i = 1; i < path.length; i++) {
        const span = path[i].clone().sub(path[i-1]), cable = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, span.length(), 5), looks.red);
        cable.position.copy(path[i-1]).addScaledVector(span, .5); cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.normalize()); scene.add(cable);
      }
    }
    add(new THREE.CircleGeometry(VOLCANO.floorRadius+8, 24).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({ color: 0xff7a33 }), VOLCANO.x, VOLCANO.floor+.8, VOLCANO.z);
    this.scatter('trees', new THREE.ConeGeometry(1, 1, 5), new THREE.MeshStandardMaterial({ color: 0x3f7a5c, flatShading: true }), i => {
      const x = -1350+3100*random(i, 2), z = -1350+2750*random(i, 3), h = terrainHeight(x, z), size = 4+6*random(i, 4);
      if (h < 9 || h > 150 || slopeAt(x, z) > .6 || Math.hypot(x-TOWN.x, z-TOWN.z) < TOWN.radius || nearStructure({ x, y: h+size, z }, size+8)) return null;
      return [x, h+size, z, size, size*2];
    });
    this.scatter('rocks', new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8f8a78, flatShading: true }), i => {
      const x = -1450+3300*random(i, 5), z = -1450+3000*random(i, 6), h = terrainHeight(x, z), size = 2+5*random(i, 7);
      if (h < -5 || (h > 8 && slopeAt(x, z) < .6) || nearStructure({ x, y: Math.max(0, h), z }, size+20)) return null;
      return [x, Math.max(0, h)+size*.2, z, size, size*.7];
    });
    this.scatter('clouds', new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: .3, depthWrite: false }), i => {
      const angle = 6.283*random(i, 8), reach = 1750*Math.sqrt(random(i, 9)), size = 28+36*random(i, 10);
      return [Math.cos(angle)*reach, 400+200*random(i, 11), Math.sin(angle)*reach, size, size*.22];
    });
    const points = new Float32Array(600*3);
    for (let i = 0; i < 600; i++) {
      const angle = 6.283*random(i, 12), lift = .08+.9*random(i, 13), flat = Math.sqrt(1-lift*lift);
      points.set([Math.cos(angle)*flat*4000, lift*4000, Math.sin(angle)*flat*4000], i*3);
    }
    const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false; scene.add(this.stars);
  }

  private scatter(kind: keyof typeof FEEL.scenery, geometry: THREE.BufferGeometry, material: THREE.Material, place: (i: number) => [number, number, number, number, number] | null) {
    const matrices: THREE.Matrix4[] = [];
    for (let i = 0; matrices.length < FEEL.scenery[kind] && i < FEEL.scenery[kind]*8; i++) {
      const spot = place(i);
      if (spot) matrices.push(new THREE.Matrix4().makeScale(spot[3], spot[4], spot[3]).setPosition(spot[0], spot[1], spot[2]));
    }
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.computeBoundingSphere(); this.scene.add(mesh);
  }

  /** Eases the light toward a time of day and closes the view in as the sea mist thickens. */
  update(dt: number, time: number, mist: number, eye: THREE.Vector3) {
    const to = TIMES[time%TIMES.length], rate = 1-Math.exp(-dt*3/SKY.seconds);
    this.sky.lerp(this.target.set(to.sky), rate); this.fog.color.copy(this.sky);
    this.sea.color.lerp(this.target.set(to.sea), rate);
    this.sun.color.lerp(this.target.set(to.sun), rate);
    this.sun.intensity += (to.sunLevel-this.sun.intensity)*rate;
    this.ambient.intensity += (to.ambient-this.ambient.intensity)*rate;
    this.sun.position.lerp(new THREE.Vector3().fromArray(to.from), rate);
    this.night += (to.night-this.night)*rate;
    this.glass.emissiveIntensity = this.night*.55; this.lamp.emissiveIntensity = .4+this.night*2.2;
    this.stars.material.opacity = Math.max(0, this.night-.5)*2*(1-mist); this.stars.position.copy(eye);
    this.fog.near = SKY.clearNear+(SKY.mistNear-SKY.clearNear)*mist; this.fog.far = SKY.clearFar+(SKY.mistFar-SKY.clearFar)*mist;
  }
}
