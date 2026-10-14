// The production line, drawn once. Everything static is a string here; everything that moves is
// built once at a rest position (usually the world origin) and moved by the page with translateAlong.
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { L, PHYS, STAGES } from "./model.mjs";

export const WIDTH = 880;
export const HEIGHT = 470;
export const AZIMUTH = 58;

const PLATE = { x: -270, y: -54, w: 624, d: 108, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const GANTRY = { x0: 40, x1: 340, y: 30, top: 128 };
const BEAM_Z = 136;

export const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [GANTRY.x0, -34, BEAM_Z + 10], [GANTRY.x1, 34, BEAM_Z + 10], [L.PRESS, 0, 140], [L.MAG, 0, 104]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZIMUTH },
);

const at = (p) => k.iso(p, P);
const S = (paths, style = {}) => k.solidSvg(paths, style);
const Ln = (d, style = {}) => k.lineSvg(d, style);
const D = (points, style = {}) => k.dotsSvg(points, style);
const plan = (x0, x1, y0, y1, r = 1) => ({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r });
// a box from x0..x1, y0..y1, z0..z1
const box = (x0, x1, y0, y1, z0, z1, o = {}) =>
  S(k.slabOf(plan(x0, x1, y0, y1, o.r ?? 0.8), z0, z1 - z0, P, o.steps ?? 3, o.bevel ?? 0), { tone: o.tone ?? "mid", crease: o.crease, lit: o.lit, inner: o.inner });
const cyl = (x, y, r, z0, z1, o = {}) => S(k.cylinder(x, y, r, z0, z1 - z0, P, o.steps ?? 24, o.bevel ?? 0), { tone: o.tone ?? "mid", crease: o.crease, lit: o.lit, inner: o.inner });
const dot = (p, size = 0.45, tone = "mid") => D([at(p)], { size, tone });
const dots = (ps, size = 0.45, tone = "mid") => D(ps.map(at), { size, tone });
const seg = (a, b, style) => Ln(k.segment(a, b, P), style);
// a round part along y (drums, motor can, pivots)
const alongY = (x, z, y0, y1, r, o = {}) => S(G.disc(y0, y1, r, G.frameOf([x, 0, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: o.tone ?? "mid", crease: o.crease, inner: o.inner });
const faceRingY = (x, y, z, r) => Ln(G.circleOf(G.frameOf([x, 0, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]), y, r, P), { tone: "faint" });
function faceRect(axis, at, u0, u1, z0, z1, r = 1.2) {
  const pts = [];
  const corner = (cu, cz, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2); pts.push([cu + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  corner(u1 - r, z0 + r, -Math.PI / 2); corner(u1 - r, z1 - r, 0); corner(u0 + r, z1 - r, Math.PI / 2); corner(u0 + r, z0 + r, Math.PI);
  const p3 = ([u, z]) => (axis === "x" ? [at, u, z] : [u, at, z]);
  return "M" + pts.map((q) => at3(p3(q))).join("L") + "Z";
}
const at3 = (p) => { const [x, y] = k.iso(p, P); return `${x.toFixed(1)} ${y.toFixed(1)}`; };
const station = (name, body) => `<g data-station="${name}">${body}</g>`;
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---------------------------------------------------------------- base
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const feet = [...k.corners(PLATE, 22), [GANTRY.x0, PLATE.y + 22], [GANTRY.x0, PLATE.y + PLATE.d - 22]];
  for (const [x, y] of byDepth(feet)) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -PLATE_H + 3, P, 8), { tone: "faint" }) }));
  out.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // two T-slots run the length of the bench; machines are bolted into them
  for (const y of [-38, 27]) out.push(Ln(k.planOutline(plan(-252, 336, y, y + 3, 1.5), 0, P, 3), { tone: "lo" }), Ln(k.lineOnTop([-250.5, y + 1.5], [334.5, y + 1.5], 0, P), { tone: "faint" }));
  // ruler strip along the back edge, millimetres with a major mark every 50
  const strip = plan(-246, 330, PLATE.y + 7, PLATE.y + 13, 1);
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 5, 10, strip.y + strip.d - 0.8, 0.6, [-1.8, -3.4], P);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 1.5, strip.y + 3, 0.6]), at([strip.x + strip.w - 1.5, strip.y + 3, 0.6])], { size: 0.4 }));
  return out.join("");
}

// ---------------------------------------------------------------- 01 commit: magazine of blanks with an exit gate
const MAG = { x0: L.MAG - 13, x1: L.GATE, y: 15, t: 2, z0: 37, z1: 100 };
export const BLANK = (lit = false) => {
  const w = L.PART.w / 2;
  return box(-w, w, -w, w, 0, L.PART.body, { tone: "hi", crease: "lo", bevel: 0.5, r: 0.6, lit, inner: Ln(k.sideSeam(plan(-w, w, -w, w, 0.6), 5, P, 3), { tone: "faint" }) });
};
export const PART = (h = L.PART.boss, lit = false) => {
  const w = L.PART.w / 2;
  return [
    box(-w, w, -w, w, 0, L.PART.body, { tone: "hi", crease: "lo", bevel: 0.5, r: 1.2, lit }),
    Ln(k.planOutline(plan(-w + 1.4, w - 1.4, -w + 1.4, w - 1.4, 0.8), L.PART.body, P, 3), { tone: "faint" }),
    cyl(0, 0, 3.4, L.PART.body, L.PART.body + h, { tone: "hi", crease: "lo", lit, bevel: 0.35 }),
    Ln(k.ring(0, 0, 1.4, L.PART.body + h, P, 16), { tone: "lo" }),
    D([at([-w + 2.2, -w + 2.2, L.PART.body]), at([w - 2.2, w - 2.2, L.PART.body])], { size: 0.38, tone: "lo" }),
  ].join("");
};
// a burr on a bad part: a lopsided lip on the boss
export const BAD = (lit = false) => PART(L.PART.boss + L.PART.burr, lit) + box(1.2, 4.6, -1.2, 1.2, L.PART.body + L.PART.boss, L.PART.body + L.PART.boss + L.PART.burr + 0.6, { tone: "hi", crease: "lo", r: 0.5, lit });

