import * as THREE from "three";
import { createRng, range } from "./rng";
import type { PlantSpecimen } from "./types";

/* ═══════════════════════════════════════════════════════════════
   Sealed plants on THREE.LatheGeometry + TubeGeometry.
   - Lathe winding flipped (scale -1,1,1) so bottoms aren't culled
   - Helices = TubeGeometry + sphere caps (no custom torn tubes)
   - Rings = closed TubeGeometry
   ═══════════════════════════════════════════════════════════════ */

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleProfile(keys: number[], t: number): number {
  const n = keys.length - 1;
  const x = Math.min(0.9999, Math.max(0, t)) * n;
  const i = Math.floor(x);
  const f = x - i;
  return Math.max(
    0.012,
    catmull(
      keys[Math.max(0, i - 1)]!,
      keys[i]!,
      keys[Math.min(n, i + 1)]!,
      keys[Math.min(n, i + 2)]!,
      f,
    ),
  );
}

function paintMix(geo: THREE.BufferGeometry, color0: number, color1: number): void {
  const pos = geo.getAttribute("position");
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = Math.max(1e-5, bb.max.y - bb.min.y);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) - bb.min.y) / span;
    const t = color0 + (color1 - color0) * (h * h * (3 - 2 * h));
    colors[i * 3] = t;
    colors[i * 3 + 1] = t;
    colors[i * 3 + 2] = t;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * Axisymmetric body. Profile poles forced to r=0.
 * scale(-1,1,1) flips winding so outward normals face out (fixes white undersides).
 */
function latheProfile(
  height: number,
  profile: number[],
  segsU = 96,
  segsV = 72,
  y0 = 0,
  color0 = 0,
  color1 = 1,
): THREE.BufferGeometry {
  const keys = [0, ...profile.map((r) => Math.max(0.015, r)), 0];
  const pts: THREE.Vector2[] = [];
  const samples = Math.max(segsV, keys.length * 5);
  for (let j = 0; j <= samples; j++) {
    const v = j / samples;
    const y = y0 + v * height;
    const r = j === 0 || j === samples ? 0 : sampleProfile(keys, v);
    pts.push(new THREE.Vector2(r, y));
  }

  const geo = new THREE.LatheGeometry(pts, segsU);
  // Mirror X: same of-revolution shape, opposite winding → outward normals
  geo.scale(-1, 1, 1);
  geo.computeVertexNormals();
  paintMix(geo, color0, color1);
  return geo;
}

/** Capsule lobe via lathe + rigid transform. */
function solidLobe(opts: {
  length: number;
  rRoot: number;
  rMid: number;
  rTip: number;
  segsU?: number;
  segsV?: number;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  colorRoot?: number;
  colorTip?: number;
}): THREE.BufferGeometry {
  const segsU = opts.segsU ?? 36;
  const segsV = opts.segsV ?? 40;
  const len = Math.max(0.06, opts.length);
  const c0 = opts.colorRoot ?? 0.3;
  const c1 = opts.colorTip ?? 1;

  const pts: THREE.Vector2[] = [];
  for (let j = 0; j <= segsV; j++) {
    const v = j / segsV;
    const y = v * len;
    const envelope = Math.sin(v * Math.PI);
    const bias = 0.55 + 0.45 * Math.sin(v * Math.PI * 0.5);
    let r =
      (opts.rRoot * (1 - v) + opts.rMid * envelope + opts.rTip * v) * envelope * bias;
    if (j === 0 || j === segsV) r = 0;
    else r = Math.max(0.012, r);
    pts.push(new THREE.Vector2(r, y));
  }

  const geo = new THREE.LatheGeometry(pts, segsU);
  geo.scale(-1, 1, 1);
  paintMix(geo, c0, c1);

  const dir = opts.dir.clone().normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  geo.applyMatrix4(new THREE.Matrix4().compose(opts.origin, quat, new THREE.Vector3(1, 1, 1)));
  geo.computeVertexNormals();
  return geo;
}

