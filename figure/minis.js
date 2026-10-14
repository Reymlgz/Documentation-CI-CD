// Close-ups for each article section: a pruned copy of the line framed on one station, looping the
// stretch of a run where that station works. Same model, same drawing; only the camera window differs.
{
  const STAGE_TEXT = { commit: "commit", build: "build", test: "test", package: "package", staging: "staging", production: "deploy", monitor: "monitor", rollback: "rollback", failed: "failed", done: "done" };
  const HOLD = 1.4;

  function mount(host) {
    const spec = D.MINIS[host.dataset.mini];
    const [vx, vy, vw, vh] = spec.view;
    const copy = pristine.cloneNode(true);
    copy.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
    copy.removeAttribute("width");
    copy.removeAttribute("height");
    copy.removeAttribute("aria-label");
    copy.setAttribute("aria-hidden", "true");
    host.appendChild(copy);
    // drop static pieces that sit wholly outside this window, so each copy stays light
    const m = 12;
    for (const el of [...copy.children]) {
      if (el.matches("[data-slot],[data-part],defs,title") || el.querySelector("[data-slot],[data-part],[data-stack]")) continue;
      let b;
      try { b = el.getBBox(); } catch { continue; }
      if (b.x > vx + vw + m || b.x + b.width < vx - m || b.y > vy + vh + m || b.y + b.height < vy - m) el.remove();
    }
    const view = makeView(copy);
    const card = host.closest(".iso-plate");
    const readout = card.querySelector("[data-readout]");
    // every clip starts from the same opening state, so a loop never carries anything over
    const clips = spec.clips.map(([kind, t0, t1]) => ({ run: planRun(initialWorld(), kind), t0, t1 }));
    const state = { host, view, readout, clips, index: 0, t: clips[0].t0, hold: 0, visible: false, frame: 0, last: 0 };
    const paint = () => {
      const c = state.clips[state.index];
      const t = Math.min(state.t, c.t1);
      const p = poseAt(c.run, t);
      view.draw(p, t, true);
      const word = STAGE_TEXT[p.stage] ?? p.stage;
      const text = `${word} · ${p.note}`;
      if (readout.textContent !== text) readout.textContent = text;
    };
    const tick = (now) => {
      const dt = (state.last ? Math.min((now - state.last) / 1000, 1 / 30) : 1 / 60) * (window.__cdSpeed ?? 1);
      state.last = now;
      const c = state.clips[state.index];
      if (state.t < c.t1) state.t += dt;
      else if ((state.hold += dt) > HOLD) {
        state.hold = 0;
        state.index = (state.index + 1) % state.clips.length;
        state.t = state.clips[state.index].t0;
      }
      paint();
      state.frame = state.visible ? requestAnimationFrame(tick) : 0;
    };
    if (still.matches) {
      // reduced motion: one telling still, the moment the station is at work
      const c = clips[clips.length - 1];
      state.index = clips.length - 1;
      state.t = c.t0 + (c.t1 - c.t0) * 0.55;
      paint();
      return;
    }
    paint();
    new IntersectionObserver((entries) => {
      state.visible = entries[entries.length - 1].isIntersecting;
      if (state.visible && !state.frame) { state.last = 0; state.frame = requestAnimationFrame(tick); }
    }, { rootMargin: "80px 0px" }).observe(host);
  }

  // mount lazily: a copy is only built when its section comes near the screen
  const lazy = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); mount(e.target); }
  }, { rootMargin: "600px 0px" });
  document.querySelectorAll("[data-mini]").forEach((host) => lazy.observe(host));
}
