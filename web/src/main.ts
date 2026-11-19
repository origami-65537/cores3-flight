import * as THREE from 'three';
import { Keyboard, CoreS3 } from './input';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><div class="brand"><span class="mark">↗</span><div>空路 <span class="latin">SKYLINE</span><small>CORES3 FLIGHT LAB / 01</small></div></div><div class="connection"><i></i><span id="status">キーボード / Keyboard ready</span><button id="connect">CoreS3を接続 ↗</button></div></header>
<aside class="mission"><div class="eyebrow">FREE FLIGHT · 自由飛行</div><h1>風をつかまえよう。</h1><p>光のリングをくぐり、空の道をつなぐ。</p><div class="tag">◉ &nbsp; RING +100 PTS &nbsp; / &nbsp; 地面に注意</div></aside>
<section class="instruments"><div><label>SCORE / スコア</label><strong id="score">0000</strong></div><div><label>AIRSPEED</label><strong><span id="speed">0</span><em>m/s</em></strong></div><div><label>ALTITUDE</label><strong><span id="alt">0</span><em>m</em></strong></div><div><label>FLIGHT TIME</label><strong id="time">00:00</strong></div></section>
<div class="reticle"><span>┌</span> + <span>┐</span></div><div id="notice" role="status">READY FOR TAKEOFF</div>
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
for (let i=0;i<160;i++) {
  const x = Math.sin(i*127.1)*2300, z = Math.cos(i*73.7)*2300-1200;
  if (Math.abs(x)<90 && z>-1300 && z<100) continue;
  const r=18+(i%5)*8, h=25+(i%9)*13;
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
const rings: THREE.Mesh[]=[];
for(let i=0;i<40;i++) {
  const ring=new THREE.Mesh(new THREE.TorusGeometry(15, .7,8,64),new THREE.MeshStandardMaterial({color:0xffd781,emissive:0xf6af3b,emissiveIntensity:.5}));
  ring.position.set(i<5 ? Math.sin(i*.65)*30 : Math.sin(i*.5)*190,65+Math.sin(i*.7)*23,-140-i*130);
  scene.add(ring); rings.push(ring);
}
const keyboard = new Keyboard(), device = new CoreS3();
const el = (id:string) => document.getElementById(id)!;
device.onStatus=s => {el('status').textContent=s; el('connect').textContent=device.connected?'接続済み ✓':'CoreS3を接続 ↗';};
el('connect').onclick=async()=> {try {await device.connect();} catch(e) {el('status').textContent=e instanceof Error?e.message:String(e);} };
el('center').onclick=()=>{device.calibrate(); flash('センター設定 / Calibrated');};
let heading=0,pitch=0,bank=0,speed=42,throttle=.45,score=0,elapsed=0,crashed=false,noticeUntil=0;
const position=new THREE.Vector3(0,65,70);
function flash(s:string) {el('notice').textContent=s; noticeUntil=performance.now()+2200;}
function reset() { position.set(0,65,70); heading=pitch=bank=score=elapsed=0; speed=42; throttle=.45; crashed=false; rings.forEach(r=>r.visible=true); flash('新しいフライト / Let’s fly'); }
el('reset').onclick=reset; window.addEventListener('keydown',e=>{if(e.code==='KeyR')reset(); if(e.code==='KeyC')device.calibrate();});
const clock=new THREE.Clock(); let radarTimer=0;
function animate() {
  requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05);
  const key=keyboard.sample(), imu=device.sample(dt);
  const roll=THREE.MathUtils.clamp(key.roll+imu.roll,-1,1), climb=THREE.MathUtils.clamp(key.pitch+imu.pitch,-1,1);
  if(!crashed) {
    elapsed+=dt; throttle=THREE.MathUtils.clamp(throttle+key.throttle*dt*.3,0,1);
    speed=THREE.MathUtils.damp(speed,26+throttle*38+((key.boost||imu.boost)?28:0),2,dt);
    pitch=THREE.MathUtils.damp(pitch,climb*.65,3,dt); bank=THREE.MathUtils.damp(bank,-roll*.95,4,dt);
    heading+=Math.sin(bank)*dt*.8;
    const previous=position.clone();
    position.add(new THREE.Vector3(-Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch)).multiplyScalar(speed*dt));
    position.y=Math.min(position.y,650);
    for(const ring of rings) if(ring.visible) {
      const a=previous.z-ring.position.z,b=position.z-ring.position.z;
      if(a*b<=0 && a!==b) {const t=a/(a-b); const hit=previous.clone().lerp(position,t); if(Math.hypot(hit.x-ring.position.x,hit.y-ring.position.y)<13) {ring.visible=false;score+=100;flash('リング通過 +100 / NICE FLIGHT');}}
    }
    if(position.y<2 || pillars.some(p=>position.y<p.h+2 && Math.hypot(position.x-p.x,position.z-p.z)<p.r+2)) {crashed=true;flash('着地失敗 / Press R to retry');}
    if(rings.every(r=>!r.visible)) {crashed=true;flash('全リング達成！ / Perfect flight · R to restart');}
  }
  plane.position.copy(position); plane.rotation.set(pitch,heading,bank,'YXZ');
  const behind=new THREE.Vector3(0,8,27).applyAxisAngle(new THREE.Vector3(0,1,0),heading).add(position);
  camera.position.lerp(behind,1-Math.exp(-dt*5)); camera.lookAt(position.clone().add(new THREE.Vector3(-Math.sin(heading)*35,2,-Math.cos(heading)*35)));
  el('score').textContent=String(score).padStart(4,'0'); el('speed').textContent=speed.toFixed(0); el('alt').textContent=Math.max(0,position.y).toFixed(0);
  el('time').textContent=`${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')}`;
  el('notice').style.opacity=crashed||performance.now()<noticeUntil?'1':'0';
  radarTimer+=dt; if(radarTimer>=.1) {radarTimer=0;device.send({t:'radar',h:THREE.MathUtils.radToDeg(heading),o:rings.filter(r=>r.visible && r.position.distanceTo(position)<1200).sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position)).slice(0,16).map(r=>[Math.round(r.position.x-position.x),Math.round(r.position.z-position.z)]),score,speed:Math.round(speed),alt:Math.round(position.y)});}
  renderer.render(scene,camera);
}
camera.position.set(0,75,100); flash('W / ↑ で上昇 · リングを目指そう'); animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
