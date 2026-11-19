(() => {
  const encoder = new TextEncoder();
  const sim = window.coreS3Sim = { topEdgeUp: 17, rightEdgeDown: -12, buttons: 0, paused: false, legacyFirmware: false, radar: [],
    flick(gesture) {
      const sign = gesture === 'twistLeft' || gesture === 'push' ? -1 : 1;
      sim.active = { at: performance.now(), twist: gesture.startsWith('twist'), sign };
    } };
  const wrap = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;
  Object.defineProperty(navigator, 'serial', {
    configurable: true,
    value: { async requestPort() {
      let stream, timer, last;
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
              const now = performance.now();
              const flick = sim.active && now - sim.active.at < 700 ? sim.active : null;
              const k = flick ? (now - flick.at) / 140 : 0;
              // A flick swings 55 degrees in 140 ms; a twist snaps back, a pull or push holds for the rest of 700 ms.
              const swing = !flick ? 0 : k < 1 ? k * k * (3 - 2 * k) : flick.twist ? Math.max(0, 1 - (k - 1) * (k - 1) * (5 - 2 * k)) * (k < 2) : 1;
              const rUnwrapped = sim.topEdgeUp + (flick && !flick.twist ? flick.sign * 55 * swing : 0) + .55 * Math.sin(t * 23) + .6 * Math.sin(t * .7);
              const r = +wrap(rUnwrapped).toFixed(2);
              const p = +Math.max(-90, Math.min(90, sim.rightEdgeDown + (flick && flick.twist ? flick.sign * 55 * swing : 0) + .45 * Math.cos(t * 19) + .5 * Math.sin(t * .63))).toFixed(2);
              const dt = last ? Math.max(.005, (now - last.at) / 1000) : .02;
              const gx = last ? +((rUnwrapped - last.r) / dt).toFixed(1) : 0, gy = last ? +((p - last.p) / dt).toFixed(1) : 0;
              last = { at: now, r: rUnwrapped, p };
              const frame = { t: 'imu', r, p, y: +(t * .4).toFixed(2), b: sim.buttons };
              controller.enqueue(encoder.encode(JSON.stringify(sim.legacyFirmware ? frame : { ...frame, gx, gy, gz: .4 }) + '\n'));
            }, 20);
          }, cancel() { clearInterval(timer); } });
        },
        async close() { clearInterval(timer); },
      };
    } },
  });
})();
