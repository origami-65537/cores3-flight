import { test, type TestContext } from 'node:test';
import { strict as a } from 'node:assert';
import { CoreS3, parseImu, axis, neutral, wifiTarget } from './input';
test('firmware IMU frame and button mask', () => { a.deepEqual(parseImu('{"t":"imu","r":12.5,"p":-3,"y":90,"b":3}'), {t:'imu',r:12.5,p:-3,y:90,b:3}); });
test('firmware IMU frame with angular velocity', () => {
  a.deepEqual(parseImu('{"t":"imu","r":12.5,"p":-3,"y":90,"b":1,"gx":-310.4,"gy":12,"gz":0.5}'), {t:'imu',r:12.5,p:-3,y:90,b:1,gx:-310.4,gy:12,gz:.5});
  for (const line of ['{"t":"imu","r":0,"p":0,"y":0,"b":0,"gx":1,"gy":2}','{"t":"imu","r":0,"p":0,"y":0,"b":0,"gx":"1","gy":2,"gz":3}','{"t":"imu","r":0,"p":0,"y":0,"b":0,"gx":null,"gy":2,"gz":3}']) a.equal(parseImu(line),null);
});
test('empty, malformed and unexpected serial lines', () => { for (const line of ['', 'boot message', '{}','{"t":"radar"}','{"t":"imu","r":null,"p":0,"y":0,"b":0}','{"t":"imu","r":0,"p":0,"y":0,"b":4}']) a.equal(parseImu(line),null); });
test('deadzone and normalized bounds', () => { a.equal(axis(0),0); a.equal(axis(1),0); a.equal(axis(90),1); a.equal(axis(-90),-1); a.ok(axis(15)>0 && axis(15)<1); });
test('Wi-Fi WebSocket target', () => {
  a.deepEqual(wifiTarget({protocol:'http:',host:'192.168.4.1',hostname:'192.168.4.1'}), {url:'ws://192.168.4.1/ws'});
  a.deepEqual(wifiTarget({protocol:'http:',host:'localhost:5173',hostname:'localhost'}, ' http://cores3-flight.local/ '), {url:'ws://cores3-flight.local/ws'});
  a.ok('error' in wifiTarget({protocol:'http:',host:'localhost:5173',hostname:'localhost'}));
  a.ok('error' in wifiTarget({protocol:'https:',host:'origami-65537.github.io',hostname:'origami-65537.github.io'}));
});

test('Wi-Fi uses the same center and roll wrap and re-centers after reconnecting', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  let socket!: MockSocket;
  class MockSocket {
    onopen?: () => void;
    onclose?: () => void;
    onmessage?: (message:{data:string}) => void;
    constructor() { socket = this; }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { configurable:true, value:MockSocket });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'WebSocket', original);
    else Reflect.deleteProperty(globalThis, 'WebSocket');
  });

  const device = new CoreS3();
  async function connect() {
    const pending = device.connectWifi('ws://cores3-flight.local/ws');
    socket.onopen?.();
    await pending;
  }
  function frame(r:number,p:number) {
    now += 20;
    socket.onmessage?.({data:JSON.stringify({t:'imu',r,p,y:0,b:0})});
  }

  await connect();
  for (let i = 0; i < 10; i++) frame(179,-12);
  frame(-179,-12);
  a.deepEqual(device.sample(.05), neutral());
  a.deepEqual(device.telemetry(), {hz:11,roll:0,pitch:2});
  frame(-151,-12);
  a.ok(device.sample(.05).pitch > .3);
  a.equal(device.sample(.05).roll, 0);
  socket.onclose?.();
  a.deepEqual(device.sample(.05), neutral());
  await connect();
  for (let i = 0; i < 10; i++) {
    frame(17,-12);
    a.deepEqual(device.sample(.05), neutral());
  }
  frame(47,18);
  a.ok(device.sample(.05).roll > .3);
  await assertLandscapeGestures(device, frame);
});

test('USB maps all four landscape tilt gestures to the matching flight axes', async t => {
  await withSerial(t, async ({ device, frame }) => {
    for (let i = 0; i < 10; i++) await frame(17,-12);
    await assertLandscapeGestures(device, frame);
  });
});

async function assertLandscapeGestures(device:CoreS3, frame:(r:number,p:number) => void | Promise<void>) {
  const poses = [
    {gesture:'right edge down', r:17, p:3, roll:1, pitch:0},
    {gesture:'left edge down', r:17, p:-27, roll:-1, pitch:0},
    {gesture:'top edge up', r:32, p:-12, roll:0, pitch:1},
    {gesture:'top edge down', r:2, p:-12, roll:0, pitch:-1},
  ];
  for (const {gesture,r,p,roll,pitch} of poses) {
    await frame(r,p);
    const tilt = device.telemetry();
    a.equal(tilt.roll, roll*15, `${gesture}: HUD roll`);
    a.equal(tilt.pitch, pitch*15, `${gesture}: HUD pitch`);
    for (let i = 0; i < 30; i++) device.sample(.05);
    const actual = device.sample(.05);
    a.ok(Math.abs(actual.roll-roll*axis(15)) < 1e-6, `${gesture}: roll ${actual.roll}`);
    a.ok(Math.abs(actual.pitch-pitch*axis(15)) < 1e-6, `${gesture}: pitch ${actual.pitch}`);
  }
}

