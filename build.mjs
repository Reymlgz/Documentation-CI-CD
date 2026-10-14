// Builds the site: node build.mjs  →  index.html (light, with a dark toggle)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as F from "./figure/geometry.mjs";
import { L, PHYS, STAGES, planRun, initialWorld } from "./figure/model.mjs";
import { SITE_CSS, article } from "./site/content.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export /gm, "");
const theme = process.argv.includes("--dark") ? "dark" : "light";

const svg = k.figureSvg({ width: F.WIDTH, height: F.HEIGHT, label: F.LABEL, body: F.figureBody() });


// ---------------------------------------------------------------- close-ups: one per article section
// Each frames its station from world points and loops the stretch of a run where that station works.
const runs = Object.fromEntries(["good", "bad", "regress"].map((kind) => [kind, planRun(initialWorld(), kind)]));
const startOf = (kind, name) => { const key = runs[kind].tracks.stage.find(([, v]) => v === name); return key ? key[0] : null; };
const g = (n) => startOf("good", n);
const frame = (pts, aspect = 16 / 10, pad = 10) => {
  const flat = pts.map((p) => k.iso(p, F.P));
  let x0 = Math.min(...flat.map((q) => q[0])) - pad, x1 = Math.max(...flat.map((q) => q[0])) + pad;
  let y0 = Math.min(...flat.map((q) => q[1])) - pad, y1 = Math.max(...flat.map((q) => q[1])) + pad;
  let w = x1 - x0, h = y1 - y0;
  if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / aspect; y0 -= (nh - h) / 2; h = nh; }
  return [x0, y0, w, h].map((v) => +v.toFixed(1));
};
const cube = (xa, xb, ya, yb, za, zb) => [xa, xb].flatMap((x) => [ya, yb].flatMap((y) => [za, zb].map((z) => [x, y, z])));
const MINIS = {
  commit: { view: frame(cube(L.MAG - 22, L.MAG + 40, -22, 22, 0, 108)), clips: [["good", 0, g("build") + 0.3]], title: "Magazine and gate" },
  build: { view: frame(cube(L.PRESS - 30, L.PRESS + 30, -28, 30, 0, 140)), clips: [["good", g("build"), g("test") - 0.6]], title: "The press" },
  test: { view: frame(cube(L.GAUGE - 22, L.KICK + 22, -44, 40, 0, 96)), clips: [["good", g("test"), g("package") - 0.8], ["bad", startOf("bad", "test"), runs.bad.duration]], title: "Gauge, kicker, reject bin" },
  package: { view: frame(cube(L.PKG - 30, 104, -50, 20, 0, 70)), clips: [["good", g("package"), g("staging") + 0.2]], title: "Crate and labeler" },
  staging: { view: frame(cube(L.PKG - 20, L.STAGING + 22, -50, 22, 0, 150)), clips: [["good", g("staging"), g("production")]], title: "Crane to staging" },
  deploy: { view: frame(cube(L.STAGING - 22, L.BIN + 20, -34, 34, 0, 150)), clips: [["good", g("production"), g("monitor") + 0.8]], title: "Bays, crane, lever" },
  monitor: { view: frame(cube(L.BAY.A - 22, L.MONITOR + 16, -24, 26, 0, 72)), clips: [["good", g("monitor"), runs.good.duration]], title: "Error-rate dial" },
  rollback: { view: frame(cube(L.BAY.A - 22, L.MONITOR + 16, -24, 26, 0, 72)), clips: [["regress", startOf("regress", "monitor"), runs.regress.duration]], title: "Lever back to the last good bay" },
};
const HINTS = { test: "Loop · a pass, then a fail", rollback: "Loop · a hidden regression", monitor: "Loop · a healthy deploy" };
const miniCards = Object.fromEntries(Object.entries(MINIS).map(([id, m], i) => [id, k.plateHtml({
  fig: `Fig ${i + 2}`,
  title: m.title,
  hint: HINTS[id] ?? "Loop · a good commit",
  readout: "",
  body: `<div class="iso-stage cd-mini" data-mini="${id}" role="img" aria-label="Close-up of the ${m.title.toLowerCase()} station, looping its part of a pipeline run." style="aspect-ratio:${m.view[2]} / ${m.view[3]}"></div>`,
})]));

