import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FEEL } from './feel';
import { coastMeshes, ocean, random, waterfall } from './island-meshes';
import { bridgeDressing, roadDressing, shrineDressing, toriiDressing, trees } from './island-dressing';
import { BRIDGE, ROAD, TOWN, VOLCANO, WATERFALL, nearStructure, solids, surfaceHeight, terrainHeight, woods, type Look, type Solid } from './world';

const SKY = { clearNear: 700, clearFar: 5200, mistNear: 15, mistFar: 170, seconds: 2.5 };
// Each fly-through moves the island on to the next time of day.
const TIMES = [
  { sky: '#9edcf3', zenith: '#3c8ddf', sea: '#258bc9', sun: '#fff2d9', sunLevel: 2.35, ambient: 1.55, night: 0, from: [-300, 400, 230] },
  { sky: '#f3b488', zenith: '#6e75b6', sea: '#596f9f', sun: '#ff9c5a', sunLevel: 2.6, ambient: 1.35, night: .35, from: [-400, 110, 60] },
  { sky: '#1a2748', zenith: '#0a1230', sea: '#13284a', sun: '#8fa8ff', sunLevel: .9, ambient: .82, night: 1, from: [200, 320, -160] },
  { sky: '#f2cdd6', zenith: '#8c9edc', sea: '#779cc3', sun: '#ffc9b0', sunLevel: 2.2, ambient: 1.45, night: .2, from: [420, 120, -40] },
] as const;
export const timesOfDay = TIMES.length;

type ScenerySpot = [x: number, y: number, z: number, radius: number, height: number];
const slopeAt = (x: number, z: number) => Math.hypot(terrainHeight(x+4, z)-terrainHeight(x-4, z), terrainHeight(x, z+4)-terrainHeight(x, z-4))/8;

function cloud() {
  const mesh = mergeGeometries([
    new THREE.IcosahedronGeometry(1, 0).scale(1.65, .32, .73).translate(-.12, -.12, 0),
    new THREE.IcosahedronGeometry(1, 0).rotateY(.8).scale(.83, .58, .74).translate(-.65, .12, .04),
    new THREE.IcosahedronGeometry(1, 0).rotateY(.35).scale(.93, .83, .77).translate(.05, .26, 0),
    new THREE.IcosahedronGeometry(1, 0).rotateY(1.45).scale(.75, .42, .71).translate(.93, -.06, .03),
  ]);
  const normals = mesh.getAttribute('normal'), colors = new Float32Array(normals.count*3);
  const shadow = new THREE.Color('#b6d4eb'), light = new THREE.Color('#fff9ec'), tint = new THREE.Color();
  for (let i = 0; i < normals.count; i++) {
    tint.copy(shadow).lerp(light, THREE.MathUtils.smoothstep(normals.getY(i)*.68-normals.getX(i)*.32, -.63, .5));
    colors.set([tint.r, tint.g, tint.b], i*3);
  }
  return mesh.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function boulder() {
  const base = new THREE.IcosahedronGeometry(1, 0), positions = base.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const r = .82+.16*Math.sin(x*11.3+z*8.1+y*5.7);
    positions.setXYZ(i, x*r, y+.14*x, z*r);
  }
  return base;
}

function seaStack(s: Extract<Solid, { kind: 'cyl' }>) {
  const width = 7, rings = [[.82, -6], [1, .12*s.y1], [.67, .63*s.y1], [.47, .89*s.y1]];
  const point = (row: number, i: number) => {
    const [r, h] = rings[row], a = i%width*2*Math.PI/width;
    const variation = .84+.16*random(i%width, s.x+row);
    return new THREE.Vector3(s.r*(r*Math.cos(a)*variation+row*.04), h+(random(i%width, 55+row)-.5)*s.y1*.18,
      s.r*(r*Math.sin(a)*variation-row*.041));
  };
  const positions: number[] = [];
  const facet = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < width; i++) {
    for (let row = 0; row < rings.length-1; row++) {
      const a = point(row, i), b = point(row+1, i), c = point(row, i+1), d = point(row+1, i+1);
      facet(a, b, c); facet(c, b, d);
    }
    facet(point(3, i), new THREE.Vector3(s.r*.06, s.y1, -s.r*.02), point(3, i+1));
  }
  const mesh = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mesh.computeVertexNormals();
  return mesh;
}

