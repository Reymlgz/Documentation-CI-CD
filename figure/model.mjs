// The pipeline model: one pure module that drives every moving part, lamp and readout.
// A run is planned once as keyframed tracks; the page samples poseAt(run, t) each frame.
// World units are millimetres of a bench-top model line. Time is compressed figure time.

export const L = {
  BT: 34,                       // belt top
  BELT: [-250, 40],             // belt drum centres along x
  MAG: -235, GATE: -223,        // magazine centre, exit gate plane
  PRESS: -150, GAUGE: -60, KICK: -32,
  PKG: 62, PKG_TOP: 4,          // crate on the packing table
  DISP_Y: -32,                  // crate centre inside the dispenser
  LABELER: 84,                  // labeler head face at rest
  STAGING: 126, STAGING_TOP: 26,
  BAY: { A: 186, B: 230 }, PROD_TOP: 44,
  MONITOR: 264,
  BIN: 306, BIN_TOP: 56,
  PARK: 62, TRAVEL: 72,         // crane park x, carry height (crate bottom)
  CRATE: { w: 26, h: 14, floor: 1.6 },
  PART: { w: 12, body: 10, boss: 3, burr: 1.2 },
};

export const PHYS = {
  belt: 60,       // mm/s
  trolley: 170,   // mm/s
  hoist: 85,      // mm/s
  g: 900,         // mm/s², slowed so falls can be followed
  nominal: 13.0,  // finished part height, mm
  tol: 0.2,       // ± tolerance the gauge accepts, mm
  threshold: 1.0, // error rate that triggers a rollback, %
  baseline: 0.2,  // healthy error rate, %
};

export const STAGES = ["commit", "build", "test", "package", "staging", "production", "monitor"];

const EASE = {
  step: () => 0,
  lin: (p) => p,
  io: (p) => p * p * (3 - 2 * p),
  fall: (p) => p * p,
  out: (p) => 1 - (1 - p) * (1 - p),
};

function track(v0) {
  const keys = [[0, v0, "step"]];
  return {
    keys,
    hold(t) { const last = keys[keys.length - 1]; if (t > last[0]) keys.push([t, last[1], "step"]); },
    to(t0, t1, v, ease = "io") { this.hold(t0); keys.push([t1, v, ease]); },
    set(t, v) { this.hold(t); keys.push([t, v, "step"]); },
  };
}

export function sample(keys, t) {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
  const [t0, v0] = keys[i];
  const next = keys[i + 1];
  if (!next || typeof v0 !== "number" || next[2] === "step") return v0;
  const [t1, v1, ease] = next;
  const p = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return v0 + (v1 - v0) * EASE[ease](p);
}

export const fmtVersion = (v) => `v${v[0]}.${v[1]}.${v[2]}`;

export function initialWorld() {
  return {
    run: 41,
    version: [1, 4, 1],
    live: "A",
    lastLive: "v1.4.1",
    crates: [
      { id: 0, at: "A", label: "v1.4.1", filled: true },
      { id: 1, at: "B", label: "v1.4.0", filled: true },
      { id: 2, at: "pkg", label: "", filled: false },
      { id: 3, at: "disp", label: "", filled: false },
      { id: 4, at: "stack1", label: "", filled: false },
      { id: 5, at: "stack2", label: "", filled: false },
    ],
  };
}

export function placeOf(at) {
  const { CRATE } = L;
  switch (at) {
    case "A": case "B": return [L.BAY[at], 0, L.PROD_TOP];
    case "pkg": return [L.PKG, 0, L.PKG_TOP];
    case "disp": return [L.PKG, L.DISP_Y, L.PKG_TOP];
    case "stack1": return [L.PKG, L.DISP_Y, L.PKG_TOP + CRATE.h + 2];
    case "stack2": return [L.PKG, L.DISP_Y, L.PKG_TOP + 2 * (CRATE.h + 2)];
    case "staging": return [L.STAGING, 0, L.STAGING_TOP];
    case "bin": return [L.BIN, 0, 2];
  }
}

function hashOf(n) {
  let h = (n * 2654435761) >>> 0;
  let s = "";
  for (let i = 0; i < 7; i++) { h = (h * 1103515245 + 12345) >>> 0; s += "0123456789abcdef"[(h >>> 16) & 15]; }
  return s;
}