function magazineBack() {
  const { x0, x1, y, t, z0, z1 } = MAG;
  return [
    box(x0 - 4, x0, -y - 4, -y + 2, 0, z1, { r: 0.6 }),                        // back-left post
    box(x1, x1 + 4, -y - 4, -y + 2, 0, z1, { r: 0.6 }),                        // back-right post
    box(x0, x1, -y - t, -y, z0, z1, { tone: "mid", inner: Ln(k.sideSeam(plan(x0, x1, -y - t, -y, 0), 60, P, 2), { tone: "faint" }) }),
    box(x0 - 2, x0, -y, y, z0, z1, { tone: "mid" }),                           // -x plate
    dots([[x0 + 4, -y, 44], [x1 - 4, -y, 44], [x0 + 4, -y, 94], [x1 - 4, -y, 94]].map(([a, b, c]) => [a, b, c]), 0.42, "lo"),
  ].join("");
}
function magazineSide() {
  const { x1, y, z1 } = MAG;
  const out = [box(x1, x1 + 2, -y, y, 52, z1, { inner: Ln(k.ringSeam(k.ringOf(plan(x1, x1 + 2, -y, y, 0), 2), 76, P), { tone: "faint" }) })];
  // gate guides on the outside of the +x plate
  for (const gy of [-11, 9]) out.push(box(x1 + 2, x1 + 4, gy, gy + 2, L.BT + 2, 70, { r: 0.4 }));
  return out.join("");
}
export function gate() {
  const x = MAG.x1 + 2;
  return [
    box(x, x + 1.4, -9, 9, L.BT + 1, 52, { tone: "hi", crease: "lo", r: 0.3 }),
    box(x + 1.4, x + 3.4, -2, 2, 46, 50, { tone: "mid", r: 0.5 }),
    dots([[x + 1.4, -6, 48], [x + 1.4, 6, 48]], 0.4, "lo"),
  ].join("");
}
function magazineFront() {
  const { x0, x1, y, t, z1 } = MAG;
  const out = [
    box(x0 - 4, x0, y - 2, y + 4, 0, z1, { r: 0.6 }),
    box(x1, x1 + 4, y - 2, y + 4, 0, z1, { r: 0.6 }),
  ];
  for (const z of [58, 82]) out.push(box(x0, x1, y, y + t, z, z + 4, { r: 0.4, bevel: 0.3 }), dots([[x0 + 1.5, y + t, z + 2], [x1 - 1.5, y + t, z + 2]], 0.4, "lo"));
  out.push(box(x0 - 5, x1 + 5, -y - 5, y + 5, z1, z1 + 4, { r: 1.2, bevel: 0.6 }));
  out.push(Ln(k.planOutline(plan(x0 + 3, x1 - 3, -y + 3, y - 3, 1), z1 + 4, P), { tone: "faint" }));
  out.push(dots([[x0 - 2, -y - 2, z1 + 4], [x1 + 2, -y - 2, z1 + 4], [x0 - 2, y + 2, z1 + 4], [x1 + 2, y + 2, z1 + 4]], 0.45));
  return out.join("");
}
// blanks waiting in the magazine (level 0 is the one on the belt)
export const STACK_LEVELS = 6;
function stack() {
  const out = [];
  for (let i = 0; i < STACK_LEVELS; i++) {
    out.push(`<g data-stack="${i}" transform="${k.translateAlong(P, [L.MAG, 0, L.BT + i * L.PART.body])}"${i === 0 ? ' style="display:none"' : ""}>${BLANK()}</g>`);
  }
  return out.join("");
}

// ---------------------------------------------------------------- the belt
const BELT_Y = 9.5;
const RAIL = { y0: 10, y1: 13, z0: 24, z1: 37 };
function beltUnder() {
  const out = [];
  for (const x of [-236, -110, 22]) {
    for (const y of [-RAIL.y1, RAIL.y0]) out.push(box(x - 2, x + 2, y, y + 3, 0, RAIL.z0, { r: 0.4 }));
    out.push(box(x - 1.5, x + 1.5, -RAIL.y0, RAIL.y0, 7, 10, { r: 0.4 }));
  }
  out.push(box(L.BELT[0] - 6, L.BELT[1] + 6, -RAIL.y1, -RAIL.y0, RAIL.z0, RAIL.z1, { r: 0.6, bevel: 0.3 }));
  out.push(dots([-236, -110, 22].map((x) => [x, -RAIL.y0, 30]), 0.45, "lo"));
  for (const x of L.BELT) out.push(alongY(x, L.BT - 4, -RAIL.y0, RAIL.y0, 4, { tone: "mid" }));
  out.push(box(L.BELT[0], L.BELT[1], -BELT_Y, BELT_Y, L.BT - 1.4, L.BT, { tone: "lo", r: 0, crease: "faint" }));
  return out.join("");
}
export function cleats(phase) {
  const out = [];
  const gap = 10;
  const start = L.BELT[0] + 1 + ((((phase % gap) + gap) % gap));
  for (let x = start; x < L.BELT[1] - 0.5; x += gap) out.push(k.lineOnTop([x, -BELT_Y], [x, BELT_Y], L.BT, P));
  return out.join("");
}
function railFront() {
  const out = [];
  const spans = [[L.BELT[0] - 6, L.KICK - 13], [L.KICK + 13, L.BELT[1] + 6]];
  for (const [a, b] of spans) out.push(box(a, b, RAIL.y0, RAIL.y1, RAIL.z0, RAIL.z1, { r: 0.6, bevel: 0.3 }));
  // bearing blocks for the drum axles
  for (const x of L.BELT) out.push(box(x - 4, x + 4, RAIL.y1, RAIL.y1 + 2.5, 26, 34, { r: 0.6 }), faceRingY(x, RAIL.y1 + 2.5, L.BT - 4, 1.6), dot([x, RAIL.y1 + 2.5, L.BT - 4], 0.5, "mid"));
  out.push(dots([-180, -120, -80, 0].map((x) => [x, RAIL.y1, 34]), 0.4, "lo"));
  return out.join("");
}
function motor() {
  const x = L.BELT[1] - 10;
  return [
    box(x - 7, x + 7, RAIL.y1, RAIL.y1 + 6, 12, 24, { r: 0.8 }),
    alongY(x, 18, RAIL.y1 + 6, RAIL.y1 + 20, 6, { tone: "mid", inner: Ln([0.3, 0.55].map((s) => G.arcOf(G.frameOf([x, 0, 18], [0, 1, 0], [1, 0, 0], [0, 0, 1]), RAIL.y1 + 6 + 14 * s, 6, P)).join(""), { tone: "faint" }) }),
    alongY(x, 18, RAIL.y1 + 20, RAIL.y1 + 21.5, 4.5, { tone: "lo" }),
    box(x - 4, x + 4, RAIL.y1 + 8, RAIL.y1 + 16, 4, 12, { r: 0.6 }),
    dot([x, RAIL.y1 + 21.5, 18], 0.5),
  ].join("");
}

