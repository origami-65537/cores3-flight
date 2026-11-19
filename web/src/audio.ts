import { FEEL, chimePitch } from './feel';

export class FlightAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private wind?: GainNode;
  private filter?: BiquadFilterNode;
  private noise?: AudioBuffer;
  muted=false;
  start() {
    try {
      if (!this.context) {
        const ctx=this.context=new AudioContext();
        this.master=ctx.createGain(); this.master.connect(ctx.destination);
        this.master.gain.value=this.muted?0:1;
        const buffer=this.noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
        const data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
        const source=ctx.createBufferSource(); source.buffer=buffer; source.loop=true;
        this.filter=ctx.createBiquadFilter(); this.filter.type='lowpass';
        this.wind=ctx.createGain(); this.wind.gain.value=0;
        source.connect(this.filter).connect(this.wind).connect(this.master); source.start();
      }
      void this.context.resume().catch(()=>{});
    } catch { /* Audio is optional when unavailable. */ }
  }
  toggle() {
    this.muted=!this.muted;
    this.master?.gain.setTargetAtTime(this.muted?0:1,this.context!.currentTime,.02);
  }
  update(speed:number,flying:boolean) {
    if(!this.context || !this.wind || !this.filter)return;
    const t=this.context.currentTime, ratio=Math.max(0,Math.min(1,speed/FEEL.fov.maxSpeed));
    this.wind.gain.setTargetAtTime(flying?FEEL.audio.wind*ratio:0,t,FEEL.audio.smoothing);
    this.filter.frequency.setTargetAtTime(350+ratio*2200,t,FEEL.audio.smoothing);
  }
  chime(streak:number) {this.tone(chimePitch(streak),FEEL.audio.chime,.22);}
  boost() {this.tone(130,FEEL.audio.boost,.3,480);}
  whoosh() {
    if(!this.context || !this.noise || !this.master)return;
    const ctx=this.context, source=ctx.createBufferSource(), gain=ctx.createGain(), filter=ctx.createBiquadFilter();
    source.buffer=this.noise; filter.type='bandpass'; filter.frequency.value=900;
    gain.gain.setValueAtTime(.001,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(FEEL.audio.whoosh,ctx.currentTime+.08);
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.35);
    source.connect(filter).connect(gain).connect(this.master); source.start(); source.stop(ctx.currentTime+.36);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  private tone(frequency:number,level:number,duration:number,end=frequency) {
    if(!this.context || !this.master)return;
    const ctx=this.context, oscillator=ctx.createOscillator(), gain=ctx.createGain();
    oscillator.frequency.setValueAtTime(frequency,ctx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(end,ctx.currentTime+duration);
    gain.gain.setValueAtTime(level,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);
    oscillator.connect(gain).connect(this.master); oscillator.start(); oscillator.stop(ctx.currentTime+duration);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
}
