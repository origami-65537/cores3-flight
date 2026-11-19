(() => {
  const encoder = new TextEncoder();
  const sim = window.coreS3Sim = { roll: 17, pitch: -12, buttons: 0, paused: false, radar: [] };
  const wrap = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;
  Object.defineProperty(navigator, 'serial', {
    configurable: true,
    value: { async requestPort() {
      let stream, timer;
      return {
        get readable() { return stream; },
        writable: new WritableStream({ write(bytes) {
          sim.radar.push({ at: performance.now(), ...JSON.parse(new TextDecoder().decode(bytes)) });
          if (sim.radar.length > 120) sim.radar.shift();
        } }),
        async open({ baudRate }) {
          if (baudRate !== 115200) throw new Error('Expected CoreS3 baud rate');
          stream = new ReadableStream({ start(controller) {
            const boot = performance.now();
            timer = setInterval(() => {
              const t = (performance.now() - boot) / 1000;
              if (t < .3 || sim.paused) return;
              const r = +wrap(sim.roll + .55 * Math.sin(t * 23) + .6 * Math.sin(t * .7)).toFixed(2);
              const p = +(sim.pitch + .45 * Math.cos(t * 19) + .5 * Math.sin(t * .63)).toFixed(2);
              controller.enqueue(encoder.encode(JSON.stringify({ t: 'imu', r, p, y: t * .4, b: sim.buttons }) + '\n'));
            }, 20);
          }, cancel() { clearInterval(timer); } });
        },
        async close() { clearInterval(timer); },
      };
    } },
  });
})();