function solidSphere(opts: {
  center: THREE.Vector3;
  radius: number;
  segs?: number;
  squashY?: number;
  colorBase?: number;
  colorTop?: number;
  warp?: (n: THREE.Vector3) => number;
}): THREE.BufferGeometry {
  const R = Math.max(0.04, opts.radius);
  const sy = opts.squashY ?? 1;
  const segs = opts.segs ?? 48;
  // Use SphereGeometry then squash — sealed enough for caps
  const geo = new THREE.SphereGeometry(R, segs, Math.max(24, Math.floor(segs * 0.8)));
  if (sy !== 1) geo.scale(1, sy, 1);

  if (opts.warp) {
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i) / sy;
      const z = pos.getZ(i);
      const len = Math.hypot(x, y, z) || 1;
      const n = new THREE.Vector3(x / len, y / len, z / len);
      const w = Math.max(0.45, opts.warp(n));
      pos.setXYZ(i, n.x * R * w, n.y * R * sy * w, n.z * R * w);
    }
    pos.needsUpdate = true;
  }

  geo.translate(opts.center.x, opts.center.y, opts.center.z);
  geo.computeVertexNormals();
  paintMix(geo, opts.colorBase ?? 0.2, opts.colorTop ?? 0.7);
  return geo;
}

/**
 * Open tube via THREE.TubeGeometry + oversized sphere caps (covers open ends).
 * Closed ring via TubeGeometry(closed=true).
 */
function tubePath(
  path: THREE.Vector3[],
  radius: number,
  tubularSegs: number,
  radialSegs: number,
  color0: number,
  color1: number,
  closed: boolean,
): THREE.BufferGeometry {
  if (path.length < 2) {
    return solidSphere({ center: path[0] ?? new THREE.Vector3(), radius });
  }

  let pts = path.map((p) => p.clone());
  if (closed && pts[0]!.distanceTo(pts[pts.length - 1]!) < 1e-5) {
    pts = pts.slice(0, -1);
  }

  const curve = new THREE.CatmullRomCurve3(pts, closed, "catmullrom", 0.45);
  const r = Math.max(0.045, radius);
  const geo = new THREE.TubeGeometry(
    curve,
    Math.max(64, tubularSegs),
    r,
    Math.max(18, radialSegs),
    closed,
  );
  // Flip winding for outward normals (TubeGeometry can face inward depending on path)
  // Test: reverse index buffer
  const idx = geo.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);
      idx.setX(i + 1, c);
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
  }
  geo.computeVertexNormals();
  paintMix(geo, color0, color1);

  if (closed) return geo;

  // Seal open ends with spheres larger than tube radius
  const start = curve.getPoint(0);
  const end = curve.getPoint(1);
  const cap0 = solidSphere({
    center: start,
    radius: r * 1.15,
    segs: 28,
    colorBase: color0,
    colorTop: color0,
  });
  const cap1 = solidSphere({
    center: end,
    radius: r * 1.15,
    segs: 28,
    colorBase: color1,
    colorTop: color1,
  });
  return mergeParts([geo, cap0, cap1]);
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) {
    return solidSphere({ center: new THREE.Vector3(), radius: 0.3 });
  }
  if (parts.length === 1) return parts[0]!;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let offset = 0;

  for (const g of parts) {
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("color")) paintMix(g, 0.3, 0.8);
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    const col = g.getAttribute("color");
    const idx = g.getIndex();
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      colors.push(col.getX(i), col.getY(i), col.getZ(i));
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    }
    offset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

function reflowGradient(geo: THREE.BufferGeometry): void {
  if (!geo.getAttribute("color")) paintMix(geo, 0.2, 0.9);
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color") as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = Math.max(1e-5, bb.max.y - bb.min.y);
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) - bb.min.y) / span;
    const prev = col.getX(i);
    const t = Math.min(1, Math.max(0, prev * 0.55 + h * 0.45));
    col.setXYZ(i, t, t, t);
  }
  col.needsUpdate = true;
}

const HOVER = 0.05;

function normalize(geo: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  geo.translate(-((bb.min.x + bb.max.x) / 2), -bb.min.y, -((bb.min.z + bb.max.z) / 2));
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const s = (1.05 * scale) / maxDim;
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const y0 = geo.boundingBox!.min.y;
  geo.translate(0, HOVER - y0, 0);
  geo.computeVertexNormals();
  return geo;
}

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeParts(parts);
  reflowGradient(merged);
  merged.computeVertexNormals();
  return merged;
}