test('USB auto-centers on fresh, noisy IMU data and preserves keyboard-ready neutral while waiting', async t => {
  await withSerial(t, async ({ device, frame, calibrations }) => {
    a.equal(device.calibrate(), false);
    a.deepEqual(device.sample(.05), neutral());
    await frame(21, -16);
    a.deepEqual(calibrations, [false]);
    a.deepEqual(device.sample(.05), neutral());
    for (let i = 0; i < 9; i++) await frame(17 + (-1)**i*.4, -12);
    a.deepEqual(calibrations, [false, true]);
    await frame(18, -11);
    a.deepEqual(device.sample(.05), neutral());
    await frame(47, 18, 1);
    const input = device.sample(.05);
    a.ok(input.roll > .6 && input.roll < .65);
    a.ok(input.pitch > .6 && input.pitch < .65);
    a.equal(input.boost, true);
  });
});

test('manual center clears built-up steering and hardware center averages wrapped device roll for game pitch', async t => {
  await withSerial(t, async ({ device, frame, calibrations }) => {
    for (let i = 0; i < 10; i++) await frame(179, 10);
    await frame(-179, 40);
    a.equal(device.sample(.05).pitch, 0);
    a.ok(device.sample(.05).roll > .5);
    a.equal(device.calibrate(), true);
    a.deepEqual(device.sample(.05), neutral());
    for (let i = 0; i < 10; i++) await frame(-179, 40);
    a.deepEqual(device.sample(.05), neutral());
    for (let i = 0; i < 10; i++) await frame(i % 2 ? 179 : -179, 35, 3);
    a.deepEqual(calibrations, [false, true, false, true, false, true]);
    a.deepEqual(device.sample(.05), {...neutral(), boost:true});
    await frame(-177, 35);
    const input = device.sample(.05);
    a.ok(input.pitch > 0 && input.pitch < .02);
    a.equal(input.roll, 0);
  });
});

test('a stale stream falls back to neutral and a resumed stream does not replay old tilt', async t => {
  await withSerial(t, async ({ device, frame, advance, calibrations }) => {
    for (let i = 0; i < 10; i++) await frame(12, 10);
    await frame(42, 40);
    a.ok(device.sample(.05).roll > .3);
    advance(501);
    a.deepEqual(device.sample(.05), neutral());
    a.equal(device.calibrate(), false);
    await frame(12, 10);
    a.deepEqual(device.sample(.05), neutral());
    a.deepEqual(calibrations, [false, true]);
  });
});

test('holding the device past the normal tilt range reports a hold on one axis until the hand comes back', async t => {
  await withSerial(t, async ({ device, frame, calibrations }) => {
    const pose = async (r:number, p:number) => { for (let i = 0; i < 3; i++) await frame(r, p); return device.sample(.02).hold; };
    for (let i = 0; i < 12; i++) await frame(17, -12);
    a.deepEqual(calibrations, [false, true]);
    // Device r is game pitch and device p is game roll, both relative to the centred pose (17, -12).
    a.deepEqual(await pose(17, 33), undefined, '45 degrees is a hard turn, not a hold');
    a.deepEqual(await pose(17, 40), {roll:1, pitch:0});
    a.deepEqual(await pose(75, 40), {roll:1, pitch:0}, 'the other axis is ignored while one is held');
    a.deepEqual(await pose(17, 28), {roll:1, pitch:0}, 'still held at 40 degrees');
    a.deepEqual(await pose(17, 24), undefined);
    a.deepEqual(await pose(17, -64), {roll:-1, pitch:0});
    a.deepEqual(await pose(17, -12), undefined);
    a.deepEqual(await pose(69, -12), {roll:0, pitch:1});
    a.deepEqual(await pose(-35, -12), {roll:0, pitch:-1});
    a.equal(device.calibrate(), true);
    a.equal(device.sample(.02).hold, undefined, 'no hold while centering');
  });
});

async function withSerial(t: TestContext, run: (fixture: {
  device: CoreS3; frame: (r:number,p:number,b?:number,gyro?:{gx:number,gy:number,gz:number}) => Promise<void>; advance: (ms:number) => void; calibrations:boolean[];
}) => Promise<void>) {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{ serial:{ async requestPort() {
    return { readable, writable:null, async open() {}, async close() {} };
  } } } });
  const encoder = new TextEncoder();
  const device = new CoreS3();
  const calibrations:boolean[] = [];
  device.onCalibration = ready => calibrations.push(ready);
  try {
    await device.connect();
    await run({ device, calibrations, advance: ms => { now += ms; }, async frame(r,p,b=0,gyro) {
      now += 20;
      controller.enqueue(encoder.encode(JSON.stringify({t:'imu', r, p, y:0, b, ...gyro})+'\n'));
      await Promise.resolve();
    } });
  } finally {
    controller.close();
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
}