// ---------------------------------------------------------------- 02 build: the press
const PRESS = { post: 20, top: 100, head: 110 };
export const RAM_REST = 64;
export const RAM_STROKE = RAM_REST - (L.BT + L.PART.body);
function pressPost(y) {
  const x = L.PRESS;
  return [
    box(x - 7, x + 7, y - 6, y + 6, 0, 5, { r: 1, bevel: 0.4 }),
    dots([[x - 4.5, y - 3.5, 5], [x + 4.5, y + 3.5, 5]], 0.42),
    cyl(x, y, 3.2, 5, PRESS.top, { crease: "none", inner: Ln(k.sideArc(x, y, 3.2, 40, P, 16), { tone: "faint" }) }),
  ].join("");
}
function pressHead() {
  const x = L.PRESS;
  return [
    box(x - 10, x + 10, -26, 26, PRESS.top, PRESS.head, { r: 1.5, bevel: 0.8, inner: Ln(k.sideSeam(plan(x - 10, x + 10, -26, 26, 1.5), 105, P, 3), { tone: "faint" }) }),
    cyl(x, -PRESS.post, 4.5, PRESS.head, PRESS.head + 3, { steps: 6 }),
    cyl(x, 0, 8, PRESS.head, PRESS.head + 24, { inner: Ln(k.sideArc(x, 0, 8, PRESS.head + 12, P, 32), { tone: "faint" }) }),
    cyl(x, 0, 9, PRESS.head + 24, PRESS.head + 28, { bevel: 0.5 }),
    Ln(k.radialTicks(x, 0, 9, 8, 1, PRESS.head + 28, [0.01, 0.01], P).major, { tone: "lo" }),
    D(Array.from({ length: 6 }, (_, i) => at([x + Math.sin((i / 6) * 2 * Math.PI) * 7, Math.cos((i / 6) * 2 * Math.PI) * 7, PRESS.head + 28])), { size: 0.42 }),
    cyl(x + 6, 13, 3.4, PRESS.head, PRESS.head + 2.4, { tone: "hi", crease: "lo", steps: 28 }),
    Ln(k.radialTicks(x + 6, 13, 2.8, 12, 3, PRESS.head + 2.4, [0.6, 1.1], P, -2.3, 4.6).minor, { tone: "lo" }),
    Ln(k.lineOnTop([x + 6, 13], [x + 6 + 2.2, 13 - 1.2], PRESS.head + 2.5, P), { tone: "hi", free: "end" }),
    cyl(x, PRESS.post, 4.5, PRESS.head, PRESS.head + 3, { steps: 6 }),
    // relief valve on the head's front face
    box(x - 3, x + 3, 26, 29, 102, 108, { r: 0.6 }),
    alongY(x, 105, 29, 32, 1.6, { tone: "mid" }),
  ].join("");
}
export function ram() {
  const x = 0;
  return [
    cyl(x, 0, 2.4, RAM_REST + 8, 124, { tone: "hi", crease: "none" }),
    box(-10, 10, -12, 12, RAM_REST, RAM_REST + 8, { tone: "mid", bevel: 0.6, r: 1, inner: Ln(k.sideSeam(plan(-10, 10, -12, 12, 1), RAM_REST + 2.5, P, 3), { tone: "faint" }) }),
    dots([[-7, -9, RAM_REST + 8], [7, -9, RAM_REST + 8], [-7, 9, RAM_REST + 8], [7, 9, RAM_REST + 8]], 0.42),
    cyl(x, 0, 4, RAM_REST + 8, RAM_REST + 11, { tone: "mid" }),
  ].join("");
}

