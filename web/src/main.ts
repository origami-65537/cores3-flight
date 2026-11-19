import * as THREE from 'three';
import { Keyboard, CoreS3, wifiTarget } from './input';
import { RenderQuality } from './render-quality';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><div class="brand"><span class="mark">↗</span><div>空路 <span class="latin">SKYLINE</span><small>CORES3 FLIGHT LAB / 01</small></div></div><div class="connection"><i></i><span id="status">キーボード / Keyboard ready</span><button id="connect">USBで接続 ↗</button><button id="wifi">Wi-Fiで接続 ↗</button></div></header>
<aside class="mission"><div class="eyebrow">FREE FLIGHT · 自由飛行</div><h1>風をつかまえよう。</h1><p>光のリングをくぐり、空の道をつなぐ。</p><div class="tag">◉ &nbsp; RING +100 PTS &nbsp; / &nbsp; 地面に注意</div></aside>
<section class="instruments"><div><label>SCORE / スコア</label><strong id="score">0000</strong></div><div><label>AIRSPEED</label><strong><span id="speed">0</span><em>m/s</em></strong></div><div><label>ALTITUDE</label><strong><span id="alt">0</span><em>m</em></strong></div><div><label>FLIGHT TIME</label><strong id="time">00:00</strong></div></section>
<div class="reticle"><span>┌</span> + <span>┐</span></div><div id="notice" role="status">READY FOR TAKEOFF</div>
<div id="warning" role="status" hidden></div><div id="ring-guide" hidden><span class="guide-symbol">◇</span><span class="guide-distance"></span></div><div id="crash-flash"></div>
<div id="flight-overlay"><section class="flight-card" aria-labelledby="briefing-title"><div class="eyebrow">FLIGHT BRIEFING · はじめに</div><h2 id="briefing-title">光のリングをくぐろう<small>Fly through the glowing rings</small></h2><ul><li><kbd>W / S · ↑ / ↓</kbd> 上昇 / 下降 · Climb / Descend</li><li><kbd>A / D · ← / →</kbd> バンクで旋回 · Bank to turn</li><li><kbd>Q / E</kbd> 減速 / 加速 · Slower / Faster</li><li><kbd>Shift / Space</kbd> ブースト · Boost</li><li><kbd>R</kbd> リスタート · Restart</li></ul><p>地面・岩柱に衝突するとフライト終了。<br>Ground & rock pillars end the flight.</p><button>Enter / Space で離陸 · Press Enter or Space to take off</button></section></div>
<footer><div class="controls"><span><kbd>W S</kbd> 上昇 / 下降</span><span><kbd>A D</kbd> バンク / Turn</span><span><kbd>Q E</kbd> 減速 / 加速</span><span><kbd>SHIFT / SPACE</kbd> Boost</span></div><div class="actions"><button id="center">センター合わせ</button><button id="reset">↻ リセット <kbd>R</kbd></button><button id="fullscreen" type="button" aria-pressed="false" hidden>全画面</button></div></footer>`;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a6d2df'); scene.fog = new THREE.Fog('#a6d2df',280,1400);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.domElement.setAttribute('aria-label','3D flight game'); document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60,1,.5,2400);
const quality = new RenderQuality();
let viewWidth = 0, viewHeight = 0, viewDpr = 0, renderRatio = 0;
function resizeRenderer() {
  const width = Math.max(1, innerWidth), height = Math.max(1, innerHeight);
  const dpr = devicePixelRatio;
  if (width !== viewWidth || height !== viewHeight) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    quality.resetSample();
  }
  const ratio = quality.pixelRatio(width,height,dpr);
  if (width !== viewWidth || height !== viewHeight || ratio !== renderRatio) {
    renderer.setDrawingBufferSize(width,height,ratio);
  }
  viewWidth = width; viewHeight = height; viewDpr = dpr; renderRatio = ratio;
}
resizeRenderer();
window.addEventListener('resize',resizeRenderer);
document.addEventListener('visibilitychange',() => quality.resetSample());
scene.add(new THREE.HemisphereLight(0xe6f7ff,0x4e7860,2.4));
const sun = new THREE.DirectionalLight(0xffe6bd,3); sun.position.set(-180,300,140); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000,12000),new THREE.MeshStandardMaterial({color:0x5e9480,roughness:1}));
ground.rotation.x = -Math.PI/2; scene.add(ground);
const grid = new THREE.GridHelper(12000,240,0x73a38f,0x73a38f); grid.position.y=.1; scene.add(grid);
const pillarMaterial = new THREE.MeshStandardMaterial({color:0x4e7a70,flatShading:true});
const pillars: {x:number;z:number;r:number;h:number}[] = [];
const pillarTiles = new Map<string, typeof pillars>();
for (let i=0;i<160;i++) {
  const x = Math.sin(i*127.1)*2300, z = Math.cos(i*73.7)*2300-1200;
  if (Math.abs(x)<90 && z>-1300 && z<100) continue;
  const r=18+(i%5)*8, h=25+(i%9)*13;
  const pillar = {x,z,r,h};
  pillars.push(pillar);
  const tile = `${Math.floor(x/600)},${Math.floor(z/600)}`;
  if (!pillarTiles.has(tile)) pillarTiles.set(tile,[]);
  pillarTiles.get(tile)!.push(pillar);
}
const pillarGeometry = new THREE.CylinderGeometry(.65,1,1,5);
const transform = new THREE.Matrix4();
for (const tile of pillarTiles.values()) {
  const batch = new THREE.InstancedMesh(pillarGeometry,pillarMaterial,tile.length);
  tile.forEach(({x,z,r,h},i) => {
    transform.makeScale(r,h,r).setPosition(x,h/2,z);
    batch.setMatrixAt(i,transform);
  });
  batch.computeBoundingSphere();
  scene.add(batch);
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
const ringGeometry = new THREE.TorusGeometry(15,.7,8,64);
const ringMaterial = new THREE.MeshStandardMaterial({color:0xffd781,emissive:0xf6af3b,emissiveIntensity:.5});
for(let i=0;i<40;i++) {
  const ring=new THREE.Mesh(ringGeometry,ringMaterial);
  ring.position.set(i<5 ? Math.sin(i*.65)*30 : Math.sin(i*.5)*190,65+Math.sin(i*.7)*23,-140-i*130);
  scene.add(ring); rings.push(ring);
}
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
device.onCalibration=ready=>flash(ready?'センター設定 / Calibrated':'姿勢をキープ / Hold still to center');
function center() {
  if (!device.calibrate()) flash(device.connected?'姿勢データ待ち / Waiting for motion data':'CoreS3 を接続してください / Connect CoreS3 first');
}
el('center').onclick=center;
el('app').querySelector('.instruments')!.insertAdjacentHTML('beforeend','<div><label>RINGS</label><strong id="ring-count">0/40</strong></div><div><label>THROTTLE</label><strong><span id="throttle">45</span><em>%</em></strong></div>');
let heading=0,pitch=0,bank=0,speed=42,throttle=.45,score=0,elapsed=0,crashed=false,noticeUntil=0;
let started=false;
const position=new THREE.Vector3(0,65,70);
function flash(s:string) {el('notice').textContent=s; noticeUntil=performance.now()+2200;}
function takeoff() {started=true; el('flight-overlay').hidden=true; flash('リングの中心を狙おう · Aim for the ring center');}
function reset() { position.set(0,65,70); heading=pitch=bank=score=elapsed=0; speed=42; throttle=.45; crashed=false; rings.forEach(r=>r.visible=true); el('crash-flash').classList.remove('active'); takeoff(); }
function formatTime() {return `${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')}`;}
function finish(cause:'ground'|'pillar'|'complete') {
  crashed=true;
  const title=cause==='ground'?'地面に衝突 / You hit the ground':cause==='pillar'?'岩柱に衝突 / You hit a rock pillar':'全リング達成！ / Perfect flight';
  const tip=cause==='ground'?'高度が下がったら W / ↑ で機首上げ · Pitch up when low':cause==='pillar'?'A / D で早めに旋回して避けよう · Turn early to avoid pillars':'空の道をつないだ！ / All rings cleared!';
  el('flight-overlay').innerHTML=`<section class="flight-card" aria-labelledby="result-title"><div class="eyebrow">FLIGHT REPORT · リザルト</div><h2 id="result-title">${title}</h2><p>${tip}</p><dl class="result-stats"><div><dt>SCORE / スコア</dt><dd>${score}</dd></div><div><dt>RINGS</dt><dd>${rings.filter(r=>!r.visible).length}/40</dd></div><div><dt>FLIGHT TIME</dt><dd>${formatTime()}</dd></div></dl><button id="retry">R / Enter でリトライ · Retry</button></section>`;
  el('retry').onclick=reset; el('flight-overlay').hidden=false;
  if(cause!=='complete')el('crash-flash').classList.add('active');
  el('retry').focus();
}
el('flight-overlay').onclick=()=>{if(!started)takeoff();};
el('reset').onclick=reset; window.addEventListener('keydown',e=>{
  if(e.repeat)return;
  if(e.code==='Enter' && e.target===fullscreen)return;
  if(e.code==='KeyR')reset();
  if((e.code==='Enter' && (!started || crashed)) || (e.code==='Space' && !started)) {e.preventDefault(); if(!started)takeoff(); else reset();}
  if(e.code==='KeyC')center();
});
const clock=new THREE.Clock(); let radarTimer=0;
const scoreDisplay=el('score'), speedDisplay=el('speed'), altDisplay=el('alt'), timeDisplay=el('time'), noticeDisplay=el('notice');
const ringCountDisplay=el('ring-count'), throttleDisplay=el('throttle');
const fullscreen=el('fullscreen');
fullscreen.hidden=!document.fullscreenEnabled;
fullscreen.onclick=async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    flash('全画面にできません / Fullscreen unavailable');
  }
};
document.addEventListener('fullscreenchange',() => {
  const active=!!document.fullscreenElement;
  fullscreen.setAttribute('aria-pressed',String(active));
  fullscreen.textContent=active?'全画面を終了':'全画面';
  resizeRenderer();
});
function showText(element:HTMLElement,value:string) {
  if (element.textContent!==value) element.textContent=value;
}
const previous=new THREE.Vector3(), flightDirection=new THREE.Vector3(), hit=new THREE.Vector3(),
  behind=new THREE.Vector3(), lookTarget=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);