/* ── families ────────────────────────────────────────────────── */

function buildCap(h: number, r: number, bloomR: number, rng: () => number): THREE.BufferGeometry {
  const capW = bloomR * (1.05 + range(rng, 0, 0.2));
  const profile = [
    r * 0.9, r * 1.05, r * 0.95, r * 0.7, r * 0.55, r * 0.5, r * 0.7,
    capW * 0.55, capW * 0.95, capW * 1.02, capW * 0.75, capW * 0.4, capW * 0.15,
  ];
  return finish([latheProfile(h * 1.05, profile, 96, 72, 0, 0.05, 0.95)]);
}

function buildFlowerDome(
  h: number, r: number, bloomR: number, petals: number, rng: () => number,
): THREE.BufferGeometry {
  const profile = [
    r * 0.6, bloomR * 0.55, bloomR * 0.88, bloomR * 0.98,
    bloomR * 0.88, bloomR * 0.55, bloomR * 0.28, bloomR * 0.12,
  ];
  const body = latheProfile(h * 0.72, profile, 84, 60, 0, 0.05, 0.45);
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.48;
  const count = petals + 4;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const elev = 0.5 + range(rng, -0.04, 0.1);
    const dir = new THREE.Vector3(
      Math.sin(a) * Math.sin(elev),
      Math.cos(elev) * 0.85 + 0.2,
      Math.cos(a) * Math.sin(elev),
    ).normalize();
    parts.push(
      solidLobe({
        length: bloomR * range(rng, 0.7, 0.92),
        rRoot: bloomR * 0.2,
        rMid: bloomR * 0.22,
        rTip: bloomR * 0.1,
        origin: new THREE.Vector3(Math.sin(a) * bloomR * 0.15, y - 0.08, Math.cos(a) * bloomR * 0.15),
        dir,
        colorRoot: 0.4,
        colorTip: 0.98,
      }),
    );
  }
  return finish(parts);
}

function buildAnemone(
  h: number, r: number, bloomR: number, n: number, rng: () => number,
): THREE.BufferGeometry {
  const profile = [
    r * 0.8, bloomR * 0.5, bloomR * 0.75, bloomR * 0.82,
    bloomR * 0.6, bloomR * 0.32, bloomR * 0.12,
  ];
  const body = latheProfile(h * 0.68, profile, 72, 54, 0, 0.05, 0.4);
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.5;
  const count = n + 6;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + range(rng, -0.03, 0.03);
    const elev = range(rng, 0.15, 0.75);
    const dir = new THREE.Vector3(
      Math.sin(a) * Math.sin(elev), Math.cos(elev), Math.cos(a) * Math.sin(elev),
    ).normalize();
    parts.push(
      solidLobe({
        length: bloomR * range(rng, 0.75, 1.2),
        rRoot: bloomR * 0.09,
        rMid: bloomR * 0.09,
        rTip: bloomR * 0.14,
        origin: new THREE.Vector3(Math.sin(a) * bloomR * 0.06, y - 0.03, Math.cos(a) * bloomR * 0.06),
        dir,
        colorRoot: 0.35,
        colorTip: 0.98,
      }),
    );
  }
  return finish(parts);
}

function buildLotus(
  h: number, r: number, bloomR: number, petals: number, rng: () => number,
): THREE.BufferGeometry {
  const profile = [
    r * 0.9, r * 0.95, r * 0.75, r * 0.52, r * 0.45,
    bloomR * 0.35, bloomR * 0.48, bloomR * 0.42, bloomR * 0.25, bloomR * 0.1,
  ];
  const body = latheProfile(h * 0.88, profile, 84, 66, 0, 0.05, 0.4);
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.72;
  for (let L = 0; L < 3; L++) {
    const lt = L / 2;
    const count = petals + L;
    const elev = 0.4 + lt * 0.48;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + lt * 0.28;
      const dir = new THREE.Vector3(
        Math.sin(a) * Math.sin(elev), Math.cos(elev), Math.cos(a) * Math.sin(elev),
      ).normalize();
      parts.push(
        solidLobe({
          length: bloomR * (0.65 + lt * 0.35),
          rRoot: bloomR * 0.16,
          rMid: bloomR * (0.2 - lt * 0.03),
          rTip: bloomR * 0.06,
          origin: new THREE.Vector3(Math.sin(a) * bloomR * 0.05, y - 0.06, Math.cos(a) * bloomR * 0.05),
          dir,
          colorRoot: 0.35 + lt * 0.1,
          colorTip: 0.9 + lt * 0.08,
        }),
      );
    }
  }
  return finish(parts);
}

