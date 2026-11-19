import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { RenderQuality } from './render-quality';

test('preserves native 1080p, caps fullscreen pixels and recalculates for resize and DPR changes', () => {
  const quality = new RenderQuality();
  a.equal(quality.pixelRatio(1920,1080,1),1);
  a.equal(quality.pixelRatio(1920,1080,2),4/3);
  a.equal(quality.pixelRatio(960,540,2),2);
  a.equal(quality.pixelRatio(960,540,1.25),1.25);
});

test('scales sustained slow rendering down and restores quality only after sustained fast rendering', () => {
  const quality = new RenderQuality();
  const sample = (frames:number,ms:number) => {
    for (let i=0;i<frames;i++) quality.sample(ms);
    return quality.pixelRatio(1920,1080,1);
  };
  a.equal(sample(10,35),1);
  a.equal(sample(10,35),.85);
  a.equal(sample(100,35),.55);
  a.equal(sample(100,21),.55);
  a.equal(sample(200,17),.55);
  a.equal(sample(240,17),.7);
});

test('resize and tab stalls discard partial frame samples', () => {
  const quality = new RenderQuality();
  for (let i=0;i<19;i++) a.equal(quality.sample(35),false);
  quality.resetSample();
  for (let i=0;i<19;i++) a.equal(quality.sample(35),false);
  a.equal(quality.sample(400),false);
  a.equal(quality.sample(35),false);
  a.equal(quality.pixelRatio(1920,1080,1),1);
});
