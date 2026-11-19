export interface Point { x: number; y: number; z: number }
export interface Gate extends Point { radius: number }

export const launch: Readonly<Point> = {x:0, y:65, z:70};

export function buildCourse(): Gate[] {
  let z = -125;
  return Array.from({length:40}, (_, i) => {
    const difficulty = Math.min(1, Math.max(0, (i-1)/11));
    const gate = {
      x:118*difficulty*Math.sin((i-1)*.38),
      y:launch.y+(4+19*difficulty)*Math.sin(i*.61),
      z,
      radius:22-6*difficulty,
    };
    z -= 115+24*difficulty;
    return gate;
  });
}

export function crossGate(gate: Gate, from: Point, to: Point): 'hit' | 'miss' | null {
  if (from.z <= gate.z || to.z > gate.z) return null;
  const t = (from.z-gate.z)/(from.z-to.z);
  const x = from.x+(to.x-from.x)*t;
  const y = from.y+(to.y-from.y)*t;
  return Math.hypot(x-gate.x, y-gate.y) < gate.radius ? 'hit' : 'miss';
}

export function isNearCourse(gates: readonly Gate[], x: number, z: number, radius: number): boolean {
  let from: Point = launch;
  for (const gate of gates) {
    const dx = gate.x-from.x, dz = gate.z-from.z;
    const t = Math.max(0, Math.min(1, ((x-from.x)*dx+(z-from.z)*dz)/(dx*dx+dz*dz)));
    if (Math.hypot(x-from.x-dx*t, z-from.z-dz*t) < radius+gate.radius+8) return true;
    from = gate;
  }
  return false;
}