// kind: "good" | "bad" (breaks a test) | "regress" (passes tests, fails in production)
export function planRun(world, kind) {
  const run = world.run + 1;
  const hash = hashOf(run * 7 + kind.length);
  const { BT, PART, CRATE } = L;
  const tr = {
    partX: track(L.MAG), partY: track(0), partZ: track(BT), partShape: track("blank"), partVis: track(1), partSlot: track("mag"),
    belt: track(world.belt || 0), gate: track(0), stack: track(0), stack0: track(0), ram: track(0), probe: track(0), dial: track(0),
    kicker: track(0), labeler: track(0), craneX: track(L.PARK), craneZ: track(L.TRAVEL), lever: track(world.live === "A" ? -1 : 1),
    monitor: track(PHYS.baseline), stage: track("commit"), note: track("pushed"),
  };
  const lamps = Object.fromEntries(STAGES.map((s) => [s, track("off")]));
  lamps.production.set(0, "ok");
  const crates = world.crates.map((c) => {
    const [x, y, z] = placeOf(c.at);
    return { id: c.id, x: track(x), y: track(y), z: track(z), filled: track(c.filled ? 1 : 0), label: track(c.label), held: track(0) };
  });
  const crateAt = (at) => world.crates.find((c) => c.at === at).id;
  let t = 0;
  const stage = (name, at, note) => { tr.stage.set(at, name); tr.note.set(at, note); };
  const lamp = (name, at, v) => lamps[name].set(at, v);

  // 01 commit: the gate lifts, the belt carries the blank out, the stack drops one place
  stage("commit", 0, "pushed " + hash);
  lamp("commit", 0, "run");
  for (const s of STAGES.slice(1)) if (s !== "production") lamp(s, 0, "off");
  tr.gate.to(0.2, 0.5, 1);
  const beltMove = (x1) => {
    const x0 = sample(tr.partX.keys, t);
    const dur = 0.35 + Math.abs(x1 - x0) / PHYS.belt;
    tr.partX.to(t, t + dur, x1, "io");
    const b0 = sample(tr.belt.keys, t);
    tr.belt.to(t, t + dur, b0 + (x1 - x0), "io");
    return dur;
  };
  t = 0.5;
  const exitAt = t + 0.6;
  tr.partSlot.set(exitAt, "belt");
  let dur = beltMove(L.PRESS);
  tr.gate.to(exitAt + 0.15, exitAt + 0.45, 0);
  tr.stack.to(exitAt + 0.5, exitAt + 0.5 + Math.sqrt((2 * PART.body) / PHYS.g), -1, "fall");
  tr.stack.set(exitAt + 0.9, 0);
  tr.stack0.set(exitAt + 0.9, 1);
  lamp("commit", t + 0.4, "ok");
  t += dur;

  // 02 build: the ram presses the blank into a finished part
  stage("build", t, "pressing " + hash);
  lamp("build", t, "run");
  tr.ram.to(t, t + 0.55, 1, "fall");
  tr.partShape.set(t + 0.55, kind === "bad" ? "bad" : "part");
  tr.ram.to(t + 0.85, t + 1.45, 0, "io");
  lamp("build", t + 1.45, "ok");
  t += 1.6;

  // 03 test: the probe drops onto the part and the dial reads its height
  dur = beltMove(L.GAUGE);
  t += dur;
  stage("test", t, "gauging height");
  lamp("test", t, "run");
  const height = PHYS.nominal + (kind === "bad" ? PART.burr : 0.04);
  tr.probe.to(t, t + 0.5, 1, "io");
  tr.dial.to(t + 0.35, t + 0.9, height - PHYS.nominal, "out");
  t += 1.3;
  const pass = Math.abs(height - PHYS.nominal) <= PHYS.tol;
  tr.probe.to(t, t + 0.4, 0, "io");
  tr.dial.to(t + 0.1, t + 0.5, 0, "io");
  lamp("test", t, pass ? "ok" : "fail");
  t += 0.5;

  const result = { run, hash, kind, pass, height, version: null, rolledBack: false };

  if (!pass) {
    // rejected: the kicker throws the part off the belt into the reject bin
    stage("test", t, `failed · height ${height.toFixed(2)} mm`);
    dur = beltMove(L.KICK);
    t += dur;
    tr.kicker.to(t, t + 0.45, 1, "io");
    const kickEnd = t + 0.45;
    tr.partY.to(t, kickEnd, 16, "io");
    tr.partSlot.set(t + 0.2, "front");
    const fall = Math.sqrt((2 * (BT - 2)) / PHYS.g);
    tr.partZ.to(kickEnd, kickEnd + fall, 2, "fall");
    tr.partY.to(kickEnd, kickEnd + fall, 25, "lin");
    tr.partVis.set(kickEnd + fall + 0.05, 0);
    tr.kicker.to(kickEnd + 0.1, kickEnd + 0.6, 0, "io");
    t = kickEnd + 1.2;
    stage("failed", t, `tests failed · ${fmtVersion(world.version)} stays live`);
    return finishPlan(world, result, tr, lamps, crates, t);
  }

  // 04 package: the part drops into the crate and the labeler stamps the version
  dur = beltMove(L.BELT[1] + 2);
  t += dur;
  stage("package", t, "packing artifact");
  lamp("package", t, "run");
  const pkg = crateAt("pkg");
  const v = 60;
  const dropZ = L.PKG_TOP + CRATE.floor;
  const fall = Math.sqrt((2 * (BT - dropZ)) / PHYS.g);
  tr.partX.to(t, t + fall, L.BELT[1] + 2 + v * fall, "lin");
  tr.partZ.to(t, t + fall, dropZ, "fall");
  tr.partSlot.set(t + fall * 0.55, "crate");
  tr.partX.to(t + fall, t + fall + 0.35, L.PKG, "out");
  t += fall + 0.4;
  tr.partVis.set(t, 0);
  crates[pkg].filled.set(t, 1);
  const version = [world.version[0], world.version[1], world.version[2] + 1];
  const vtext = fmtVersion(version);
  result.version = vtext;
  tr.labeler.to(t, t + 0.4, 1, "io");
  crates[pkg].label.set(t + 0.4, vtext);
  tr.labeler.to(t + 0.6, t + 1.0, 0, "io");
  lamp("package", t + 1.0, "ok");
  stage("package", t + 0.4, "artifact " + vtext);
  t += 1.1;

  // crane helpers: trolley and hoist, carrying whatever crate it holds
  let held = null;
  const craneTo = (x) => {
    const x0 = sample(tr.craneX.keys, t);
    const d = 0.45 + Math.abs(x - x0) / PHYS.trolley;
    tr.craneX.to(t, t + d, x, "io");
    if (held !== null) crates[held].x.to(t, t + d, x, "io");
    t += d;
  };
  const hoist = (z) => {
    const z0 = sample(tr.craneZ.keys, t);
    const d = 0.35 + Math.abs(z - z0) / PHYS.hoist;
    tr.craneZ.to(t, t + d, z, "io");
    if (held !== null) crates[held].z.to(t, t + d, z, "io");
    t += d;
  };
  const grip = (id) => { held = id; crates[id].held.set(t, 1); t += 0.3; };
  const release = () => { crates[held].held.set(t, 0); held = null; t += 0.3; };

  // 05 staging: carry the crate to the staging table and smoke-test it there
  stage("staging", t, "deploying to staging");
  lamp("staging", t, "run");
  craneTo(L.PKG);
  hoist(L.PKG_TOP);
  grip(pkg);
  hoist(L.TRAVEL);
  // the dispenser feeds the next empty crate while the crane carries this one
  const feed = t;
  const next = crateAt("disp");
  crates[next].y.to(feed, feed + 0.9, 0, "io");
  const s1 = crateAt("stack1"), s2 = crateAt("stack2");
  const drop = Math.sqrt((2 * (CRATE.h + 2)) / PHYS.g);
  crates[s1].z.to(feed + 0.9, feed + 0.9 + drop, placeOf("disp")[2], "fall");
  crates[s2].z.to(feed + 1.0, feed + 1.0 + drop, placeOf("stack1")[2], "fall");
  craneTo(L.STAGING);
  hoist(L.STAGING_TOP);
  release();
  hoist(L.STAGING_TOP + 8);
  stage("staging", t, "smoke test on staging");
  t += 1.2;
  lamp("staging", t, "ok");

  // 06 production: retire the idle bay's old crate, then place the new one there
  const idle = world.live === "A" ? "B" : "A";
  stage("production", t, `retiring ${world.crates.find((c) => c.at === idle).label} from bay ${idle}`);
  lamp("production", t, "run");
  const old = crateAt(idle);
  hoist(L.TRAVEL);
  craneTo(L.BAY[idle]);
  hoist(L.PROD_TOP);
  grip(old);
  hoist(L.TRAVEL);
  craneTo(L.BIN);
  hoist(L.BIN_TOP + 2);
  const dropAt = t;
  release();
  const binFall = Math.sqrt((2 * (L.BIN_TOP)) / PHYS.g);
  crates[old].z.to(dropAt, dropAt + binFall, 2, "fall");
  // hidden in the bin, the old crate is emptied and returns to the top of the dispenser stack
  const back = dropAt + binFall + 0.2;
  const [sx, sy, sz] = placeOf("stack2");
  crates[old].x.set(back, sx); crates[old].y.set(back, sy); crates[old].z.set(back, sz);
  crates[old].filled.set(back, 0); crates[old].label.set(back, "");
  stage("production", t, `deploying ${vtext} to bay ${idle}`);
  hoist(L.TRAVEL);
  craneTo(L.STAGING);
  hoist(L.STAGING_TOP);
  grip(pkg);
  hoist(L.TRAVEL);
  craneTo(L.BAY[idle]);
  hoist(L.PROD_TOP);
  release();
  hoist(L.TRAVEL);
  // the router lever switches traffic to the new bay
  tr.lever.to(t, t + 0.5, idle === "A" ? -1 : 1, "io");
  t += 0.5;
  lamp("production", t, "ok");
  stage("monitor", t, `${vtext} live · watching errors`);
  lamp("monitor", t, "run");
  const watch = t;
  craneTo(L.PARK);

  // 07 monitor: a regression shows up as errors under real traffic; past the threshold, roll back
  let live = idle;
  if (kind === "regress") {
    const cross = watch + 1.1;
    tr.monitor.to(watch + 0.2, watch + 2.0, 3.8, "out");
    tr.monitor.to(watch + 2.4, watch + 3.6, PHYS.baseline, "io");
    stage("monitor", cross, `errors ${PHYS.threshold.toFixed(1)}% · threshold crossed`);
    lamp("monitor", cross, "fail");
    const flip = cross + 0.4;
    tr.lever.to(flip, flip + 0.5, idle === "A" ? 1 : -1, "io");
    lamp("production", flip + 0.5, "fail");
    stage("rollback", flip + 0.5, `rolled back to ${world.lastLive}`);
    live = world.live;
    result.rolledBack = true;
    t = Math.max(t, watch + 4.2);
  } else {
    t = Math.max(t, watch + 3.0);
    lamp("monitor", t, "ok");
    stage("done", t, `${vtext} live · healthy`);
  }
  result.live = live;
  result.idle = idle;
  result.old = old;
  result.next = next;
  result.pkg = pkg;
  result.s1 = s1;
  result.s2 = s2;
  return finishPlan(world, result, tr, lamps, crates, t + 0.6);
}

