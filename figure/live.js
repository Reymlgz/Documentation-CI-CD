// Live code for the production line. Runs after the kit (global functions) and the model (inlined).
// DATA comes from the build: projection, layout constants and the strings for pooled parts.
const D = DATA;
const P = D.P;
const stage = document.querySelector(".cd-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const live = document.querySelector("[data-live]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const pristine = svg.cloneNode(true);
const tpl = document.createElement("template");
const make = (html) => { tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`; return tpl.content.firstChild.firstChild; };

// A view is one drawing of the line that a pose can be drawn into. The big figure is one; each section's close-up is another.
function makeView(svg) {
const slots = Object.fromEntries([...svg.querySelectorAll("[data-slot]")].map((g) => [g.dataset.slot, g]));
const parts = Object.fromEntries([...svg.querySelectorAll("[data-part]")].map((g) => [g.dataset.part, g]));
const part = make(D.pool.part);
const shapes = Object.fromEntries([...part.querySelectorAll("[data-shape]")].map((g) => [g.dataset.shape, g]));
const crates = D.pool.crates.map((html) => make(html));
const crateBits = crates.map((g) => ({ inner: g.querySelector("[data-inner]"), bad: g.querySelector("[data-bad]"), tag: g.querySelector("[data-tag]"), label: g.querySelector("[data-label]") }));
const stackEls = [...svg.querySelectorAll("[data-stack]")];
const lamps = Object.fromEntries([...svg.querySelectorAll("[data-lamp]")].map((p) => [p.dataset.lamp, p]));
const bayLamps = Object.fromEntries([...svg.querySelectorAll("[data-bay-lamp]")].map((p) => [p.dataset.bayLamp, p]));
const beacon = svg.querySelector('[data-lamp-beacon="staging"]');

const place = (el, slotName) => { const s = slots[slotName]; if (el.parentNode !== s) s.appendChild(el); };
const move = (el, p) => { const v = translateAlong(P, p); if (el.getAttribute("transform") !== v) el.setAttribute("transform", v); };
const show = (el, on) => { const v = on ? "" : "none"; if (el.style.display !== v) el.style.display = v; };
const setD = (el, d) => { if (el.getAttribute("d") !== d) el.setAttribute("d", d); };
const setState = (el, s) => { if (el && el.dataset.state !== s) el.dataset.state = s; };

// the station each crate sits at, and when it counts as resting there rather than in the air
const SUPPORTS = [["pkg", L.PKG, L.PKG_TOP], ["staging", L.STAGING, L.STAGING_TOP], ["A", L.BAY.A, L.PROD_TOP], ["B", L.BAY.B, L.PROD_TOP], ["bin", L.BIN, L.BIN_TOP - 54]];
function crateSlot(c) {
  if (Math.abs(c.x - L.PKG) < 2 && c.y < -3) return "disp";
  let best = null, gap = 1e9;
  for (const s of SUPPORTS) { const g = Math.abs(c.x - s[1]); if (g < gap) { gap = g; best = s; } }
  if (gap < 2 && c.z < (best[0] === "bin" ? L.BIN_TOP + 4 : best[2] + L.CRATE.h + 2)) return best[0];
  return "air";
}

function cleats(phase) {
  const out = [];
  const gap = 10;
  const start = L.BELT[0] + 1 + (((phase % gap) + gap) % gap);
  for (let x = start; x < L.BELT[1] - 0.5; x += gap) out.push(lineOnTop([x, -9.5], [x, 9.5], L.BT, P));
  return out.join("");
}
function needle(dial, angle) {
  const { x, y, top, r } = dial;
  return lineOnTop([x - Math.sin(angle) * 2.4, y + Math.cos(angle) * 2.4], [x + Math.sin(angle) * r, y - Math.cos(angle) * r], top + 0.2, P);
}
function lever(value) {
  const { x, y, z, len, swing } = D.LEVER;
  const a = (value * swing * Math.PI) / 180;
  const tip = [x + Math.sin(a) * len, y + 2.2, z + Math.cos(a) * len];
  return { d: segment([x, y + 2.2, z], tip, P), tip: iso(tip, P) };
}
const kickerRod = (padY) => solidSvg(slabOf({ x: -1.2, y: D.KICK.gland + 3, w: 2.4, d: padY - 1.5 - (D.KICK.gland + 3), r: 0.5 }, D.KICK.z - 1.2, 2.4, P, 2), { tone: "hi", crease: "none", lit: true });

// ---------------------------------------------------------------- draw one pose
let lastRod = null;
function draw(p, t, active) {
  // part on the line
  const inCrate = p.partSlot === "crate";
  show(part, p.partVis > 0 && !inCrate);
  for (const [name, g] of Object.entries(shapes)) show(g, p.partShape === name);
  if (!inCrate) { place(part, p.partSlot === "mag" ? "mag" : p.partSlot === "front" ? "front" : "belt"); move(part, [p.partX, p.partY, p.partZ]); }
  // magazine stack: level 0 is hidden while the moving part stands in its place or the stack is falling
  stackEls.forEach((g, i) => {
    if (i === 0) show(g, p.stack0 > 0 && p.stack === 0);
    move(g, [L.MAG, 0, L.BT + (i + p.stack) * L.PART.body]);
  });
  move(parts.gate, [0, 0, p.gate * 17]);
  setD(parts.cleats, cleats(p.belt));
  move(parts.ram, [L.PRESS, 0, -p.ram * D.RAM_STROKE]);
  // the probe stops on the part: its travel ends at the part's real height
  const height = p.partShape === "bad" ? D.PHYS.nominal + L.PART.burr : D.PHYS.nominal;
  move(parts.probe, [L.GAUGE, 0, D.PROBE_REST - p.probe * (D.PROBE_REST - (L.BT + height))]);
  setD(parts.gaugeNeedle, needle(D.DIALS.gauge, (p.dial / 2) * 2 * Math.PI));
  const padY = D.KICK_REST + p.kicker * D.KICK_TRAVEL;
  move(parts.kickerPad, [L.KICK, padY, 0]);
  const rodKey = padY.toFixed(2);
  if (rodKey !== lastRod) { parts.kickerRod.innerHTML = kickerRod(padY); lastRod = rodKey; }
  move(parts.labeler, [-p.labeler * D.LAB_TRAVEL, 0, 0]);
  // crates
  p.crates.forEach((c, i) => {
    const g = crates[i];
    place(g, crateSlot(c));
    move(g, [c.x, c.y, c.z]);
    const bits = crateBits[i];
    show(bits.bad, false);
    const holding = inCrate && c.x === L.PKG && Math.abs(c.y) < 0.01 && c.z === L.PKG_TOP && !c.filled;
    show(bits.inner, c.filled > 0 || holding);
    if (holding) bits.inner.setAttribute("transform", translateAlong(P, [p.partX - L.PKG, 0, p.partZ - L.PKG_TOP]));
    else bits.inner.removeAttribute("transform");
    show(bits.tag, !!c.label);
    if (bits.label.textContent !== c.label) bits.label.textContent = c.label;
  });
  // crane
  move(parts.trolley, [p.craneX, 0, 0]);
  move(parts.trolleyBack, [p.craneX, 0, 0]);
  move(parts.trolleyFront, [p.craneX, 0, 0]);
  move(parts.hook, [p.craneX, 0, p.craneZ]);
  setD(parts.cable, segment([p.craneX, 0, p.craneZ + D.HOOK_Z + 8], [p.craneX, 0, D.TROLLEY_Z - 4], P));
  // router lever and monitor
  const lv = lever(p.lever);
  setD(parts.lever, lv.d);
  parts.leverKnob.setAttribute("cx", lv.tip[0].toFixed(1));
  parts.leverKnob.setAttribute("cy", lv.tip[1].toFixed(1));
  const wobble = still.matches ? 0 : Math.sin(t * 2.3) * 0.04 + Math.sin(t * 5.1) * 0.03;
  const errs = Math.max(0, p.monitor + wobble);
  setD(parts.monNeedle, needle(D.DIALS.monitor, -D.MON_SPAN / 2 + (Math.min(errs, D.MON_MAX) / D.MON_MAX) * D.MON_SPAN));
  // lamps
  for (const [name, el] of Object.entries(lamps)) setState(el, p.lamps[name]);
  const liveBay = p.lever < 0 ? "A" : "B";
  setState(bayLamps.A, liveBay === "A" ? "ok" : "off");
  setState(bayLamps.B, liveBay === "B" ? "ok" : "off");
  setState(beacon, p.lamps.staging);
  p.errs = errs;
  // one lit accent: the part while it is loose on the line, then the crate the crane is carrying
  const heldIndex = p.crates.findIndex((c) => c.held > 0);
  const watch = p.partVis > 0 && !inCrate && active ? part : heldIndex >= 0 ? crates[heldIndex] : null;
  if (watch !== watched) { if (watched) delete watched.dataset.watch; if (watch) watch.dataset.watch = ""; watched = watch; }
}
let watched = null;
return { draw, svg };
}
const main = makeView(svg);
const draw = (p, t) => main.draw(p, t, !!run);

// ---------------------------------------------------------------- runs, tour and controls
let world = initialWorld();
let run = null, clock = 0, pose = restPose(world);
let touring = !still.matches, tourIndex = 0, idleUntil = 1.4;
const TOUR = ["good", "bad", "regress", "good"];
const buttons = [...document.querySelectorAll("[data-run]")];
const KIND_TEXT = { good: "a good commit", bad: "a commit that breaks a test", regress: "a commit with a hidden regression" };

let queued = null;
function start(kind, byHand) {
  if (byHand) { touring = false; paused = false; }
  if (run) {
    // a push while the line is busy waits its turn, like a CI queue
    if (byHand) { queued = kind; announce(`Queued: ${KIND_TEXT[kind]}. It starts when run ${run.run} finishes.`); kick(); }
    return false;
  }
  run = planRun(world, kind);
  clock = 0;
  stage.dataset.running = "";
  announce(`Run ${run.run} started: ${KIND_TEXT[kind]}, ${run.hash}.`);
  kick();
  return true;
}
function end() {
  world = finishRun(world, run);
  const done = run;
  run = null;
  pose = restPose(world);
  // keep the lamps showing the last result until the next run starts
  pose.lamps = Object.fromEntries(Object.entries(done.lamps).map(([k, keys]) => [k, sample(keys, done.duration)]));
  pose.note = sample(done.tracks.note, done.duration);
  pose.stage = sample(done.tracks.stage, done.duration);
  delete stage.dataset.running;
  announce(done.pass ? (done.rolledBack ? `Run ${done.run}: ${done.version} rolled back. ${world.lastLive} is live.` : `Run ${done.run}: ${done.version} is live.`) : `Run ${done.run}: tests failed. ${world.lastLive} stays live.`);
  idleUntil = clock + 2.6;
  if (queued) { const next = queued; queued = null; start(next, false); }
}
const STAGE_WORD = { commit: "commit", build: "build", test: "test", package: "package", staging: "staging", production: "deploy", monitor: "monitor", rollback: "rollback", failed: "failed", done: "done", idle: "idle" };
function say(p, t) {
  const head = run ? `run #${run.run} · ${STAGE_WORD[p.stage]} · ${t.toFixed(1)} s` : `idle · ${world.lastLive} live`;
  const tail = run && (p.stage === "monitor" || p.stage === "rollback") ? ` · errors ${(p.errs ?? p.monitor).toFixed(1)}%` : "";
  const text = `${head}${tail}`;
  if (readout.textContent !== text) readout.textContent = text;
  const note = document.querySelector("[data-note]");
  const noteText = queued ? `${p.note} · next: ${KIND_TEXT[queued]}` : p.note;
  if (note && note.textContent !== noteText) note.textContent = noteText;
  const st = run ? p.stage : "idle";
  if (stage.dataset.stage !== st) { stage.dataset.stage = st; document.dispatchEvent(new CustomEvent("cd-stage", { detail: st })); }
}
let announceTimer = 0;
function announce(text) { clearTimeout(announceTimer); announceTimer = setTimeout(() => { if (live) live.textContent = text; }, 50); }

let frame = 0, last = 0, visible = false, idleClock = 0;
const speedOf = () => (window.__cdSpeed ?? 1);
function tick(now) {
  if (paused) { frame = 0; return; }
  const dt = (last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60) * speedOf();
  last = now;
  if (run) {
    clock += still.matches ? run.duration : dt;
    if (clock >= run.duration) { pose = poseAt(run, run.duration); draw(pose, clock); end(); }
    else { pose = poseAt(run, clock); draw(pose, clock); }
  } else {
    clock += dt;
    if (touring && clock >= idleUntil) { start(TOUR[tourIndex++ % TOUR.length], false); }
    draw(pose, clock);
  }
  say(pose, run ? clock : 0);
  follow(pose, dt);
  frame = visible && (!still.matches || run) ? requestAnimationFrame(tick) : 0;
}
// On a narrow screen the stage pans; it glides to keep the part or the crane in view unless the reader is panning.
let panHold = 0, panSet = -1;
stage.addEventListener("scroll", () => { if (Math.abs(stage.scrollLeft - panSet) > 2) panHold = performance.now() + 4000; }, { passive: true });
function follow(p, dt) {
  if (stage.scrollWidth <= stage.clientWidth + 2 || performance.now() < panHold) return;
  const x = p.partVis > 0 && p.partSlot !== "crate" ? [p.partX, p.partY, p.partZ] : [p.craneX, 0, p.craneZ];
  const box = svg.getBoundingClientRect();
  const sx = (iso(x, P)[0] / svg.viewBox.baseVal.width) * box.width;
  const want = Math.max(0, Math.min(stage.scrollWidth - stage.clientWidth, sx - stage.clientWidth / 2));
  const next = still.matches ? want : stage.scrollLeft + (want - stage.scrollLeft) * (1 - Math.exp(-dt / 0.6));
  if (Math.abs(next - stage.scrollLeft) > 0.5) { stage.scrollLeft = next; panSet = stage.scrollLeft; }
}
function kick() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(stage);
buttons.forEach((b) => b.addEventListener("click", () => start(b.dataset.run, true)));

// ---------------------------------------------------------------- focus a station
const stationEls = [...svg.querySelectorAll("[data-station]")];
const keys = [...document.querySelectorAll("[data-focus]")];
let focused = null;
function focus(name) {
  focused = name;
  if (name) svg.dataset.focus = name; else delete svg.dataset.focus;
  const want = name ? name.split(" ") : [];
  for (const el of stationEls) { const on = el.dataset.station.split(" ").some((s) => want.includes(s)); if (on) el.dataset.on = ""; else delete el.dataset.on; }
  keys.forEach((k) => k.setAttribute("aria-pressed", String(k.dataset.focus === name)));
  document.dispatchEvent(new CustomEvent("cd-focus", { detail: name }));
}
keys.forEach((k) => {
  k.addEventListener("click", () => focus(focused === k.dataset.focus ? null : k.dataset.focus));
});
let paused = false;
function seek(kind, t) {
  paused = true; touring = false;
  run = planRun(world, kind); clock = t;
  pose = poseAt(run, t); draw(pose, t); say(pose, t);
}
window.__cd = { focus, start, seek, get world() { return world; }, get run() { return run; }, get clock() { return clock; }, setTour(on) { touring = on; } };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && focused) focus(null); });
stage.addEventListener("pointerdown", () => { touring = false; });

draw(pose, 0);
say(pose, 0);