// ---------------------------------------------------------------- 03 test: gauge bridge, probe, dial; kicker and reject bin
const GAUGE = { post: 20, bar: 76, dialR: 11 };
export const PROBE_REST = L.BT + PHYS.nominal + 7;
function gaugePost(y) {
  const x = L.GAUGE;
  return [
    box(x - 6, x + 6, y - 5, y + 5, 0, 4, { r: 1, bevel: 0.4 }),
    dots([[x - 3.6, y - 2.6, 4], [x + 3.6, y + 2.6, 4]], 0.4),
    cyl(x, y, 2.8, 4, GAUGE.bar, { crease: "none", inner: Ln(k.sideArc(x, y, 2.8, 30, P, 16), { tone: "faint" }) }),
  ].join("");
}
function gaugeBar() {
  const x = L.GAUGE;
  const top = GAUGE.bar + 6;
  const R = GAUGE.dialR;
  const t = k.radialTicks(x, 0, R - 2.6, 40, 5, top + 6, [1.1, 2.3], P);
  // tolerance marks: ±0.2 mm on a dial of 2 mm per turn
  const tol = (PHYS.tol / 2) * 2 * Math.PI;
  const tolMarks = [-tol, tol].map((a) => k.lineOnTop([x + Math.sin(a) * (R - 5.6), -Math.cos(a) * (R - 5.6)], [x + Math.sin(a) * (R - 2.6), -Math.cos(a) * (R - 2.6)], top + 6, P)).join("");
  return [
    box(x - 6, x + 6, -26, 26, GAUGE.bar, top, { r: 1.2, bevel: 0.6, inner: Ln(k.sideSeam(plan(x - 6, x + 6, -26, 26, 1.2), GAUGE.bar + 3, P, 3), { tone: "faint" }) }),
    dots([[x, -22, top], [x, 22, top]], 0.45),
    cyl(x, 0, R, top, top + 6, { tone: "hi", crease: "lo", bevel: 0.6, steps: 56 }),
    Ln(k.knurl(x, 0, R, top + 3, top + 6, 64, P, 0.3), { tone: "lo" }),
    Ln(k.sideArc(x, 0, R, top + 3, P, 40), { tone: "faint" }),
    Ln(k.ring(x, 0, R - 1.8, top + 6, P, 56), { tone: "lo" }),
    Ln(t.minor, { tone: "lo" }), Ln(t.major, { tone: "mid" }),
    Ln(tolMarks, { tone: "green" }),
    Ln(k.ring(x, 0, 1.3, top + 6, P, 16), { tone: "mid" }),
  ].join("");
}
export const DIAL_TOP = GAUGE.bar + 12;
export function probe() {
  // built with its tip at z = 0, moved to the probe's height by the page
  return [
    cyl(0, 0, 1.1, 2, GAUGE.bar - (L.BT + PHYS.nominal) + 2, { tone: "hi", crease: "none" }),
    cyl(0, 0, 2.2, 0, 2.4, { tone: "hi", crease: "lo" }),
    cyl(0, 0, 1.8, 9, 11, { tone: "mid" }),
  ].join("");
}
function probeSleeve() {
  return cyl(L.GAUGE, 0, 2.6, GAUGE.bar - 7, GAUGE.bar, { tone: "mid", inner: Ln(k.sideArc(L.GAUGE, 0, 2.6, GAUGE.bar - 3.5, P, 16), { tone: "faint" }) });
}
const KICK = { y0: -42, y1: -22, gland: -24, z: 40 };
function kickerBack() {
  const x = L.KICK;
  return [
    box(x - 9, x + 9, KICK.y0 - 2, KICK.y1, 0, 32, { r: 1, bevel: 0.5, inner: Ln(k.sideSeam(plan(x - 9, x + 9, KICK.y0 - 2, KICK.y1, 1), 8, P, 3), { tone: "faint" }) }),
    alongY(x, KICK.z, KICK.y0, KICK.gland, 6, { tone: "mid", inner: Ln([KICK.y0 + 4, KICK.gland - 4].map((s) => G.arcOf(G.frameOf([x, 0, KICK.z], [0, 1, 0], [1, 0, 0], [0, 0, 1]), s, 6, P)).join(""), { tone: "faint" }) }),
    box(x - 7, x + 7, KICK.gland - 1, KICK.gland + 1, 32, 48, { r: 0.6 }),
    alongY(x, KICK.z, KICK.gland + 1, KICK.gland + 3, 2.6, { tone: "mid" }),
    dots([[x - 5, KICK.gland + 1, 34.5], [x + 5, KICK.gland + 1, 34.5], [x - 5, KICK.gland + 1, 45.5], [x + 5, KICK.gland + 1, 45.5]], 0.4),
  ].join("");
}
export const KICK_REST = -9;
export const KICK_TRAVEL = 10 - KICK_REST;
export function kickerPad() {
  return box(-6, 6, -1.5, 0, L.BT + 1.5, L.BT + 10, { tone: "hi", crease: "lo", r: 0.4 });
}
export const kickerRod = (padY) => k.solidSvg(k.slabOf(plan(-1.2, 1.2, KICK.gland + 3, padY - 1.5, 0.5), KICK.z - 1.2, 2.4, P, 2), { tone: "hi", crease: "none" });
const REJ = { x0: L.KICK - 14, x1: L.KICK + 14, y0: 16, y1: 38, h: 24 };
function rejectBack() {
  const { x0, x1, y0, y1, h } = REJ;
  return [
    box(x0, x1, y0, y1, 0, 1.6, { tone: "lo" }),
    box(x0, x1, y0, y0 + 1.6, 0, h, { tone: "mid", r: 0.4 }),
    box(x0, x0 + 1.6, y0, y1, 0, h, { tone: "mid", r: 0.4 }),
  ].join("");
}
function rejectFront() {
  const { x0, x1, y0, y1, h } = REJ;
  return [
    box(x1 - 1.6, x1, y0, y1, 0, h, { tone: "mid", r: 0.4 }),
    box(x0, x1, y1 - 1.6, y1, 0, h, { tone: "mid", r: 0.4, bevel: 0.3, inner: Ln(k.sideSeam(plan(x0, x1, y1 - 1.6, y1, 0.4), 6, P, 3), { tone: "faint" }) }),
    dots([[x0 + 2.5, y1, h - 2.5], [x1 - 2.5, y1, h - 2.5], [x0 + 2.5, y1, 3.5], [x1 - 2.5, y1, 3.5]], 0.42, "lo"),
  ].join("");
}

