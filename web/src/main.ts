import * as THREE from 'three';
import { Keyboard, CoreS3, wifiTarget } from './input';
import { CEILING, groundHeight, landmarks, launch, mist, nearStructure, pathHits, terrainHeight, throughGate, touching, wrap } from './world';
import { Island } from './island';
import { buildAircraft } from './aircraft';
import { RenderQuality } from './render-quality';
import { FEEL, fovFromSpeed, nearMiss } from './feel';
import { FlightAudio } from './audio';
import { Aerobatics, STUNT, TRICK_NAMES, steepness, trickPoints, turnFactor, type TrickKind } from './stunts';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><div class="brand"><span class="mark">↗</span><div>空路 <span class="latin">SKYLINE</span><small>CORES3 FLIGHT LAB / 01</small></div></div><div class="connection"><i></i><span id="status">キーボード / Keyboard ready</span><span id="imu"></span><button id="connect">USBで接続 ↗</button><button id="wifi">Wi-Fiで接続 ↗</button></div></header>
<section class="instruments"><div><label>SCORE</label><strong id="score">0000</strong></div><div><label>SPEED</label><strong><span id="speed">0</span><em>m/s</em></strong></div><div><label>ALT</label><strong><span id="alt">0</span><em>m</em></strong></div></section>
<pre id="stunt-debug" hidden></pre><div id="notice" role="status"></div>
<div id="warning" role="status" hidden></div><div id="crash-flash"></div>
<div id="flight-overlay"><section class="flight-card" aria-labelledby="briefing-title"><div class="eyebrow">FLIGHT BRIEFING · はじめに</div><h2 id="briefing-title">島を自由に飛ぼう<small>The island is yours to fly</small></h2><ul><li><kbd>W / S · ↑ / ↓</kbd> 上昇 / 下降 · Climb / Descend</li><li><kbd>A / D · ← / →</kbd> バンクで旋回 · Bank to turn</li><li><kbd>Q / E</kbd> 減速 / 加速 · Slower / Faster</li><li><kbd>Shift / Space</kbd> ブースト · Boost</li><li><kbd>J / L</kbd> 押している間ロール · Hold to roll, full turn +100</li><li><kbd>I</kbd> 押している間ループ · Hold to loop +300（35 m/s 以上）</li><li><kbd>K</kbd> 押して反転 · Hold to split S +250</li><li><kbd>R</kbd> リスタート · Restart</li><li><kbd>CoreS3</kbd> 大きく傾けている間だけ回転 · Tilt far and hold to rotate</li></ul><p>島の名所には、くぐり抜けられる場所がある。<br>Each landmark has a way under or through. Hitting anything ends the flight.</p><button>Enter / Space で離陸 · Press Enter or Space to take off</button></section></div>
<footer><div class="controls"><span><kbd>W S</kbd> 上昇 / 下降</span><span><kbd>A D</kbd> バンク / Turn</span><span><kbd>Q E</kbd> 減速 / 加速</span><span><kbd>SHIFT / SPACE</kbd> Boost</span><span><kbd>J L · I · K</kbd> ロール / ループ / スプリットS</span></div><div class="actions"><button id="center">センター合わせ</button><button id="reset">↻ リセット <kbd>R</kbd></button><button id="fullscreen" type="button" aria-pressed="false" hidden>全画面</button></div></footer>`;
const scene = new THREE.Scene();
document.querySelector('.flight-card ul')!.insertAdjacentHTML('beforeend','<li><kbd>M</kbd> Mute / Unmute</li>');
document.querySelector('footer .controls')!.insertAdjacentHTML('beforeend','<span><kbd>M</kbd> Mute</span>');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.domElement.setAttribute('aria-label','3D flight game'); document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(FEEL.fov.cruise,1,1,9000);
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
const island = new Island(scene);
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
const particleMaterial=new THREE.PointsMaterial({color:0xffe5a0,size:1.5,transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending});
const particles=new THREE.Points(particleGeometry,particleMaterial); particles.frustumCulled=false; particles.visible=false; scene.add(particles);
let rewardAge=Infinity, hitstopUntil=0, boostMix=0, wasBoosting=false;
let lastWhoosh=-Infinity, lastCue=-Infinity, lastBoostCue=-Infinity, wasLow=false, skimmedGround=false, skimmedStructure=false;
// Flying through a landmark: light shards, a chime that climbs with each new landmark, and the time of day moves on.
function reward() {
  rewardAge=0; particles.position.copy(position); particles.visible=true;
  particlePositions.fill(0); hitstopUntil=performance.now()+FEEL.hitstopMs;
  audio.chime(found.size);
  if(found.size===landmarks.length && !fanfare) {fanfare=true; for(const step of [1,2,3])setTimeout(()=>audio.chime(found.size+step*2),step*140);}
  timeOfDay++;
}
const {model:plane, updatePropeller}=buildAircraft();
scene.add(plane);
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
setInterval(()=>{
  const panel=el('stunt-debug');
  panel.hidden=!showStunts;
  if(!showStunts)return;
  const t=device.telemetry(), h=STUNT.hold, sign=(n:number)=>`${n<0?'-':'+'}${Math.abs(n).toFixed(0).padStart(3)}`, degrees=(n:number)=>sign(n*180/Math.PI);
  const held=heldAxis.roll?`HOLD ROLL ${heldAxis.roll<0?'←':'→'}`:heldAxis.pitch?`HOLD ${heldAxis.pitch>0?'PULL':'PUSH'}`:aero.stalled?`STALL · ${STUNT.loop.minSpeed} m/s 必要`:'—';
  showText(panel,[`STUNT DEBUG · G`,!device.connected?'CoreS3 未接続 · keys J L I K':!t.hz?'NO IMU DATA':`tilt roll ${sign(t.roll)}°  pitch ${sign(t.pitch)}°`,`hold ≥${h.start}° · release <${h.release}°`,`input ${held}`,`plane bank ${degrees(bank)}°  pitch ${degrees(pitch)}°`,`count roll ${trickCounts.barrelRoll} loop ${trickCounts.loop} split S ${trickCounts.splitS}`].join('\n'));
},100);
setInterval(()=>{const t=device.telemetry(); el('imu').textContent=device.connected?(t.hz?`傾き R${t.roll.toFixed(0)}° P${t.pitch.toFixed(0)}° · ${t.hz}Hz`:'姿勢データなし / No IMU data'):'';},250);
device.onCalibration=ready=>flash(ready?'センター設定':'姿勢をキープ');
function center() {
  if (!device.calibrate()) flash(device.connected?'姿勢データ待ち':'CoreS3 を接続してください');
}
el('center').onclick=center;
const minSpeed = 22, speedRange = 38, cruiseThrottle = .4, cruiseSpeed = minSpeed+speedRange*cruiseThrottle;
let heading=0,pitch=0,bank=0,speed=cruiseSpeed,throttle=cruiseThrottle,score=0,elapsed=0,timeOfDay=0;
let started=false,ended=false,parked=false,noticeUntil=0,fanfare=false,showStunts=false,stalledCue=false;
const aero=new Aerobatics(), heldAxis={roll:0,pitch:0}, trickCounts:Record<TrickKind,number>={barrelRoll:0,loop:0,splitS:0};
const position = new THREE.Vector3(launch.x,launch.y,launch.z);
const found=new Set<string>(), armed=landmarks.map(()=>true);
const previous = new THREE.Vector3(), forward = new THREE.Vector3();
const notice = el('notice'), warning = el('warning');
function flash(s:string) {if (!ended) {notice.textContent=s; noticeUntil=performance.now()+2200;}}
function takeoff() {audio.start(); started=true; parked=false; el('flight-overlay').hidden=true;}
device.onHangar=down=>{
  if(down) {parked=true; noticeUntil=0;}
  else if(parked && !ended) takeoff();
  else parked=false;
};
function resetFlight() {
  position.set(launch.x,launch.y,launch.z);
  heading=launch.heading; pitch=bank=score=elapsed=timeOfDay=0; found.clear(); armed.fill(true); fanfare=false; aero.reset(); stalledCue=false; trickCounts.barrelRoll=trickCounts.loop=trickCounts.splitS=0;
  speed=cruiseSpeed; throttle=cruiseThrottle; ended=false; noticeUntil=0;
  hitstopUntil=0; wasBoosting=false; wasLow=false; skimmedGround=skimmedStructure=false; boostMix=0; lastWhoosh=lastCue=lastBoostCue=-Infinity;
  rewardAge=Infinity; particles.visible=false;
  camera.position.set(launch.x,launch.y+8,launch.z+27);
  el('crash-flash').classList.remove('active');
}
function reset() {resetFlight(); takeoff();}
function formatTime() {return `${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')}`;}
function finish(cause:'ground'|'structure') {
  ended=true;
  const sea=cause==='ground' && terrainHeight(position.x,position.z)<0;
  const title=sea?'海に着水 / You hit the water':cause==='ground'?'地面に衝突 / You hit the ground':'障害物に衝突 / You hit an obstacle';
  const tip=cause==='ground'?'高度が下がったら W / ↑ で機首上げ · Pitch up when low':'すき間の真ん中をねらおう · Aim for the middle of the gap';
  el('flight-overlay').innerHTML=`<section class="flight-card" aria-labelledby="result-title"><div class="eyebrow">FLIGHT REPORT · リザルト</div><h2 id="result-title">${title}</h2><p>${tip}</p><dl class="result-stats"><div><dt>SCORE / スコア</dt><dd>${score}</dd></div><div><dt>LANDMARKS / 名所</dt><dd>${found.size}/${landmarks.length}</dd></div><div><dt>FLIGHT TIME</dt><dd>${formatTime()}</dd></div></dl><button id="retry">R / Enter でリトライ · Retry</button></section>`;
  el('retry').onclick=reset; el('flight-overlay').hidden=false;
  el('crash-flash').classList.add('active');
  el('retry').focus();
}
el('flight-overlay').onclick=()=>{if(!started)takeoff();};
el('reset').onclick=reset; window.addEventListener('keydown',e=>{
  if(e.repeat)return;
  if(e.code==='Enter' && e.target===fullscreen)return;
  if(e.code==='KeyR')reset();
  if((e.code==='Enter' && (!started || ended)) || (e.code==='Space' && !started)) {e.preventDefault(); if(!started)takeoff(); else reset();}
  else if(e.code==='Enter' && parked) takeoff();
  if(e.code==='KeyC')center();
  if(e.code==='KeyG')showStunts=!showStunts;
  if(e.code==='KeyM') {audio.toggle(); flash(audio.muted?'Audio muted':'Audio on');}
});
const clock=new THREE.Clock(); let radarTimer=0;
const scoreDisplay=el('score'), speedDisplay=el('speed'), altDisplay=el('alt');
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
// Header and footer stay off screen during play; moving the mouse, touching the screen or pressing Tab brings them back for a moment.
let playing=false, peekTimer=0;
const placeBelowHeader=()=>document.body.style.setProperty('--header-height',`${el('app').querySelector('header')!.offsetHeight}px`);
function peek() {
  if(!document.body.classList.contains('peek')){document.body.classList.add('peek'); placeBelowHeader();}
  clearTimeout(peekTimer);
  peekTimer=window.setTimeout(()=>document.body.classList.remove('peek'),2500);
}
window.addEventListener('resize',()=>{if(document.body.classList.contains('peek'))placeBelowHeader();});
window.addEventListener('pointermove',peek); window.addEventListener('pointerdown',peek);
window.addEventListener('keydown',e=>{if(e.code==='Tab')peek();});
function animate() {
  requestAnimationFrame(animate);
  const frameTime=clock.getDelta();
  if (quality.sample(frameTime*1000) || devicePixelRatio!==viewDpr) resizeRenderer();
  const visualDt=Math.min(frameTime,.05), now=performance.now();
  const dt=now<hitstopUntil?0:visualDt;
  const key=keyboard.sample(), imu=device.sample(dt);
  const roll=THREE.MathUtils.clamp(key.roll+imu.roll,-1,1), climb=THREE.MathUtils.clamp(key.pitch+imu.pitch,-1,1);
  let flying=started && !ended && !parked;
  const boosting=flying && (key.boost||imu.boost);
  if(boosting && !wasBoosting) {audio.boost(); if(now-lastBoostCue>FEEL.deviceCueCooldownMs) {device.send({t:'sfx',s:'boost'});lastBoostCue=now;}}
  wasBoosting=boosting;
  if(flying) {
    elapsed+=dt; throttle=THREE.MathUtils.clamp(throttle+key.throttle*dt*.3,0,1);
    speed=THREE.MathUtils.damp(speed,minSpeed+throttle*speedRange+((key.boost||imu.boost)?28:0),2,dt);
    previous.copy(position);
    // Past the normal tilt range the plane keeps rotating while the input is held; the usual limits return when it is let go.
    const keyHold=key.hold!, deviceHold=imu.hold;
    heldAxis.roll=keyHold.roll||deviceHold?.roll||0; heldAxis.pitch=keyHold.pitch||deviceHold?.pitch||0;
    const flown=aero.step({heading,pitch,bank},{roll,climb,hold:heldAxis,speed,bankResponse:key.roll?FEEL.response.keyboardBank:FEEL.response.bank,pitchResponse:key.pitch?FEEL.response.keyboardPitch:FEEL.response.pitch},dt);
    ({heading,pitch,bank}=flown);
    if(aero.stalled && !stalledCue)flash(`失速！ ${STUNT.loop.minSpeed} m/s 必要`);
    stalledCue=aero.stalled;
    speed=Math.max(minSpeed*.6,speed-STUNT.gravity*steepness(pitch)*dt);
    heading+=Math.sin(bank)*turnFactor(pitch)*dt*FEEL.response.turn;
    forward.set(-Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch));
    position.addScaledVector(forward,speed*dt);
    position.y=Math.min(position.y,CEILING);
    // Far out over the sea the mist closes in and the flight carries on from the other side of the island.
    const back=wrap(position.x,position.z);
    if(back) {
      camera.position.x+=back.x-position.x; camera.position.z+=back.z-position.z;
      position.x=previous.x=back.x; position.z=previous.z=back.z;
    }
    const hit=touching(position,FEEL.clearance);
    if (hit) {finish(hit); flying=false;}
    else {
      // A trick scores only once its last frame has cleared the island.
      for(const kind of flown.tricks) {score+=trickPoints(kind); trickCounts[kind]++; flash(`${TRICK_NAMES[kind]} +${trickPoints(kind)}`);}
      landmarks.forEach(({id,gate},i) => {
        if(!armed[i]) armed[i]=Math.hypot(position.x-gate.x,position.z-gate.z)>FEEL.rearmDistance;
        else if(throughGate(gate,previous,position)) {armed[i]=false; found.add(id); score+=FEEL.flyThroughPoints; reward();}
      });
    }
  }
  const airspeed=parked?0:speed, view=heading+aero.view, stunting=aero.active({heading,pitch,bank});
  plane.position.copy(position); plane.rotation.set(pitch,heading,bank,'YXZ');
  updatePropeller(dt, flying && !reducedMotion.matches ? airspeed : 0);
  audio.update(airspeed,flying);
  boostMix=THREE.MathUtils.damp(boostMix,boosting?1:0,FEEL.camera.boostSmoothing,visualDt);
  lineMaterial.opacity=boostMix*FEEL.speedLines.opacity;
  speedLines.position.z=(now%200)/200*FEEL.speedLines.length;
  camera.fov=THREE.MathUtils.damp(camera.fov,fovFromSpeed(airspeed),FEEL.fov.smoothing,visualDt); camera.updateProjectionMatrix();
  if(particles.visible) {
    rewardAge+=visualDt;
    for(let i=0;i<FEEL.particleCount;i++) {
      const angle=i*2.39996,r=rewardAge*FEEL.particleSpeed*(.5+(i%4)/6);
      particlePositions.set([Math.cos(angle)*r,Math.sin(angle)*r*.7+i%3,Math.sin(i*1.7)*r],i*3);
    }
    particleGeometry.attributes.position.needsUpdate=true; particleMaterial.opacity=Math.max(0,1-rewardAge/FEEL.particleSeconds);
    if(rewardAge>FEEL.particleSeconds)particles.visible=false;
  }
  behind.set(0,8,27+boostMix*FEEL.camera.pullback).applyAxisAngle(up,view).add(position);
  lookTarget.set(-Math.sin(view)*35,2,-Math.cos(view)*35).add(position);
  camera.position.lerp(behind,1-Math.exp(-visualDt*(stunting?STUNT.cameraSmoothing:FEEL.camera.smoothing)));
  if(!reducedMotion.matches) {camera.position.x+=Math.sin(now*.047)*boostMix*FEEL.camera.shake; camera.position.y+=Math.cos(now*.063)*boostMix*FEEL.camera.shake;}
  camera.position.y=Math.max(camera.position.y,groundHeight(camera.position.x,camera.position.z)+2);
  camera.lookAt(lookTarget);
  island.update(visualDt,timeOfDay,mist(position.x,position.z),camera.position);
  if(playing!==(started && !ended))document.body.classList.toggle('play',playing=started && !ended);
  showText(scoreDisplay,String(score).padStart(4,'0'));
  showText(speedDisplay,airspeed.toFixed(0));
  showText(altDisplay,Math.max(0,position.y).toFixed(0));
  const opacity=flying && performance.now()<noticeUntil?'1':'0';
  if (notice.style.opacity!==opacity) notice.style.opacity=opacity;
  const height=position.y-groundHeight(position.x,position.z)-FEEL.clearance;
  // Warn only when the path ahead really ends in something, so a clean pass under a bridge stays quiet.
  const danger=flying && pathHits(position,forward,speed*FEEL.lookAheadSeconds,FEEL.clearance);
  const low=danger==='ground';
  if(flying && low && !wasLow && now-lastCue>FEEL.deviceCueCooldownMs) {device.send({t:'sfx',s:'pullup'}); lastCue=now;}
  wasLow=flying && low;
  const close=flying && nearStructure(position,FEEL.nearMiss.structure);
  const groundPass=skimmedGround && height>=FEEL.nearMiss.ground, structurePass=skimmedStructure && !close;
  if(flying && nearMiss(height,FEEL.nearMiss.ground))skimmedGround=true;
  if(!flying || groundPass)skimmedGround=false;
  skimmedStructure=close;
  if(flying && now-lastWhoosh>FEEL.nearMiss.cooldownMs && (groundPass || structurePass)) {audio.whoosh();lastWhoosh=now;}
  warning.hidden=!flying || !danger;
  showText(warning,low?'PULL UP':'OBSTACLE');
  radarTimer+=dt; if(radarTimer>=.1) {radarTimer=0;device.send({t:'radar',h:THREE.MathUtils.radToDeg(heading),range:FEEL.radarRange,o:landmarks.map(({gate})=>[Math.round(gate.x-position.x),Math.round(gate.z-position.z)]),score,speed:Math.round(airspeed),alt:Math.round(position.y)});}
  renderer.render(scene,camera);
}
resetFlight(); animate();
