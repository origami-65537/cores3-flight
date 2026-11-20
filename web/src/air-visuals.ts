import * as THREE from 'three';
import { coastEffect, updraft, wind } from './air';
import { groundHeight, type Point } from './world';

export function tracerStyle(lift:number, distance:number) {
  const warmth = Math.max(0,Math.min(1,lift/15));
  const fade = Math.max(0,Math.min(1,(250-distance)/65));
  return { warmth, brightness:(.22+.6*warmth)*fade, trail:.35+.3*warmth };
}

export function recycleTracer(p:Point, center:Point, forward:Point) {
  const x=p.x-center.x, y=p.y-center.y, z=p.z-center.z;
  return Math.abs(x)>250 || Math.abs(y)>250 || Math.abs(z)>250 || x*forward.x+y*forward.y+z*forward.z < -100;
}

export class AirVisuals {
  private readonly count = 1600;
  private readonly positions = new Float32Array(this.count*6);
  private readonly colors = new Float32Array(this.count*6);
  private readonly velocity = new Float32Array(this.count*3);
  private readonly motes = Array.from({length:this.count},() => new THREE.Vector3(Infinity,0,0));
  private readonly ground = new Float32Array(this.count);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly lines:THREE.LineSegments;
  private readonly cushionPositions = new Float32Array(96*6);
  private readonly cushionGeometry = new THREE.BufferGeometry();
  private readonly cushion:THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>;
  private frame = 0;
  constructor(private readonly scene:THREE.Scene) {
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(this.geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.lines.frustumCulled=false; scene.add(this.lines);
    this.cushionGeometry.setAttribute('position',new THREE.BufferAttribute(this.cushionPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.cushion = new THREE.LineSegments(this.cushionGeometry,new THREE.LineBasicMaterial({color:0xe6d9ad,transparent:true,opacity:0,depthWrite:false}));
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
      if(recycled) p.set(center.x+(Math.random()-.5)*500,Math.max(2,center.y+(Math.random()-.5)*500),center.z+(Math.random()-.5)*500);
      if(recycled || i%12===this.frame%12) {
        const breeze=wind(p,time);
        this.velocity.set([breeze.x,updraft(p),breeze.z],j);
        this.ground[i]=groundHeight(p.x,p.z)+1;
      }
      p.x+=this.velocity[j]*dt; p.y+=this.velocity[j+1]*dt; p.z+=this.velocity[j+2]*dt;
      const style=tracerStyle(this.velocity[j+1],Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z));
      const light=p.y>this.ground[i]?style.brightness:0;
      this.positions.set([p.x,p.y,p.z,p.x-this.velocity[j]*style.trail,p.y-this.velocity[j+1]*style.trail,p.z-this.velocity[j+2]*style.trail],k);
      this.colors.set([light,light*(1-.18*style.warmth),light*(1-.48*style.warmth),light*.3,light*.3,light*.28],k);
    }
    this.geometry.attributes.position.needsUpdate=true; this.geometry.attributes.color.needsUpdate=true;
    const coast=coastEffect(center);
    this.cushion.visible=coast>0;
    if(coast>0) {
      this.cushion.material.opacity=.32*coast;
      const sideX=-forward.z, sideZ=forward.x;
      for(let i=0;i<96;i++) {
        const back=(i*.618+time*1.8)%1*55, side=Math.sin(i*127.1)*(3+back*.19);
        const x=center.x-forward.x*back+sideX*side, z=center.z-forward.z*back+sideZ*side;
        const y=groundHeight(x,z)+.5+(i%5)*.19;
        this.cushionPositions.set([x,y,z,x-forward.x*(2+coast*5),y,z-forward.z*(2+coast*5)],i*6);
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