// ---------------------------------------------------------------- 04 package: roller table, dispenser, labeler; the crate
const PKG = { x0: L.PKG - 15, x1: L.PKG + 15, y0: -50, y1: 17 };
const DISP = { x0: L.PKG - 15, x1: L.PKG + 15, y0: -48, y1: -16, top: 62, open: L.PKG_TOP + L.CRATE.h + 2 };
function pkgTable() {
  const { x0, x1, y0, y1 } = PKG;
  const out = [box(x0, x1, y0, y1, 0, L.PKG_TOP, { tone: "mid", r: 1, bevel: 0.4 })];
  const rollers = [];
  for (let y = y0 + 3; y < y1 - 1; y += 4) rollers.push(k.lineOnTop([x0, y], [x1, y], L.PKG_TOP, P));
  out.push(Ln(rollers.join(""), { tone: "faint" }));
  return out.join("");
}
function dispenserBack() {
  const { x0, x1, y0, y1, top } = DISP;
  return [
    box(x0 - 2, x1 + 2, y0 - 2, y0, L.PKG_TOP, top, { r: 0.4 }),
    box(x0 - 2, x0, y0, y1, L.PKG_TOP, top, { r: 0.4 }),
  ].join("");
}
function dispenserFront() {
  const { x0, x1, y0, y1, top, open } = DISP;
  return [
    box(x1, x1 + 2, y0, y1 + 2, L.PKG_TOP, top, { r: 0.4, inner: Ln(k.ringSeam(k.ringOf(plan(x1, x1 + 2, y0, y1 + 2, 0), 2), 40, P), { tone: "faint" }) }),
    box(x0 - 2, x1 + 2, y1, y1 + 2, open, top, { r: 0.4, inner: Ln(k.ringSeam(k.ringOf(plan(x0 - 2, x1 + 2, y1, y1 + 2, 0), 2), 40, P), { tone: "faint" }) }),
    box(x0 - 2, x0 + 2, y1, y1 + 2, L.PKG_TOP, open, { r: 0.4 }),
    Ln(faceRect("x", x1 + 2, y0 + 6, y1 - 4, 24, 54, 1.4), { tone: "lo" }),
    Ln(faceRect("x", x1 + 2, y0 + 8, y1 - 6, 26, 52, 1), { tone: "faint" }),
    box(x1 + 2, x1 + 3, y0 + 3.6, y0 + 6, 28, 33, { r: 0.3 }),
    box(x1 + 2, x1 + 3, y0 + 3.6, y0 + 6, 45, 50, { r: 0.3 }),
    box(x1 + 2, x1 + 3.4, y1 - 9, y1 - 6, 37, 41, { r: 0.4 }),
    dots([[x1 + 2, y0 + 2.5, 8], [x1 + 2, y1 - 1.5, 8], [x1 + 2, y0 + 2.5, top - 3], [x1 + 2, y1 - 1.5, top - 3]], 0.42, "lo"),
    box(x0 - 4, x1 + 4, y0 - 4, y1 + 4, top, top + 3, { r: 1, bevel: 0.5 }),
    Ln(k.planOutline(plan(x0 + 2, x1 - 2, y0 + 2, y1 - 2, 1), top + 3, P), { tone: "faint" }),
    dots([[x0 - 2, y0 - 2, top + 3], [x1 + 2, y0 - 2, top + 3], [x0 - 2, y1 + 2, top + 3], [x1 + 2, y1 + 2, top + 3]], 0.45),
  ].join("");
}
const LAB = { x0: 80, x1: 102, face: L.LABELER };
function labelerBody() {
  return [
    box(LAB.x0, LAB.x1, -11, 11, 0, 8, { r: 1, bevel: 0.4 }),
    dots([[LAB.x0 + 3, -8, 8], [LAB.x1 - 3, 8, 8]], 0.42),
    box(LAB.x0 + 6, LAB.x1, -7, 7, 8, 21, { r: 1, bevel: 0.5, inner: Ln(k.sideSeam(plan(LAB.x0 + 6, LAB.x1, -7, 7, 1), 12, P, 3), { tone: "faint" }) }),
    Ln([0, 1, 2, 3].map((i) => faceRect("y", 7, LAB.x0 + 10 + i * 3, LAB.x0 + 11.4 + i * 3, 11.5, 18.5, 0.6)).join(""), { tone: "lo" }),
    // a roll of blank tags on top
    cyl(LAB.x0 + 14, 0, 5, 21, 25, { tone: "mid", bevel: 0.3 }),
    Ln(k.ring(LAB.x0 + 14, 0, 2, 25, P, 16), { tone: "lo" }),
  ].join("");
}
export const LAB_TRAVEL = LAB.face - (L.PKG + L.CRATE.w / 2) - 0.3;
export function labelerHead() {
  const f = LAB.face;
  return [
    box(f + 2, LAB.x0 + 6, -1.4, 1.4, 13.5, 16.3, { tone: "hi", crease: "none", r: 0.4 }),
    box(f, f + 2, -6, 6, 9, 17, { tone: "hi", crease: "lo", r: 0.4 }),
  ].join("");
}
export function crate(id) {
  const { w, h, floor } = L.CRATE;
  const a = w / 2, t = 1.6;
  const plateFace = a + 0.4;
  return [
    box(-a, a, -a, a, 0, floor, { tone: "lo", r: 0.8 }),
    box(-a, a, -a, -a + t, 0, h, { tone: "mid", r: 0.5 }),
    box(-a, -a + t, -a, a, 0, h, { tone: "mid", r: 0.5 }),
    box(-1, 1, -a, -a + t, h, h + 5, { tone: "mid", r: 0.3 }),
    `<g data-inner style="display:none">${PART()}</g>`,
    `<g data-bad style="display:none">${BAD()}</g>`,
    box(a - t, a, -a, a, 0, h, { tone: "mid", r: 0.5, inner: Ln(k.ringSeam(k.ringOf(plan(a - t, a, -a, a, 0), 2), 3, P), { tone: "faint" }) }),
    box(-a, a, a - t, a, 0, h, { tone: "mid", r: 0.5, inner: Ln(k.ringSeam(k.ringOf(plan(-a, a, a - t, a, 0), 2), 3, P), { tone: "faint" }) }),
    dots([[-a + 2, a, h - 2], [a - 2, a, h - 2], [a, -a + 2, h - 2], [a, a - 2, h - 2]], 0.4, "lo"),
    box(-1, 1, a - t, a, h, h + 5, { tone: "mid", r: 0.3 }),
    box(-1.2, 1.2, -a, a, h + 5, h + 7, { tone: "mid", r: 0.5, bevel: 0.3 }),
    `<g data-tag style="display:none">`,
    box(a, plateFace, -8, 8, 3.5, 10.5, { tone: "hi", crease: "none", r: 0.2 }),
    `<text class="iso-face-text" data-tone="hi" data-label transform="${k.sideMatrix([plateFace, 0], 5.8, P, "right")}" font-size="3.4" text-anchor="middle"></text>`,
    `</g>`,
  ].join("");
}

