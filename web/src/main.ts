import * as THREE from 'three';
import { Keyboard, CoreS3, wifiTarget } from './input';
import { buildCourse, crossGate, isNearCourse, launch } from './course';
import { RenderQuality } from './render-quality';
import { ringGuidePlacement } from './guide-layout';
import { FEEL, fovFromSpeed, nearMiss } from './feel';
import { FlightAudio } from './audio';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><div class="brand"><span class="mark">↗</span><div>空路 <span class="latin">SKYLINE</span><small>CORES3 FLIGHT LAB / 01</small></div></div><div class="connection"><i></i><span id="status">キーボード / Keyboard ready</span><span id="imu"></span><button id="connect">USBで接続 ↗</button><button id="wifi">Wi-Fiで接続 ↗</button></div></header>
<aside class="mission"><div class="eyebrow">RING RUN · リングコース</div><h1>風をつかまえよう。</h1><p>金色のリングに照準を合わせよう。</p><div class="tag">◉ &nbsp; RING +100 PTS &nbsp; / &nbsp; 地面に注意</div></aside>
<section class="instruments"><div><label>SCORE / スコア</label><strong id="score">0000</strong></div><div><label>AIRSPEED</label><strong><span id="speed">0</span><em>m/s</em></strong></div><div><label>ALTITUDE</label><strong><span id="alt">0</span><em>m</em></strong></div><div><label>FLIGHT TIME</label><strong id="time">00:00</strong></div></section>
<div class="reticle" aria-hidden="true">⊕</div><div id="notice" role="status"></div>
<div id="warning" role="status" hidden></div><div id="ring-guide" hidden><span class="guide-symbol" aria-hidden="true">➤</span><span class="guide-distance"></span></div><div id="crash-flash"></div>
<div id="flight-overlay"><section class="flight-card" aria-labelledby="briefing-title"><div class="eyebrow">FLIGHT BRIEFING · はじめに</div><h2 id="briefing-title">光のリングをくぐろう<small>Fly through the glowing rings</small></h2><ul><li><kbd>W / S · ↑ / ↓</kbd> 上昇 / 下降 · Climb / Descend</li><li><kbd>A / D · ← / →</kbd> バンクで旋回 · Bank to turn</li><li><kbd>Q / E</kbd> 減速 / 加速 · Slower / Faster</li><li><kbd>Shift / Space</kbd> ブースト · Boost</li><li><kbd>R</kbd> リスタート · Restart</li></ul><p>地面・岩柱に衝突するとフライト終了。<br>Ground & rock pillars end the flight.</p><button>Enter / Space で離陸 · Press Enter or Space to take off</button></section></div>
<footer><div class="controls"><span><kbd>W S</kbd> 上昇 / 下降</span><span><kbd>A D</kbd> バンク / Turn</span><span><kbd>Q E</kbd> 減速 / 加速</span><span><kbd>SHIFT / SPACE</kbd> Boost</span></div><div class="actions"><button id="center">センター合わせ</button><button id="reset">↻ リセット <kbd>R</kbd></button><button id="fullscreen" type="button" aria-pressed="false" hidden>全画面</button></div></footer>`;
const scene = new THREE.Scene();
document.querySelector('.flight-card ul')!.insertAdjacentHTML('beforeend','<li><kbd>M</kbd> Mute / Unmute</li>');
document.querySelector('footer .controls')!.insertAdjacentHTML('beforeend','<span><kbd>M</kbd> Mute</span>');
scene.background = new THREE.Color('#a6d2df'); scene.fog = new THREE.Fog('#a6d2df',280,1400);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.domElement.setAttribute('aria-label','3D flight game'); document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(FEEL.fov.cruise,1,.5,2400);
const audio = new FlightAudio();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
const course = buildCourse();
const pillarTiles = new Map<string, typeof pillars>();
for (let i=0;i<160;i++) {
  const x = Math.sin(i*127.1)*2300, z = Math.cos(i*73.7)*3400-2350;
  const r=18+(i%5)*8, h=25+(i%9)*13;
  if (isNearCourse(course,x,z,r)) continue;
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
for (const [kind,count] of Object.entries(FEEL.scenery)) {
  const cloud=kind==='clouds', tree=kind==='trees';
  const geometry=tree?new THREE.ConeGeometry(1,1,5):new THREE.IcosahedronGeometry(1,0);
  const material=new THREE.MeshStandardMaterial({color:cloud?0xffffff:tree?0x427b65:0x79988d,flatShading:true,transparent:cloud,opacity:cloud?.24:1,depthWrite:!cloud});
  const tiles=new Map<string,THREE.Matrix4[]>();
  for(let i=0;i<count;i++) {
    const x=Math.sin(i*127.1+count)*1500,z=Math.cos(i*73.7+count)*3100-2600;
    const size=cloud?20+i%18:tree?4+i%7:2+i%5;
    if(isNearCourse(course,x,z,size))continue;
    const matrix=new THREE.Matrix4().makeScale(size,cloud?size*.2:tree?size*2:size*.6,size);
    matrix.setPosition(x,cloud?18+i%32:tree?size:size*.3,z);
    const tile=`${Math.floor(x/600)},${Math.floor(z/600)}`;
    if(!tiles.has(tile))tiles.set(tile,[]);
    tiles.get(tile)!.push(matrix);
  }
  for(const matrices of tiles.values()) {
    const mesh=new THREE.InstancedMesh(geometry,material,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m)); mesh.computeBoundingSphere(); scene.add(mesh);
  }
}
const linePositions=new Float32Array(FEEL.speedLines.count*6);
for(let i=0;i<FEEL.speedLines.count;i++) {
  const angle=i*2.39996,r=9+i%8,z=-20-i%6*5;
  linePositions.set([Math.cos(angle)*r,Math.sin(angle)*r,z,Math.cos(angle)*r,Math.sin(angle)*r,z+FEEL.speedLines.length],i*6);
}
const lineGeometry=new THREE.BufferGeometry(); lineGeometry.setAttribute('position',new THREE.BufferAttribute(linePositions,3));
const lineMaterial=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false});
const speedLines=new THREE.LineSegments(lineGeometry,lineMaterial); camera.add(speedLines); scene.add(camera);
const particlePositions=new Float32Array(FEEL.particleCount*3);
const particleGeometry=new THREE.BufferGeometry(); particleGeometry.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));
const particleMaterial=new THREE.PointsMaterial({color:0xffe5a0,size:1.5,transparent:true,depthWrite:false});
const particles=new THREE.Points(particleGeometry,particleMaterial); particles.frustumCulled=false; particles.visible=false; scene.add(particles);
let rewardRing:THREE.Mesh<THREE.TorusGeometry,THREE.MeshBasicMaterial>|null=null, rewardAge=0, streak=0, hitstopUntil=0, boostMix=0, wasBoosting=false;
let lastWhoosh=-Infinity, lastCue=-Infinity, lastBoostCue=-Infinity, wasLow=false, skimmedGround=false;
function reward(index:number) {
  if(rewardRing) {rewardRing.visible=false; rewardRing.material.dispose(); rewardRing.material=distantRing;}
  rewardRing=rings[index]; rewardRing.visible=true;
  rewardRing.material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  rewardAge=0; particles.position.copy(rewardRing.position); particles.visible=true;
  particlePositions.fill(0); hitstopUntil=performance.now()+FEEL.hitstopMs;
  audio.chime(++streak);
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
const rim = .045;
const ringGeometry = new THREE.TorusGeometry(1,rim,8,64);
const rings = course.map(({x,y,z,radius}) => {
  const ring = new THREE.Mesh(ringGeometry,distantRing);
  ring.scale.setScalar(radius/(1-rim));
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
setInterval(()=>{const t=device.telemetry(); el('imu').textContent=device.connected?(t.hz?`傾き R${t.roll.toFixed(0)}° P${t.pitch.toFixed(0)}° · ${t.hz}Hz`:'姿勢データなし / No IMU data'):'';},250);
device.onCalibration=ready=>flash(ready?'センター設定 / Calibrated':'姿勢をキープ / Hold still to center');
function center() {
  if (!device.calibrate()) flash(device.connected?'姿勢データ待ち / Waiting for motion data':'CoreS3 を接続してください / Connect CoreS3 first');
}
el('center').onclick=center;
el('app').querySelector('.instruments')!.insertAdjacentHTML('beforeend','<div><label>RINGS</label><strong id="ring-count">0/40</strong></div><div><label>THROTTLE</label><strong><span id="throttle">40</span><em>%</em></strong></div>');
const minSpeed = 22, speedRange = 38, cruiseThrottle = .4, cruiseSpeed = minSpeed+speedRange*cruiseThrottle;
let heading=0,pitch=0,bank=0,speed=cruiseSpeed,throttle=cruiseThrottle,score=0,elapsed=0,nextGate=0;
let started=false,ended=false,noticeUntil=0;
const position = new THREE.Vector3(launch.x,launch.y,launch.z);
const previous = new THREE.Vector3(), forward = new THREE.Vector3(), aim = new THREE.Vector3();
const reticle = document.querySelector<HTMLElement>('.reticle')!;
const notice = el('notice'), warning = el('warning');
const ringGuide = el('ring-guide');
const placeRingGuide = ringGuidePlacement(ringGuide, document.querySelector<HTMLElement>('.instruments')!);
const guideSymbol = ringGuide.querySelector<HTMLElement>('.guide-symbol')!;
const guideDistance = ringGuide.querySelector<HTMLElement>('.guide-distance')!;
const guideLocal = new THREE.Vector3(), guideProjected = new THREE.Vector3();
function flash(s:string) {if (!ended) {notice.textContent=s; noticeUntil=performance.now()+2200;}}
function takeoff() {audio.start(); started=true; el('flight-overlay').hidden=true; flash('照準を金色のリングへ / Aim at gold');}
function resetFlight() {
  position.set(launch.x,launch.y,launch.z);
  heading=pitch=bank=score=elapsed=nextGate=0;
  speed=cruiseSpeed; throttle=cruiseThrottle; ended=false;
  streak=0; hitstopUntil=0; wasBoosting=false; wasLow=false; skimmedGround=false; boostMix=0; lastWhoosh=lastCue=lastBoostCue=-Infinity;
  if(rewardRing)rewardRing.material.dispose();
  rewardRing=null; particles.visible=false;
  rings.forEach((r,i) => {r.visible=true; r.material=distantRing; r.scale.setScalar(course[i].radius/(1-rim));});
  rings[0].material=activeRing;
  camera.position.set(launch.x,launch.y+8,launch.z+27);
  el('crash-flash').classList.remove('active');
}
function reset() {resetFlight(); takeoff();}
function formatTime() {return `${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')}`;}
function finish(cause:'ground'|'pillar'|'complete') {
  ended=true;
  const title=cause==='ground'?'地面に衝突 / You hit the ground':cause==='pillar'?'岩柱に衝突 / You hit a rock pillar':score/100===course.length?'全リング達成！ / Perfect flight':'コース終了 / Course complete';
  const tip=cause==='ground'?'高度が下がったら W / ↑ で機首上げ · Pitch up when low':cause==='pillar'?'A / D で早めに旋回して避けよう · Turn early to avoid pillars':'もう一度、金色のリングに挑戦 · Try for more gold rings';
  el('flight-overlay').innerHTML=`<section class="flight-card" aria-labelledby="result-title"><div class="eyebrow">FLIGHT REPORT · リザルト</div><h2 id="result-title">${title}</h2><p>${tip}</p><dl class="result-stats"><div><dt>SCORE / スコア</dt><dd>${score}</dd></div><div><dt>RINGS</dt><dd>${score/100}/${course.length}</dd></div><div><dt>FLIGHT TIME</dt><dd>${formatTime()}</dd></div></dl><button id="retry">R / Enter でリトライ · Retry</button></section>`;
  el('retry').onclick=reset; el('flight-overlay').hidden=false;
  if(cause!=='complete')el('crash-flash').classList.add('active');
  el('retry').focus();
}
el('flight-overlay').onclick=()=>{if(!started)takeoff();};
el('reset').onclick=reset; window.addEventListener('keydown',e=>{
  if(e.repeat)return;
  if(e.code==='Enter' && e.target===fullscreen)return;
  if(e.code==='KeyR')reset();
  if((e.code==='Enter' && (!started || ended)) || (e.code==='Space' && !started)) {e.preventDefault(); if(!started)takeoff(); else reset();}
  if(e.code==='KeyC')center();
  if(e.code==='KeyM') {audio.toggle(); flash(audio.muted?'Audio muted':'Audio on');}
});
const clock=new THREE.Clock(); let radarTimer=0;
const scoreDisplay=el('score'), speedDisplay=el('speed'), altDisplay=el('alt'), timeDisplay=el('time');
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
const behind=new THREE.Vector3(), lookTarget=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);
function animate() {
  requestAnimationFrame(animate);
  const frameTime=clock.getDelta();
  if (quality.sample(frameTime*1000) || devicePixelRatio!==viewDpr) resizeRenderer();
  const visualDt=Math.min(frameTime,.05), now=performance.now();
  const dt=now<hitstopUntil?0:visualDt;
  const key=keyboard.sample(), imu=device.sample(dt);
  const roll=THREE.MathUtils.clamp(key.roll+imu.roll,-1,1), climb=THREE.MathUtils.clamp(key.pitch+imu.pitch,-1,1);
  const boosting=started && !ended && (key.boost||imu.boost);
  if(boosting && !wasBoosting) {audio.boost(); if(now-lastBoostCue>FEEL.deviceCueCooldownMs) {device.send({t:'sfx',s:'boost'});lastBoostCue=now;}}
  wasBoosting=boosting;
  if(started && !ended) {
    elapsed+=dt; throttle=THREE.MathUtils.clamp(throttle+key.throttle*dt*.3,0,1);
    speed=THREE.MathUtils.damp(speed,minSpeed+throttle*speedRange+((key.boost||imu.boost)?28:0),2,dt);
    pitch=THREE.MathUtils.damp(pitch,climb*.49,key.pitch?FEEL.response.keyboardPitch:FEEL.response.pitch,dt); bank=THREE.MathUtils.damp(bank,-roll*.78,key.roll?FEEL.response.keyboardBank:FEEL.response.bank,dt);
    heading+=Math.sin(bank)*dt*FEEL.response.turn;
    previous.copy(position);
    forward.set(-Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch));
    position.addScaledVector(forward,speed*dt);
    position.y=Math.min(position.y,650);
    if (position.y<2) finish('ground');
    else if (pillars.some(p=>position.y<p.h+2 && Math.hypot(position.x-p.x,position.z-p.z)<p.r+2)) {
      finish('pillar');
    } else {
      const result = crossGate(course[nextGate],previous,position);
      if (result) {
        const index=nextGate++; rings[index].visible=false;
        if (result==='hit') {score+=100; reward(index); flash('リング通過 +100 / Nice flight');}
        else {streak=0; flash('リングを逃した / Missed · Keep going');}
        if (nextGate===course.length) finish('complete');
        else rings[nextGate].material=activeRing;
      }
    }
  }
  plane.position.copy(position); plane.rotation.set(pitch,heading,bank,'YXZ');
  audio.update(speed,started && !ended);
  boostMix=THREE.MathUtils.damp(boostMix,boosting?1:0,FEEL.camera.boostSmoothing,visualDt);
  lineMaterial.opacity=boostMix*FEEL.speedLines.opacity;
  speedLines.position.z=(now%200)/200*FEEL.speedLines.length;
  camera.fov=THREE.MathUtils.damp(camera.fov,fovFromSpeed(speed),FEEL.fov.smoothing,visualDt); camera.updateProjectionMatrix();
  if(rewardRing) {
    rewardAge+=visualDt;
    rewardRing.scale.setScalar(course[nextGate-1].radius/(1-rim)*(1+.25*Math.sin(Math.min(1,rewardAge/FEEL.ringPulseSeconds)*Math.PI)));
    if(rewardAge>FEEL.ringPulseSeconds)rewardRing.visible=false;
    for(let i=0;i<FEEL.particleCount;i++) {
      const angle=i*2.39996,r=rewardAge*FEEL.particleSpeed;
      particlePositions.set([Math.cos(angle)*r,Math.sin(angle)*r,(i%5-2)*r*.2],i*3);
    }
    particleGeometry.attributes.position.needsUpdate=true; particleMaterial.opacity=Math.max(0,1-rewardAge/FEEL.particleSeconds);
    if(rewardAge>FEEL.particleSeconds) {particles.visible=false; rewardRing.material.dispose(); rewardRing.material=distantRing; rewardRing=null;}
  }
  behind.set(0,8,27+boostMix*FEEL.camera.pullback).applyAxisAngle(up,heading).add(position);
  lookTarget.set(-Math.sin(heading)*35,2,-Math.cos(heading)*35).add(position);
  camera.position.lerp(behind,1-Math.exp(-visualDt*FEEL.camera.smoothing));
  if(!reducedMotion.matches) {camera.position.x+=Math.sin(now*.047)*boostMix*FEEL.camera.shake; camera.position.y+=Math.cos(now*.063)*boostMix*FEEL.camera.shake;}
  camera.lookAt(lookTarget);
  ringGuide.hidden = reticle.hidden = !started || ended;
  if (started && !ended) {
    const target = rings[nextGate].position;
    const intercept = (target.z-position.z)/forward.z;
    camera.updateMatrixWorld();
    aim.copy(position).addScaledVector(forward,forward.z<-.1 && intercept>0 ? Math.max(15,intercept) : 65).project(camera);
    reticle.style.left = `${(aim.x+1)*50}%`;
    reticle.style.top = `${(1-aim.y)*50}%`;
    updateRingGuide(target);
  }
  showText(scoreDisplay,String(score).padStart(4,'0'));
  showText(speedDisplay,speed.toFixed(0));
  showText(altDisplay,Math.max(0,position.y).toFixed(0));
  showText(timeDisplay,formatTime());
  showText(ringCountDisplay,`${score/100}/${course.length}`);
  showText(throttleDisplay,(throttle*100).toFixed(0));
  const opacity=started && !ended && performance.now()<noticeUntil?'1':'0';
  if (notice.style.opacity!==opacity) notice.style.opacity=opacity;
  const low=position.y<12 || position.y<25 && Math.sin(pitch)<0;
  const flying=started && !ended;
  if(flying && low && !wasLow && now-lastCue>FEEL.deviceCueCooldownMs) {device.send({t:'sfx',s:'pullup'}); lastCue=now;}
  wasLow=flying && low;
  const groundPass=skimmedGround && position.y-2>=FEEL.nearMiss.ground;
  if(flying && nearMiss(position.y-2,FEEL.nearMiss.ground))skimmedGround=true;
  if(!flying || groundPass)skimmedGround=false;
  if(flying && now-lastWhoosh>FEEL.nearMiss.cooldownMs && (groundPass || pillars.some(p=>position.y<p.h+2 && nearMiss(Math.hypot(position.x-p.x,position.z-p.z)-p.r-2,FEEL.nearMiss.pillar) && (position.x-p.x)*forward.x+(position.z-p.z)*forward.z>0))) {audio.whoosh();lastWhoosh=now;}
  const obstacle=pillars.some(p=>{
    const dx=p.x-position.x,dz=p.z-position.z;
    const ahead=-dx*Math.sin(heading)-dz*Math.cos(heading), side=dx*Math.cos(heading)-dz*Math.sin(heading);
    return position.y<p.h+2 && ahead>0 && ahead-p.r<60 && Math.abs(side)<p.r+12;
  });
  warning.hidden=!started || ended || (!low && !obstacle);
  showText(warning,low?'PULL UP · W / ↑':'OBSTACLE · A / D で回避');
  radarTimer+=dt; if(radarTimer>=.1) {radarTimer=0;device.send({t:'radar',h:THREE.MathUtils.radToDeg(heading),o:rings.filter(r=>r.visible && r.position.distanceTo(position)<1200).sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position)).slice(0,16).map(r=>[Math.round(r.position.x-position.x),Math.round(r.position.z-position.z)]),score,speed:Math.round(speed),alt:Math.round(position.y)});}
  renderer.render(scene,camera);
}
resetFlight(); animate();
function updateRingGuide(target: THREE.Vector3) {
  const local=guideLocal.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const projected=guideProjected.copy(local).applyMatrix4(camera.projectionMatrix);
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
  placeRingGuide(innerWidth/2+x,innerHeight/2+y+(onScreen?30:0));
  guideSymbol.hidden=onScreen;
  guideSymbol.style.transform=onScreen?'':`rotate(${Math.atan2(y,x)}rad)`;
  showText(guideDistance,`NEXT ${nextGate+1}/${course.length} · ${Math.round(target.distanceTo(position))} m`);
}
