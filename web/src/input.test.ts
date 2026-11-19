import { test, type TestContext } from 'node:test';
import { strict as a } from 'node:assert';
import { CoreS3, parseImu, axis, neutral, wifiTarget } from './input';
test('firmware IMU frame and button mask', () => { a.deepEqual(parseImu('{"t":"imu","r":12.5,"p":-3,"y":90,"b":3}'), {t:'imu',r:12.5,p:-3,y:90,b:3}); });
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
  frame(-151,18);
  a.ok(device.sample(.05).roll > .3);
  socket.onclose?.();
  a.deepEqual(device.sample(.05), neutral());
  await connect();
  for (let i = 0; i < 10; i++) {
    frame(17,-12);
    a.deepEqual(device.sample(.05), neutral());
  }
  frame(47,18);
  a.ok(device.sample(.05).roll > .3);
});

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
    a.ok(input.roll > .3 && input.roll < .5);
    a.ok(input.pitch > .3 && input.pitch < .5);
    a.equal(input.boost, true);
  });
});

test('manual center clears built-up steering and hardware center averages across the roll wrap', async t => {
  await withSerial(t, async ({ device, frame, calibrations }) => {
    for (let i = 0; i < 10; i++) await frame(179, 10);
    await frame(-179, 40);
    a.equal(device.sample(.05).roll, 0);
    a.ok(device.sample(.05).pitch > .5);
    a.equal(device.calibrate(), true);
    a.deepEqual(device.sample(.05), neutral());
    for (let i = 0; i < 10; i++) await frame(-179, 40);
    a.deepEqual(device.sample(.05), neutral());
    for (let i = 0; i < 10; i++) await frame(i % 2 ? 179 : -179, 35, 3);
    a.deepEqual(calibrations, [false, true, false, true, false, true]);
    a.deepEqual(device.sample(.05), {...neutral(), boost:true});
    await frame(-177, 35);
    const input = device.sample(.05);
    a.ok(input.roll > 0 && input.roll < .02);
    a.equal(input.pitch, 0);
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

async function withSerial(t: TestContext, run: (fixture: {
  device: CoreS3; frame: (r:number,p:number,b?:number) => Promise<void>; advance: (ms:number) => void; calibrations:boolean[];
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
    await run({ device, calibrations, advance: ms => { now += ms; }, async frame(r,p,b=0) {
      now += 20;
      controller.enqueue(encoder.encode(JSON.stringify({t:'imu', r, p, y:0, b})+'\n'));
      await Promise.resolve();
    } });
  } finally {
    controller.close();
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
}