function buildVase(h: number, r: number, bloomR: number): THREE.BufferGeometry {
  const profile = [
    r * 0.6, bloomR * 0.45, bloomR * 0.72, bloomR * 0.88, bloomR * 0.7,
    bloomR * 0.4, bloomR * 0.32, bloomR * 0.45, bloomR * 0.55, bloomR * 0.42, bloomR * 0.18,
  ];
  return finish([latheProfile(h * 1.15, profile, 96, 72, 0, 0.05, 0.95)]);
}

function buildSpire(h: number, r: number, buds: number, rng: () => number): THREE.BufferGeometry {
  const profile = [r * 0.95, r * 0.9, r * 0.65, r * 0.42, r * 0.28, r * 0.16, r * 0.1, 0.04];
  const body = latheProfile(h * 1.15, profile, 90, 80, 0, 0.05, 0.55);
  const parts: THREE.BufferGeometry[] = [body];
  for (let i = 0; i < buds + 6; i++) {
    const t = 0.3 + (i / (buds + 6)) * 0.6;
    const a = i * 1.7;
    const dir = new THREE.Vector3(Math.sin(a), 0.25, Math.cos(a)).normalize();
    const br = r * (0.9 - t * 0.4);
    parts.push(
      solidLobe({
        length: br * 2.2,
        rRoot: br * 0.7,
        rMid: br,
        rTip: br * 0.5,
        origin: new THREE.Vector3(Math.sin(a) * r * 0.12, h * t, Math.cos(a) * r * 0.12),
        dir,
        colorRoot: 0.3 + t * 0.3,
        colorTip: 0.75 + t * 0.2,
      }),
    );
  }
  parts.push(
    solidSphere({
      center: new THREE.Vector3(0, h * 1.05, 0),
      radius: r * 0.45,
      squashY: 1.5,
      colorBase: 0.7,
      colorTop: 1,
      segs: 32,
    }),
  );
  return finish(parts);
}

function buildCluster(
  h: number, r: number, bloomR: number, n: number, rng: () => number,
): THREE.BufferGeometry {
  const profile = [r * 0.95, r * 1.0, r * 0.75, r * 0.5, r * 0.42, bloomR * 0.28];
  const body = latheProfile(h * 0.75, profile, 90, 64, 0, 0.05, 0.35);
  const centers: { p: THREE.Vector3; s: number }[] = [];
  const y = h * 0.82;
  for (let i = 0; i < n + 10; i++) {
    const u = rng();
    const v = rng();
    const a = u * Math.PI * 2;
    const elev = Math.acos(2 * v - 1) * 0.5;
    const rr = bloomR * range(rng, 0.05, 0.55);
    centers.push({
      p: new THREE.Vector3(
        Math.sin(a) * Math.sin(elev) * rr,
        y + Math.cos(elev) * rr * 0.55,
        Math.cos(a) * Math.sin(elev) * rr,
      ),
      s: bloomR * range(rng, 0.18, 0.32),
    });
  }
  const head = solidSphere({
    center: new THREE.Vector3(0, y, 0),
    radius: bloomR * 0.95,
    segs: 56,
    colorBase: 0.4,
    colorTop: 0.95,
    warp: (n) => {
      const p = n.clone().multiplyScalar(bloomR * 0.95).add(new THREE.Vector3(0, y, 0));
      let d = 1e9;
      for (const c of centers) d = Math.min(d, p.distanceTo(c.p) / c.s);
      return THREE.MathUtils.clamp(1.15 - d * 0.35, 0.55, 1.35);
    },
  });
  return finish([body, head]);
}

