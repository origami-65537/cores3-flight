import * as THREE from 'three';
import { Keyboard, CoreS3, wifiTarget } from './input';
import { buildCourse, crossGate, isNearCourse, launch } from './course';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><div class="brand"><span class="mark">↗</span><div>空路 <span class="latin">SKYLINE</span><small>CORES3 FLIGHT LAB / 01</small></div></div><div class="connection"><i></i><span id="status">キーボード / Keyboard ready</span><button id="connect">USBで接続 ↗</button><button id="wifi">Wi-Fiで接続 ↗</button></div></header>
<aside class="mission"><div class="eyebrow">RING RUN · リングコース</div><h1>風をつかまえよう。</h1><p>金色のリングに照準を合わせよう。</p><div class="tag">◉ &nbsp; RING +100 PTS &nbsp; / &nbsp; 地面に注意</div></aside>
<section class="instruments"><div><label>SCORE / スコア</label><strong id="score">0000</strong></div><div><label>AIRSPEED</label><strong><span id="speed">0</span><em>m/s</em></strong></div><div><label>ALTITUDE</label><strong><span id="alt">0</span><em>m</em></strong></div><div><label>FLIGHT TIME</label><strong id="time">00:00</strong></div></section>
<div class="course-hud"><span id="bearing" aria-hidden="true">↑</span><span id="next-ring"></span></div>
<div class="reticle" aria-hidden="true">⊕</div><div id="notice" role="status"></div>
<footer><div class="controls"><span><kbd>W S</kbd> 上昇 / 下降</span><span><kbd>A D</kbd> バンク / Turn</span><span><kbd>Q E</kbd> 速度</span><span><kbd>SHIFT</kbd> Boost</span></div><div><button id="center">センター合わせ</button><button id="reset">↻ リセット <kbd>R</kbd></button></div></footer>`;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a6d2df'); scene.fog = new THREE.Fog('#a6d2df',280,1400);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label','3D flight game'); document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.5,2400);
scene.add(new THREE.HemisphereLight(0xe6f7ff,0x4e7860,2.4));
const sun = new THREE.DirectionalLight(0xffe6bd,3); sun.position.set(-180,300,140); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000,12000),new THREE.MeshStandardMaterial({color:0x5e9480,roughness:1}));
ground.rotation.x = -Math.PI/2; scene.add(ground);
const grid = new THREE.GridHelper(12000,240,0x73a38f,0x73a38f); grid.position.y=.1; scene.add(grid);
const pillarMaterial = new THREE.MeshStandardMaterial({color:0x4e7a70,flatShading:true});
const pillars: {x:number;z:number;r:number;h:number}[] = [];
const course = buildCourse();
for (let i=0;i<160;i++) {
  const x = Math.sin(i*127.1)*2300, z = Math.cos(i*73.7)*3400-2350;
  const r=18+(i%5)*8, h=25+(i%9)*13;
  if (isNearCourse(course,x,z,r)) continue;
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(r*.65,r,h,5),pillarMaterial);
  hill.position.set(x,h/2,z); scene.add(hill); pillars.push({x,z,r,h});
}
const plane = new THREE.Group();
const cream = new THREE.MeshStandardMaterial({color:0xfff3d8,metalness:.25,roughness:.4});
const orange = new THREE.MeshStandardMaterial({color:0xf2744f,roughness:.4});
function part(geometry:THREE.BufferGeometry, material:THREE.Material, x:number,y:number,z:number) {
  const mesh = new THREE.Mesh(geometry,material); mesh.position.set(x,y,z); plane.add(mesh); return mesh;
}
const body=part(new THREE.ConeGeometry(1.05,8,8),cream,0,0,0); body.rotation.x=-Math.PI/2;
part(new THREE.BoxGeometry(12,.22,2.1),cream,0,-.1,1);
part(new THREE.BoxGeometry(4.5,.2,1.3),orange,0,.4,3);
part(new THREE.BoxGeometry(.2,2,1.8),orange,0,1.1,2.7);
const cockpit=part(new THREE.SphereGeometry(.75,12,8),new THREE.MeshStandardMaterial({color:0x183b50,metalness:.6,roughness:.15}),0,.65,-.6); cockpit.scale.z=1.8;
part(new THREE.BoxGeometry(1.3,.24,2.15),orange,-4.8,-.08,1); part(new THREE.BoxGeometry(1.3,.24,2.15),orange,4.8,-.08,1);
scene.add(plane);
const activeRing = new THREE.MeshBasicMaterial({color:0xffc34c});
const distantRing = new THREE.MeshBasicMaterial({color:0x6c9596});
const rings = course.map(({x,y,z,radius}) => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius+.9,.9,8,64),distantRing);
  ring.position.set(x,y,z);
  scene.add(ring);
  return ring;
});
const keyboard = new Keyboard(), device = new CoreS3();
const el = (id:string) => document.getElementById(id)!;
const showError=(e:unknown)=>{const s=e instanceof Error?e.message:String(e); el('status').textContent=s; flash(s);};
let wifiUrl='', wifiBusy=false;
device.onStatus=s => {el('status').textContent=s; el('connect').textContent=device.connected&&!wifiUrl?'USB接続済み ✓':'USBで接続 ↗'; el('wifi').textContent=device.connected&&wifiUrl?'Wi-Fi接続済み ✓':'Wi-Fiで接続 ↗';};
el('connect').onclick=async()=> {if(device.connected) return; try {await device.connect(); wifiUrl=''; device.onStatus('CoreS3 USB 接続済み / Connected');} catch(e) {showError(e);} };
async function connectWifi(url:string, quiet=false) {
  if (wifiBusy || device.connected) return; wifiBusy=true;
  try {await device.connectWifi(url); wifiUrl=url; device.onStatus('CoreS3 Wi-Fi 接続済み / Connected');} catch(e) {if(!quiet) showError(e);} finally {wifiBusy=false;}
}
el('wifi').onclick=()=>{
  if (device.connected) return;
  const ask=location.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const host=ask ? prompt('CoreS3 のアドレス / CoreS3 address', localStorage.getItem('cores3-host') ?? 'cores3-flight.local') ?? undefined : undefined;
  if (ask && host===undefined) return;
  if (host) localStorage.setItem('cores3-host',host);
  const target=wifiTarget(location,host);
  if ('error' in target) showError(new Error(target.error)); else void connectWifi(target.url);
};
const servedByDevice=wifiTarget(location);
if (location.protocol==='http:' && 'url' in servedByDevice) {wifiUrl=servedByDevice.url; void connectWifi(wifiUrl,true);}
setInterval(()=>{if(wifiUrl && !device.connected) void connectWifi(wifiUrl,true);},3000);
el('center').onclick=()=>{device.calibrate(); flash('センター設定 / Calibrated');};
const minSpeed = 22, speedRange = 38, cruiseThrottle = .4, cruiseSpeed = minSpeed+speedRange*cruiseThrottle;
let heading=0,pitch=0,bank=0,speed=cruiseSpeed,throttle=cruiseThrottle,score=0,elapsed=0,nextGate=0;
let ended=false,noticeUntil=0;
const position = new THREE.Vector3(launch.x,launch.y,launch.z);
const previous = new THREE.Vector3(), forward = new THREE.Vector3(), aim = new THREE.Vector3();
const reticle = document.querySelector<HTMLElement>('.reticle')!;
const nextRing = el('next-ring'), bearing = el('bearing'), notice = el('notice');
function flash(s:string) {if (!ended) {notice.textContent=s; noticeUntil=performance.now()+2200;}}
function finish(s:string) {
  ended = true;
  notice.dataset.ended = 'true';
  notice.textContent = s+' · R to retry';
}
function reset() {
  position.set(launch.x,launch.y,launch.z);
  heading=pitch=bank=score=elapsed=nextGate=0;
  speed=cruiseSpeed; throttle=cruiseThrottle; ended=false;
  delete notice.dataset.ended;
  rings.forEach(r => {r.visible=true; r.material=distantRing;});
  rings[0].material=activeRing;
  camera.position.set(launch.x,launch.y+8,launch.z+27);
  flash('照準を金色のリングへ / Aim at gold');
}
el('reset').onclick=reset; window.addEventListener('keydown',e=>{if(e.code==='KeyR')reset(); if(e.code==='KeyC')device.calibrate();});
const clock=new THREE.Clock(); let radarTimer=0;
function animate() {
  requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05);
  const key=keyboard.sample(), imu=device.sample(dt);
  const roll=THREE.MathUtils.clamp(key.roll+imu.roll,-1,1), climb=THREE.MathUtils.clamp(key.pitch+imu.pitch,-1,1);
  if(!ended) {
    elapsed+=dt; throttle=THREE.MathUtils.clamp(throttle+key.throttle*dt*.3,0,1);
    speed=THREE.MathUtils.damp(speed,minSpeed+throttle*speedRange+((key.boost||imu.boost)?28:0),2,dt);
    pitch=THREE.MathUtils.damp(pitch,climb*.49,4,dt); bank=THREE.MathUtils.damp(bank,-roll*.78,5,dt);
    heading+=Math.sin(bank)*dt*.64;
    previous.copy(position);
    forward.set(-Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch));
    position.addScaledVector(forward,speed*dt);
    position.y=Math.min(position.y,650);
    if (position.y<2) finish('地面に衝突 / Ground collision');
    else if (pillars.some(p=>position.y<p.h+2 && Math.hypot(position.x-p.x,position.z-p.z)<p.r+2)) {
      finish('岩柱に衝突 / Rock collision');
    } else {
      const result = crossGate(course[nextGate],previous,position);
      if (result) {
        rings[nextGate++].visible=false;
        if (result==='hit') {score+=100; flash('リング通過 +100 / Nice flight');}
        else flash('リングを逃した / Missed · Keep going');
        if (nextGate===course.length) finish(`コース終了 / ${score/100} of ${course.length} rings`);
        else rings[nextGate].material=activeRing;
      }
    }
  }
  plane.position.copy(position); plane.rotation.set(pitch,heading,bank,'YXZ');
  const behind=new THREE.Vector3(0,8,27).applyAxisAngle(new THREE.Vector3(0,1,0),heading).add(position);
  camera.position.lerp(behind,1-Math.exp(-dt*5)); camera.lookAt(position.clone().add(new THREE.Vector3(-Math.sin(heading)*35,2,-Math.cos(heading)*35)));
  const target = course[nextGate];
  bearing.hidden = ended;
  reticle.hidden = ended;
  if (!ended) {
    const dx = target.x-position.x, dy = target.y-position.y, dz = target.z-position.z;
    const angle = Math.atan2(dx*Math.cos(heading)-dz*Math.sin(heading),-dx*Math.sin(heading)-dz*Math.cos(heading));
    bearing.style.transform = `rotate(${angle}rad)`;
    nextRing.textContent = `NEXT ${nextGate+1}/${course.length} · ${Math.round(Math.hypot(dx,dy,dz))} m`;
    const intercept = dz/forward.z;
    camera.updateMatrixWorld();
    aim.copy(position).addScaledVector(forward,forward.z<-.1 && intercept>0 ? Math.max(15,intercept) : 65).project(camera);
    reticle.style.left = `${(aim.x+1)*50}%`;
    reticle.style.top = `${(1-aim.y)*50}%`;
  } else {
    nextRing.textContent = `RINGS ${score/100}/${course.length}`;
  }
  el('score').textContent=String(score).padStart(4,'0'); el('speed').textContent=speed.toFixed(0); el('alt').textContent=Math.max(0,position.y).toFixed(0);
  el('time').textContent=`${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')}`;
  notice.style.opacity=ended||performance.now()<noticeUntil?'1':'0';
  radarTimer+=dt; if(radarTimer>=.1) {radarTimer=0;device.send({t:'radar',h:THREE.MathUtils.radToDeg(heading),o:rings.filter(r=>r.visible && r.position.distanceTo(position)<1200).sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position)).slice(0,16).map(r=>[Math.round(r.position.x-position.x),Math.round(r.position.z-position.z)]),score,speed:Math.round(speed),alt:Math.round(position.y)});}
  renderer.render(scene,camera);
}
reset(); animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
