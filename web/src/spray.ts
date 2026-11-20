import * as THREE from 'three';

export function sprayRate(skim:number) {
  return Number.isFinite(skim) ? 300*Math.max(0,Math.min(1,skim)) : 0;
}

export class SeaSpray {
  private readonly count=384;
  private readonly positions=new Float32Array(this.count*3);
  private readonly velocities=new Float32Array(this.count*3);
  private readonly ages=new Float32Array(this.count);
  private readonly lives=new Float32Array(this.count);
  private readonly sizes=new Float32Array(this.count);
  private readonly alphas=new Float32Array(this.count);
  private readonly strengths=new Float32Array(this.count);
  private readonly geometry=new THREE.BufferGeometry();
  private readonly material=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false,
    uniforms:{scale:{value:600}},
    vertexShader:`attribute float size; attribute float alpha;
      uniform float scale; varying float opacity;
      void main() {
        vec4 view=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=min(48.0,size*scale/max(1.0,-view.z));
        opacity=alpha;
      }`,
    fragmentShader:`varying float opacity;
      void main() {
        float radius=length(gl_PointCoord-0.5)*2.0;
        gl_FragColor=vec4(0.94,0.98,1.0,opacity*(1.0-smoothstep(0.25,1.0,radius)));
      }`
  });
  readonly points=new THREE.Points(this.geometry,this.material);
  private cursor=0;
  private pending=0;

  constructor(scene:THREE.Scene) {
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size',new THREE.BufferAttribute(this.sizes,1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha',new THREE.BufferAttribute(this.alphas,1).setUsage(THREE.DynamicDrawUsage));
    this.points.frustumCulled=false;
    scene.add(this.points);
  }

  reset() {
    this.lives.fill(0); this.alphas.fill(0); this.pending=0; this.cursor=0;
    this.geometry.attributes.alpha.needsUpdate=true;
  }

  update(dt:number,skim:number,position:THREE.Vector3,forward:THREE.Vector3,speed:number,pixelHeight:number) {
    const strength=sprayRate(skim)/300;
    this.material.uniforms.scale.value=pixelHeight;
    for(let i=0;i<this.count;i++) {
      if(this.lives[i]===0)continue;
      this.ages[i]+=dt;
      const j=i*3;
      this.velocities[j+1]-=12*dt;
      for(let axis=0;axis<3;axis++)this.positions[j+axis]+=this.velocities[j+axis]*dt;
      if(this.ages[i]>=this.lives[i] || this.positions[j+1]<0) {
        this.lives[i]=0; this.alphas[i]=0;
      } else {
        this.alphas[i]=(.35+.5*this.strengths[i])*Math.pow(1-this.ages[i]/this.lives[i],.7);
      }
    }
    if(strength===0)this.pending=0;
    else this.pending+=sprayRate(skim)*dt;
    while(this.pending>=1) {
      this.pending--;
      const i=this.cursor, j=i*3;
      this.cursor=(i+1)%this.count;
      const side=(Math.random()-.5)*2, back=3+Math.random()*speed*dt;
      this.positions[j]=position.x-forward.x*back+forward.z*side*1.8;
      this.positions[j+1]=.15;
      this.positions[j+2]=position.z-forward.z*back-forward.x*side*1.8;
      const kick=3+strength*7, spread=side*(2+strength*5);
      this.velocities[j]=-forward.x*kick+forward.z*spread;
      this.velocities[j+1]=(3+strength*6)*(.65+Math.random()*.5);
      this.velocities[j+2]=-forward.z*kick-forward.x*spread;
      this.ages[i]=0; this.lives[i]=.6+Math.random()*.5;
      this.strengths[i]=strength; this.sizes[i]=(.35+strength*.65)*(.6+Math.random()*.8);
      this.alphas[i]=.35+.5*strength;
    }
    this.geometry.attributes.position.needsUpdate=true;
    this.geometry.attributes.size.needsUpdate=true;
    this.geometry.attributes.alpha.needsUpdate=true;
  }
}