const DATA = {
  P: F.P,
  L,
  PHYS,
  pool: F.pool(),
  RAM_STROKE: F.RAM_STROKE,
  PROBE_REST: F.PROBE_REST,
  KICK_REST: F.KICK_REST,
  KICK_TRAVEL: F.KICK_TRAVEL,
  KICK: { gland: -24, z: 40 },
  LAB_TRAVEL: F.LAB_TRAVEL,
  DIALS: F.DIALS,
  LEVER: F.LEVER,
  MON_SPAN: F.MON_SPAN,
  MON_MAX: F.MON_MAX,
  HOOK_Z: F.HOOK_Z,
  TROLLEY_Z: F.TROLLEY_Z,
  MINIS: Object.fromEntries(Object.entries(MINIS).map(([id, m]) => [id, { view: m.view, clips: m.clips }])),
};

const KEYS = [
  ["01", "Commit", "commit"],
  ["02", "Build", "build"],
  ["03", "Test", "test"],
  ["04", "Package", "package artifact"],
  ["05", "Staging", "staging crane"],
  ["06", "Deploy", "production crane"],
  ["07", "Monitor", "monitor"],
  ["08", "Rollback", "production monitor"],
];

const card = k.plateHtml({
  fig: "Fig 1",
  title: "The CI/CD line",
  hint: "Push a commit · pick a station",
  readout: "idle · v1.4.1 live",
  body: `<div class="iso-stage cd-stage" role="group" aria-label="A CI/CD pipeline drawn as a production line. Use the buttons below to push a commit and watch it go through each station.">${svg}</div>`,
});

const controls = `
<div class="cd-controls">
  <div class="cd-run" role="group" aria-label="Push a commit">
    <button type="button" data-run="good"><span class="cd-dot" data-tone="ok"></span>Push a good commit</button>
    <button type="button" data-run="bad"><span class="cd-dot" data-tone="fail"></span>Push a commit that breaks a test</button>
    <button type="button" data-run="regress"><span class="cd-dot" data-tone="run"></span>Ship a hidden regression</button>
  </div>
  <p class="cd-note" aria-hidden="true"><span class="cd-note-k">now</span> <span data-note>v1.4.1 live</span></p>
  <div class="cd-keys" role="group" aria-label="Highlight a station">
    ${KEYS.map(([n, label, focus]) => `<button type="button" data-focus="${focus}" aria-pressed="false"><span class="cd-num">${n}</span>${label}</button>`).join("")}
  </div>
  <p class="cd-caption">A bench-top line stands in for a pipeline. A blank is a commit; the press is the build; the gauge is the test suite; a labelled crate is the versioned artifact; the crane deploys it to staging and then to the idle production bay; the lever is the router; the dial watches the error rate. Every lamp, reading and version comes from one model of the run. Time is compressed: a real pipeline takes minutes, not seconds.</p>
  <div class="cd-sr" aria-live="polite" data-live></div>
</div>`;

const script = [strip(read("kit/iso-kit.mjs")), strip(read("figure/model.mjs")), `const DATA = ${JSON.stringify(DATA)};`, read("figure/live.js"), read("figure/minis.js"), read("site/page.js")].join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CI/CD, taken apart</title>
<meta name="description" content="Learn how continuous integration and continuous delivery work by watching a commit travel down a bench-top production line.">
<style>${k.ISO_CSS}${SITE_CSS}</style></head>
<body class="iso" data-theme="${theme}">
${article({ card, controls, minis: miniCards })}
<noscript><p class="cd-noscript">This page draws its figures with JavaScript. Open <code>index.html</code> in a web browser (Chrome, Safari, Firefox or Edge) to see them move.</p></noscript>
<script src="app.js" defer></script>
</body></html>`;

const out = "index.html";
writeFileSync(join(HERE, out), html);
// the code lives in its own classic script (not a module), so it also runs from file:// and is never shown as page text
writeFileSync(join(HERE, "app.js"), `"use strict";\n{\n${script}\n}\n`);
console.log("wrote", out, (html.length / 1024).toFixed(0) + " KB");