function finishPlan(world, result, tr, lamps, crates, end) {
  const keys = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.keys]));
  return {
    ...result,
    duration: end,
    tracks: keys(tr),
    lamps: keys(lamps),
    crates: crates.map((c) => ({ id: c.id, x: c.x.keys, y: c.y.keys, z: c.z.keys, filled: c.filled.keys, label: c.label.keys, held: c.held.keys })),
  };
}

export function poseAt(run, t) {
  const p = {};
  for (const [k, keys] of Object.entries(run.tracks)) p[k] = sample(keys, t);
  p.lamps = Object.fromEntries(Object.entries(run.lamps).map(([k, keys]) => [k, sample(keys, t)]));
  p.crates = run.crates.map((c) => ({ id: c.id, x: sample(c.x, t), y: sample(c.y, t), z: sample(c.z, t), filled: sample(c.filled, t), label: sample(c.label, t), held: sample(c.held, t) }));
  return p;
}

// The world after a run: versions, bays, which crate sits where.
export function finishRun(world, run) {
  const belt = run.tracks.belt[run.tracks.belt.length - 1][1];
  const next = { ...world, run: run.run, belt, crates: world.crates.map((c) => ({ ...c })) };
  if (!run.pass) return next;
  const at = (id) => next.crates.find((c) => c.id === id);
  next.version = run.version.slice(1).split(".").map(Number);
  at(run.old).at = "stack2"; at(run.old).label = ""; at(run.old).filled = false;
  at(run.s2).at = "stack1";
  at(run.s1).at = "disp";
  at(run.next).at = "pkg";
  at(run.pkg).at = run.idle; at(run.pkg).label = run.version; at(run.pkg).filled = true;
  next.live = run.live;
  if (!run.rolledBack) next.lastLive = run.version;
  return next;
}

// Idle world pose (no run active).
export function restPose(world) {
  const crates = world.crates.map((c) => { const [x, y, z] = placeOf(c.at); return { id: c.id, x, y, z, filled: c.filled ? 1 : 0, label: c.label, held: 0 }; });
  return {
    partX: L.MAG, partY: 0, partZ: L.BT, partShape: "blank", partVis: 1, partSlot: "mag", belt: world.belt || 0, gate: 0, stack: 0, stack0: 0, ram: 0, probe: 0, dial: 0,
    kicker: 0, labeler: 0, craneX: L.PARK, craneZ: L.TRAVEL, lever: world.live === "A" ? -1 : 1, monitor: PHYS.baseline,
    stage: "idle", note: `${world.lastLive} live`, lamps: Object.fromEntries(STAGES.map((s) => [s, s === "production" ? "ok" : "off"])), crates,
  };
}