function animate() {
  requestAnimationFrame(animate);
  const frameTime=clock.getDelta();
  if (quality.sample(frameTime*1000) || devicePixelRatio!==viewDpr) resizeRenderer();
  const dt=Math.min(frameTime,.05);
  const key=keyboard.sample(), imu=device.sample(dt);
  const roll=THREE.MathUtils.clamp(key.roll+imu.roll,-1,1), climb=THREE.MathUtils.clamp(key.pitch+imu.pitch,-1,1);
  if(started && !crashed) {
    elapsed+=dt; throttle=THREE.MathUtils.clamp(throttle+key.throttle*dt*.3,0,1);
    speed=THREE.MathUtils.damp(speed,26+throttle*38+((key.boost||imu.boost)?28:0),2,dt);
    pitch=THREE.MathUtils.damp(pitch,climb*.65,3,dt); bank=THREE.MathUtils.damp(bank,-roll*.95,4,dt);
    heading+=Math.sin(bank)*dt*.8;
    previous.copy(position);
    flightDirection.set(-Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch));
    position.addScaledVector(flightDirection,speed*dt);
    position.y=Math.min(position.y,650);
    for(const ring of rings) if(ring.visible) {
      const a=previous.z-ring.position.z,b=position.z-ring.position.z;
      if(a*b<=0 && a!==b) {hit.lerpVectors(previous,position,a/(a-b)); if(Math.hypot(hit.x-ring.position.x,hit.y-ring.position.y)<13) {ring.visible=false;score+=100;flash('リング通過 +100 / NICE FLIGHT');}}
    }
    if(position.y<2) finish('ground');
    else if(pillars.some(p=>position.y<p.h+2 && Math.hypot(position.x-p.x,position.z-p.z)<p.r+2)) finish('pillar');
    else if(rings.every(r=>!r.visible)) finish('complete');
  }
  plane.position.copy(position); plane.rotation.set(pitch,heading,bank,'YXZ');
  behind.set(0,8,27).applyAxisAngle(up,heading).add(position);
  lookTarget.set(-Math.sin(heading)*35,2,-Math.cos(heading)*35).add(position);
  camera.position.lerp(behind,1-Math.exp(-dt*5)); camera.lookAt(lookTarget);
  showText(scoreDisplay,String(score).padStart(4,'0'));
  showText(speedDisplay,speed.toFixed(0));
  showText(altDisplay,Math.max(0,position.y).toFixed(0));
  showText(timeDisplay,formatTime());
  showText(ringCountDisplay,`${rings.filter(r=>!r.visible).length}/40`);
  showText(throttleDisplay,(throttle*100).toFixed(0));
  const opacity=started && !crashed && performance.now()<noticeUntil?'1':'0';
  if (noticeDisplay.style.opacity!==opacity) noticeDisplay.style.opacity=opacity;
  const low=position.y<12 || position.y<25 && Math.sin(pitch)<0;
  const obstacle=pillars.some(p=>{
    const dx=p.x-position.x,dz=p.z-position.z;
    const ahead=-dx*Math.sin(heading)-dz*Math.cos(heading), side=dx*Math.cos(heading)-dz*Math.sin(heading);
    return position.y<p.h+2 && ahead>0 && ahead-p.r<60 && Math.abs(side)<p.r+12;
  });
  el('warning').hidden=!started || crashed || (!low && !obstacle);
  el('warning').textContent=low?'PULL UP · W / ↑':'OBSTACLE · A / D で回避';
  updateRingGuide();
  radarTimer+=dt; if(radarTimer>=.1) {radarTimer=0;device.send({t:'radar',h:THREE.MathUtils.radToDeg(heading),o:rings.filter(r=>r.visible && r.position.distanceTo(position)<1200).sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position)).slice(0,16).map(r=>[Math.round(r.position.x-position.x),Math.round(r.position.z-position.z)]),score,speed:Math.round(speed),alt:Math.round(position.y)});}
  renderer.render(scene,camera);
}
camera.position.set(0,75,100); animate();
function updateRingGuide() {
  const target=rings.filter(r=>r.visible).sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position))[0];
  const guide=el('ring-guide'); guide.hidden=!started || crashed || !target;
  if(!target || !started || crashed)return;
  camera.updateMatrixWorld();
  const local=target.position.clone().applyMatrix4(camera.matrixWorldInverse), projected=target.position.clone().project(camera);
  const onScreen=local.z<0 && Math.abs(projected.x)<.88 && Math.abs(projected.y)<.8;
  let x=projected.x*innerWidth/2,y=-projected.y*innerHeight/2;
  if(!onScreen) {
    x=local.x; y=-local.y;
    if(Math.abs(x)+Math.abs(y)<.001)y=1;
    const halfWidth=Math.max(20,innerWidth/2-(innerWidth>850?230:Math.min(160,innerWidth*.35)));
    const halfHeight=Math.max(20,innerHeight/2-130);
    const scale=Math.min(halfWidth/Math.max(Math.abs(x),.001),halfHeight/Math.max(Math.abs(y),.001));
    x*=scale; y*=scale;
  }
  guide.style.left=`${innerWidth/2+x}px`; guide.style.top=`${innerHeight/2+y}px`;
  const symbol=guide.querySelector<HTMLElement>('.guide-symbol')!;
  symbol.textContent=onScreen?'◇':'➤'; symbol.style.transform=onScreen?'none':`rotate(${Math.atan2(y,x)}rad)`;
  guide.querySelector('.guide-distance')!.textContent=`${Math.round(target.position.distanceTo(position))} m`;
}
