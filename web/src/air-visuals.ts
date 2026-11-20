import * as THREE from 'three';
import { coastEffect, updraft, wind } from './air';
import { groundHeight, type Point } from './world';

export function tracerStyle(lift:number, distance:number) {
  const warmth = Math.max(0,Math.min(1,lift/15));
  const fade = Math.max(0,Math.min(1,(250-distance)/65));
  const nearby = Math.max(0,1-distance/120);
  return { warmth, brightness:(.5+.35*warmth+.15*nearby)*fade, trail:.95-.35*warmth };
}

export function recycleTracer(p:Point, center:Point, forward:Point) {
  const x=p.x-center.x, y=p.y-center.y, z=p.z-center.z;
  return Math.abs(x)>250 || Math.abs(y)>250 || Math.abs(z)>250 || x*forward.x+y*forward.y+z*forward.z < -100;
}

export class AirVisuals {
  private readonly count = 1600;
  private readonly positions = new Float32Array(this.count*6);
  private readonly colors = new Float32Array(this.count*8);
  private readonly velocity = new Float32Array(this.count*3);
  private readonly motes = Array.from({length:this.count},() => new THREE.Vector3(Infinity,0,0));
  private readonly ground = new Float32Array(this.count);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly lines:THREE.LineSegments;
  private readonly cushionPositions = new Float32Array(256*6);
  private readonly cushionGeometry = new THREE.BufferGeometry();
  private readonly cushion:THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>;
  private frame = 0;
  constructor(private readonly scene:THREE.Scene) {
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,4).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(this.geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}));
    this.lines.frustumCulled=false; scene.add(this.lines);
    this.cushionGeometry.setAttribute('position',new THREE.BufferAttribute(this.cushionPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.cushion = new THREE.LineSegments(this.cushionGeometry,new THREE.LineBasicMaterial({color:0xb2fff0,transparent:true,opacity:0,depthWrite:false}));
    this.cushion.frustumCulled=false; scene.add(this.cushion);
  }

  update(dt:number, time:number, center:Point, forward:Point, quality:number, enabled:boolean) {
    this.lines.visible=this.cushion.visible=enabled;
    if (!enabled) return;
    const count=Math.floor(this.count*quality*quality);
    this.geometry.setDrawRange(0,count*2);
    for(let i=0;i<count;i++) {
      const p=this.motes[i], j=i*3, k=i*6;
      const recycled=recycleTracer(p,center,forward);
      if(recycled) {
        const span=i%2?500:220;
        p.set(center.x+(Math.random()-.5)*span,Math.max(2,center.y+(Math.random()-.5)*span),center.z+(Math.random()-.5)*span);
      }
      if(recycled || i%12===this.frame%12) {
        const breeze=wind(p,time);
        this.velocity.set([breeze.x,updraft(p),breeze.z],j);
        this.ground[i]=groundHeight(p.x,p.z)+1;
      }
      p.x+=this.velocity[j]*dt; p.y+=this.velocity[j+1]*dt; p.z+=this.velocity[j+2]*dt;
      const style=tracerStyle(this.velocity[j+1],Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z));
      const light=p.y>this.ground[i]?style.brightness:0;
      this.positions.set([p.x,p.y,p.z,p.x-this.velocity[j]*style.trail,p.y-this.velocity[j+1]*style.trail,p.z-this.velocity[j+2]*style.trail],k);
      const green=1-.4*style.warmth, blue=1-.8*style.warmth;
      this.colors.set([1,green,blue,light,1,green,blue,0],i*8);
    }
    this.geometry.attributes.position.needsUpdate=true; this.geometry.attributes.color.needsUpdate=true;
    const coast=coastEffect(center);
    this.cushion.visible=coast>0;
    if(coast>0) {
      this.cushion.material.opacity=.65*coast;
      const sideX=-forward.z, sideZ=forward.x;
      for(let i=0;i<256;i++) {
        const back=-18+(i*.618+time*1.8)%1*40, side=Math.sin(i*127.1)*(7+(back+18)*.14);
        const x=center.x-forward.x*back+sideX*side, z=center.z-forward.z*back+sideZ*side;
        const y=groundHeight(x,z)+.5+(i%5)*.12;
        this.cushionPositions.set([x,y,z,x-forward.x*(3+coast*6),y,z-forward.z*(3+coast*6)],i*6);
      }
      this.cushionGeometry.attributes.position.needsUpdate=true;
    }
    const clouds=this.scene.getObjectByName('clouds');
    if(clouds) {
      const breeze=wind({x:0,y:500,z:0},time);
      clouds.position.x+=breeze.x*dt; clouds.position.z+=breeze.z*dt;
      if(Math.hypot(clouds.position.x,clouds.position.z)>4000) clouds.position.set(0,0,0);
    }
    this.frame++;
  }
}
