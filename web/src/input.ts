export interface Controls { pitch: number; roll: number; yaw?: number; throttle: number; boost: boolean }
export interface InputSource { sample(dt: number): Controls }
export const neutral = (): Controls => ({pitch:0, roll:0, throttle:0, boost:false});
export interface Imu { t: 'imu'; r: number; p: number; y: number; b: number }
export function parseImu(line: string): Imu | null {
  try {
    const v = JSON.parse(line);
    return v?.t === 'imu' && ['r','p','y','b'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k])) && Number.isInteger(v.b) && v.b >= 0 && v.b <= 3 ? v : null;
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
    return {pitch:k('KeyW','ArrowUp')-k('KeyS','ArrowDown'), roll:k('KeyD','ArrowRight')-k('KeyA','ArrowLeft'), throttle:k('KeyE')-k('KeyQ'), boost:!!k('ShiftLeft','ShiftRight','Space')};
  }
}
interface Port { readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null; open(o:{baudRate:number}):Promise<void>; close():Promise<void> }
export class CoreS3 implements InputSource {
  private port?: Port;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private socket?: WebSocket;
  private imu: Imu = {t:'imu',r:0,p:0,y:0,b:0};
  private center = {r:0,p:0};
  private filtered = neutral();
  private last = 0;
  private busy = false;
  connected = false;
  onStatus: (s:string) => void = () => {};
  calibrate() { this.center = {r:this.imu.r,p:this.imu.p}; }
  private receive(line: string) {
    const msg = parseImu(line);
    if (msg) { const recenter = (msg.b & 2) && !(this.imu.b & 2); this.imu = msg; this.last = performance.now(); if (recenter) this.calibrate(); }
  }
  connectWifi(url: string) {
    if (this.connected) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => { this.socket = socket; this.connected = true; this.onStatus('CoreS3 Wi-Fi 接続済み / Connected'); resolve(); };
      socket.onmessage = e => { if (typeof e.data === 'string') this.receive(e.data); };
      socket.onclose = () => {
        if (this.socket !== socket) { reject(new Error(`${url} に接続できません / Wi-Fi connection failed`)); return; }
        this.socket = undefined; this.connected = false; this.last = 0;
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
      this.connected = false; this.last = 0;
      try { await this.writer?.close(); } catch { /* Unplugged. */ }
      this.writer?.releaseLock(); this.writer = undefined;
      await port.close().catch(() => {}); this.port = undefined;
      this.onStatus('切断 / Keyboard mode');
    }
  }
  sample(dt:number): Controls {
    if (performance.now()-this.last > 500 || !this.connected) return neutral();
    const blend = 1-Math.exp(-dt*10);
    this.filtered.pitch += (axis(this.imu.p-this.center.p)-this.filtered.pitch)*blend;
    this.filtered.roll += (axis(this.imu.r-this.center.r)-this.filtered.roll)*blend;
    return {...this.filtered,boost:!!(this.imu.b&1)};
  }
  send(data:unknown) {
    if (this.socket) { if (this.socket.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 4096) this.socket.send(JSON.stringify(data)); return; }
    if (!this.writer || this.busy) return;
    this.busy = true;
    void this.writer.write(new TextEncoder().encode(JSON.stringify(data)+'\n')).catch(() => {}).finally(() => {this.busy=false;});
  }
}
