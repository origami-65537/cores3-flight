import * as THREE from 'three';
import { GRID, VOLCANO, WATERFALL, surfaceHeight, terrainHeight } from './world';

export const random = (i: number, salt: number) => { const n = Math.sin(i*127.1+salt*311.7)*43758.5453; return n-Math.floor(n); };
const mix = THREE.MathUtils.lerp;
const ease = THREE.MathUtils.smoothstep;
type Vertex = readonly [number, number, number];

function geometry(positions: number[], colors?: number[]) {
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return mesh;
}

export function coastMeshes() {
  const { x0, x1, z0, z1, step } = GRID;
  const columns = Math.round((x1-x0)/step)+1, rows = Math.round((z1-z0)/step)+1;
  const points = Array.from({ length: columns*rows }, (_, i): Vertex => {
    const x = x0+i%columns*step, z = z0+Math.floor(i/columns)*step;
    return [x, terrainHeight(x, z), z];
  });
  const sand = new THREE.Color('#f4d599'), grass = new THREE.Color('#9acd4c'), high = new THREE.Color('#689e4c');
  const rock = new THREE.Color('#a69686'), basalt = new THREE.Color('#535e71'), snow = new THREE.Color('#eef5fb');
  const positions: number[] = [], colors: number[] = [], foam: number[] = [], color = new THREE.Color();
  const triangle = (a: Vertex, b: Vertex, c: Vertex, i: number) => {
    const top = Math.max(a[1], b[1], c[1]), bottom = Math.min(a[1], b[1], c[1]);
    if (bottom < -1.7 && top >= -1.7) {
      const edge: Vertex[] = [];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        if ((p[1] < -1.7) === (q[1] < -1.7)) continue;
        const t = (-1.7-p[1])/(q[1]-p[1]);
        edge.push([mix(p[0], q[0], t), .12, mix(p[2], q[2], t)]);
      }
      if (edge.length === 2 && Math.sin(a[0]*.053+a[2]*.037) > -.68) {
        const [p, q] = edge, dx = q[0]-p[0], dz = q[2]-p[2], length = Math.hypot(dx, dz);
        if (length > .01) {
          const width = 1.4+random(i, 21)*1.4, sx = dz/length*width, sz = -dx/length*width;
          foam.push(p[0]+sx, p[1], p[2]+sz, q[0]+sx, q[1], q[2]+sz, p[0]-sx, p[1], p[2]-sz,
            q[0]+sx, q[1], q[2]+sz, q[0]-sx, q[1], q[2]-sz, p[0]-sx, p[1], p[2]-sz);
        }
      }
    }
    if (top < 0) return;
    const x = (a[0]+b[0]+c[0])/3, y = (a[1]+b[1]+c[1])/3, z = (a[2]+b[2]+c[2])/3;
    const slope = Math.hypot(b[1]-a[1], c[1]-a[1])/step;
    const crater = Math.hypot(x-VOLCANO.x, z-VOLCANO.z);
    color.copy(sand)
      .lerp(grass, ease(y+2*Math.sin(x*.05+z*.04), 5, 11))
      .lerp(high, ease(y, 28, 124))
      .lerp(rock, ease(slope, .55, 1.35))
      .lerp(basalt, ease(y, 133, 238));
    if (crater > VOLCANO.rimRadius*.79) {
      const snowline = 302+13*Math.sin(x*.036-z*.024)+11*Math.sin(z*.047);
      color.lerp(snow, ease(y, snowline-5, snowline+7));
    }
    color.multiplyScalar(.91+.15*random(i, 1)+.07*Math.sin(x*.052+y*.041+Math.cos(z*.034)));
    positions.push(...a, ...b, ...c);
    for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
  };
  for (let row = 0; row < rows-1; row++) for (let col = 0; col < columns-1; col++) {
    const a = row*columns+col, b = a+columns;
    triangle(points[a], points[b], points[a+1], a*2);
    triangle(points[b+1], points[a+1], points[b], a*2+1);
  }
  for (let i = 0; i < 260; i++) {
    const x = 3600*(random(i, 51)-.5), z = 3600*(random(i, 52)-.5);
    if (terrainHeight(x, z) > -7) continue;
    const spread = 3+12*random(i, 53);
    foam.push(x-spread, .12, z, x+spread*.3, .12, z-1.2, x+spread, .12, z+1.7);
  }
  return [
    new THREE.Mesh(geometry(positions, colors), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
    new THREE.Mesh(geometry(foam), new THREE.MeshBasicMaterial({ color: 0xc6f3f4, side: THREE.DoubleSide, transparent: true, opacity: .67, depthWrite: false })),
  ] as const;
}

