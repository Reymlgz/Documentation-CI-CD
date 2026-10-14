"use strict";
{
const AZIMUTH = 45;
const ELEVATION = 30;
const SHADES = 4;
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }) {
    const a = azimuth * RADIANS;
    const e = elevation * RADIANS;
    return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}
function iso([x, y, z], projection) {
    const { origin } = projection;
    const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
    return [origin[0] + (x * sinA - y * cosA) * k, origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}
function towardViewer(projection) {
    const { sinA, cosA } = cameraOf(projection);
    return [cosA, sinA];
}
function depthOf([x, y, z], projection) {
    const { sinA, cosA, sinE, cosE } = cameraOf(projection);
    return (x * cosA + y * sinA) * cosE + z * sinE;
}
const tenth = (value) => {
    const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return text === "-0" ? "0" : text;
};
function pathOf(points, closed = false) {
    if (!points.length)
        return "";
    return points.map(([x, y], at) => `${at ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}
const joinPaths = (paths) => paths.filter(Boolean).join("");
function roundedPlan({ x, y, w, d, r }, steps = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, d / 2));
    const corners = [
        [x + w - radius, y + radius, -90],
        [x + w - radius, y + d - radius, 0],
        [x + radius, y + d - radius, 90],
        [x + radius, y + radius, 180],
    ];
    const out = [];
    for (const [cx, cy, start] of corners) {
        const count = radius > 0 ? steps : 0;
        for (let step = 0; step <= count; step++) {
            const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
            out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
    }
    return out;
}
function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[(index + 1) % points.length];
        area += ax * by - bx * ay;
    }
    return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3)
        return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
            lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
            upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function runsOf(flags, want) {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0)
        return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
        const index = (start + step) % count;
        if (flags[index] === want) {
            if (!run)
                run = [index];
            run.push((index + 1) % count);
        }
        else if (run) {
            runs.push(run);
            run = null;
        }
    }
    if (run)
        runs.push(run);
    return runs;
}
function extrude(ring, z, height, projection, options = {}) {
    const convex = options.convex ?? true;
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const { sinA, cosA } = cameraOf(projection);
    const normals = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy) || 1;
        return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]);
    });
    const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
    const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
    const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
    const outline = [];
    const crease = [];
    for (const run of runsOf(facing, false))
        outline.push(pathOf(run.map((index) => top[index])));
    for (const run of runsOf(facing, true)) {
        crease.push(pathOf(run.map((index) => top[index])));
        if (height > 0)
            outline.push(pathOf(run.map((index) => bottom[index])));
    }
    if (height > 0) {
        for (let index = 0; index < count; index++) {
            if (facing[(index + count - 1) % count] !== facing[index])
                outline.push(pathOf([top[index], bottom[index]]));
        }
    }
    let fill;
    if (convex) {
        fill = pathOf(convexHull([...top, ...bottom]), true);
    }
    else {
        const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const next = (index + 1) % count;
            parts.push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
        fill = parts.join("");
    }
    const buckets = Array.from({ length: SHADES }, () => []);
    if (height > 0) {
        const [lx, ly] = [-sinA, cosA];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const [nx, ny] = normals[index];
            const lit = (nx * lx + ny * ly + 1) / 2;
            const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
            const next = (index + 1) % count;
            buckets[shade].push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
    }
    let bevel;
    if (options.bevel && options.bevel > 0) {
        const by = options.bevel;
        const inset = ring.map(([x, y], index) => {
            const [ax, ay] = normals[(index + count - 1) % count];
            const [bx, by2] = normals[index];
            const mx = ax + bx;
            const my = ay + by2;
            const length = Math.hypot(mx, my) || 1;
            return [x - (mx / length) * by, y - (my / length) * by];
        });
        const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
        bevel = runsOf(facing, true)
            .map((run) => pathOf([top[run[0]], ...run.slice(1, -1).map((index) => insetTop[index]), top[run[run.length - 1]]]))
            .join("");
    }
    return {
        fill,
        outline: outline.join(""),
        crease: crease.join(""),
        top: pathOf(oriented(top), true),
        shades: buckets.map((paths) => paths.join("")),
        bevel,
    };
}
const ringOf = (plan, steps = 8) => roundedPlan(plan, steps);
function slabOf(plan, z, height, projection, steps = 8, bevel = 0) {
    return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}
function circleRing(cx, cy, radius, steps = 40) {
    return Array.from({ length: steps }, (_, step) => {
        const angle = (step / steps) * Math.PI * 2;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
}
function cylinder(cx, cy, radius, z, height, projection, steps = 32, bevel = 0) {
    return extrude(circleRing(cx, cy, radius, steps), z, height, projection, { convex: true, bevel });
}
const insetPlan = ({ x, y, w, d, r }, by) => ({ x: x + by, y: y + by, w: w - by * 2, d: d - by * 2, r: Math.max(0, r - by) });
function onTop(points, z, projection, closed = false) {
    return pathOf(points.map(([x, y]) => iso([x, y, z], projection)), closed);
}
const planOutline = (plan, z, projection, steps = 8) => onTop(ringOf(plan, steps), z, projection, true);
const lineOnTop = (from, to, z, projection) => onTop([from, to], z, projection);
const segment = (from, to, projection) => pathOf([iso(from, projection), iso(to, projection)]);
const rise = (at, from, to, projection) => segment([at[0], at[1], from], [at[0], at[1], to], projection);
const ring = (cx, cy, radius, z, projection, steps = 40) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);
const pointsAt = (points, projection) => points.map((point) => iso(point, projection));
function dotGrid(x, y, columns, rows, gap, z, projection) {
    const dots = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++)
            dots.push(iso([x + column * gap, y + row * gap, z], projection));
    }
    return dots;
}
function corners({ x, y, w, d }, inset = 0) {
    return [
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + d - inset],
        [x + w - inset, y + d - inset],
    ];
}
function boxCorners({ x, y, w, d }, z0, z1) {
    const out = [];
    for (const px of [x, x + w])
        for (const py of [y, y + d])
            for (const z of [z0, z1])
                out.push([px, py, z]);
    return out;
}
function knurl(cx, cy, radius, z0, z1, count, projection, inset = 0.4) {
    const [vx, vy] = towardViewer(projection);
    const lines = [];
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        if (nx * vx + ny * vy < 0.15)
            continue;
        lines.push(segment([cx + radius * nx, cy + radius * ny, z0 + inset], [cx + radius * nx, cy + radius * ny, z1 - inset], projection));
    }
    return lines.join("");
}
function sideArc(cx, cy, radius, z, projection, steps = 24) {
    const [vx, vy] = towardViewer(projection);
    const facing = Math.atan2(vy, vx);
    const points = [];
    for (let step = 0; step <= steps; step++) {
        const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
        points.push(iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection));
    }
    return pathOf(points);
}
function ringSeam(ring, z, projection) {
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const facing = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
        return nx * vx + ny * vy > 1e-9;
    });
    return runsOf(facing, true).map((run) => pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection)))).join("");
}
const sideSeam = (plan, z, projection, steps = 8) => ringSeam(ringOf(plan, steps), z, projection);
function sideRing(center, radius, axis, projection, steps = 20) {
    const [px, py, pz] = center;
    const points = [];
    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        points.push(iso(axis === "x" ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
    }
    return pathOf(points, true);
}
function coil(from, to, center, radius, turns, axis, projection, perTurn = 16) {
    const count = Math.max(1, Math.round(turns * perTurn));
    const back = [];
    const front = [];
    let run = [];
    let near = null;
    for (let index = 0; index <= count; index++) {
        const share = index / count;
        const angle = share * turns * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        const along = from + (to - from) * share;
        const point = axis === "x" ? [along, center[0] + u, center[1] + v] : [center[0] + u, along, center[1] + v];
        const normal = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
        const facing = depthOf(normal, projection) > 0;
        const flat = iso(point, projection);
        if (near === null)
            near = facing;
        if (facing !== near) {
            run.push(flat);
            (near ? front : back).push(pathOf(run));
            run = [flat];
            near = facing;
            continue;
        }
        run.push(flat);
    }
    if (run.length > 1)
        (near ? front : back).push(pathOf(run));
    return { back: back.join(""), front: front.join("") };
}
function topTicks(from, to, step, every, edge, z, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, edge] : [edge, at];
        const b = axis === "x" ? [at, edge + length] : [edge + length, at];
        (big ? major : minor).push(lineOnTop(a, b, z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function sideTicks(from, to, step, every, face, top, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, face, top] : [face, at, top];
        const b = axis === "x" ? [at, face, top - length] : [face, at, top - length];
        (big ? major : minor).push(segment(a, b, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function radialTicks(cx, cy, radius, count, every, z, lengths, projection, from = 0, span = Math.PI * 2) {
    const minor = [];
    const major = [];
    const closed = Math.abs(span - Math.PI * 2) < 1e-9;
    const steps = closed ? count : count + 1;
    for (let index = 0; index < steps; index++) {
        const angle = from + (index / count) * span;
        const big = index % every === 0;
        const inner = radius - (big ? lengths[1] : lengths[0]);
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);
        (big ? major : minor).push(lineOnTop([cx + sx * inner, cy + sy * inner], [cx + sx * radius, cy + sy * radius], z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
const haloOf = (plan, z, height, projection) => slabOf(plan, z, height, projection).fill;
function axisVector(projection, [dx, dy, dz]) {
    const origin = iso([0, 0, 0], projection);
    const moved = iso([dx, dy, dz], projection);
    return [moved[0] - origin[0], moved[1] - origin[1]];
}
const fine = (value) => Math.round(value * 100) / 100;
function translateAlong(projection, by) {
    const [x, y] = axisVector(projection, by);
    return `translate(${fine(x)} ${fine(y)})`;
}
const thousandth = (value) => Math.round(value * 1000) / 1000;
function axesAt(at, z, projection) {
    const origin = iso([at[0], at[1], z], projection);
    const along = (point) => {
        const [px, py] = iso(point, projection);
        return [px - origin[0], py - origin[1]];
    };
    return { origin, x: along([at[0] + 1, at[1], z]), y: along([at[0], at[1] + 1, z]), z: along([at[0], at[1], z + 1]) };
}
const matrixOf = (u, v, origin) => `matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;
function holdStill(element, [dx, dy]) {
    const text = dx || dy ? `translate(${-dx} ${-dy})` : "";
    element.querySelectorAll("[data-hold]").forEach((node) => (text ? node.setAttribute("transform", text) : node.removeAttribute("transform")));
}
function topMatrix(at, z, projection, along = "x") {
    const { origin, x, y } = axesAt(at, z, projection);
    return along === "x" ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}
function sideMatrix(at, z, projection, face) {
    const { origin, x, y, z: up } = axesAt(at, z, projection);
    const down = [-up[0], -up[1]];
    return face === "left" ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}
function screenRise(height, projection) {
    const { cosE, k } = cameraOf(projection);
    return height * cosE * k;
}
function fitProjection(points, width, height, { pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
    const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
    const flat = points.map((point) => iso(point, unit));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const up = Math.min(...ys);
    const down = Math.max(...ys);
    const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
    return {
        origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale],
        scale,
        azimuth,
        elevation,
    };
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (pairs) => Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join("");
function solidSvg(paths, { tone = "hi", crease = "faint", halo = false, lit = false, flat = false, className, inner = "" } = {}) {
    const parts = [];
    if (halo)
        parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
    parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
    if (!flat) {
        paths.shades.forEach((d, shade) => {
            if (d)
                parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
        });
        parts.push(`<path class="iso-top" d="${paths.top}"/>`);
    }
    if (crease !== "none" && paths.crease)
        parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
    if (crease !== "none" && paths.bevel)
        parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
    if (inner)
        parts.push(inner);
    parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
    return `<g${attrs({ class: className ? `iso-solid ${className}` : "iso-solid", "data-lit": lit ? "" : undefined, "data-seamless": paths.seamless ? "" : undefined })}>${parts.join("")}</g>`;
}
function lineSvg(d, { tone = "lo", dotted = false, dashed = false, flow = false, className, free } = {}) {
    if (!d)
        return "";
    return `<path${attrs({
        class: className ? `iso-line ${className}` : "iso-line",
        "data-tone": tone,
        "data-free": free === true ? "" : free || undefined,
        "data-dotted": dotted ? "" : undefined,
        "data-dashed": dashed ? "" : undefined,
        "data-flow": flow ? "" : undefined,
        d,
    })}/>`;
}
function dotsSvg(points, { size = 0.5, tone = "mid", pulse = false } = {}) {
    const dots = points
        .map(([x, y, alpha], index) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ""}/>`)
        .join("");
    return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}
function fadedSvg(list, style = {}) {
    const groups = new Map();
    for (const entry of list) {
        const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
        if (!d || !(alpha > 0.02))
            continue;
        const level = Math.min(1, Math.round(alpha * 20) / 20);
        groups.set(level, (groups.get(level) ?? "") + d);
    }
    return [...groups].map(([alpha, d]) => (alpha >= 1 ? lineSvg(d, style) : `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`)).join("");
}
function fadeLineSvg(points, { fade = [0, 0], tone = "lo", className, stops = 6 } = {}) {
    if (points.length < 2)
        return "";
    const ease = (t) => t * t * (3 - 2 * t);
    const hashOf = (text) => {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(36);
    };
    const lengths = [0];
    for (let index = 1; index < points.length; index++)
        lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const at = (length) => {
        let index = 1;
        while (index < points.length - 1 && lengths[index] < length)
            index++;
        const span = lengths[index] - lengths[index - 1] || 1;
        const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
        return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t];
    };
    const pieceOf = (from, to) => [at(from), ...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6), at(to)];
    const total = lengths[lengths.length - 1];
    if (total < 1e-6)
        return "";
    let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
    if (start + end > total) {
        const share = total / (start + end);
        start *= share;
        end *= share;
    }
    const paint = `var(--anatomy-${tone})`;
    const ramp = (piece, rising) => {
        const d = pathOf(piece);
        const [x1, y1] = piece[0];
        const [x2, y2] = piece[piece.length - 1];
        const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
        const marks = Array.from({ length: stops + 1 }, (_, index) => {
            const t = index / stops;
            const alpha = ease(rising ? t : 1 - t);
            return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
        }).join("");
        const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
        return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : "iso-line", "data-tone": tone, "data-free": rising ? "start" : "end", d, style: `stroke:url(#${id})` })}/>`;
    };
    const parts = [];
    if (start > 0.05)
        parts.push(ramp(pieceOf(0, start), true));
    if (total - end - start > 0.05)
        parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
    if (end > 0.05)
        parts.push(ramp(pieceOf(total - end, total), false));
    return `<g class="iso-fade">${parts.join("")}</g>`;
}
function wireSvg(from, to, { via = [], tone = "lo", dotted = false, dashed = false, flow = false, ends = "both", size = 1.2 } = {}) {
    const d = pathOf([from, ...via, to]);
    const end = ([x, y]) => `<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
    return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === "both" || ends === "from" ? end(from) : ""}${ends === "both" || ends === "to" ? end(to) : ""}</g>`;
}
function faceTextSvg(transform, text, { size = 3, tone = "mid", anchor = "start" } = {}) {
    return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}
function groupSvg(children, extra = {}) {
    return `<g${attrs(extra)}>${Array.isArray(children) ? children.join("") : children}</g>`;
}
function figureSvg({ width, height, label, body, standalone = false, className }) {
    const style = standalone ? `<style>${ISO_CSS}</style>` : "";
    return `<svg${attrs({
        xmlns: "http://www.w3.org/2000/svg",
        class: `iso-svg${standalone ? " iso" : ""}${className ? ` ${className}` : ""}`,
        "data-theme": standalone || undefined,
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": label,
    })}>${style}${Array.isArray(body) ? body.join("") : body}</svg>`;
}
function swatchSvg(mark) {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
        const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
        const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
        return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
function plateHtml({ fig, title, hint, readout = "", keys = [], caption, body }) {
    const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${escape(text)}</span>`;
    const legend = keys.length || caption
        ? `<figcaption class="iso-legend">${keys.length ? `<span class="iso-keys">${keys.map((key) => `<span class="iso-key">${swatchSvg(key.mark)}${escape(key.label)}</span>`).join("")}</span>` : ""}${caption ? `<span class="iso-caption">${escape(caption)}</span>` : ""}</figcaption>`
        : "";
    return `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", fig)}${title ? corner("title", title) : ""}${hint ? corner("hint", hint) : ""}${corner("readout", readout, " data-readout")}</div>${body}</div>${legend}</figure>`;
}
function pageHtml({ title, theme = "dark", body, script = "", width = 650 }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${ISO_CSS}${PAGE_CSS.replace("__WIDTH__", String(width))}</style></head><body class="iso" data-theme="${theme}"><main class="iso-page">${body}</main>${script ? `<script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : ""}</body></html>`;
}
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.iso-page{width:min(__WIDTH__px,100% - 32px);margin:64px auto 96px}
`;
const ISO_CSS = `
.iso{
  --anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;
  --anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;
  --anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;
  --anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;
  --anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;
  --anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;
  --anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;
  --anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);
  --anatomy-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;
}
.iso[data-theme="light"]{
  --anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;
  --anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;
  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;
  --anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;
  --anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;
  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;
  --anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;
  --anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;
}
.iso-svg{display:block;width:100%;height:auto;overflow:visible}
.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}
.iso-fill{fill:var(--anatomy-paper);stroke:none}
.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}
.iso-shade,.iso-top{stroke:none}
.iso-shade[data-shade="0"]{fill:var(--anatomy-shade-0)}
.iso-shade[data-shade="1"]{fill:var(--anatomy-shade-1)}
.iso-shade[data-shade="2"]{fill:var(--anatomy-shade-2)}
.iso-shade[data-shade="3"]{fill:var(--anatomy-shade-3)}
.iso-top{fill:var(--anatomy-top)}
.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}
.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}
.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}
.iso-solid[data-seamless]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}
.iso-solid[data-seamless]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}
.iso-solid[data-seamless]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}
.iso-solid[data-seamless]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}
.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}
.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}
.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}
.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}
.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}
.iso-line[data-tone="hi"]{stroke:var(--anatomy-hi)}
.iso-line[data-tone="mid"]{stroke:var(--anatomy-mid)}
.iso-line[data-tone="lo"]{stroke:var(--anatomy-lo)}
.iso-line[data-tone="faint"]{stroke:var(--anatomy-faint)}
.iso-line[data-tone="lit"]{stroke:var(--anatomy-lit)}
.iso-line[data-tone="red"]{stroke:var(--anatomy-red)}
.iso-line[data-tone="green"]{stroke:var(--anatomy-green)}
.iso-line[data-tone="blue"]{stroke:var(--anatomy-blue)}
.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}
.iso-line[data-dashed]{stroke-dasharray:3 3}
.iso-line[data-flow]{stroke-dasharray:2 6}
.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}
.iso-wire[data-tone="hi"] .iso-wire-end{stroke:var(--anatomy-hi)}
.iso-wire[data-tone="mid"] .iso-wire-end{stroke:var(--anatomy-mid)}
.iso-wire[data-tone="faint"] .iso-wire-end{stroke:var(--anatomy-faint)}
.iso-wire[data-tone="lit"] .iso-wire-end{stroke:var(--anatomy-lit)}
.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}
.iso-dots[data-tone="hi"] circle{opacity:.85}
.iso-dots[data-tone="mid"] circle{opacity:.45}
.iso-dots[data-tone="lo"] circle{opacity:.22}
.iso-dots[data-tone="faint"] circle{opacity:.12}
.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}
.iso-face-text[data-tone="hi"]{fill:var(--anatomy-hi)}
.iso-face-text[data-tone="lo"]{fill:var(--anatomy-lo)}
.iso-face-text[data-tone="faint"]{fill:var(--anatomy-faint)}
.tb-body{fill:var(--anatomy-shade-2);stroke:none}
.tb-shine{fill:var(--anatomy-top);stroke:none}
.tb-shade{fill:var(--anatomy-shade-0);stroke:none}
.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}
.tb-ring[data-tone="mid"]{stroke:var(--anatomy-mid)}
.tb-ring[data-tone="faint"]{stroke:var(--anatomy-faint)}
.tb-ring[data-tone="hi"]{stroke:var(--anatomy-hi)}
@keyframes iso-flow{to{stroke-dashoffset:-32}}
@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}
.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}
.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}
.iso-figure{margin:32px 0 36px}
.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}
.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}
.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}
.iso-plate-corner[data-corner="fig"]{top:0;left:0;color:var(--anatomy-text)}
.iso-plate-corner[data-corner="title"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="hint"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="readout"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.iso-plate .iso-svg{margin:0 auto}
.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}
.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}
.iso-key{display:inline-flex;align-items:center;gap:7px}
.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}
.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.iso-swatch[data-mark="raised"] path,.iso-swatch[data-mark="flat"] path{stroke:var(--anatomy-mid)}
.iso-swatch[data-mark="lit"] path{stroke:var(--anatomy-lit)}
.iso-swatch[data-mark="dim"] path{stroke:var(--anatomy-lo)}
.iso-swatch[data-mark="dotted"] path{stroke-dasharray:.01 3;stroke-width:1.4}
.iso-swatch[data-mark="dashed"] path{stroke-dasharray:3 2.5}
.iso-swatch[data-mark="red"] path{stroke:var(--anatomy-red)}
.iso-swatch[data-mark="green"] path{stroke:var(--anatomy-green)}
.iso-swatch[data-mark="blue"] path{stroke:var(--anatomy-blue)}
.iso-swatch-crease{stroke:var(--anatomy-lo)!important}
@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner="hint"]{bottom:18px}}
@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}
`;

// The pipeline model: one pure module that drives every moving part, lamp and readout.
// A run is planned once as keyframed tracks; the page samples poseAt(run, t) each frame.
// World units are millimetres of a bench-top model line. Time is compressed figure time.

const L = {
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

const PHYS = {
  belt: 60,       // mm/s
  trolley: 170,   // mm/s
  hoist: 85,      // mm/s
  g: 900,         // mm/s², slowed so falls can be followed
  nominal: 13.0,  // finished part height, mm
  tol: 0.2,       // ± tolerance the gauge accepts, mm
  threshold: 1.0, // error rate that triggers a rollback, %
  baseline: 0.2,  // healthy error rate, %
};

const STAGES = ["commit", "build", "test", "package", "staging", "production", "monitor"];

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

function sample(keys, t) {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
  const [t0, v0] = keys[i];
  const next = keys[i + 1];
  if (!next || typeof v0 !== "number" || next[2] === "step") return v0;
  const [t1, v1, ease] = next;
  const p = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return v0 + (v1 - v0) * EASE[ease](p);
}

const fmtVersion = (v) => `v${v[0]}.${v[1]}.${v[2]}`;

function initialWorld() {
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

function placeOf(at) {
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
function planRun(world, kind) {
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

function poseAt(run, t) {
  const p = {};
  for (const [k, keys] of Object.entries(run.tracks)) p[k] = sample(keys, t);
  p.lamps = Object.fromEntries(Object.entries(run.lamps).map(([k, keys]) => [k, sample(keys, t)]));
  p.crates = run.crates.map((c) => ({ id: c.id, x: sample(c.x, t), y: sample(c.y, t), z: sample(c.z, t), filled: sample(c.filled, t), label: sample(c.label, t), held: sample(c.held, t) }));
  return p;
}

// The world after a run: versions, bays, which crate sits where.
function finishRun(world, run) {
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
function restPose(world) {
  const crates = world.crates.map((c) => { const [x, y, z] = placeOf(c.at); return { id: c.id, x, y, z, filled: c.filled ? 1 : 0, label: c.label, held: 0 }; });
  return {
    partX: L.MAG, partY: 0, partZ: L.BT, partShape: "blank", partVis: 1, partSlot: "mag", belt: world.belt || 0, gate: 0, stack: 0, stack0: 0, ram: 0, probe: 0, dial: 0,
    kicker: 0, labeler: 0, craneX: L.PARK, craneZ: L.TRAVEL, lever: world.live === "A" ? -1 : 1, monitor: PHYS.baseline,
    stage: "idle", note: `${world.lastLive} live`, lamps: Object.fromEntries(STAGES.map((s) => [s, s === "production" ? "ok" : "off"])), crates,
  };
}

const DATA = {"P":{"origin":[389.70830135132934,257.10028746255097],"scale":1.116263024702067,"azimuth":58,"elevation":30},"L":{"BT":34,"BELT":[-250,40],"MAG":-235,"GATE":-223,"PRESS":-150,"GAUGE":-60,"KICK":-32,"PKG":62,"PKG_TOP":4,"DISP_Y":-32,"LABELER":84,"STAGING":126,"STAGING_TOP":26,"BAY":{"A":186,"B":230},"PROD_TOP":44,"MONITOR":264,"BIN":306,"BIN_TOP":56,"PARK":62,"TRAVEL":72,"CRATE":{"w":26,"h":14,"floor":1.6},"PART":{"w":12,"body":10,"boss":3,"burr":1.2}},"PHYS":{"belt":60,"trolley":170,"hoist":85,"g":900,"nominal":13,"tol":0.2,"threshold":1,"baseline":0.2},"pool":{"part":"<g data-part=\"part\" data-station=\"subject\"><g data-shape=\"blank\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.4 246.1L378.5 245.9L386.6 239.4L386.9 239.2L387.3 239.2L387.7 239.3L400.7 243.3L401 243.5L401.1 243.7L401.1 255.9L400.9 256.1L392.9 262.6L392.5 262.7L392.1 262.8L391.7 262.7L378.8 258.7L378.5 258.5L378.4 258.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M401.1 255.9L400.9 256.1L400.9 243.9L401.1 243.7ZM400.9 256.1L392.9 262.6L392.9 250.3L400.9 243.9ZM392.9 262.6L392.5 262.7L392.5 250.5L392.9 250.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.5 262.7L392.1 262.8L392.1 250.5L392.5 250.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M392.1 262.8L391.7 262.7L391.7 250.5L392.1 250.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391.7 262.7L378.8 258.7L378.8 246.4L391.7 250.5ZM378.8 258.7L378.5 258.5L378.5 246.3L378.8 246.4ZM378.5 258.5L378.4 258.3L378.4 246.1L378.5 246.3Z\"/><path class=\"iso-top\" d=\"M400.7 243.3L401 243.5L401.1 243.7L400.9 243.9L392.9 250.3L392.5 250.5L392.1 250.5L391.7 250.5L378.8 246.4L378.5 246.3L378.4 246.1L378.5 245.9L386.6 239.4L386.9 239.2L387.3 239.2L387.7 239.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M401.1 243.7L400.9 243.9L392.9 250.3L392.5 250.5L392.1 250.5L391.7 250.5L378.8 246.4L378.5 246.3L378.4 246.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M401.1 243.7L400.3 243.7L392.3 250.1L392.2 250.2L392.1 250.2L392 250.2L379.2 246.2L379.1 246.1L378.4 246.1\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M401.1 249.8L400.9 250L392.9 256.5L392.5 256.6L392.1 256.7L391.7 256.6L378.8 252.6L378.5 252.4L378.4 252.2\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.4 246.1L378.5 245.9L386.6 239.4L386.9 239.2L387.3 239.2L387.7 239.3L400.7 243.3L401 243.5L401.1 243.7M401.1 255.9L400.9 256.1L392.9 262.6L392.5 262.7L392.1 262.8L391.7 262.7L378.8 258.7L378.5 258.5L378.4 258.3M401.1 243.7L401.1 255.9M378.4 246.1L378.4 258.3\"/></g></g><g data-shape=\"part\" style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 243L393.8 242.5ZM393 246.6L392 247L392 243.3L393 243ZM394.5 245L394.3 245.6L394.3 241.9L394.5 241.3ZM394.3 245.6L393.8 246.1L393.8 242.5L394.3 241.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 243.5L392 243.3ZM390.8 247.2L389.5 247.3L389.5 243.6L390.8 243.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 243.5L389.5 243.6ZM388.3 247.2L387.2 246.9L387.2 243.2L388.3 243.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 242.8L387.2 243.2ZM386.2 246.5L385.5 246L385.5 242.3L386.2 242.8ZM385.5 246L385 245.4L385 241.7L385.5 242.3ZM385 245.4L384.9 244.8L384.9 241.1L385 241.7Z\"/><path class=\"iso-top\" d=\"M393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.3 241.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 241.3L394.3 241.9L393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 241.3L393.8 241.8L393.4 242.3L392.6 242.8L391.7 243.1L390.7 243.3L389.6 243.4L388.4 243.3L387.4 243L386.6 242.7L385.9 242.2L385.5 241.7L384.9 241.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 241.1L384.9 244.8M394.5 241.3L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 241.7L390.9 242L390.2 242.2L389.4 242.2L388.7 242L388.1 241.8L387.8 241.4L387.8 241L388 240.7L388.6 240.4L389.3 240.2L390 240.2L390.8 240.4L391.3 240.6L391.6 241L391.7 241.4Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g></g><g data-shape=\"bad\" style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 241.5L393.8 241ZM393 246.6L392 247L392 241.9L393 241.5ZM394.5 245L394.3 245.6L394.3 240.4L394.5 239.8ZM394.3 245.6L393.8 246.1L393.8 241L394.3 240.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 242.1L392 241.9ZM390.8 247.2L389.5 247.3L389.5 242.1L390.8 242.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 242L389.5 242.1ZM388.3 247.2L387.2 246.9L387.2 241.8L388.3 242Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 241.4L387.2 241.8ZM386.2 246.5L385.5 246L385.5 240.9L386.2 241.4ZM385.5 246L385 245.4L385 240.3L385.5 240.9ZM385 245.4L384.9 244.8L384.9 239.7L385 240.3Z\"/><path class=\"iso-top\" d=\"M393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 239.8L394.3 240.4L393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 239.8L393.8 240.4L393.4 240.9L392.6 241.3L391.7 241.6L390.7 241.8L389.6 241.9L388.4 241.8L387.4 241.6L386.6 241.2L385.9 240.7L385.5 240.2L384.9 239.7\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 239.7L384.9 244.8M394.5 239.8L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 240.3L390.9 240.5L390.2 240.7L389.4 240.7L388.7 240.6L388.1 240.3L387.8 240L387.8 239.6L388 239.2L388.6 238.9L389.3 238.8L390 238.8L390.8 238.9L391.3 239.2L391.6 239.5L391.7 239.9Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1L395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M395.8 242.3L395.7 242.5L395.7 240.3L395.8 240.1ZM395.7 242.5L394.7 243.3L394.7 241.1L395.7 240.3ZM394.7 243.3L394.4 243.5L394.4 241.3L394.7 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M394.4 243.5L394.1 243.5L394.1 241.3L394.4 241.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M394.1 243.5L393.7 243.5L393.7 241.3L394.1 241.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M393.7 243.5L390.8 242.6L390.8 240.4L393.7 241.3ZM390.8 242.6L390.6 242.4L390.6 240.2L390.8 240.4ZM390.6 242.4L390.5 242.2L390.5 240L390.6 240.2Z\"/><path class=\"iso-top\" d=\"M395.5 239.8L395.8 240L395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1M395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2M395.8 240.1L395.8 242.3M390.5 240L390.5 242.2\"/></g></g></g>","crates":["<g data-crate=\"0\" data-station=\"artifact\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4L414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.6 254.4L414.4 254.7L414.4 252.7L414.6 252.4ZM414.4 254.7L396.1 269.3L396.1 267.3L414.4 252.7ZM396.1 269.3L395.7 269.5L395.7 267.5L396.1 267.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.5L395.1 269.5L395.1 267.6L395.7 267.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.1 269.5L394.6 269.4L394.6 267.5L395.1 267.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.6 269.4L365.4 260.3L365.4 258.4L394.6 267.5ZM365.4 260.3L365 260.1L365 258.1L365.4 258.4ZM365 260.1L364.8 259.8L364.8 257.9L365 258.1Z\"/><path class=\"iso-top\" d=\"M414 251.9L414.4 252.1L414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4M414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8M414.6 252.4L414.6 254.4M364.8 257.9L364.8 259.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L414.2 254.8L414.2 237.7L414.6 237.4ZM414.2 254.8L413.9 255L413.9 237.8L414.2 237.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M413.9 255L413.6 255L413.6 237.9L413.9 237.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M413.6 255L413.2 255L413.2 237.8L413.6 237.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M413.2 255L383.3 245.6L383.3 228.5L413.2 237.8ZM383.3 245.6L383 245.5L383 228.3L383.3 228.5ZM383 245.5L382.9 245.3L382.9 228.2L383 228.3Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3M414.7 237.2L414.7 254.3M382.9 228.2L382.9 245.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1L385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M385.5 245.2L385.4 245.4L385.4 228.2L385.5 228.1ZM385.4 245.4L366.7 260.3L366.7 243.2L385.4 228.2ZM366.7 260.3L366.4 260.4L366.4 243.3L366.7 243.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M366.4 260.4L366.1 260.5L366.1 243.4L366.4 243.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M366.1 260.5L365.7 260.4L365.7 243.3L366.1 243.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M365.7 260.4L365 260.2L365 243.1L365.7 243.3ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M385.2 227.7L385.4 227.9L385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1M385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9M385.5 228.1L385.5 245.2M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5L400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.5 232.6L400.4 232.8L400.4 226.6L400.5 226.5ZM400.4 232.8L399.7 233.4L399.7 227.2L400.4 226.6ZM399.7 233.4L399.5 233.4L399.5 227.3L399.7 227.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.5 233.4L399.3 233.4L399.3 227.3L399.5 227.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.3 233.4L399.1 233.4L399.1 227.3L399.3 227.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.1 233.4L397.4 232.9L397.4 226.8L399.1 227.3ZM397.4 232.9L397.3 232.8L397.3 226.7L397.4 226.8ZM397.3 232.8L397.2 232.7L397.2 226.6L397.3 226.7Z\"/><path class=\"iso-top\" d=\"M400.3 226.3L400.4 226.4L400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5M400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7M400.5 226.5L400.5 232.6M397.2 226.6L397.2 232.7\"/></g><g data-inner style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 243L393.8 242.5ZM393 246.6L392 247L392 243.3L393 243ZM394.5 245L394.3 245.6L394.3 241.9L394.5 241.3ZM394.3 245.6L393.8 246.1L393.8 242.5L394.3 241.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 243.5L392 243.3ZM390.8 247.2L389.5 247.3L389.5 243.6L390.8 243.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 243.5L389.5 243.6ZM388.3 247.2L387.2 246.9L387.2 243.2L388.3 243.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 242.8L387.2 243.2ZM386.2 246.5L385.5 246L385.5 242.3L386.2 242.8ZM385.5 246L385 245.4L385 241.7L385.5 242.3ZM385 245.4L384.9 244.8L384.9 241.1L385 241.7Z\"/><path class=\"iso-top\" d=\"M393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.3 241.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 241.3L394.3 241.9L393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 241.3L393.8 241.8L393.4 242.3L392.6 242.8L391.7 243.1L390.7 243.3L389.6 243.4L388.4 243.3L387.4 243L386.6 242.7L385.9 242.2L385.5 241.7L384.9 241.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 241.1L384.9 244.8M394.5 241.3L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 241.7L390.9 242L390.2 242.2L389.4 242.2L388.7 242L388.1 241.8L387.8 241.4L387.8 241L388 240.7L388.6 240.4L389.3 240.2L390 240.2L390.8 240.4L391.3 240.6L391.6 241L391.7 241.4Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g></g><g data-bad style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 241.5L393.8 241ZM393 246.6L392 247L392 241.9L393 241.5ZM394.5 245L394.3 245.6L394.3 240.4L394.5 239.8ZM394.3 245.6L393.8 246.1L393.8 241L394.3 240.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 242.1L392 241.9ZM390.8 247.2L389.5 247.3L389.5 242.1L390.8 242.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 242L389.5 242.1ZM388.3 247.2L387.2 246.9L387.2 241.8L388.3 242Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 241.4L387.2 241.8ZM386.2 246.5L385.5 246L385.5 240.9L386.2 241.4ZM385.5 246L385 245.4L385 240.3L385.5 240.9ZM385 245.4L384.9 244.8L384.9 239.7L385 240.3Z\"/><path class=\"iso-top\" d=\"M393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 239.8L394.3 240.4L393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 239.8L393.8 240.4L393.4 240.9L392.6 241.3L391.7 241.6L390.7 241.8L389.6 241.9L388.4 241.8L387.4 241.6L386.6 241.2L385.9 240.7L385.5 240.2L384.9 239.7\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 239.7L384.9 244.8M394.5 239.8L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 240.3L390.9 240.5L390.2 240.7L389.4 240.7L388.7 240.6L388.1 240.3L387.8 240L387.8 239.6L388 239.2L388.6 238.9L389.3 238.8L390 238.8L390.8 238.9L391.3 239.2L391.6 239.5L391.7 239.9Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1L395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M395.8 242.3L395.7 242.5L395.7 240.3L395.8 240.1ZM395.7 242.5L394.7 243.3L394.7 241.1L395.7 240.3ZM394.7 243.3L394.4 243.5L394.4 241.3L394.7 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M394.4 243.5L394.1 243.5L394.1 241.3L394.4 241.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M394.1 243.5L393.7 243.5L393.7 241.3L394.1 241.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M393.7 243.5L390.8 242.6L390.8 240.4L393.7 241.3ZM390.8 242.6L390.6 242.4L390.6 240.2L390.8 240.4ZM390.6 242.4L390.5 242.2L390.5 240L390.6 240.2Z\"/><path class=\"iso-top\" d=\"M395.5 239.8L395.8 240L395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1M395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2M395.8 240.1L395.8 242.3M390.5 240L390.5 242.2\"/></g></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L395.9 269.4L395.9 252.3L414.6 237.4ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L394.2 269.3L394.2 252.2L394.9 252.4ZM394.2 269.3L394 269.2L394 252.1L394.2 252.2ZM394 269.2L393.9 269L393.9 251.9L394 252.1Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M415 250.5L395.5 266.1L393.6 265.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269M414.7 237.2L414.7 254.3M393.9 251.9L393.9 269\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8L396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M396.5 268.9L396.4 269.1L396.4 252L396.5 251.8ZM396.4 269.1L395.9 269.4L395.9 252.3L396.4 252ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L365 260.2L365 243.1L394.9 252.4ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M396.1 251.5L396.4 251.6L396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M396.7 265.1L395.5 266.1L364.4 256.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8M396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9M396.5 251.8L396.5 268.9M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"366.8\" cy=\"246.1\" r=\"0.4\"/><circle cx=\"393.2\" cy=\"254.3\" r=\"0.4\"/><circle cx=\"413.5\" cy=\"240.7\" r=\"0.4\"/><circle cx=\"397\" cy=\"253.9\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1L382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.2 247.3L382.2 247.4L382.2 241.2L382.2 241.1ZM382.2 247.4L381.4 248L381.4 241.8L382.2 241.2ZM381.4 248L381.2 248L381.2 241.9L381.4 241.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.2 248L381 248.1L381 241.9L381.2 241.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381 248.1L380.8 248L380.8 241.9L381 241.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 248L379.1 247.5L379.1 241.4L380.8 241.9ZM379.1 247.5L379 247.4L379 241.3L379.1 241.4ZM379 247.4L378.9 247.3L378.9 241.2L379 241.3Z\"/><path class=\"iso-top\" d=\"M382 241L382.2 241L382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1M382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3M382.2 241.1L382.2 247.3M378.9 241.2L378.9 247.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2L400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.6 226.7L400.5 226.8L400.5 224.4L400.6 224.2ZM400.5 226.8L381.8 241.8L381.8 239.4L400.5 224.4ZM381.8 241.8L381.5 241.9L381.5 239.5L381.8 239.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.5 241.9L381.2 242L381.2 239.5L381.5 239.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381.2 242L380.8 241.9L380.8 239.5L381.2 239.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 241.9L379.1 241.4L379.1 238.9L380.8 239.5ZM379.1 241.4L378.9 241.3L378.9 238.8L379.1 238.9ZM378.9 241.3L378.8 241.1L378.8 238.6L378.9 238.8Z\"/><path class=\"iso-top\" d=\"M400.3 223.9L400.5 224L400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M400.6 224.2L400.1 224.3L381.5 239.2L381.3 239.3L381.2 239.3L381 239.3L379.4 238.8L379.3 238.7L378.8 238.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2M400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1M400.6 224.2L400.6 226.7M378.8 238.6L378.8 241.1\"/></g><g data-tag style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.6 244.5L411.6 244.5L411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.4 262.5L399.4 262.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M411.6 253.1L411.6 253.2L411.6 244.6L411.6 244.5ZM411.6 253.2L399.9 262.5L399.9 253.9L411.6 244.6ZM399.9 262.5L399.8 262.6L399.8 254L399.9 253.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.8 262.6L399.7 262.6L399.7 254L399.8 254Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.7 262.6L399.5 262.5L399.5 254L399.7 254Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.5 254L399.5 254L399.5 262.5L399.5 262.5ZM399.5 262.5L399.4 262.5L399.4 253.9L399.5 254ZM399.4 262.5L399.4 262.4L399.4 253.9L399.4 253.9Z\"/><path class=\"iso-top\" d=\"M411.5 244.4L411.6 244.5L411.6 244.5L411.6 244.6L399.9 253.9L399.8 254L399.7 254L399.5 254L399.5 254L399.4 253.9L399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4Z\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.5 244.4L411.6 244.5L411.6 244.5M411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.5 262.5L399.4 262.5L399.4 262.4M411.6 244.5L411.6 253.1M399.4 253.9L399.4 262.4\"/></g><text class=\"iso-face-text\" data-tone=\"hi\" data-label transform=\"matrix(0.748 -0.599 0 1.223 405.754 255.021)\" font-size=\"3.4\" text-anchor=\"middle\"></text></g></g>","<g data-crate=\"1\" data-station=\"artifact\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4L414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.6 254.4L414.4 254.7L414.4 252.7L414.6 252.4ZM414.4 254.7L396.1 269.3L396.1 267.3L414.4 252.7ZM396.1 269.3L395.7 269.5L395.7 267.5L396.1 267.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.5L395.1 269.5L395.1 267.6L395.7 267.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.1 269.5L394.6 269.4L394.6 267.5L395.1 267.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.6 269.4L365.4 260.3L365.4 258.4L394.6 267.5ZM365.4 260.3L365 260.1L365 258.1L365.4 258.4ZM365 260.1L364.8 259.8L364.8 257.9L365 258.1Z\"/><path class=\"iso-top\" d=\"M414 251.9L414.4 252.1L414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4M414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8M414.6 252.4L414.6 254.4M364.8 257.9L364.8 259.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L414.2 254.8L414.2 237.7L414.6 237.4ZM414.2 254.8L413.9 255L413.9 237.8L414.2 237.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M413.9 255L413.6 255L413.6 237.9L413.9 237.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M413.6 255L413.2 255L413.2 237.8L413.6 237.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M413.2 255L383.3 245.6L383.3 228.5L413.2 237.8ZM383.3 245.6L383 245.5L383 228.3L383.3 228.5ZM383 245.5L382.9 245.3L382.9 228.2L383 228.3Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3M414.7 237.2L414.7 254.3M382.9 228.2L382.9 245.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1L385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M385.5 245.2L385.4 245.4L385.4 228.2L385.5 228.1ZM385.4 245.4L366.7 260.3L366.7 243.2L385.4 228.2ZM366.7 260.3L366.4 260.4L366.4 243.3L366.7 243.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M366.4 260.4L366.1 260.5L366.1 243.4L366.4 243.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M366.1 260.5L365.7 260.4L365.7 243.3L366.1 243.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M365.7 260.4L365 260.2L365 243.1L365.7 243.3ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M385.2 227.7L385.4 227.9L385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1M385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9M385.5 228.1L385.5 245.2M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5L400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.5 232.6L400.4 232.8L400.4 226.6L400.5 226.5ZM400.4 232.8L399.7 233.4L399.7 227.2L400.4 226.6ZM399.7 233.4L399.5 233.4L399.5 227.3L399.7 227.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.5 233.4L399.3 233.4L399.3 227.3L399.5 227.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.3 233.4L399.1 233.4L399.1 227.3L399.3 227.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.1 233.4L397.4 232.9L397.4 226.8L399.1 227.3ZM397.4 232.9L397.3 232.8L397.3 226.7L397.4 226.8ZM397.3 232.8L397.2 232.7L397.2 226.6L397.3 226.7Z\"/><path class=\"iso-top\" d=\"M400.3 226.3L400.4 226.4L400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5M400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7M400.5 226.5L400.5 232.6M397.2 226.6L397.2 232.7\"/></g><g data-inner style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 243L393.8 242.5ZM393 246.6L392 247L392 243.3L393 243ZM394.5 245L394.3 245.6L394.3 241.9L394.5 241.3ZM394.3 245.6L393.8 246.1L393.8 242.5L394.3 241.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 243.5L392 243.3ZM390.8 247.2L389.5 247.3L389.5 243.6L390.8 243.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 243.5L389.5 243.6ZM388.3 247.2L387.2 246.9L387.2 243.2L388.3 243.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 242.8L387.2 243.2ZM386.2 246.5L385.5 246L385.5 242.3L386.2 242.8ZM385.5 246L385 245.4L385 241.7L385.5 242.3ZM385 245.4L384.9 244.8L384.9 241.1L385 241.7Z\"/><path class=\"iso-top\" d=\"M393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.3 241.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 241.3L394.3 241.9L393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 241.3L393.8 241.8L393.4 242.3L392.6 242.8L391.7 243.1L390.7 243.3L389.6 243.4L388.4 243.3L387.4 243L386.6 242.7L385.9 242.2L385.5 241.7L384.9 241.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 241.1L384.9 244.8M394.5 241.3L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 241.7L390.9 242L390.2 242.2L389.4 242.2L388.7 242L388.1 241.8L387.8 241.4L387.8 241L388 240.7L388.6 240.4L389.3 240.2L390 240.2L390.8 240.4L391.3 240.6L391.6 241L391.7 241.4Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g></g><g data-bad style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 241.5L393.8 241ZM393 246.6L392 247L392 241.9L393 241.5ZM394.5 245L394.3 245.6L394.3 240.4L394.5 239.8ZM394.3 245.6L393.8 246.1L393.8 241L394.3 240.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 242.1L392 241.9ZM390.8 247.2L389.5 247.3L389.5 242.1L390.8 242.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 242L389.5 242.1ZM388.3 247.2L387.2 246.9L387.2 241.8L388.3 242Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 241.4L387.2 241.8ZM386.2 246.5L385.5 246L385.5 240.9L386.2 241.4ZM385.5 246L385 245.4L385 240.3L385.5 240.9ZM385 245.4L384.9 244.8L384.9 239.7L385 240.3Z\"/><path class=\"iso-top\" d=\"M393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 239.8L394.3 240.4L393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 239.8L393.8 240.4L393.4 240.9L392.6 241.3L391.7 241.6L390.7 241.8L389.6 241.9L388.4 241.8L387.4 241.6L386.6 241.2L385.9 240.7L385.5 240.2L384.9 239.7\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 239.7L384.9 244.8M394.5 239.8L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 240.3L390.9 240.5L390.2 240.7L389.4 240.7L388.7 240.6L388.1 240.3L387.8 240L387.8 239.6L388 239.2L388.6 238.9L389.3 238.8L390 238.8L390.8 238.9L391.3 239.2L391.6 239.5L391.7 239.9Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1L395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M395.8 242.3L395.7 242.5L395.7 240.3L395.8 240.1ZM395.7 242.5L394.7 243.3L394.7 241.1L395.7 240.3ZM394.7 243.3L394.4 243.5L394.4 241.3L394.7 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M394.4 243.5L394.1 243.5L394.1 241.3L394.4 241.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M394.1 243.5L393.7 243.5L393.7 241.3L394.1 241.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M393.7 243.5L390.8 242.6L390.8 240.4L393.7 241.3ZM390.8 242.6L390.6 242.4L390.6 240.2L390.8 240.4ZM390.6 242.4L390.5 242.2L390.5 240L390.6 240.2Z\"/><path class=\"iso-top\" d=\"M395.5 239.8L395.8 240L395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1M395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2M395.8 240.1L395.8 242.3M390.5 240L390.5 242.2\"/></g></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L395.9 269.4L395.9 252.3L414.6 237.4ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L394.2 269.3L394.2 252.2L394.9 252.4ZM394.2 269.3L394 269.2L394 252.1L394.2 252.2ZM394 269.2L393.9 269L393.9 251.9L394 252.1Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M415 250.5L395.5 266.1L393.6 265.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269M414.7 237.2L414.7 254.3M393.9 251.9L393.9 269\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8L396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M396.5 268.9L396.4 269.1L396.4 252L396.5 251.8ZM396.4 269.1L395.9 269.4L395.9 252.3L396.4 252ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L365 260.2L365 243.1L394.9 252.4ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M396.1 251.5L396.4 251.6L396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M396.7 265.1L395.5 266.1L364.4 256.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8M396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9M396.5 251.8L396.5 268.9M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"366.8\" cy=\"246.1\" r=\"0.4\"/><circle cx=\"393.2\" cy=\"254.3\" r=\"0.4\"/><circle cx=\"413.5\" cy=\"240.7\" r=\"0.4\"/><circle cx=\"397\" cy=\"253.9\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1L382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.2 247.3L382.2 247.4L382.2 241.2L382.2 241.1ZM382.2 247.4L381.4 248L381.4 241.8L382.2 241.2ZM381.4 248L381.2 248L381.2 241.9L381.4 241.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.2 248L381 248.1L381 241.9L381.2 241.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381 248.1L380.8 248L380.8 241.9L381 241.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 248L379.1 247.5L379.1 241.4L380.8 241.9ZM379.1 247.5L379 247.4L379 241.3L379.1 241.4ZM379 247.4L378.9 247.3L378.9 241.2L379 241.3Z\"/><path class=\"iso-top\" d=\"M382 241L382.2 241L382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1M382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3M382.2 241.1L382.2 247.3M378.9 241.2L378.9 247.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2L400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.6 226.7L400.5 226.8L400.5 224.4L400.6 224.2ZM400.5 226.8L381.8 241.8L381.8 239.4L400.5 224.4ZM381.8 241.8L381.5 241.9L381.5 239.5L381.8 239.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.5 241.9L381.2 242L381.2 239.5L381.5 239.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381.2 242L380.8 241.9L380.8 239.5L381.2 239.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 241.9L379.1 241.4L379.1 238.9L380.8 239.5ZM379.1 241.4L378.9 241.3L378.9 238.8L379.1 238.9ZM378.9 241.3L378.8 241.1L378.8 238.6L378.9 238.8Z\"/><path class=\"iso-top\" d=\"M400.3 223.9L400.5 224L400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M400.6 224.2L400.1 224.3L381.5 239.2L381.3 239.3L381.2 239.3L381 239.3L379.4 238.8L379.3 238.7L378.8 238.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2M400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1M400.6 224.2L400.6 226.7M378.8 238.6L378.8 241.1\"/></g><g data-tag style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.6 244.5L411.6 244.5L411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.4 262.5L399.4 262.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M411.6 253.1L411.6 253.2L411.6 244.6L411.6 244.5ZM411.6 253.2L399.9 262.5L399.9 253.9L411.6 244.6ZM399.9 262.5L399.8 262.6L399.8 254L399.9 253.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.8 262.6L399.7 262.6L399.7 254L399.8 254Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.7 262.6L399.5 262.5L399.5 254L399.7 254Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.5 254L399.5 254L399.5 262.5L399.5 262.5ZM399.5 262.5L399.4 262.5L399.4 253.9L399.5 254ZM399.4 262.5L399.4 262.4L399.4 253.9L399.4 253.9Z\"/><path class=\"iso-top\" d=\"M411.5 244.4L411.6 244.5L411.6 244.5L411.6 244.6L399.9 253.9L399.8 254L399.7 254L399.5 254L399.5 254L399.4 253.9L399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4Z\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.5 244.4L411.6 244.5L411.6 244.5M411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.5 262.5L399.4 262.5L399.4 262.4M411.6 244.5L411.6 253.1M399.4 253.9L399.4 262.4\"/></g><text class=\"iso-face-text\" data-tone=\"hi\" data-label transform=\"matrix(0.748 -0.599 0 1.223 405.754 255.021)\" font-size=\"3.4\" text-anchor=\"middle\"></text></g></g>","<g data-crate=\"2\" data-station=\"artifact\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4L414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.6 254.4L414.4 254.7L414.4 252.7L414.6 252.4ZM414.4 254.7L396.1 269.3L396.1 267.3L414.4 252.7ZM396.1 269.3L395.7 269.5L395.7 267.5L396.1 267.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.5L395.1 269.5L395.1 267.6L395.7 267.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.1 269.5L394.6 269.4L394.6 267.5L395.1 267.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.6 269.4L365.4 260.3L365.4 258.4L394.6 267.5ZM365.4 260.3L365 260.1L365 258.1L365.4 258.4ZM365 260.1L364.8 259.8L364.8 257.9L365 258.1Z\"/><path class=\"iso-top\" d=\"M414 251.9L414.4 252.1L414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4M414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8M414.6 252.4L414.6 254.4M364.8 257.9L364.8 259.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L414.2 254.8L414.2 237.7L414.6 237.4ZM414.2 254.8L413.9 255L413.9 237.8L414.2 237.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M413.9 255L413.6 255L413.6 237.9L413.9 237.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M413.6 255L413.2 255L413.2 237.8L413.6 237.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M413.2 255L383.3 245.6L383.3 228.5L413.2 237.8ZM383.3 245.6L383 245.5L383 228.3L383.3 228.5ZM383 245.5L382.9 245.3L382.9 228.2L383 228.3Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3M414.7 237.2L414.7 254.3M382.9 228.2L382.9 245.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1L385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M385.5 245.2L385.4 245.4L385.4 228.2L385.5 228.1ZM385.4 245.4L366.7 260.3L366.7 243.2L385.4 228.2ZM366.7 260.3L366.4 260.4L366.4 243.3L366.7 243.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M366.4 260.4L366.1 260.5L366.1 243.4L366.4 243.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M366.1 260.5L365.7 260.4L365.7 243.3L366.1 243.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M365.7 260.4L365 260.2L365 243.1L365.7 243.3ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M385.2 227.7L385.4 227.9L385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1M385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9M385.5 228.1L385.5 245.2M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5L400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.5 232.6L400.4 232.8L400.4 226.6L400.5 226.5ZM400.4 232.8L399.7 233.4L399.7 227.2L400.4 226.6ZM399.7 233.4L399.5 233.4L399.5 227.3L399.7 227.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.5 233.4L399.3 233.4L399.3 227.3L399.5 227.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.3 233.4L399.1 233.4L399.1 227.3L399.3 227.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.1 233.4L397.4 232.9L397.4 226.8L399.1 227.3ZM397.4 232.9L397.3 232.8L397.3 226.7L397.4 226.8ZM397.3 232.8L397.2 232.7L397.2 226.6L397.3 226.7Z\"/><path class=\"iso-top\" d=\"M400.3 226.3L400.4 226.4L400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5M400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7M400.5 226.5L400.5 232.6M397.2 226.6L397.2 232.7\"/></g><g data-inner style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 243L393.8 242.5ZM393 246.6L392 247L392 243.3L393 243ZM394.5 245L394.3 245.6L394.3 241.9L394.5 241.3ZM394.3 245.6L393.8 246.1L393.8 242.5L394.3 241.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 243.5L392 243.3ZM390.8 247.2L389.5 247.3L389.5 243.6L390.8 243.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 243.5L389.5 243.6ZM388.3 247.2L387.2 246.9L387.2 243.2L388.3 243.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 242.8L387.2 243.2ZM386.2 246.5L385.5 246L385.5 242.3L386.2 242.8ZM385.5 246L385 245.4L385 241.7L385.5 242.3ZM385 245.4L384.9 244.8L384.9 241.1L385 241.7Z\"/><path class=\"iso-top\" d=\"M393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.3 241.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 241.3L394.3 241.9L393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 241.3L393.8 241.8L393.4 242.3L392.6 242.8L391.7 243.1L390.7 243.3L389.6 243.4L388.4 243.3L387.4 243L386.6 242.7L385.9 242.2L385.5 241.7L384.9 241.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 241.1L384.9 244.8M394.5 241.3L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 241.7L390.9 242L390.2 242.2L389.4 242.2L388.7 242L388.1 241.8L387.8 241.4L387.8 241L388 240.7L388.6 240.4L389.3 240.2L390 240.2L390.8 240.4L391.3 240.6L391.6 241L391.7 241.4Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g></g><g data-bad style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 241.5L393.8 241ZM393 246.6L392 247L392 241.9L393 241.5ZM394.5 245L394.3 245.6L394.3 240.4L394.5 239.8ZM394.3 245.6L393.8 246.1L393.8 241L394.3 240.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 242.1L392 241.9ZM390.8 247.2L389.5 247.3L389.5 242.1L390.8 242.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 242L389.5 242.1ZM388.3 247.2L387.2 246.9L387.2 241.8L388.3 242Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 241.4L387.2 241.8ZM386.2 246.5L385.5 246L385.5 240.9L386.2 241.4ZM385.5 246L385 245.4L385 240.3L385.5 240.9ZM385 245.4L384.9 244.8L384.9 239.7L385 240.3Z\"/><path class=\"iso-top\" d=\"M393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 239.8L394.3 240.4L393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 239.8L393.8 240.4L393.4 240.9L392.6 241.3L391.7 241.6L390.7 241.8L389.6 241.9L388.4 241.8L387.4 241.6L386.6 241.2L385.9 240.7L385.5 240.2L384.9 239.7\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 239.7L384.9 244.8M394.5 239.8L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 240.3L390.9 240.5L390.2 240.7L389.4 240.7L388.7 240.6L388.1 240.3L387.8 240L387.8 239.6L388 239.2L388.6 238.9L389.3 238.8L390 238.8L390.8 238.9L391.3 239.2L391.6 239.5L391.7 239.9Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1L395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M395.8 242.3L395.7 242.5L395.7 240.3L395.8 240.1ZM395.7 242.5L394.7 243.3L394.7 241.1L395.7 240.3ZM394.7 243.3L394.4 243.5L394.4 241.3L394.7 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M394.4 243.5L394.1 243.5L394.1 241.3L394.4 241.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M394.1 243.5L393.7 243.5L393.7 241.3L394.1 241.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M393.7 243.5L390.8 242.6L390.8 240.4L393.7 241.3ZM390.8 242.6L390.6 242.4L390.6 240.2L390.8 240.4ZM390.6 242.4L390.5 242.2L390.5 240L390.6 240.2Z\"/><path class=\"iso-top\" d=\"M395.5 239.8L395.8 240L395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1M395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2M395.8 240.1L395.8 242.3M390.5 240L390.5 242.2\"/></g></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L395.9 269.4L395.9 252.3L414.6 237.4ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L394.2 269.3L394.2 252.2L394.9 252.4ZM394.2 269.3L394 269.2L394 252.1L394.2 252.2ZM394 269.2L393.9 269L393.9 251.9L394 252.1Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M415 250.5L395.5 266.1L393.6 265.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269M414.7 237.2L414.7 254.3M393.9 251.9L393.9 269\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8L396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M396.5 268.9L396.4 269.1L396.4 252L396.5 251.8ZM396.4 269.1L395.9 269.4L395.9 252.3L396.4 252ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L365 260.2L365 243.1L394.9 252.4ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M396.1 251.5L396.4 251.6L396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M396.7 265.1L395.5 266.1L364.4 256.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8M396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9M396.5 251.8L396.5 268.9M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"366.8\" cy=\"246.1\" r=\"0.4\"/><circle cx=\"393.2\" cy=\"254.3\" r=\"0.4\"/><circle cx=\"413.5\" cy=\"240.7\" r=\"0.4\"/><circle cx=\"397\" cy=\"253.9\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1L382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.2 247.3L382.2 247.4L382.2 241.2L382.2 241.1ZM382.2 247.4L381.4 248L381.4 241.8L382.2 241.2ZM381.4 248L381.2 248L381.2 241.9L381.4 241.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.2 248L381 248.1L381 241.9L381.2 241.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381 248.1L380.8 248L380.8 241.9L381 241.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 248L379.1 247.5L379.1 241.4L380.8 241.9ZM379.1 247.5L379 247.4L379 241.3L379.1 241.4ZM379 247.4L378.9 247.3L378.9 241.2L379 241.3Z\"/><path class=\"iso-top\" d=\"M382 241L382.2 241L382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1M382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3M382.2 241.1L382.2 247.3M378.9 241.2L378.9 247.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2L400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.6 226.7L400.5 226.8L400.5 224.4L400.6 224.2ZM400.5 226.8L381.8 241.8L381.8 239.4L400.5 224.4ZM381.8 241.8L381.5 241.9L381.5 239.5L381.8 239.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.5 241.9L381.2 242L381.2 239.5L381.5 239.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381.2 242L380.8 241.9L380.8 239.5L381.2 239.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 241.9L379.1 241.4L379.1 238.9L380.8 239.5ZM379.1 241.4L378.9 241.3L378.9 238.8L379.1 238.9ZM378.9 241.3L378.8 241.1L378.8 238.6L378.9 238.8Z\"/><path class=\"iso-top\" d=\"M400.3 223.9L400.5 224L400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M400.6 224.2L400.1 224.3L381.5 239.2L381.3 239.3L381.2 239.3L381 239.3L379.4 238.8L379.3 238.7L378.8 238.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2M400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1M400.6 224.2L400.6 226.7M378.8 238.6L378.8 241.1\"/></g><g data-tag style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.6 244.5L411.6 244.5L411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.4 262.5L399.4 262.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M411.6 253.1L411.6 253.2L411.6 244.6L411.6 244.5ZM411.6 253.2L399.9 262.5L399.9 253.9L411.6 244.6ZM399.9 262.5L399.8 262.6L399.8 254L399.9 253.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.8 262.6L399.7 262.6L399.7 254L399.8 254Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.7 262.6L399.5 262.5L399.5 254L399.7 254Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.5 254L399.5 254L399.5 262.5L399.5 262.5ZM399.5 262.5L399.4 262.5L399.4 253.9L399.5 254ZM399.4 262.5L399.4 262.4L399.4 253.9L399.4 253.9Z\"/><path class=\"iso-top\" d=\"M411.5 244.4L411.6 244.5L411.6 244.5L411.6 244.6L399.9 253.9L399.8 254L399.7 254L399.5 254L399.5 254L399.4 253.9L399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4Z\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.5 244.4L411.6 244.5L411.6 244.5M411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.5 262.5L399.4 262.5L399.4 262.4M411.6 244.5L411.6 253.1M399.4 253.9L399.4 262.4\"/></g><text class=\"iso-face-text\" data-tone=\"hi\" data-label transform=\"matrix(0.748 -0.599 0 1.223 405.754 255.021)\" font-size=\"3.4\" text-anchor=\"middle\"></text></g></g>","<g data-crate=\"3\" data-station=\"artifact\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4L414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.6 254.4L414.4 254.7L414.4 252.7L414.6 252.4ZM414.4 254.7L396.1 269.3L396.1 267.3L414.4 252.7ZM396.1 269.3L395.7 269.5L395.7 267.5L396.1 267.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.5L395.1 269.5L395.1 267.6L395.7 267.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.1 269.5L394.6 269.4L394.6 267.5L395.1 267.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.6 269.4L365.4 260.3L365.4 258.4L394.6 267.5ZM365.4 260.3L365 260.1L365 258.1L365.4 258.4ZM365 260.1L364.8 259.8L364.8 257.9L365 258.1Z\"/><path class=\"iso-top\" d=\"M414 251.9L414.4 252.1L414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4M414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8M414.6 252.4L414.6 254.4M364.8 257.9L364.8 259.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L414.2 254.8L414.2 237.7L414.6 237.4ZM414.2 254.8L413.9 255L413.9 237.8L414.2 237.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M413.9 255L413.6 255L413.6 237.9L413.9 237.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M413.6 255L413.2 255L413.2 237.8L413.6 237.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M413.2 255L383.3 245.6L383.3 228.5L413.2 237.8ZM383.3 245.6L383 245.5L383 228.3L383.3 228.5ZM383 245.5L382.9 245.3L382.9 228.2L383 228.3Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3M414.7 237.2L414.7 254.3M382.9 228.2L382.9 245.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1L385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M385.5 245.2L385.4 245.4L385.4 228.2L385.5 228.1ZM385.4 245.4L366.7 260.3L366.7 243.2L385.4 228.2ZM366.7 260.3L366.4 260.4L366.4 243.3L366.7 243.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M366.4 260.4L366.1 260.5L366.1 243.4L366.4 243.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M366.1 260.5L365.7 260.4L365.7 243.3L366.1 243.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M365.7 260.4L365 260.2L365 243.1L365.7 243.3ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M385.2 227.7L385.4 227.9L385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1M385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9M385.5 228.1L385.5 245.2M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5L400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.5 232.6L400.4 232.8L400.4 226.6L400.5 226.5ZM400.4 232.8L399.7 233.4L399.7 227.2L400.4 226.6ZM399.7 233.4L399.5 233.4L399.5 227.3L399.7 227.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.5 233.4L399.3 233.4L399.3 227.3L399.5 227.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.3 233.4L399.1 233.4L399.1 227.3L399.3 227.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.1 233.4L397.4 232.9L397.4 226.8L399.1 227.3ZM397.4 232.9L397.3 232.8L397.3 226.7L397.4 226.8ZM397.3 232.8L397.2 232.7L397.2 226.6L397.3 226.7Z\"/><path class=\"iso-top\" d=\"M400.3 226.3L400.4 226.4L400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5M400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7M400.5 226.5L400.5 232.6M397.2 226.6L397.2 232.7\"/></g><g data-inner style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 243L393.8 242.5ZM393 246.6L392 247L392 243.3L393 243ZM394.5 245L394.3 245.6L394.3 241.9L394.5 241.3ZM394.3 245.6L393.8 246.1L393.8 242.5L394.3 241.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 243.5L392 243.3ZM390.8 247.2L389.5 247.3L389.5 243.6L390.8 243.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 243.5L389.5 243.6ZM388.3 247.2L387.2 246.9L387.2 243.2L388.3 243.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 242.8L387.2 243.2ZM386.2 246.5L385.5 246L385.5 242.3L386.2 242.8ZM385.5 246L385 245.4L385 241.7L385.5 242.3ZM385 245.4L384.9 244.8L384.9 241.1L385 241.7Z\"/><path class=\"iso-top\" d=\"M393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.3 241.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 241.3L394.3 241.9L393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 241.3L393.8 241.8L393.4 242.3L392.6 242.8L391.7 243.1L390.7 243.3L389.6 243.4L388.4 243.3L387.4 243L386.6 242.7L385.9 242.2L385.5 241.7L384.9 241.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 241.1L384.9 244.8M394.5 241.3L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 241.7L390.9 242L390.2 242.2L389.4 242.2L388.7 242L388.1 241.8L387.8 241.4L387.8 241L388 240.7L388.6 240.4L389.3 240.2L390 240.2L390.8 240.4L391.3 240.6L391.6 241L391.7 241.4Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g></g><g data-bad style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 241.5L393.8 241ZM393 246.6L392 247L392 241.9L393 241.5ZM394.5 245L394.3 245.6L394.3 240.4L394.5 239.8ZM394.3 245.6L393.8 246.1L393.8 241L394.3 240.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 242.1L392 241.9ZM390.8 247.2L389.5 247.3L389.5 242.1L390.8 242.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 242L389.5 242.1ZM388.3 247.2L387.2 246.9L387.2 241.8L388.3 242Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 241.4L387.2 241.8ZM386.2 246.5L385.5 246L385.5 240.9L386.2 241.4ZM385.5 246L385 245.4L385 240.3L385.5 240.9ZM385 245.4L384.9 244.8L384.9 239.7L385 240.3Z\"/><path class=\"iso-top\" d=\"M393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 239.8L394.3 240.4L393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 239.8L393.8 240.4L393.4 240.9L392.6 241.3L391.7 241.6L390.7 241.8L389.6 241.9L388.4 241.8L387.4 241.6L386.6 241.2L385.9 240.7L385.5 240.2L384.9 239.7\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 239.7L384.9 244.8M394.5 239.8L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 240.3L390.9 240.5L390.2 240.7L389.4 240.7L388.7 240.6L388.1 240.3L387.8 240L387.8 239.6L388 239.2L388.6 238.9L389.3 238.8L390 238.8L390.8 238.9L391.3 239.2L391.6 239.5L391.7 239.9Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1L395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M395.8 242.3L395.7 242.5L395.7 240.3L395.8 240.1ZM395.7 242.5L394.7 243.3L394.7 241.1L395.7 240.3ZM394.7 243.3L394.4 243.5L394.4 241.3L394.7 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M394.4 243.5L394.1 243.5L394.1 241.3L394.4 241.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M394.1 243.5L393.7 243.5L393.7 241.3L394.1 241.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M393.7 243.5L390.8 242.6L390.8 240.4L393.7 241.3ZM390.8 242.6L390.6 242.4L390.6 240.2L390.8 240.4ZM390.6 242.4L390.5 242.2L390.5 240L390.6 240.2Z\"/><path class=\"iso-top\" d=\"M395.5 239.8L395.8 240L395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1M395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2M395.8 240.1L395.8 242.3M390.5 240L390.5 242.2\"/></g></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L395.9 269.4L395.9 252.3L414.6 237.4ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L394.2 269.3L394.2 252.2L394.9 252.4ZM394.2 269.3L394 269.2L394 252.1L394.2 252.2ZM394 269.2L393.9 269L393.9 251.9L394 252.1Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M415 250.5L395.5 266.1L393.6 265.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269M414.7 237.2L414.7 254.3M393.9 251.9L393.9 269\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8L396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M396.5 268.9L396.4 269.1L396.4 252L396.5 251.8ZM396.4 269.1L395.9 269.4L395.9 252.3L396.4 252ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L365 260.2L365 243.1L394.9 252.4ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M396.1 251.5L396.4 251.6L396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M396.7 265.1L395.5 266.1L364.4 256.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8M396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9M396.5 251.8L396.5 268.9M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"366.8\" cy=\"246.1\" r=\"0.4\"/><circle cx=\"393.2\" cy=\"254.3\" r=\"0.4\"/><circle cx=\"413.5\" cy=\"240.7\" r=\"0.4\"/><circle cx=\"397\" cy=\"253.9\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1L382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.2 247.3L382.2 247.4L382.2 241.2L382.2 241.1ZM382.2 247.4L381.4 248L381.4 241.8L382.2 241.2ZM381.4 248L381.2 248L381.2 241.9L381.4 241.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.2 248L381 248.1L381 241.9L381.2 241.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381 248.1L380.8 248L380.8 241.9L381 241.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 248L379.1 247.5L379.1 241.4L380.8 241.9ZM379.1 247.5L379 247.4L379 241.3L379.1 241.4ZM379 247.4L378.9 247.3L378.9 241.2L379 241.3Z\"/><path class=\"iso-top\" d=\"M382 241L382.2 241L382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1M382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3M382.2 241.1L382.2 247.3M378.9 241.2L378.9 247.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2L400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.6 226.7L400.5 226.8L400.5 224.4L400.6 224.2ZM400.5 226.8L381.8 241.8L381.8 239.4L400.5 224.4ZM381.8 241.8L381.5 241.9L381.5 239.5L381.8 239.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.5 241.9L381.2 242L381.2 239.5L381.5 239.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381.2 242L380.8 241.9L380.8 239.5L381.2 239.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 241.9L379.1 241.4L379.1 238.9L380.8 239.5ZM379.1 241.4L378.9 241.3L378.9 238.8L379.1 238.9ZM378.9 241.3L378.8 241.1L378.8 238.6L378.9 238.8Z\"/><path class=\"iso-top\" d=\"M400.3 223.9L400.5 224L400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M400.6 224.2L400.1 224.3L381.5 239.2L381.3 239.3L381.2 239.3L381 239.3L379.4 238.8L379.3 238.7L378.8 238.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2M400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1M400.6 224.2L400.6 226.7M378.8 238.6L378.8 241.1\"/></g><g data-tag style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.6 244.5L411.6 244.5L411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.4 262.5L399.4 262.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M411.6 253.1L411.6 253.2L411.6 244.6L411.6 244.5ZM411.6 253.2L399.9 262.5L399.9 253.9L411.6 244.6ZM399.9 262.5L399.8 262.6L399.8 254L399.9 253.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.8 262.6L399.7 262.6L399.7 254L399.8 254Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.7 262.6L399.5 262.5L399.5 254L399.7 254Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.5 254L399.5 254L399.5 262.5L399.5 262.5ZM399.5 262.5L399.4 262.5L399.4 253.9L399.5 254ZM399.4 262.5L399.4 262.4L399.4 253.9L399.4 253.9Z\"/><path class=\"iso-top\" d=\"M411.5 244.4L411.6 244.5L411.6 244.5L411.6 244.6L399.9 253.9L399.8 254L399.7 254L399.5 254L399.5 254L399.4 253.9L399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4Z\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.5 244.4L411.6 244.5L411.6 244.5M411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.5 262.5L399.4 262.5L399.4 262.4M411.6 244.5L411.6 253.1M399.4 253.9L399.4 262.4\"/></g><text class=\"iso-face-text\" data-tone=\"hi\" data-label transform=\"matrix(0.748 -0.599 0 1.223 405.754 255.021)\" font-size=\"3.4\" text-anchor=\"middle\"></text></g></g>","<g data-crate=\"4\" data-station=\"artifact\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4L414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.6 254.4L414.4 254.7L414.4 252.7L414.6 252.4ZM414.4 254.7L396.1 269.3L396.1 267.3L414.4 252.7ZM396.1 269.3L395.7 269.5L395.7 267.5L396.1 267.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.5L395.1 269.5L395.1 267.6L395.7 267.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.1 269.5L394.6 269.4L394.6 267.5L395.1 267.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.6 269.4L365.4 260.3L365.4 258.4L394.6 267.5ZM365.4 260.3L365 260.1L365 258.1L365.4 258.4ZM365 260.1L364.8 259.8L364.8 257.9L365 258.1Z\"/><path class=\"iso-top\" d=\"M414 251.9L414.4 252.1L414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4M414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8M414.6 252.4L414.6 254.4M364.8 257.9L364.8 259.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L414.2 254.8L414.2 237.7L414.6 237.4ZM414.2 254.8L413.9 255L413.9 237.8L414.2 237.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M413.9 255L413.6 255L413.6 237.9L413.9 237.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M413.6 255L413.2 255L413.2 237.8L413.6 237.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M413.2 255L383.3 245.6L383.3 228.5L413.2 237.8ZM383.3 245.6L383 245.5L383 228.3L383.3 228.5ZM383 245.5L382.9 245.3L382.9 228.2L383 228.3Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3M414.7 237.2L414.7 254.3M382.9 228.2L382.9 245.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1L385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M385.5 245.2L385.4 245.4L385.4 228.2L385.5 228.1ZM385.4 245.4L366.7 260.3L366.7 243.2L385.4 228.2ZM366.7 260.3L366.4 260.4L366.4 243.3L366.7 243.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M366.4 260.4L366.1 260.5L366.1 243.4L366.4 243.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M366.1 260.5L365.7 260.4L365.7 243.3L366.1 243.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M365.7 260.4L365 260.2L365 243.1L365.7 243.3ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M385.2 227.7L385.4 227.9L385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1M385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9M385.5 228.1L385.5 245.2M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5L400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.5 232.6L400.4 232.8L400.4 226.6L400.5 226.5ZM400.4 232.8L399.7 233.4L399.7 227.2L400.4 226.6ZM399.7 233.4L399.5 233.4L399.5 227.3L399.7 227.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.5 233.4L399.3 233.4L399.3 227.3L399.5 227.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.3 233.4L399.1 233.4L399.1 227.3L399.3 227.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.1 233.4L397.4 232.9L397.4 226.8L399.1 227.3ZM397.4 232.9L397.3 232.8L397.3 226.7L397.4 226.8ZM397.3 232.8L397.2 232.7L397.2 226.6L397.3 226.7Z\"/><path class=\"iso-top\" d=\"M400.3 226.3L400.4 226.4L400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5M400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7M400.5 226.5L400.5 232.6M397.2 226.6L397.2 232.7\"/></g><g data-inner style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 243L393.8 242.5ZM393 246.6L392 247L392 243.3L393 243ZM394.5 245L394.3 245.6L394.3 241.9L394.5 241.3ZM394.3 245.6L393.8 246.1L393.8 242.5L394.3 241.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 243.5L392 243.3ZM390.8 247.2L389.5 247.3L389.5 243.6L390.8 243.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 243.5L389.5 243.6ZM388.3 247.2L387.2 246.9L387.2 243.2L388.3 243.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 242.8L387.2 243.2ZM386.2 246.5L385.5 246L385.5 242.3L386.2 242.8ZM385.5 246L385 245.4L385 241.7L385.5 242.3ZM385 245.4L384.9 244.8L384.9 241.1L385 241.7Z\"/><path class=\"iso-top\" d=\"M393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.3 241.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 241.3L394.3 241.9L393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 241.3L393.8 241.8L393.4 242.3L392.6 242.8L391.7 243.1L390.7 243.3L389.6 243.4L388.4 243.3L387.4 243L386.6 242.7L385.9 242.2L385.5 241.7L384.9 241.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 241.1L384.9 244.8M394.5 241.3L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 241.7L390.9 242L390.2 242.2L389.4 242.2L388.7 242L388.1 241.8L387.8 241.4L387.8 241L388 240.7L388.6 240.4L389.3 240.2L390 240.2L390.8 240.4L391.3 240.6L391.6 241L391.7 241.4Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g></g><g data-bad style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 241.5L393.8 241ZM393 246.6L392 247L392 241.9L393 241.5ZM394.5 245L394.3 245.6L394.3 240.4L394.5 239.8ZM394.3 245.6L393.8 246.1L393.8 241L394.3 240.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 242.1L392 241.9ZM390.8 247.2L389.5 247.3L389.5 242.1L390.8 242.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 242L389.5 242.1ZM388.3 247.2L387.2 246.9L387.2 241.8L388.3 242Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 241.4L387.2 241.8ZM386.2 246.5L385.5 246L385.5 240.9L386.2 241.4ZM385.5 246L385 245.4L385 240.3L385.5 240.9ZM385 245.4L384.9 244.8L384.9 239.7L385 240.3Z\"/><path class=\"iso-top\" d=\"M393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 239.8L394.3 240.4L393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 239.8L393.8 240.4L393.4 240.9L392.6 241.3L391.7 241.6L390.7 241.8L389.6 241.9L388.4 241.8L387.4 241.6L386.6 241.2L385.9 240.7L385.5 240.2L384.9 239.7\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 239.7L384.9 244.8M394.5 239.8L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 240.3L390.9 240.5L390.2 240.7L389.4 240.7L388.7 240.6L388.1 240.3L387.8 240L387.8 239.6L388 239.2L388.6 238.9L389.3 238.8L390 238.8L390.8 238.9L391.3 239.2L391.6 239.5L391.7 239.9Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1L395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M395.8 242.3L395.7 242.5L395.7 240.3L395.8 240.1ZM395.7 242.5L394.7 243.3L394.7 241.1L395.7 240.3ZM394.7 243.3L394.4 243.5L394.4 241.3L394.7 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M394.4 243.5L394.1 243.5L394.1 241.3L394.4 241.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M394.1 243.5L393.7 243.5L393.7 241.3L394.1 241.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M393.7 243.5L390.8 242.6L390.8 240.4L393.7 241.3ZM390.8 242.6L390.6 242.4L390.6 240.2L390.8 240.4ZM390.6 242.4L390.5 242.2L390.5 240L390.6 240.2Z\"/><path class=\"iso-top\" d=\"M395.5 239.8L395.8 240L395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1M395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2M395.8 240.1L395.8 242.3M390.5 240L390.5 242.2\"/></g></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L395.9 269.4L395.9 252.3L414.6 237.4ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L394.2 269.3L394.2 252.2L394.9 252.4ZM394.2 269.3L394 269.2L394 252.1L394.2 252.2ZM394 269.2L393.9 269L393.9 251.9L394 252.1Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M415 250.5L395.5 266.1L393.6 265.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269M414.7 237.2L414.7 254.3M393.9 251.9L393.9 269\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8L396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M396.5 268.9L396.4 269.1L396.4 252L396.5 251.8ZM396.4 269.1L395.9 269.4L395.9 252.3L396.4 252ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L365 260.2L365 243.1L394.9 252.4ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M396.1 251.5L396.4 251.6L396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M396.7 265.1L395.5 266.1L364.4 256.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8M396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9M396.5 251.8L396.5 268.9M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"366.8\" cy=\"246.1\" r=\"0.4\"/><circle cx=\"393.2\" cy=\"254.3\" r=\"0.4\"/><circle cx=\"413.5\" cy=\"240.7\" r=\"0.4\"/><circle cx=\"397\" cy=\"253.9\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1L382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.2 247.3L382.2 247.4L382.2 241.2L382.2 241.1ZM382.2 247.4L381.4 248L381.4 241.8L382.2 241.2ZM381.4 248L381.2 248L381.2 241.9L381.4 241.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.2 248L381 248.1L381 241.9L381.2 241.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381 248.1L380.8 248L380.8 241.9L381 241.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 248L379.1 247.5L379.1 241.4L380.8 241.9ZM379.1 247.5L379 247.4L379 241.3L379.1 241.4ZM379 247.4L378.9 247.3L378.9 241.2L379 241.3Z\"/><path class=\"iso-top\" d=\"M382 241L382.2 241L382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1M382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3M382.2 241.1L382.2 247.3M378.9 241.2L378.9 247.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2L400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.6 226.7L400.5 226.8L400.5 224.4L400.6 224.2ZM400.5 226.8L381.8 241.8L381.8 239.4L400.5 224.4ZM381.8 241.8L381.5 241.9L381.5 239.5L381.8 239.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.5 241.9L381.2 242L381.2 239.5L381.5 239.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381.2 242L380.8 241.9L380.8 239.5L381.2 239.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 241.9L379.1 241.4L379.1 238.9L380.8 239.5ZM379.1 241.4L378.9 241.3L378.9 238.8L379.1 238.9ZM378.9 241.3L378.8 241.1L378.8 238.6L378.9 238.8Z\"/><path class=\"iso-top\" d=\"M400.3 223.9L400.5 224L400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M400.6 224.2L400.1 224.3L381.5 239.2L381.3 239.3L381.2 239.3L381 239.3L379.4 238.8L379.3 238.7L378.8 238.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2M400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1M400.6 224.2L400.6 226.7M378.8 238.6L378.8 241.1\"/></g><g data-tag style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.6 244.5L411.6 244.5L411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.4 262.5L399.4 262.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M411.6 253.1L411.6 253.2L411.6 244.6L411.6 244.5ZM411.6 253.2L399.9 262.5L399.9 253.9L411.6 244.6ZM399.9 262.5L399.8 262.6L399.8 254L399.9 253.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.8 262.6L399.7 262.6L399.7 254L399.8 254Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.7 262.6L399.5 262.5L399.5 254L399.7 254Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.5 254L399.5 254L399.5 262.5L399.5 262.5ZM399.5 262.5L399.4 262.5L399.4 253.9L399.5 254ZM399.4 262.5L399.4 262.4L399.4 253.9L399.4 253.9Z\"/><path class=\"iso-top\" d=\"M411.5 244.4L411.6 244.5L411.6 244.5L411.6 244.6L399.9 253.9L399.8 254L399.7 254L399.5 254L399.5 254L399.4 253.9L399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4Z\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.5 244.4L411.6 244.5L411.6 244.5M411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.5 262.5L399.4 262.5L399.4 262.4M411.6 244.5L411.6 253.1M399.4 253.9L399.4 262.4\"/></g><text class=\"iso-face-text\" data-tone=\"hi\" data-label transform=\"matrix(0.748 -0.599 0 1.223 405.754 255.021)\" font-size=\"3.4\" text-anchor=\"middle\"></text></g></g>","<g data-crate=\"5\" data-station=\"artifact\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4L414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.6 254.4L414.4 254.7L414.4 252.7L414.6 252.4ZM414.4 254.7L396.1 269.3L396.1 267.3L414.4 252.7ZM396.1 269.3L395.7 269.5L395.7 267.5L396.1 267.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.5L395.1 269.5L395.1 267.6L395.7 267.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.1 269.5L394.6 269.4L394.6 267.5L395.1 267.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.6 269.4L365.4 260.3L365.4 258.4L394.6 267.5ZM365.4 260.3L365 260.1L365 258.1L365.4 258.4ZM365 260.1L364.8 259.8L364.8 257.9L365 258.1Z\"/><path class=\"iso-top\" d=\"M414 251.9L414.4 252.1L414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.6 252.4L414.4 252.7L396.1 267.3L395.7 267.5L395.1 267.6L394.6 267.5L365.4 258.4L365 258.1L364.8 257.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M364.8 257.9L365 257.6L383.3 243L383.7 242.8L384.3 242.7L384.8 242.8L414 251.9L414.4 252.1L414.6 252.4M414.6 254.4L414.4 254.7L396.1 269.3L395.7 269.5L395.1 269.5L394.6 269.4L365.4 260.3L365 260.1L364.8 259.8M414.6 252.4L414.6 254.4M364.8 257.9L364.8 259.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L414.2 254.8L414.2 237.7L414.6 237.4ZM414.2 254.8L413.9 255L413.9 237.8L414.2 237.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M413.9 255L413.6 255L413.6 237.9L413.9 237.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M413.6 255L413.2 255L413.2 237.8L413.6 237.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M413.2 255L383.3 245.6L383.3 228.5L413.2 237.8ZM383.3 245.6L383 245.5L383 228.3L383.3 228.5ZM383 245.5L382.9 245.3L382.9 228.2L383 228.3Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L414.2 237.7L413.9 237.8L413.6 237.9L413.2 237.8L383.3 228.5L383 228.3L382.9 228.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M382.9 228.2L383 228L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L414.2 254.8L413.9 255L413.6 255L413.2 255L383.3 245.6L383 245.5L382.9 245.3M414.7 237.2L414.7 254.3M382.9 228.2L382.9 245.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1L385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M385.5 245.2L385.4 245.4L385.4 228.2L385.5 228.1ZM385.4 245.4L366.7 260.3L366.7 243.2L385.4 228.2ZM366.7 260.3L366.4 260.4L366.4 243.3L366.7 243.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M366.4 260.4L366.1 260.5L366.1 243.4L366.4 243.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M366.1 260.5L365.7 260.4L365.7 243.3L366.1 243.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M365.7 260.4L365 260.2L365 243.1L365.7 243.3ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M385.2 227.7L385.4 227.9L385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M385.5 228.1L385.4 228.2L366.7 243.2L366.4 243.3L366.1 243.4L365.7 243.3L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L383.5 227.6L383.8 227.5L384.1 227.5L384.5 227.5L385.2 227.7L385.4 227.9L385.5 228.1M385.5 245.2L385.4 245.4L366.7 260.3L366.4 260.4L366.1 260.5L365.7 260.4L365 260.2L364.8 260.1L364.7 259.9M385.5 228.1L385.5 245.2M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5L400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.5 232.6L400.4 232.8L400.4 226.6L400.5 226.5ZM400.4 232.8L399.7 233.4L399.7 227.2L400.4 226.6ZM399.7 233.4L399.5 233.4L399.5 227.3L399.7 227.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.5 233.4L399.3 233.4L399.3 227.3L399.5 227.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.3 233.4L399.1 233.4L399.1 227.3L399.3 227.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.1 233.4L397.4 232.9L397.4 226.8L399.1 227.3ZM397.4 232.9L397.3 232.8L397.3 226.7L397.4 226.8ZM397.3 232.8L397.2 232.7L397.2 226.6L397.3 226.7Z\"/><path class=\"iso-top\" d=\"M400.3 226.3L400.4 226.4L400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.5 226.5L400.4 226.6L399.7 227.2L399.5 227.3L399.3 227.3L399.1 227.3L397.4 226.8L397.3 226.7L397.2 226.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M397.2 226.6L397.3 226.5L398 225.9L398.2 225.8L398.4 225.8L398.6 225.8L400.3 226.3L400.4 226.4L400.5 226.5M400.5 232.6L400.4 232.8L399.7 233.4L399.5 233.4L399.3 233.4L399.1 233.4L397.4 232.9L397.3 232.8L397.2 232.7M400.5 226.5L400.5 232.6M397.2 226.6L397.2 232.7\"/></g><g data-inner style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 243L393.8 242.5ZM393 246.6L392 247L392 243.3L393 243ZM394.5 245L394.3 245.6L394.3 241.9L394.5 241.3ZM394.3 245.6L393.8 246.1L393.8 242.5L394.3 241.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 243.5L392 243.3ZM390.8 247.2L389.5 247.3L389.5 243.6L390.8 243.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 243.5L389.5 243.6ZM388.3 247.2L387.2 246.9L387.2 243.2L388.3 243.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 242.8L387.2 243.2ZM386.2 246.5L385.5 246L385.5 242.3L386.2 242.8ZM385.5 246L385 245.4L385 241.7L385.5 242.3ZM385 245.4L384.9 244.8L384.9 241.1L385 241.7Z\"/><path class=\"iso-top\" d=\"M393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3L394.3 241.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 241.3L394.3 241.9L393.8 242.5L393 243L392 243.3L390.8 243.5L389.5 243.6L388.3 243.5L387.2 243.2L386.2 242.8L385.5 242.3L385 241.7L384.9 241.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 241.3L393.8 241.8L393.4 242.3L392.6 242.8L391.7 243.1L390.7 243.3L389.6 243.4L388.4 243.3L387.4 243L386.6 242.7L385.9 242.2L385.5 241.7L384.9 241.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 241.1L385.1 240.5L385.6 239.9L386.4 239.4L387.5 239.1L388.6 238.9L389.9 238.8L391.1 238.9L392.3 239.2L393.2 239.6L393.9 240.1L394.4 240.7L394.5 241.3M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 241.1L384.9 244.8M394.5 241.3L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 241.7L390.9 242L390.2 242.2L389.4 242.2L388.7 242L388.1 241.8L387.8 241.4L387.8 241L388 240.7L388.6 240.4L389.3 240.2L390 240.2L390.8 240.4L391.3 240.6L391.6 241L391.7 241.4Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g></g><g data-bad style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8L400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.7 256.1L400.5 256.5L400.5 244.2L400.7 243.8ZM400.5 256.5L393.3 262.2L393.3 250L400.5 244.2ZM393.3 262.2L392.7 262.5L392.7 250.3L393.3 250Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.7 262.5L391.8 262.6L391.8 250.4L392.7 250.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M391.8 262.6L391 262.5L391 250.3L391.8 250.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M391 262.5L379.5 258.9L379.5 246.7L391 250.3ZM379.5 258.9L378.9 258.6L378.9 246.3L379.5 246.7ZM378.9 258.6L378.7 258.1L378.7 245.9L378.9 246.3Z\"/><path class=\"iso-top\" d=\"M399.9 243.1L400.5 243.4L400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M400.7 243.8L400.5 244.2L393.3 250L392.7 250.3L391.8 250.4L391 250.3L379.5 246.7L378.9 246.3L378.7 245.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M400.7 243.8L399.8 244.1L392.8 249.8L392.3 250L391.8 250L391.3 249.9L379.9 246.4L379.5 246.2L378.7 245.9\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M378.7 245.9L378.9 245.5L386.1 239.8L386.8 239.5L387.6 239.4L388.5 239.5L399.9 243.1L400.5 243.4L400.7 243.8M400.7 256.1L400.5 256.5L393.3 262.2L392.7 262.5L391.8 262.6L391 262.5L379.5 258.9L378.9 258.6L378.7 258.1M400.7 243.8L400.7 256.1M378.7 245.9L378.7 258.1\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M397.7 243.5L398.1 243.8L398.2 244L398.1 244.3L392.4 248.9L391.9 249.1L391.4 249.1L390.8 249L381.7 246.2L381.3 246L381.2 245.7L381.4 245.4L387 240.9L387.5 240.7L388 240.6L388.6 240.7Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M393.8 246.1L393 246.6L393 241.5L393.8 241ZM393 246.6L392 247L392 241.9L393 241.5ZM394.5 245L394.3 245.6L394.3 240.4L394.5 239.8ZM394.3 245.6L393.8 246.1L393.8 241L394.3 240.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392 247L390.8 247.2L390.8 242.1L392 241.9ZM390.8 247.2L389.5 247.3L389.5 242.1L390.8 242.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.5 247.3L388.3 247.2L388.3 242L389.5 242.1ZM388.3 247.2L387.2 246.9L387.2 241.8L388.3 242Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M387.2 246.9L386.2 246.5L386.2 241.4L387.2 241.8ZM386.2 246.5L385.5 246L385.5 240.9L386.2 241.4ZM385.5 246L385 245.4L385 240.3L385.5 240.9ZM385 245.4L384.9 244.8L384.9 239.7L385 240.3Z\"/><path class=\"iso-top\" d=\"M393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8L394.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M394.5 239.8L394.3 240.4L393.8 241L393 241.5L392 241.9L390.8 242.1L389.5 242.1L388.3 242L387.2 241.8L386.2 241.4L385.5 240.9L385 240.3L384.9 239.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M394.5 239.8L393.8 240.4L393.4 240.9L392.6 241.3L391.7 241.6L390.7 241.8L389.6 241.9L388.4 241.8L387.4 241.6L386.6 241.2L385.9 240.7L385.5 240.2L384.9 239.7\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M384.9 239.7L385.1 239L385.6 238.5L386.4 238L387.5 237.6L388.6 237.4L389.9 237.3L391.1 237.4L392.3 237.7L393.2 238.1L393.9 238.6L394.4 239.2L394.5 239.8M394.5 245L394.3 245.6L393.8 246.1L393 246.6L392 247L390.8 247.2L389.5 247.3L388.3 247.2L387.2 246.9L386.2 246.5L385.5 246L385 245.4L384.9 244.8M384.9 239.7L384.9 244.8M394.5 239.8L394.5 245\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M391.4 240.3L390.9 240.5L390.2 240.7L389.4 240.7L388.7 240.6L388.1 240.3L387.8 240L387.8 239.6L388 239.2L388.6 238.9L389.3 238.8L390 238.8L390.8 238.9L391.3 239.2L391.6 239.5L391.7 239.9Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"388\" cy=\"241.2\" r=\"0.38\"/><circle cx=\"391.4\" cy=\"248.6\" r=\"0.38\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1L395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M395.8 242.3L395.7 242.5L395.7 240.3L395.8 240.1ZM395.7 242.5L394.7 243.3L394.7 241.1L395.7 240.3ZM394.7 243.3L394.4 243.5L394.4 241.3L394.7 241.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M394.4 243.5L394.1 243.5L394.1 241.3L394.4 241.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M394.1 243.5L393.7 243.5L393.7 241.3L394.1 241.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M393.7 243.5L390.8 242.6L390.8 240.4L393.7 241.3ZM390.8 242.6L390.6 242.4L390.6 240.2L390.8 240.4ZM390.6 242.4L390.5 242.2L390.5 240L390.6 240.2Z\"/><path class=\"iso-top\" d=\"M395.5 239.8L395.8 240L395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M395.8 240.1L395.7 240.3L394.7 241.1L394.4 241.3L394.1 241.3L393.7 241.3L390.8 240.4L390.6 240.2L390.5 240\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M390.5 240L390.6 239.9L391.7 239L391.9 238.9L392.3 238.9L392.6 238.9L395.5 239.8L395.8 240L395.8 240.1M395.8 242.3L395.7 242.5L394.7 243.3L394.4 243.5L394.1 243.5L393.7 243.5L390.8 242.6L390.6 242.4L390.5 242.2M395.8 240.1L395.8 242.3M390.5 240L390.5 242.2\"/></g></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2L414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M414.7 254.3L414.6 254.5L414.6 237.4L414.7 237.2ZM414.6 254.5L395.9 269.4L395.9 252.3L414.6 237.4ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L394.2 269.3L394.2 252.2L394.9 252.4ZM394.2 269.3L394 269.2L394 252.1L394.2 252.2ZM394 269.2L393.9 269L393.9 251.9L394 252.1Z\"/><path class=\"iso-top\" d=\"M414.4 236.9L414.7 237L414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M414.7 237.2L414.6 237.4L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L394.2 252.2L394 252.1L393.9 251.9\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M415 250.5L395.5 266.1L393.6 265.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M393.9 251.9L394 251.7L412.7 236.8L413 236.6L413.3 236.6L413.7 236.6L414.4 236.9L414.7 237L414.7 237.2M414.7 254.3L414.6 254.5L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L394.2 269.3L394 269.2L393.9 269M414.7 237.2L414.7 254.3M393.9 251.9L393.9 269\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8L396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M396.5 268.9L396.4 269.1L396.4 252L396.5 251.8ZM396.4 269.1L395.9 269.4L395.9 252.3L396.4 252ZM395.9 269.4L395.7 269.6L395.7 252.5L395.9 252.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M395.7 269.6L395.3 269.6L395.3 252.5L395.7 252.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M395.3 269.6L394.9 269.6L394.9 252.4L395.3 252.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M394.9 269.6L365 260.2L365 243.1L394.9 252.4ZM365 260.2L364.8 260.1L364.8 243L365 243.1ZM364.8 260.1L364.7 259.9L364.7 242.8L364.8 243Z\"/><path class=\"iso-top\" d=\"M396.1 251.5L396.4 251.6L396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M396.5 251.8L396.4 252L395.9 252.3L395.7 252.5L395.3 252.5L394.9 252.4L365 243.1L364.8 243L364.7 242.8\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M396.7 265.1L395.5 266.1L364.4 256.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M364.7 242.8L364.8 242.6L365.2 242.2L365.5 242.1L365.9 242.1L366.2 242.1L396.1 251.5L396.4 251.6L396.5 251.8M396.5 268.9L396.4 269.1L395.9 269.4L395.7 269.6L395.3 269.6L394.9 269.6L365 260.2L364.8 260.1L364.7 259.9M396.5 251.8L396.5 268.9M364.7 242.8L364.7 259.9\"/></g><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"366.8\" cy=\"246.1\" r=\"0.4\"/><circle cx=\"393.2\" cy=\"254.3\" r=\"0.4\"/><circle cx=\"413.5\" cy=\"240.7\" r=\"0.4\"/><circle cx=\"397\" cy=\"253.9\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1L382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.2 247.3L382.2 247.4L382.2 241.2L382.2 241.1ZM382.2 247.4L381.4 248L381.4 241.8L382.2 241.2ZM381.4 248L381.2 248L381.2 241.9L381.4 241.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.2 248L381 248.1L381 241.9L381.2 241.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381 248.1L380.8 248L380.8 241.9L381 241.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 248L379.1 247.5L379.1 241.4L380.8 241.9ZM379.1 247.5L379 247.4L379 241.3L379.1 241.4ZM379 247.4L378.9 247.3L378.9 241.2L379 241.3Z\"/><path class=\"iso-top\" d=\"M382 241L382.2 241L382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M382.2 241.1L382.2 241.2L381.4 241.8L381.2 241.9L381 241.9L380.8 241.9L379.1 241.4L379 241.3L378.9 241.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.9 241.2L379 241.1L379.8 240.5L379.9 240.4L380.1 240.4L380.3 240.4L382 241L382.2 241L382.2 241.1M382.2 247.3L382.2 247.4L381.4 248L381.2 248L381 248.1L380.8 248L379.1 247.5L379 247.4L378.9 247.3M382.2 241.1L382.2 247.3M378.9 241.2L378.9 247.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2L400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M400.6 226.7L400.5 226.8L400.5 224.4L400.6 224.2ZM400.5 226.8L381.8 241.8L381.8 239.4L400.5 224.4ZM381.8 241.8L381.5 241.9L381.5 239.5L381.8 239.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M381.5 241.9L381.2 242L381.2 239.5L381.5 239.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M381.2 242L380.8 241.9L380.8 239.5L381.2 239.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M380.8 241.9L379.1 241.4L379.1 238.9L380.8 239.5ZM379.1 241.4L378.9 241.3L378.9 238.8L379.1 238.9ZM378.9 241.3L378.8 241.1L378.8 238.6L378.9 238.8Z\"/><path class=\"iso-top\" d=\"M400.3 223.9L400.5 224L400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.6 224.2L400.5 224.4L381.8 239.4L381.5 239.5L381.2 239.5L380.8 239.5L379.1 238.9L378.9 238.8L378.8 238.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M400.6 224.2L400.1 224.3L381.5 239.2L381.3 239.3L381.2 239.3L381 239.3L379.4 238.8L379.3 238.7L378.8 238.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M378.8 238.6L378.9 238.5L397.6 223.5L397.9 223.4L398.2 223.3L398.6 223.4L400.3 223.9L400.5 224L400.6 224.2M400.6 226.7L400.5 226.8L381.8 241.8L381.5 241.9L381.2 242L380.8 241.9L379.1 241.4L378.9 241.3L378.8 241.1M400.6 224.2L400.6 226.7M378.8 238.6L378.8 241.1\"/></g><g data-tag style=\"display:none\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.6 244.5L411.6 244.5L411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.4 262.5L399.4 262.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M411.6 253.1L411.6 253.2L411.6 244.6L411.6 244.5ZM411.6 253.2L399.9 262.5L399.9 253.9L411.6 244.6ZM399.9 262.5L399.8 262.6L399.8 254L399.9 253.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M399.8 262.6L399.7 262.6L399.7 254L399.8 254Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.7 262.6L399.5 262.5L399.5 254L399.7 254Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M399.5 254L399.5 254L399.5 262.5L399.5 262.5ZM399.5 262.5L399.4 262.5L399.4 253.9L399.5 254ZM399.4 262.5L399.4 262.4L399.4 253.9L399.4 253.9Z\"/><path class=\"iso-top\" d=\"M411.5 244.4L411.6 244.5L411.6 244.5L411.6 244.6L399.9 253.9L399.8 254L399.7 254L399.5 254L399.5 254L399.4 253.9L399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4Z\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M399.4 253.9L399.4 253.8L411.1 244.5L411.2 244.4L411.4 244.4L411.5 244.4L411.5 244.4L411.6 244.5L411.6 244.5M411.6 253.1L411.6 253.2L399.9 262.5L399.8 262.6L399.7 262.6L399.5 262.5L399.5 262.5L399.4 262.5L399.4 262.4M411.6 244.5L411.6 253.1M399.4 253.9L399.4 262.4\"/></g><text class=\"iso-face-text\" data-tone=\"hi\" data-label transform=\"matrix(0.748 -0.599 0 1.223 405.754 255.021)\" font-size=\"3.4\" text-anchor=\"middle\"></text></g></g>"]},"RAM_STROKE":20,"PROBE_REST":54,"KICK_REST":-9,"KICK_TRAVEL":19,"KICK":{"gland":-24,"z":40},"LAB_TRAVEL":8.7,"DIALS":{"gauge":{"x":-60,"y":0,"top":88,"r":7.5},"monitor":{"x":264,"y":0,"top":55,"r":6.5}},"LEVER":{"x":208,"y":22,"z":31,"len":11,"swing":38},"MON_SPAN":4.71238898038469,"MON_MAX":5,"HOOK_Z":21,"TROLLEY_Z":124,"MINIS":{"commit":{"view":[-42.2,5.7,322.6,201.6],"clips":[["good",0,2.5666666666666664]]},"build":{"view":[10.7,-8.2,397.4,248.4],"clips":[["good",2.2666666666666666,5.116666666666667]]},"test":{"view":[164.4,72.7,343.4,214.6],"clips":[["good",5.716666666666667,8.766666666666666],["bad",5.716666666666667,9.983333333333333]]},"package":{"view":[342.8,143.5,279.1,174.4],"clips":[["good",9.566666666666666,11.517885915752222]]},"staging":{"view":[285,49.5,457.9,286.2],"clips":[["good",11.317885915752223,18.029650621634577]]},"deploy":{"view":[385.4,82.2,523.5,327.2],"clips":[["good",18.029650621634577,31.38553297457576]]},"monitor":{"view":[509.7,206,290.2,181.4],"clips":[["good",30.58553297457576,34.18553297457576]]},"rollback":{"view":[509.7,206,290.2,181.4],"clips":[["regress",30.58553297457576,35.38553297457576]]}}};
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

// Page behaviour around the figure: theme toggle, "show on the line" buttons, active station in the nav.
{
  const body = document.body;
  try { const saved = localStorage.getItem("cd-theme"); if (saved === "dark" || saved === "light") body.dataset.theme = saved; } catch {}
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    body.dataset.theme = body.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("cd-theme", body.dataset.theme); } catch {}
  });
  const figure = document.getElementById("line");
  document.querySelectorAll("[data-show]").forEach((b) => b.addEventListener("click", () => {
    window.__cd.focus(b.dataset.show);
    figure.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }));
  const STEP_OF = { commit: "commit", build: "build", test: "test", package: "package", staging: "staging", production: "deploy", monitor: "monitor", rollback: "rollback", failed: "test" };
  const navs = [...document.querySelectorAll("[data-nav]")];
  document.addEventListener("cd-stage", (e) => {
    const id = STEP_OF[e.detail];
    navs.forEach((a) => { if (a.dataset.nav === id) a.dataset.active = ""; else delete a.dataset.active; });
  });
}

}