// ---------------------------------------------------------------- 05 staging and 06 production tables
const STG = { x0: L.STAGING - 16, x1: L.STAGING + 16, y0: -18, y1: 18 };
function table(x0, x1, y0, y1, top, legs) {
  const out = [];
  for (const [x, y] of byDepth(legs)) out.push(box(x - 2, x + 2, y - 2, y + 2, 0, top - 5, { r: 0.4 }));
  out.push(box(x0, x1, y0, y1, top - 5, top, { r: 1.2, bevel: 0.6, inner: Ln(k.sideSeam(plan(x0, x1, y0, y1, 1.2), top - 2.5, P, 3), { tone: "faint" }) }));
  return out.join("");
}
function stagingTable() {
  const { x0, x1, y0, y1 } = STG;
  const top = L.STAGING_TOP;
  return [
    table(x0, x1, y0, y1, top, [[x0 + 3, y0 + 3], [x1 - 3, y0 + 3], [x0 + 3, y1 - 3], [x1 - 3, y1 - 3]]),
    box(x0 + 2, x1 - 2, y0 + 2, y0 + 4, 6, 9, { r: 0.3 }),
    Ln(k.planOutline(plan(L.STAGING - 14, L.STAGING + 14, -14, 14, 1), top, P), { tone: "faint" }),
    dots([[x0 + 2.5, y1 - 2.5, top], [x1 - 2.5, y1 - 2.5, top]], 0.45),
  ].join("");
}
function stagingTester() {
  // a small smoke-test tower behind the staging bay
  const x = STG.x1 - 5, y = STG.y0 - 4;
  return [
    box(x - 4, x + 4, y - 3, y + 3, 0, 40, { r: 0.8, bevel: 0.4 }),
    box(x - 5, x + 5, y - 4, y + 4, 40, 44, { r: 1, bevel: 0.4 }),
    cyl(x, y, 2.4, 44, 47, { tone: "mid" }),
    `<path class="cd-lamp" data-lamp-beacon="staging" d="${k.ring(x, y, 2.4, 47, P, 20)}"/>`,
  ].join("");
}
const PROD = { x0: 162, x1: 280, y0: -22, y1: 22 };
function prodTable() {
  const { x0, x1, y0, y1 } = PROD;
  const top = L.PROD_TOP;
  const out = [table(x0, x1, y0, y1, top, [[x0 + 3, y0 + 3], [x1 - 3, y0 + 3], [x0 + 3, y1 - 3], [x1 - 3, y1 - 3], [208, y0 + 3], [208, y1 - 3]])];
  out.push(box(x0 + 2, x1 - 2, y0 + 2, y0 + 4, 10, 13, { r: 0.3 }));
  for (const bay of ["A", "B"]) {
    const bx = L.BAY[bay];
    out.push(Ln(k.planOutline(plan(bx - 14, bx + 14, -14, 14, 1), top, P), { tone: "faint" }));
    out.push(...[[-15.5, -15.5], [15.5, -15.5], [-15.5, 15.5], [15.5, 15.5]].map(([dx, dy]) => cyl(bx + dx, dy, 0.9, top, top + 2, { steps: 12 })));
  }
  return out.join("");
}
function beacons() {
  return ["A", "B"].map((bay) => {
    const x = L.BAY[bay], y = PROD.y0 + 3;
    return [
      box(x - 3, x + 3, y - 2, y + 2, L.PROD_TOP, L.PROD_TOP + 2, { r: 0.6 }),
      cyl(x, y, 1, L.PROD_TOP + 2, L.PROD_TOP + 18, { crease: "none" }),
      cyl(x, y, 2.6, L.PROD_TOP + 18, L.PROD_TOP + 20, { tone: "mid" }),
      cyl(x, y, 2.2, L.PROD_TOP + 20, L.PROD_TOP + 23, { tone: "mid" }),
      `<path class="cd-lamp" data-bay-lamp="${bay}" d="${k.ring(x, y, 2.2, L.PROD_TOP + 23, P, 20)}"/>`,
    ].join("");
  }).join("");
}
// the router: a lever on the table's front face pointing at the live bay
export const LEVER = { x: 208, y: PROD.y1, z: L.PROD_TOP - 13, len: 11, swing: 38 };
function leverBase() {
  const { x, y, z } = LEVER;
  const swing = (LEVER.swing * Math.PI) / 180;
  const arc = [];
  for (let i = 0; i <= 24; i++) {
    const a = -swing + (2 * swing * i) / 24;
    arc.push(at([x + Math.sin(a) * (LEVER.len + 2.5), y + 0.2, z + Math.cos(a) * (LEVER.len + 2.5)]));
  }
  const arcD = "M" + arc.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join("L");
  return [
    box(x - 20, x + 20, y - 3, y, z - 6, L.PROD_TOP - 5, { tone: "mid", r: 0.4, inner: Ln(k.sideSeam(plan(x - 20, x + 20, y - 3, y, 0.4), z - 3, P, 2), { tone: "faint" }) }),
    dots([[x - 17, y, L.PROD_TOP - 7.5], [x + 17, y, L.PROD_TOP - 7.5], [x - 17, y, z - 3.5], [x + 17, y, z - 3.5]], 0.4, "lo"),
    Ln(arcD, { tone: "lo" }),
    dots([-1, 1].map((s) => [x + Math.sin(s * swing) * (LEVER.len + 2.5), y + 0.2, z + Math.cos(s * swing) * (LEVER.len + 2.5)]), 0.7, "mid"),
    alongY(x, z, y, y + 2.2, 2.4, { tone: "mid" }),
  ].join("");
}
export function leverAt(value) {
  const { x, y, z, len } = LEVER;
  const a = (value * LEVER.swing * Math.PI) / 180;
  const tip = [x + Math.sin(a) * len, y + 2.2, z + Math.cos(a) * len];
  return { d: k.segment([x, y + 2.2, z], tip, P), tip: at(tip) };
}
// the monitor: error-rate dial on a pedestal, 0–5 % over 270°, threshold mark at 1 %
const MON = { x: L.MONITOR, y: 0, r: 9.5, z: L.PROD_TOP + 6 };
export const MON_TOP = MON.z + 5;
export const MON_SPAN = 1.5 * Math.PI;
export const MON_MAX = 5;
function monitorDial() {
  const { x, y, r, z } = MON;
  const top = z + 5;
  const from = -MON_SPAN / 2;
  const t = k.radialTicks(x, y, r - 2.2, 25, 5, top, [1, 2.2], P, from, MON_SPAN);
  const thr = from + (PHYS.threshold / MON_MAX) * MON_SPAN;
  const red = [];
  for (let i = 0; i <= 16; i++) {
    const a = thr + ((MON_SPAN / 2 - thr) * i) / 16;
    red.push(at([x + Math.sin(a) * (r - 2.2), y - Math.cos(a) * (r - 2.2), top]));
  }
  return [
    box(x - 7, x + 7, y - 7, y + 7, L.PROD_TOP, z, { r: 1, bevel: 0.4 }),
    cyl(x, y, r, z, top, { tone: "hi", crease: "lo", bevel: 0.6, steps: 48 }),
    Ln(k.knurl(x, y, r, z + 2.5, top, 52, P, 0.3), { tone: "lo" }),
    Ln(k.ring(x, y, r - 1.6, top, P, 48), { tone: "lo" }),
    Ln(t.minor, { tone: "lo" }), Ln(t.major, { tone: "mid" }),
    Ln("M" + red.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join("L"), { tone: "red" }),
    Ln(k.lineOnTop([x + Math.sin(thr) * (r - 5.4), y - Math.cos(thr) * (r - 5.4)], [x + Math.sin(thr) * (r - 1.6), y - Math.cos(thr) * (r - 1.6)], top, P), { tone: "red" }),
    Ln(k.ring(x, y, 1.2, top, P, 16), { tone: "mid" }),
  ].join("");
}
export function needle(cx, cy, top, r, angle) {
  return k.lineOnTop([cx - Math.sin(angle) * 2.4, cy + Math.cos(angle) * 2.4], [cx + Math.sin(angle) * r, cy - Math.cos(angle) * r], top + 0.2, P);
}
export const DIALS = {
  gauge: { x: L.GAUGE, y: 0, top: DIAL_TOP, r: GAUGE.dialR - 3.5 },
  monitor: { x: MON.x, y: MON.y, top: MON_TOP, r: MON.r - 3 },
};