export function ocean(material: THREE.MeshBasicMaterial) {
  const span = 2000, horizon = 8000, cells = 100, step = 2*span/cells;
  const points = Array.from({ length: (cells+1)**2 }, (_, i) => {
    const col = i%(cells+1), row = Math.floor(i/(cells+1));
    const edge = col === 0 || row === 0 || col === cells || row === cells;
    const x = col*step-span+(edge ? 0 : (random(i, 26)-.5)*step*.85);
    const z = row*step-span+(edge ? 0 : (random(i, 27)-.5)*step*.85);
    const shallows = 1-ease(-terrainHeight(x, z), 0, 26);
    const detail = 1-ease(Math.max(Math.abs(x), Math.abs(z)), span*.66, span);
    return { x, z, shallows, detail };
  });
  type Patch = typeof points[number];
  const positions: number[] = [], colors: number[] = [];
  const face = (a: Patch, b: Patch, c: Patch, shade: number) => {
    for (const { x, z, shallows, detail } of [a, b, c]) {
      positions.push(x, 0, z);
      const light = 1+shade*detail, blend = shallows*detail;
      colors.push(light*(1+blend*1.65), light*(1+blend*1.07), light*(1+blend*.25));
    }
  };
  for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) {
    const a = row*(cells+1)+col, b = a+cells+1;
    face(points[a], points[b], points[a+1], (random(a, 28)-.5)*.19);
    face(points[b+1], points[a+1], points[b], (random(a, 29)-.5)*.19);
  }
  const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]];
  const corner = ([x, z]: number[], size: number) => ({ x: x*size, z: z*size, shallows: 0, detail: 0 });
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i+1)%corners.length];
    face(corner(a, span), corner(a, horizon), corner(b, span), 0);
    face(corner(b, span), corner(a, horizon), corner(b, horizon), 0);
  }
  return new THREE.Mesh(geometry(positions, colors), material);
}

export function waterfall() {
  const positions: number[] = [], colors: number[] = [], sections = 56, streams = 9;
  const white = new THREE.Color('#dff8fe'), blue = new THREE.Color('#389bc7'), color = new THREE.Color();
  const { x, z0, z1, width } = WATERFALL;
  const vertex = (row: number, column: number) => {
    const t = row/sections, u = column/streams, z = mix(z0, z1, t);
    const px = x-8*ease(t, .52, 1)+(u-.5)*width*(.7+.48*t+.09*Math.sin(t*28));
    positions.push(px, Math.max(.2, surfaceHeight(px, z)+.95), z);
    const splash = .52*ease(t, .77, 1)+.28*(1-ease(t, 0, .18));
    color.copy(blue).lerp(white, .17+.28*random(column, 31)+.15*Math.sin(t*34+column*3.8)+splash);
    colors.push(color.r, color.g, color.b);
  };
  for (let row = 0; row < sections; row++) for (let col = 0; col < streams; col++) {
    vertex(row, col); vertex(row+1, col); vertex(row, col+1);
    vertex(row, col+1); vertex(row+1, col); vertex(row+1, col+1);
  }
  return new THREE.Mesh(geometry(positions, colors), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