function buildFan(
  h: number, r: number, bloomR: number, blades: number, rng: () => number,
): THREE.BufferGeometry {
  const profile = [r * 0.9, r * 1.0, r * 0.75, r * 0.48, r * 0.4];
  const body = latheProfile(h * 0.82, profile, 90, 64, 0, 0.05, 0.35);
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.72;
  for (let i = 0; i < blades; i++) {
    const t = blades <= 1 ? 0.5 : i / (blades - 1);
    const a = (t - 0.5) * 1.85;
    const dir = new THREE.Vector3(Math.sin(a), 0.28 + range(rng, -0.04, 0.06), Math.cos(a)).normalize();
    parts.push(
      solidLobe({
        length: bloomR * 1.1,
        rRoot: bloomR * 0.16,
        rMid: bloomR * 0.2,
        rTip: bloomR * 0.07,
        origin: new THREE.Vector3(0, y - 0.05, 0),
        dir,
        colorRoot: 0.3,
        colorTip: 0.95,
      }),
    );
  }
  return finish(parts);
}

function buildBell(h: number, r: number, bloomR: number): THREE.BufferGeometry {
  const profile = [
    r * 0.8, r * 0.95, r * 0.75, r * 0.5, r * 0.42,
    bloomR * 0.5, bloomR * 0.78, bloomR * 0.98, bloomR * 1.0,
    bloomR * 0.82, bloomR * 0.5, bloomR * 0.25, bloomR * 0.1,
  ];
  const body = latheProfile(h * 1.05, profile, 96, 72, 0, 0.05, 0.85);
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.62;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a) * 0.85, 0.35, Math.cos(a) * 0.85).normalize();
    parts.push(
      solidLobe({
        length: bloomR * 0.7,
        rRoot: bloomR * 0.28,
        rMid: bloomR * 0.32,
        rTip: bloomR * 0.12,
        origin: new THREE.Vector3(Math.sin(a) * bloomR * 0.15, y, Math.cos(a) * bloomR * 0.15),
        dir,
        colorRoot: 0.45,
        colorTip: 0.95,
      }),
    );
  }
  parts.push(
    solidSphere({
      center: new THREE.Vector3(0, h * 0.95, 0),
      radius: bloomR * 0.14,
      squashY: 1.3,
      colorBase: 0.7,
      colorTop: 1,
      segs: 30,
    }),
  );
  return finish(parts);
}

function buildPalm(
  h: number, r: number, bloomR: number, n: number, rng: () => number,
): THREE.BufferGeometry {
  const profile = [r * 1.05, r * 1.15, r * 0.95, r * 0.65, r * 0.48, r * 0.4];
  const body = latheProfile(h * 0.88, profile, 90, 64, 0, 0.05, 0.35);
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.82;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a), range(rng, 0.1, 0.3), Math.cos(a)).normalize();
    parts.push(
      solidLobe({
        length: bloomR * range(rng, 1.05, 1.45),
        rRoot: bloomR * 0.12,
        rMid: bloomR * 0.14,
        rTip: bloomR * 0.04,
        origin: new THREE.Vector3(0, y - 0.03, 0),
        dir,
        colorRoot: 0.3,
        colorTip: 0.92,
      }),
    );
  }
  return finish(parts);
}

function buildOrb(h: number, r: number, bloomR: number): THREE.BufferGeometry {
  const stem = latheProfile(
    h * 0.7,
    [r * 0.9, r * 0.95, r * 0.7, r * 0.48, r * 0.42],
    64, 44, 0, 0.05, 0.35,
  );
  const orb = solidSphere({
    center: new THREE.Vector3(0, h * 0.85, 0),
    radius: bloomR * 0.85,
    segs: 56,
    colorBase: 0.35,
    colorTop: 0.92,
    warp: (n) =>
      1 + 0.05 * Math.sin(n.x * 6) * Math.sin(n.y * 6) * Math.sin(n.z * 6),
  });
  return finish([stem, orb]);
}