// ---------------------------------------------------------------- retire bin
const BIN = { x0: L.BIN - 16, x1: L.BIN + 16, y0: -20, y1: 20, h: L.BIN_TOP };
function binBack() {
  const { x0, x1, y0, y1, h } = BIN;
  return [
    box(x0, x1, y0, y1, 0, 2, { tone: "lo" }),
    box(x0, x1, y0, y0 + 2, 0, h, { r: 0.4, inner: Ln(k.sideSeam(plan(x0, x1, y0, y0 + 2, 0.4), 28, P, 2), { tone: "faint" }) }),
    box(x0, x0 + 2, y0, y1, 0, h, { r: 0.4 }),
  ].join("");
}
function binFront() {
  const { x0, x1, y0, y1, h } = BIN;
  const ribs = [14, 28, 42];
  return [
    box(x1 - 2, x1, y0, y1, 0, h, { r: 0.4, inner: Ln(ribs.map((z) => k.ringSeam(k.ringOf(plan(x1 - 2, x1, y0, y1, 0), 2), z, P)).join(""), { tone: "faint" }) }),
    box(x0, x1, y1 - 2, y1, 0, h, { r: 0.4, bevel: 0.3, inner: Ln(ribs.map((z) => k.sideSeam(plan(x0, x1, y1 - 2, y1, 0.4), z, P, 2)).join(""), { tone: "faint" }) }),
    dots([[x0 + 3, y1, h - 3], [x1 - 3, y1, h - 3], [x1, y0 + 3, h - 3], [x1, y1 - 3, h - 3]], 0.42, "lo"),
    Ln(faceRect("y", y1, x0 + 5, x1 - 5, 3, 11, 1), { tone: "lo" }),
    box(L.BIN - 5, L.BIN + 5, y1, y1 + 1.6, 8, 9.6, { r: 0.4 }),
  ].join("");
}

// ---------------------------------------------------------------- gantry crane
function gantryLeg(x, y) {
  return [
    box(x - 6, x + 6, y - 6, y + 6, 0, 3, { r: 1, bevel: 0.4 }),
    dots([[x - 4, y - 4, 3], [x + 4, y + 4, 3]], 0.42),
    box(x - 3, x + 3, y - 3, y + 3, 3, GANTRY.top, { r: 0.6, inner: Ln([40, 90].map((z) => k.sideSeam(plan(x - 3, x + 3, y - 3, y + 3, 0.6), z, P, 3)).join(""), { tone: "faint" }) }),
  ].join("");
}
function gantryTop() {
  const { x0, x1, y, top } = GANTRY;
  const out = [];
  for (const x of [x0, x1]) {
    out.push(box(x - 4, x + 4, -y - 4, y + 4, top, BEAM_Z, { r: 1, bevel: 0.5 }));
    out.push(dots([[x, -y, BEAM_Z], [x, y, BEAM_Z]], 0.5));
  }
  out.push(box(x0 - 4, x1 + 4, -4, 4, BEAM_Z, BEAM_Z + 7, { r: 1, bevel: 0.6, inner: Ln(k.sideSeam(plan(x0 - 4, x1 + 4, -4, 4, 1), BEAM_Z + 3.5, P, 3), { tone: "faint" }) }));
  const strip = plan(x0 + 8, x1 - 8, -4, 4, 0);
  const ticks = k.topTicks(strip.x + 2, strip.x + strip.w - 2, 10, 5, 3.2, BEAM_Z + 7, [-1.6, -3], P);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  return out.join("");
}
export const TROLLEY_Z = BEAM_Z - 12;
export function trolleyBack() {
  return [
    box(-11, 11, -7.5, -5.5, TROLLEY_Z + 2, BEAM_Z + 4, { r: 0.6 }),
    alongY(-6, BEAM_Z + 1, -5.5, -4, 2, { tone: "lo" }),
    alongY(6, BEAM_Z + 1, -5.5, -4, 2, { tone: "lo" }),
  ].join("");
}
export function trolleyBody() {
  return [
    box(-12, 12, -8, 8, TROLLEY_Z - 4, TROLLEY_Z + 2, { r: 1.2, bevel: 0.5 }),
    alongY(0, TROLLEY_Z - 1, -6, 6, 3, { tone: "mid" }),
  ].join("");
}
export function trolleyFront() {
  return [
    box(-11, 11, 5.5, 7.5, TROLLEY_Z + 2, BEAM_Z + 4, { r: 0.6, bevel: 0.3 }),
    alongY(-6, BEAM_Z + 1, 7.5, 9, 2, { tone: "mid" }),
    alongY(6, BEAM_Z + 1, 7.5, 9, 2, { tone: "mid" }),
    dots([[-6, 9, BEAM_Z + 1], [6, 9, BEAM_Z + 1], [-8, 7.5, TROLLEY_Z + 5], [8, 7.5, TROLLEY_Z + 5]], 0.42),
  ].join("");
}
// the hook block, built with the crate bottom at z = 0
export const HOOK_Z = L.CRATE.h + 7;
export function hookBlock() {
  const z = HOOK_Z;
  return [
    box(-1, 1, -1, 1, z, z + 2.4, { tone: "hi", crease: "none", r: 0.3 }),
    box(-3.4, 3.4, -3, 3, z + 2.4, z + 8, { tone: "mid", crease: "faint", r: 0.8, bevel: 0.4 }),
    dots([[-2, 3, z + 5.2], [2, 3, z + 5.2]], 0.4),
  ].join("");
}
export const cableAt = (x, hz) => k.segment([x, 0, hz + HOOK_Z + 8], [x, 0, TROLLEY_Z - 4], P);

