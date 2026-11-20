import { FEEL } from './feel';
import { HoldDetector, type Hold } from './stunts';

/** hold names an axis kept past the normal tilt range: it rotates the plane for as long as it stays there. */
export interface Controls { pitch: number; roll: number; yaw?: number; throttle: number; hold?: Hold }
export interface InputSource { sample(dt: number): Controls }
export const neutral = (): Controls => ({pitch:0, roll:0, throttle:0});
/** gx, gy and gz are angular velocity in degrees per second; older firmware omits them and the game does not use them. */
export interface Imu { t: 'imu'; r: number; p: number; y: number; b: number; gx?: number; gy?: number; gz?: number }
export function parseImu(line: string): Imu | null {
  try {
    const v = JSON.parse(line);
    const numbers = (keys:string[]) => keys.every(k => typeof v[k] === 'number' && Number.isFinite(v[k]));
    const rates = ['gx','gy','gz'];
    return v?.t === 'imu' && numbers(['r','p','y','b']) && Number.isInteger(v.b) && v.b >= 0 && v.b <= 3 && (numbers(rates) || rates.every(k => v[k] === undefined)) ? v : null;
  } catch { return null; }
}
export function axis(degrees: number): number {
  const n = Math.max(-1, Math.min(1, degrees / 30));
  return Math.abs(n) < .08 ? 0 : Math.sign(n) * (Math.abs(n) - .08) / .92;
}
export type WifiTarget = {url: string} | {error: string};
export function wifiTarget(page: {protocol: string; host: string; hostname: string}, host?: string): WifiTarget {
  if (page.protocol === 'https:') return {error: 'Wi-Fi は本体のページ http://cores3-flight.local/ を開いてください'};
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
  const target = (host ?? (local ? '' : page.host)).trim().replace(/^(https?|wss?):\/\//, '').replace(/\/.*$/, '');
  return target ? {url: `ws://${target}/ws`} : {error: '本体のアドレスを入力してください'};
}
export class Keyboard implements InputSource {
  keys = new Set<string>();
  constructor() {
    window.addEventListener('keydown', e => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); this.keys.add(e.code); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  sample(): Controls {
    const k = (...codes: string[]) => Number(codes.some(c => this.keys.has(c)));
    return {pitch:k('KeyW','ArrowUp')-k('KeyS','ArrowDown'), roll:k('KeyD','ArrowRight')-k('KeyA','ArrowLeft'), throttle:k('KeyE')-k('KeyQ'), hold:{roll:k('KeyL')-k('KeyJ'), pitch:k('KeyI')-k('KeyK')}};
  }
}
interface Port { readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null; open(o:{baudRate:number}):Promise<void>; close():Promise<void> }
const IMU_TIMEOUT_MS = 500;
const CENTER_WINDOW_MS = 180;
const relativeRoll = (roll:number, center:number) => ((roll-center+180)%360+360)%360-180;
export class CoreS3 implements InputSource {
  private port?: Port;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private socket?: WebSocket;
  private imu: Imu = {t:'imu',r:0,p:0,y:0,b:0};
  private center = {r:0,p:0};
  private centering?: { started:number; anchor:number; r:number; p:number; count:number };
  private filtered = neutral();
  private last?: number;
  private busy = false;
  private frames: number[] = [];
  private holds = new HoldDetector();
  connected = false;
  onStatus: (s:string) => void = () => {};
  onCalibration: (ready:boolean) => void = () => {};
  calibrate() {
    const now = performance.now();
    if (!this.connected || this.last === undefined || now-this.last > IMU_TIMEOUT_MS) return false;
    this.startCentering(now);
    return true;
  }
  private startCentering(now:number) {
    this.centering = {started:now,anchor:this.imu.r,r:0,p:0,count:0};
    this.filtered = neutral(); this.holds.reset();
    this.onCalibration(false);
  }
  private receive(line:string) {
    const msg = parseImu(line);
    if (!msg) return;
    const now = performance.now();
    const first = this.last === undefined;
    const recenter = (msg.b & 2) && !(this.imu.b & 2);
    const interrupted = this.last !== undefined && now-this.last > IMU_TIMEOUT_MS;
    this.imu = msg; this.last = now;
    this.frames.push(now); while (this.frames.length && now-this.frames[0] > 1000) this.frames.shift();
    if (interrupted) { this.filtered = neutral(); this.holds.reset(); }
    if (first || recenter || (interrupted && this.centering)) this.startCentering(now);
    const capture = this.centering;
    if (capture) {
      capture.r += relativeRoll(msg.r,capture.anchor);
      capture.p += msg.p;
      capture.count++;
      if (capture.count > 1 && now-capture.started >= CENTER_WINDOW_MS) {
        this.center = {r:capture.anchor+capture.r/capture.count,p:capture.p/capture.count};
        this.centering = undefined;
        this.onCalibration(true);
      }
    }
  }
  connectWifi(url: string) {
    if (this.connected) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => { this.socket = socket; this.connected = true; this.onStatus('CoreS3 Wi-Fi 接続済み / Connected'); resolve(); };
      socket.onmessage = e => { if (typeof e.data === 'string') this.receive(e.data); };
      socket.onclose = () => {
        if (this.socket !== socket) { reject(new Error(`${url} に接続できません / Wi-Fi connection failed`)); return; }
        this.socket = undefined; this.connected = false; this.last = undefined;
        this.onStatus('Wi-Fi 切断 / Keyboard mode');
      };
    });
  }
  async connect() {
    if (this.connected) return;
    const serial = (navigator as Navigator & {serial?: {requestPort():Promise<Port>}}).serial;
    if (!serial) throw new Error('Chrome / Edge の HTTPS または localhost で接続してください');
    const port = await serial.requestPort();
    await port.open({baudRate:115200});
    this.port = port;
    this.writer = port.writable?.getWriter();
    this.connected = true;
    this.onStatus('CoreS3 接続済み / Connected');
    void this.read(port);
  }
  private async read(port:Port) {
    const reader = port.readable?.getReader();
    let buffer = '';
    const decoder = new TextDecoder();
    try {
      if (!reader) throw new Error('No serial reader');
      while (true) {
        const {value,done} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value,{stream:true});
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          this.receive(buffer.slice(0,end)); buffer = buffer.slice(end+1);
        }
        if (buffer.length > 4096) buffer = '';
      }
    } catch { /* Disconnect falls back to keyboard. */ }
    finally {
      reader?.releaseLock();
      this.connected = false; this.last = undefined;
      try { await this.writer?.close(); } catch { /* Unplugged. */ }
      this.writer?.releaseLock(); this.writer = undefined;
      await port.close().catch(() => {}); this.port = undefined;
      this.onStatus('切断 / Keyboard mode');
    }
  }
  private flightTilt() {
    return {roll:this.imu.p-this.center.p,pitch:relativeRoll(this.imu.r,this.center.r)};
  }
  telemetry() {
    const now = performance.now();
    const live = this.connected && this.last !== undefined && now-this.last <= IMU_TIMEOUT_MS;
    return {hz: live ? this.frames.filter(t => now-t <= 1000).length : 0, ...this.flightTilt()};
  }
  sample(dt:number): Controls {
    if (!this.connected || this.last === undefined || performance.now()-this.last > IMU_TIMEOUT_MS) return neutral();
    if (this.centering) return neutral();
    const blend = 1-Math.exp(-dt*FEEL.response.device);
    const {roll,pitch} = this.flightTilt();
    this.filtered.pitch += (axis(pitch)-this.filtered.pitch)*blend;
    this.filtered.roll += (axis(roll)-this.filtered.roll)*blend;
    const hold = this.holds.update(roll,pitch);
    return hold.roll || hold.pitch ? {...this.filtered,hold} : {...this.filtered};
  }
  send(data:unknown) {
    if (this.socket) { if (this.socket.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 4096) this.socket.send(JSON.stringify(data)); return; }
    if (!this.writer || this.busy) return;
    this.busy = true;
    void this.writer.write(new TextEncoder().encode(JSON.stringify(data)+'\n')).catch(() => {}).finally(() => {this.busy=false;});
  }
}