function buildStar(
  h: number, r: number, bloomR: number, points: number, rng: () => number,
): THREE.BufferGeometry {
  const body = latheProfile(
    h * 0.82,
    [r * 0.9, r * 0.95, r * 0.7, r * 0.48, bloomR * 0.3],
    64, 44, 0, 0.05, 0.4,
  );
  const parts: THREE.BufferGeometry[] = [
    body,
    solidSphere({
      center: new THREE.Vector3(0, h * 0.8, 0),
      radius: bloomR * 0.28,
      segs: 36,
      colorBase: 0.5,
      colorTop: 0.75,
    }),
  ];
  const y = h * 0.8;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a), range(rng, 0, 0.12), Math.cos(a)).normalize();
    parts.push(
      solidLobe({
        length: bloomR * 0.9,
        rRoot: bloomR * 0.16,
        rMid: bloomR * 0.12,
        rTip: bloomR * 0.04,
        origin: new THREE.Vector3(Math.sin(a) * bloomR * 0.05, y, Math.cos(a) * bloomR * 0.05),
        dir,
        colorRoot: 0.4,
        colorTip: 0.95,
      }),
    );
  }
  return finish(parts);
}

function buildDroop(
  h: number, r: number, bloomR: number, n: number, droop: number, rng: () => number,
): THREE.BufferGeometry {
  const body = latheProfile(
    h * 0.9,
    [r * 0.9, r * 1.0, r * 0.8, r * 0.52, r * 0.45, bloomR * 0.28],
    64, 48, 0, 0.05, 0.35,
  );
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.82;
  const count = Math.max(4, Math.floor(n / 2) + 2);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const elev = Math.PI * 0.5 + 0.25 + droop * 0.8;
    const dir = new THREE.Vector3(
      Math.sin(a) * Math.sin(elev), Math.cos(elev), Math.cos(a) * Math.sin(elev),
    ).normalize();
    parts.push(
      solidLobe({
        length: bloomR * range(rng, 0.85, 1.2),
        rRoot: bloomR * 0.12,
        rMid: bloomR * 0.18,
        rTip: bloomR * 0.14,
        origin: new THREE.Vector3(Math.sin(a) * bloomR * 0.06, y - 0.03, Math.cos(a) * bloomR * 0.06),
        dir,
        colorRoot: 0.3,
        colorTip: 0.95,
      }),
    );
  }
  return finish(parts);
}

/** Continuous sealed helix — TubeGeometry + sphere caps. */
function buildHelix(h: number, r: number, bloomR: number, rng: () => number): THREE.BufferGeometry {
  const turns = 2.0 + range(rng, 0, 0.65);
  const steps = Math.floor(turns * 56);
  const path: THREE.Vector3[] = [];

  const baseH = h * 0.4;
  for (let i = 0; i <= 12; i++) {
    path.push(new THREE.Vector3(0, (i / 12) * baseH, 0));
  }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const ease = t * t * (3 - 2 * t);
    const rr = bloomR * (0.18 + 0.45 * Math.sin(t * Math.PI)) * (0.4 + 0.6 * ease);
    path.push(new THREE.Vector3(Math.sin(a) * rr, baseH + t * bloomR * 1.45, Math.cos(a) * rr));
  }

  // Constant fat radius — no paper-thin sections
  const tubeR = Math.max(r * 0.55, bloomR * 0.14);
  return finish([
    tubePath(path, tubeR, steps + 48, 22, 0.12, 0.95, false),
  ]);
}

function buildRing(h: number, r: number, bloomR: number, rings: number): THREE.BufferGeometry {
  const body = latheProfile(
    h * 0.82,
    [r * 0.9, r * 0.95, r * 0.7, r * 0.48, bloomR * 0.28],
    64, 44, 0, 0.05, 0.4,
  );
  const parts: THREE.BufferGeometry[] = [
    body,
    solidSphere({
      center: new THREE.Vector3(0, h * 0.85, 0),
      radius: bloomR * 0.22,
      segs: 36,
      colorBase: 0.55,
      colorTop: 0.8,
    }),
  ];
  const y = h * 0.85;
  for (let i = 0; i < rings; i++) {
    const t = rings <= 1 ? 0 : i / (rings - 1);
    const major = bloomR * (0.35 + t * 0.4);
    const minor = Math.max(0.05, bloomR * 0.12 * (1 - t * 0.1));
    const path: THREE.Vector3[] = [];
    const segs = 48;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      path.push(new THREE.Vector3(Math.cos(a) * major, y + t * 0.05, Math.sin(a) * major));
    }
    parts.push(tubePath(path, minor, 96, 20, 0.35 + t * 0.2, 0.85 + t * 0.1, true));
  }
  return finish(parts);
}

