(() => {
  const encoder = new TextEncoder();
  const sim = window.coreS3Sim = { topEdgeUp: 17, rightEdgeDown: -12, buttons: 0, paused: false, legacyFirmware: false, radar: [],
    // Tilts 60 degrees past the centred pose for a while: 'rollLeft', 'rollRight', 'pull' or 'push'.
    hold(gesture, ms = 1300) {
      sim.active = { at: performance.now(), ms, roll: gesture.startsWith('roll'), sign: gesture === 'rollLeft' || gesture === 'push' ? -1 : 1 };
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
              const hold = sim.active && now - sim.active.at < sim.active.ms + 150 ? sim.active : null;
              // The hand takes 150 ms to get there and 150 ms to come back.
              const swing = hold ? 60 * hold.sign * Math.max(0, Math.min(1, (now - hold.at) / 150, (hold.at + hold.ms + 150 - now) / 150)) : 0;
              const rUnwrapped = sim.topEdgeUp + (hold && !hold.roll ? swing : 0) + .55 * Math.sin(t * 23) + .6 * Math.sin(t * .7);
              const r = +wrap(rUnwrapped).toFixed(2);
              const p = +Math.max(-90, Math.min(90, sim.rightEdgeDown + (hold && hold.roll ? swing : 0) + .45 * Math.cos(t * 19) + .5 * Math.sin(t * .63))).toFixed(2);
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
