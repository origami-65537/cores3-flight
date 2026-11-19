const maxRenderPixels = 2560 * 1440;
const scales = [1,.85,.7,.55];

export class RenderQuality {
  private level = 0;
  private duration = 0;
  private frames = 0;
  private fastWindows = 0;

  pixelRatio(width:number,height:number,dpr:number) {
    return Math.min(dpr,2,Math.sqrt(maxRenderPixels/(width*height))) * scales[this.level];
  }

  resetSample() {
    this.duration = this.frames = this.fastWindows = 0;
  }

  sample(frameMs:number) {
    if (frameMs > 250) {
      this.resetSample();
      return false;
    }
    this.duration += frameMs;
    this.frames++;
    if (this.duration < 700) return false;
    const mean = this.duration / this.frames;
    this.duration = this.frames = 0;
    this.fastWindows = mean < 18 ? this.fastWindows + 1 : 0;
    if (mean > 26 && this.level < scales.length - 1) {
      this.level++;
      return true;
    }
    if (this.fastWindows >= 10 && this.level > 0) {
      this.level--;
      this.fastWindows = 0;
      return true;
    }
    return false;
  }
}