function buildBud(h: number, r: number, bloomR: number): THREE.BufferGeometry {
  const br = bloomR * 0.75;
  // Keep mid-body thick — no near-zero waist that reads as a hole
  const profile = [
    r * 0.95, r * 1.0, r * 0.78, r * 0.55, r * 0.5,
    br * 0.58, br * 0.88, br * 0.98, br * 0.8, br * 0.48, br * 0.2,
  ];
  return finish([latheProfile(h * 1.05, profile, 96, 84, 0, 0.05, 0.95)]);
}

function buildFrond(
  h: number, r: number, bloomR: number, n: number, rng: () => number,
): THREE.BufferGeometry {
  const body = latheProfile(
    h * 0.48,
    [r * 1.0, r * 1.1, r * 0.9, r * 0.55, r * 0.42],
    64, 40, 0, 0.05, 0.35,
  );
  const parts: THREE.BufferGeometry[] = [body];
  const y = h * 0.42;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + range(rng, -0.05, 0.05);
    const elev = 0.55 + range(rng, -0.08, 0.1);
    const dir = new THREE.Vector3(
      Math.sin(a) * Math.sin(elev), Math.cos(elev), Math.cos(a) * Math.sin(elev),
    ).normalize();
    parts.push(
      solidLobe({
        length: bloomR * range(rng, 1.0, 1.45),
        rRoot: bloomR * 0.1,
        rMid: bloomR * 0.1,
        rTip: bloomR * 0.05,
        origin: new THREE.Vector3(0, y - 0.03, 0),
        dir,
        colorRoot: 0.3,
        colorTip: 0.92,
      }),
    );
  }
  return finish(parts);
}

export function buildPlantGeometry(specimen: PlantSpecimen): THREE.BufferGeometry {
  const rng = createRng(specimen.seed + 17);
  const h = specimen.stemHeight;
  const r = specimen.stemRadius;
  const bloomR = 0.5 * specimen.bloomScale;
  let geo: THREE.BufferGeometry;

  switch (specimen.family) {
    case "cap":
      geo = buildCap(h, r, bloomR, rng);
      break;
    case "lotus":
      geo =
        rng() > 0.4
          ? buildLotus(h, r, bloomR, specimen.petalCount, rng)
          : buildFlowerDome(h, r, bloomR, specimen.petalCount, rng);
      break;
    case "anemone":
      geo =
        rng() > 0.35
          ? buildAnemone(h, r, bloomR, specimen.petalCount, rng)
          : buildFlowerDome(h, r, bloomR, specimen.petalCount + 2, rng);
      break;
    case "vase":
      geo = buildVase(h, r, bloomR);
      break;
    case "spire":
      geo = buildSpire(h * 1.1, r * 1.25, specimen.petalCount, rng);
      break;
    case "cluster":
      geo = buildCluster(h, r, bloomR, specimen.petalCount, rng);
      break;
    case "fan":
      geo = buildFan(h, r, bloomR * 1.1, specimen.petalCount, rng);
      break;
    case "bell":
      geo = buildBell(h, r, bloomR);
      break;
    case "palm":
      geo = buildPalm(h, r, bloomR, specimen.petalCount, rng);
      break;
    case "orb":
      geo = buildOrb(h, r, bloomR);
      break;
    case "star":
      geo = buildStar(h, r, bloomR, specimen.petalCount, rng);
      break;
    case "droop":
      geo = buildDroop(h, r, bloomR, specimen.petalCount, specimen.droop, rng);
      break;
    case "helix":
      geo = buildHelix(h, r, bloomR, rng);
      break;
    case "ring":
      geo = buildRing(h, r, bloomR, 3 + Math.floor(rng() * 2));
      break;
    case "bud":
      geo = buildBud(h, r, bloomR);
      break;
    case "frond":
      geo = buildFrond(h, r, bloomR, specimen.petalCount, rng);
      break;
    default:
      geo = buildCap(h, r, bloomR, rng);
  }

  return normalize(geo, specimen.scale);
}