// ---------------------------------------------------------------- pipeline board: one lamp per stage along the front edge
export const LAMP_X = { commit: L.MAG, build: L.PRESS, test: L.GAUGE, package: L.PKG, staging: L.STAGING, production: 208, monitor: L.MONITOR };
const RAIL_F = { x0: -258, x1: 292, y0: 40, y1: 49, h: 5 };
function board() {
  const out = [box(RAIL_F.x0, RAIL_F.x1, RAIL_F.y0, RAIL_F.y1, 0, RAIL_F.h, { r: 1.2, bevel: 0.5, inner: Ln(k.sideSeam(plan(RAIL_F.x0, RAIL_F.x1, RAIL_F.y0, RAIL_F.y1, 1.2), 2, P, 3), { tone: "faint" }) })];
  const ys = (RAIL_F.y0 + RAIL_F.y1) / 2;
  // a groove links the lamps in pipeline order
  out.push(Ln(k.lineOnTop([RAIL_F.x0, ys], [RAIL_F.x1, ys], RAIL_F.h, P), { tone: "faint" }));
  for (const name of STAGES) {
    const x = LAMP_X[name];
    out.push(`<g data-station="${name}">`);
    out.push(cyl(x, ys, 3.4, RAIL_F.h, RAIL_F.h + 1.2, { tone: "lo", steps: 24 }));
    out.push(cyl(x, ys, 2.5, RAIL_F.h + 1.2, RAIL_F.h + 2.2, { tone: "mid", steps: 24 }));
    out.push(`<path class="cd-lamp" data-lamp="${name}" d="${k.ring(x, ys, 2.5, RAIL_F.h + 2.2, P, 24)}"/>`);
    out.push(`</g>`);
  }
  out.push(dots([RAIL_F.x0 + 3, RAIL_F.x1 - 3].map((x) => [x, ys, RAIL_F.h]), 0.5));
  // label plate at the right end of the board
  const lp = plan(300, 342, 34, 48, 1);
  out.push(S(k.slabOf(lp, 0, 0.8, P, 4), { tone: "lo" }));
  out.push(Ln(k.planOutline(k.insetPlan(lp, 1.6), 0.8, P), { tone: "faint" }));
  out.push(Ln([[304, 38, 30], [304, 41, 22], [304, 44, 26]].map(([x, y, w]) => k.lineOnTop([x + 2, y], [x + 2 + w, y], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(dots([[302.5, 46.5, 0.8], [339.5, 35.5, 0.8]], 0.42));
  return out.join("");
}

// ---------------------------------------------------------------- assemble in painter's order
const slot = (name) => `<g data-slot="${name}"></g>`;
const mover = (part, body, at3 = [0, 0, 0], extra = "") => `<g data-part="${part}" transform="${k.translateAlong(P, at3)}"${extra}>${body}</g>`;

export function figureBody() {
  const back = [
    station("commit", magazineBack()),
    station("build", pressPost(-PRESS.post)),
    station("test", gaugePost(-GAUGE.post) + kickerBack()),
    `<g data-station="crane">${gantryLeg(GANTRY.x0, -GANTRY.y)}</g>`,
    station("production", beacons()),
    `<g data-station="crane">${gantryLeg(GANTRY.x1, -GANTRY.y)}</g>`,
  ];
  const mid = [
    station("belt", beltUnder()),
    `<path class="iso-line" data-tone="faint" data-part="cleats" d="${cleats(0)}"/>`,
    station("test", mover("kickerPad", kickerPad(), [L.KICK, KICK_REST, 0]) + `<g data-part="kickerRod" transform="${k.translateAlong(P, [L.KICK, 0, 0])}">${kickerRod(KICK_REST)}</g>`),
    slot("mag"),
    station("commit", stack() + magazineSide() + mover("gate", gate())),
    slot("belt"),
    station("belt", railFront()),
    station("commit", magazineFront()),
    station("build", mover("ram", ram(), [L.PRESS, 0, 0])),
    station("test", probeSleeve() + mover("probe", probe(), [L.GAUGE, 0, PROBE_REST])),
    station("package", pkgTable() + dispenserBack()),
    slot("disp"),
    station("package", dispenserFront()),
    slot("pkg"),
    station("package", labelerBody() + mover("labeler", labelerHead())),
    station("staging", stagingTable()),
    slot("staging"),
    station("staging", stagingTester()),
    station("production", prodTable()),
    slot("A"),
    slot("B"),
    station("monitor", monitorDial() + `<path class="iso-line" data-tone="lit" data-part="monNeedle" data-free="start" style="stroke-width:1" d=""/>`),
    station("retire", binBack()),
    slot("bin"),
    station("retire", binFront()),
    slot("air"),
    `<g data-station="crane">`,
    `<path class="iso-line" data-tone="mid" data-part="cable" d=""/>`,
    mover("hook", hookBlock(), [L.PARK, 0, L.TRAVEL]),
    mover("trolleyBack", trolleyBack(), [L.PARK, 0, 0]),
    mover("trolley", trolleyBody(), [L.PARK, 0, 0]),
    `</g>`,
  ];
  const front = [
    station("belt", motor()),
    station("build", pressPost(PRESS.post) + pressHead()),
    station("test", gaugePost(GAUGE.post) + gaugeBar() + `<path class="iso-line" data-tone="lit" data-part="gaugeNeedle" data-free="start" style="stroke-width:1" d=""/>` + rejectBack() + slot("front") + rejectFront()),
    `<g data-station="crane">${gantryLeg(GANTRY.x0, GANTRY.y)}</g>`,
    station("production", leverBase() + `<path class="iso-line" data-tone="hi" data-part="lever" style="stroke-width:1.6" d=""/><circle class="cd-knob" data-part="leverKnob" r="1.5" cx="0" cy="0"/>`),
    `<g data-station="crane">${gantryLeg(GANTRY.x1, GANTRY.y)}${gantryTop()}${mover("trolleyFront", trolleyFront(), [L.PARK, 0, 0])}</g>`,
  ];
  return [base(), ...back, ...mid, ...front, board()].join("");
}

// pool items the page places into slots
export function pool() {
  const part = {
    blank: BLANK(),
    part: PART(),
    bad: BAD(),
  };
  return {
    part: `<g data-part="part" data-station="subject"><g data-shape="blank">${part.blank}</g><g data-shape="part" style="display:none">${part.part}</g><g data-shape="bad" style="display:none">${part.bad}</g></g>`,
    crates: Array.from({ length: 6 }, (_, id) => `<g data-crate="${id}" data-station="artifact">${crate(id)}</g>`),
  };
}

export const LABEL =
  "An isometric bench-top production line that stands for a CI/CD pipeline. From left to right: a magazine of blanks with an exit gate (commit), a hydraulic press (build), a gauge bridge with a probe and a dial plus a kicker over a reject bin (test), a crate dispenser with a labeler (package), a staging table, a production table with two bays, a router lever and an error-rate dial (deploy and monitor), and a gantry crane that carries the crates. A row of status lamps along the front edge shows each stage.";
