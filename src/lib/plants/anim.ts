import type { PlantSpecimen, RGB } from "./types";

export type ColorAnim = {
  /** Base cycle speed (rad/s scale) */
  speed: number;
  /** Hue swing in turns (0–1 ≈ 0–360°) for colorA */
  hueA: number;
  /** Hue swing for colorB */
  hueB: number;
  /** Mix-channel drift along the surface */
  mixDrift: number;
  /** Emission / brightness pulse amount */
  pulse: number;
  /** Saturation breathe */
  satPulse: number;
  /** Second slower LFO weight */
  breath: number;
  /** Phase offsets */
  phase: number;
  phase2: number;
};

/** Per-specimen color-motion personality (some calm, some lively). */
export function colorAnimFor(specimen: PlantSpecimen): ColorAnim {
  const s = specimen.seed;
  const n1 = ((s * 16807) % 2147483647) / 2147483647;
  const n2 = ((s * 48271) % 2147483647) / 2147483647;
  const n3 = ((s * 69621) % 2147483647) / 2147483647;
  const n4 = ((s * 31337) % 2147483647) / 2147483647;

  // Energy tier: ~25% calm, ~50% medium, ~25% lively (jlongster-like)
  const energy =
    n1 < 0.25 ? 0.55 + n2 * 0.25 : n1 < 0.75 ? 0.95 + n2 * 0.45 : 1.45 + n2 * 0.7;

  return {
    speed: 0.35 + n3 * 0.55 * energy,
    // Hue swings are intentional — tip and base drift independently
    hueA: (0.035 + n2 * 0.06) * energy,
    hueB: (0.05 + n3 * 0.09) * energy,
    mixDrift: (0.08 + n4 * 0.14) * energy,
    pulse: (0.08 + n1 * 0.14) * energy,
    satPulse: (0.05 + n2 * 0.1) * energy,
    breath: 0.4 + n4 * 0.5,
    phase: n1 * Math.PI * 2,
    phase2: n3 * Math.PI * 2,
  };
}

function hue2rgb(p: number, q: number, t: number) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1 / 3),
  ];
}

/** Shift RGB by hue/sat/light deltas (hsl space). */
export function shiftColor(
  c: RGB,
  dH: number,
  dS: number,
  dL: number,
): RGB {
  const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
  let nh = h + dH;
  nh = nh - Math.floor(nh);
  const ns = Math.min(1, Math.max(0, s + dS));
  const nl = Math.min(1, Math.max(0.05, l + dL));
  return hslToRgb(nh, ns, nl);
}

export type LiveColors = {
  colorA: RGB;
  colorB: RGB;
  tint: RGB;
  emission: number;
  mixShift: number;
};

/** Evaluate animated colors at time t (seconds). */
export function sampleLiveColors(
  specimen: PlantSpecimen,
  anim: ColorAnim,
  t: number,
): LiveColors {
  const w1 = Math.sin(t * anim.speed + anim.phase);
  const w2 = Math.sin(t * anim.speed * 0.61 + anim.phase2);
  const w3 = Math.sin(t * anim.speed * 1.37 + anim.phase * 0.7);
  const breath = Math.sin(t * anim.speed * 0.45 + anim.phase2) * anim.breath;

  const dHa = w1 * anim.hueA + w2 * anim.hueA * 0.45;
  const dHb = w2 * anim.hueB + w3 * anim.hueB * 0.4;
  const dS = (w1 * 0.5 + w3 * 0.5) * anim.satPulse;
  const dL = breath * anim.pulse * 0.75;

  const colorA = shiftColor(specimen.colorA, dHa, dS, dL * 0.55);
  const colorB = shiftColor(specimen.colorB, dHb, dS * 0.85, dL);

  const tintMix = 0.48 + 0.22 * w2;
  const tint: RGB = [
    colorA[0] + (colorB[0] - colorA[0]) * tintMix,
    colorA[1] + (colorB[1] - colorA[1]) * tintMix,
    colorA[2] + (colorB[2] - colorA[2]) * tintMix,
  ];

  const emission =
    specimen.emission * (1 + (w1 * 0.55 + breath * 0.55) * anim.pulse * 1.5);
  const mixShift = w2 * anim.mixDrift + w3 * anim.mixDrift * 0.55;

  return { colorA, colorB, tint, emission, mixShift };
}