function archGeometry(s: Extract<Solid, { kind: 'arch' }>) {
  const angles = [0, .30, .69, 1.01, 1.38, 1.75, 2.15, 2.58, Math.PI];
  const points = (inner: boolean, edge: boolean, depth: number) => {
    const [w, h] = inner ? s.inner : s.outer;
    const curve = angles.map((a, i) => {
      const bound = inner ? 1.031 : 1;
      const scale = bound+(inner ? (edge ? .075 : 0) : -(edge ? .06 : 0)-random(i, 40)*.12);
      return new THREE.Vector3(-w*Math.cos(a)*scale, h*Math.sin(a)*scale, depth+(edge && i%2 ? Math.sign(depth)*3 : 0));
    });
    return [curve[0].clone().setY(-30), ...curve, curve[curve.length-1].clone().setY(-30)];
  };
  const edge = s.depth/2-3;
  const rims = [-edge, edge].map(z => [points(false, true, z), points(true, true, z)]);
  const core = [points(false, false, 0), points(true, false, 0)], positions: number[] = [];
  const join = (a: THREE.Vector3[], b: THREE.Vector3[]) => {
    for (let i = 1; i < a.length; i++) for (const p of [a[i-1], b[i-1], a[i], a[i], b[i-1], b[i]]) positions.push(p.x, p.y, p.z);
  };
  join(rims[0][0], rims[0][1]); join(rims[1][1], rims[1][0]);
  join(core[0], rims[0][0]); join(rims[1][0], core[0]);
  join(rims[0][1], core[1]); join(core[1], rims[1][1]);
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class Island {
  private readonly ambient = new THREE.HemisphereLight(0xe4f4ff, 0x7a8c80, TIMES[0].ambient);
  private readonly sun = new THREE.DirectionalLight(TIMES[0].sun, TIMES[0].sunLevel);
  private readonly sky = new THREE.Color(TIMES[0].sky);
  private readonly zenith = new THREE.Color(TIMES[0].zenith);
  private readonly fog = new THREE.Fog(TIMES[0].sky, SKY.clearNear, SKY.clearFar);
  private readonly sea = new THREE.MeshBasicMaterial({ color: TIMES[0].sea, vertexColors: true });
  private readonly cloud = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly foam: THREE.MeshBasicMaterial;
  private readonly dome = new THREE.Mesh(new THREE.SphereGeometry(5600, 24, 16), new THREE.ShaderMaterial({
    uniforms: { horizon: { value: this.sky }, zenith: { value: this.zenith }, mist: { value: 0 } },
    vertexShader: `
      varying float altitude;
      void main() {
        altitude = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform float mist;
      varying float altitude;
      void main() {
        gl_FragColor = vec4(mix(horizon, zenith, smoothstep(-0.02, 0.53, altitude) * (1.0 - mist)), 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, depthWrite: false,
  }));
  private readonly glass = new THREE.MeshStandardMaterial({ color: 0x86aabb, metalness: .45, roughness: .3, emissive: 0xffd28a, emissiveIntensity: 0 });
  private readonly lamp = new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0xffe08a, emissiveIntensity: .4 });
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly target = new THREE.Color();
  private night = 0;

  constructor(private readonly scene: THREE.Scene) {
    scene.background = this.sky; scene.fog = this.fog;
    this.sun.position.fromArray(TIMES[0].from);
    this.dome.renderOrder = -1;
    const [land, foam] = coastMeshes();
    this.foam = foam.material;
    scene.add(this.dome, this.ambient, this.sun, ocean(this.sea), land, foam, waterfall());
    const looks: Record<Look, THREE.Material> = {
      rock: new THREE.MeshLambertMaterial({ color: 0x918584, flatShading: true, side: THREE.DoubleSide }),
      white: new THREE.MeshStandardMaterial({ color: 0xf7f3e8, roughness: .7 }),
      red: new THREE.MeshStandardMaterial({ color: 0xd9502f, roughness: .6 }),
      vermilion: new THREE.MeshStandardMaterial({ color: 0xc74830, roughness: .78 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8d979c, roughness: .6 }),
      deck: new THREE.MeshStandardMaterial({ color: 0x6d7478, roughness: .8 }),
      tower: this.glass,
      house: new THREE.MeshStandardMaterial({ color: 0xf3e9d2, roughness: .9 }),
      wood: new THREE.MeshLambertMaterial({ color: 0x79533e }),
      shrine: new THREE.MeshLambertMaterial({ color: 0xe1d8bd }),
      stilt: new THREE.MeshLambertMaterial({ color: 0x645244 }),
    };
    const roof = new THREE.MeshLambertMaterial({ color: 0xb84831, flatShading: true });
    const windows = new THREE.MeshLambertMaterial({ color: 0x304b5b });
    const ink = new THREE.MeshStandardMaterial({ color: 0x303e3d, roughness: .8 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x967853, metalness: .35, roughness: .72 });
    const cable = new THREE.MeshLambertMaterial({ color: 0xa1b1b2 });
    const edging = new THREE.MeshLambertMaterial({ color: 0xcccfbd });
    const path = new THREE.MeshLambertMaterial({ color: 0xa5a795, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw = 0) => {
      const mesh = geometry.rotateY(yaw).translate(x, y, z);
      const batch = batches.get(material) ?? [];
      batch.push(mesh.index ? mesh.toNonIndexed() : mesh); batches.set(material, batch);
    };
    for (const s of solids) {
      if (s.look === 'vermilion') toriiDressing(s, add, looks.vermilion, ink, bronze);
      else if (s.look === 'shrine' || s.look === 'stilt') shrineDressing(s, add, looks.vermilion, ink, looks.stilt, looks.shrine);
      else if (s.kind === 'arch') add(archGeometry(s), looks[s.look], s.x, s.y, s.z, s.yaw);
      else if (s.kind === 'box') {
        if (s.look === 'house') {
          const base = s.y-s.hy, wall = s.hy*1.43, gable = s.hy*2-wall;
          add(new THREE.BoxGeometry(s.hx*1.9, wall, s.hz*1.88), looks.house, s.x, base+wall/2, s.z, s.yaw);
          const shape = new THREE.Shape().moveTo(-s.hx, 0).lineTo(s.hx, 0).lineTo(0, gable).closePath();
          add(new THREE.ExtrudeGeometry(shape, { depth: s.hz*2, bevelEnabled: false }).translate(0, 0, -s.hz), roof, s.x, base+wall, s.z, s.yaw);
          for (const side of [-1, 1]) for (const face of [-1, 1]) {
            const x = side*s.hx*.49, z = face*s.hz*.946;
            add(new THREE.BoxGeometry(s.hx*.37, wall*.32, .34), windows, s.x+x*Math.cos(s.yaw)+z*Math.sin(s.yaw),
              base+wall*.63, s.z-x*Math.sin(s.yaw)+z*Math.cos(s.yaw), s.yaw);
          }
        } else {
          add(new THREE.BoxGeometry(s.hx*2, s.hy*2, s.hz*2), looks[s.look], s.x, s.y, s.z, s.yaw);
        }
      } else if (s.look === 'white') {
        const lampRoom = 9, cap = 10, shaft = s.y1-s.y0-lampRoom-cap, levels = [0, .13, .33, .52, .74, .91, 1];
        const radius = (f: number) => s.r*(1-.40*f);
        for (let i = 1; i < levels.length; i++) {
          const bottom = levels[i-1], top = levels[i];
          add(new THREE.CylinderGeometry(radius(top), radius(bottom), shaft*(top-bottom), 12), i%2 ? looks.white : looks.red,
            s.x, s.y0+shaft*(bottom+top)/2, s.z);
        }
        const base = s.y0+shaft;
        add(new THREE.CylinderGeometry(s.r*.89, s.r*.83, 2.9, 12), looks.red, s.x, base, s.z);
        add(new THREE.CylinderGeometry(s.r*.52, s.r*.52, lampRoom, 12), this.lamp, s.x, base+lampRoom/2, s.z);
        for (let i = 0; i < 8; i++) {
          const angle = i*Math.PI/4;
          add(new THREE.BoxGeometry(.76, lampRoom, .76), looks.red, s.x+.54*s.r*Math.cos(angle), base+lampRoom/2, s.z+.54*s.r*Math.sin(angle));
        }
        add(new THREE.ConeGeometry(s.r*.77, cap, 12), looks.red, s.x, s.y1-cap/2, s.z);
      } else {
        const rock = s.look === 'rock';
        if (rock) add(seaStack(s), looks[s.look], s.x, 0, s.z, s.x);
        else add(new THREE.CylinderGeometry(s.r, s.r, s.y1-s.y0, 12), looks[s.look], s.x, (s.y0+s.y1)/2, s.z);
      }
    }
    // Suspension cables are thin dressing above the deck, not obstacles.
    const [west, east] = BRIDGE.towers, [start, end] = BRIDGE.ends, top = BRIDGE.towerHeight-2, deck = BRIDGE.deck+3, middle = (west+east)/2;
    for (const side of [-12, 12]) {
      const path = [new THREE.Vector3(start, deck, BRIDGE.z+side), new THREE.Vector3(west, top, BRIDGE.z+side)];
      for (let i = 1; i < 8; i++) { const x = west+(east-west)*i/8; path.push(new THREE.Vector3(x, deck+8+(top-deck-8)*((x-middle)/(east-middle))**2, BRIDGE.z+side)); }
      path.push(new THREE.Vector3(east, top, BRIDGE.z+side), new THREE.Vector3(end, deck, BRIDGE.z+side));
      for (let i = 1; i < path.length; i++) {
        const span = path[i].clone().sub(path[i-1]), center = path[i-1].clone().addScaledVector(span, .5);
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
        add(new THREE.CylinderGeometry(.7, .7, span.length(), 5).applyQuaternion(rotation), looks.red, center.x, center.y, center.z);
      }
    }
    bridgeDressing(add, cable, edging);
    roadDressing(ROAD, add, path);
    add(new THREE.CircleGeometry(VOLCANO.floorRadius+8, 24).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({ color: 0xff7a33 }), VOLCANO.x, VOLCANO.floor+.8, VOLCANO.z);
    for (const [material, meshes] of batches) scene.add(new THREE.Mesh(mergeGeometries(meshes), material));
    this.scatter('trees', trees(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), i => {
      const near = i%3 === 0;
      const x = near ? -895+1450*random(i, 2) : -1350+3100*random(i, 2);
      const z = near ? 365+710*random(i, 3) : -1350+2750*random(i, 3);
      const h = surfaceHeight(x, z), size = 4+8*random(i, 4);
      if (random(i, 33) > woods(x, z)) return null;
      if (h < 10 || h > 167 || slopeAt(x, z) > .61 || Math.hypot(x-TOWN.x, z-TOWN.z) < TOWN.radius || nearStructure({ x, y: h+size, z }, size+8)) return null;
      if (Math.abs(x-WATERFALL.x) < 28 && z > WATERFALL.z0-14 && z < WATERFALL.z1) return null;
      return [x, h-.36, z, size, size];
    });
    this.scatter('rocks', boulder(), new THREE.MeshLambertMaterial({ color: 0x8c807d, flatShading: true }), i => {
      const x = -1450+3300*random(i, 5), z = -1450+3000*random(i, 6), h = surfaceHeight(x, z), size = 2+5*random(i, 7);
      if (h < -5 || (h > 8 && slopeAt(x, z) < .6) || nearStructure({ x, y: Math.max(0, h), z }, size+20)) return null;
      return [x, Math.max(0, h)+size*.2, z, size, size*.7];
    });
    const nearClouds: ScenerySpot[] = [[-740, 447, -185, 214, 115], [810, 470, -530, 178, 89], [-1470, 305, -1110, 129, 64]];
    this.scatter('clouds', cloud(), this.cloud, i => {
      if (i < nearClouds.length) return nearClouds[i];
      const angle = i*2.39996, reach = 900+1750*random(i, 9), size = 60+85*random(i, 10);
      const x = Math.cos(angle)*reach, z = Math.sin(angle)*reach;
      if (Math.abs(x) < 1100 && z < 100) return null;
      return [x, 410+250*random(i, 11), z, size, size*.56];
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

  private scatter(kind: keyof typeof FEEL.scenery, geometry: THREE.BufferGeometry | THREE.BufferGeometry[], material: THREE.Material, place: (i: number) => ScenerySpot | null) {
    const matrices: THREE.Matrix4[] = [];
    for (let i = 0; matrices.length < FEEL.scenery[kind] && i < FEEL.scenery[kind]*8; i++) {
      const spot = place(i);
      if (spot) {
        const yaw = kind === 'clouds' ? (random(i, 17)-.5)*1.2 : Math.PI*2*random(i, 17);
        matrices.push(new THREE.Matrix4().makeRotationY(yaw).scale(new THREE.Vector3(spot[3], spot[4], spot[3])).setPosition(spot[0], spot[1], spot[2]));
      }
    }
    const variants = Array.isArray(geometry) ? geometry : [geometry];
    const groups = variants.map(() => [] as THREE.Matrix4[]);
    matrices.forEach((matrix, i) => groups[Math.floor(random(i, 32)*variants.length)].push(matrix));
    const shade = new THREE.Color();
    groups.forEach((group, variant) => {
      const mesh = new THREE.InstancedMesh(variants[variant], material, group.length);
      group.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
        const light = .84+.16*random(i, 24);
        mesh.setColorAt(i, shade.setRGB(light, light, light));
      });
      mesh.name=kind;
      mesh.computeBoundingSphere(); this.scene.add(mesh);
    });
  }

  /** Eases the light toward a time of day and closes the view in as the sea mist thickens. */
  update(dt: number, time: number, mist: number, eye: THREE.Vector3) {
    const to = TIMES[time%TIMES.length], rate = 1-Math.exp(-dt*3/SKY.seconds);
    this.sky.lerp(this.target.set(to.sky), rate); this.fog.color.copy(this.sky);
    this.zenith.lerp(this.target.set(to.zenith), rate); this.dome.position.copy(eye); this.dome.material.uniforms.mist.value = mist;
    this.sea.color.lerp(this.target.set(to.sea), rate);
    this.sun.color.lerp(this.target.set(to.sun), rate);
    this.sun.intensity += (to.sunLevel-this.sun.intensity)*rate;
    this.ambient.intensity += (to.ambient-this.ambient.intensity)*rate;
    this.sun.position.lerp(new THREE.Vector3().fromArray(to.from), rate);
    this.night += (to.night-this.night)*rate;
    this.cloud.color.set(0xffffff).lerp(this.sun.color, .45).multiplyScalar(1-this.night*.76);
    this.foam.opacity = .67-.5*this.night;
    this.glass.emissiveIntensity = this.night*.55; this.lamp.emissiveIntensity = .4+this.night*2.2;
    this.stars.material.opacity = Math.max(0, this.night-.5)*2*(1-mist); this.stars.position.copy(eye);
    this.fog.near = SKY.clearNear+(SKY.mistNear-SKY.clearNear)*mist; this.fog.far = SKY.clearFar+(SKY.mistFar-SKY.clearFar)*mist;
  }
}
