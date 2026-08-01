import { createRng, pick, range } from "./rng";
import {
  FAMILY_NAMES,
  type PlantFamily,
  type PlantSpecimen,
  type RGB,
} from "./types";

const FAMILIES: PlantFamily[] = [
  "cap",
  "lotus",
  "anemone",
  "vase",
  "spire",
  "cluster",
  "fan",
  "bell",
  "palm",
  "orb",
  "star",
  "droop",
  "helix",
  "ring",
  "bud",
  "frond",
];

/** Palette from the reference sheet — warm → magenta → blue → cool green. */
const PALETTE: { a: RGB; b: RGB }[] = [
  { a: [0.98, 0.18, 0.05], b: [1.0, 0.58, 0.1] },
  { a: [1.0, 0.32, 0.06], b: [1.0, 0.75, 0.18] },
  { a: [0.95, 0.12, 0.1], b: [1.0, 0.48, 0.22] },
  { a: [0.92, 0.25, 0.05], b: [1.0, 0.65, 0.15] },
  { a: [1.0, 0.4, 0.05], b: [1.0, 0.82, 0.25] },
  { a: [0.95, 0.1, 0.32], b: [1.0, 0.48, 0.62] },
  { a: [1.0, 0.22, 0.48], b: [1.0, 0.6, 0.8] },
  { a: [0.95, 0.15, 0.55], b: [1.0, 0.55, 0.88] },
  { a: [0.9, 0.12, 0.4], b: [1.0, 0.52, 0.72] },
  { a: [1.0, 0.32, 0.68], b: [1.0, 0.75, 0.92] },
  { a: [0.78, 0.12, 0.72], b: [0.98, 0.45, 0.98] },
  { a: [0.55, 0.1, 0.8], b: [0.88, 0.4, 1.0] },
  { a: [0.32, 0.15, 0.92], b: [0.55, 0.48, 1.0] },
  { a: [0.12, 0.22, 0.95], b: [0.35, 0.58, 1.0] },
  { a: [0.05, 0.35, 1.0], b: [0.28, 0.68, 1.0] },
  { a: [0.08, 0.48, 0.95], b: [0.32, 0.78, 1.0] },
  { a: [0.1, 0.58, 0.88], b: [0.35, 0.88, 0.98] },
  { a: [0.05, 0.68, 0.78], b: [0.28, 0.95, 0.88] },
  { a: [0.08, 0.75, 0.55], b: [0.35, 0.98, 0.72] },
  { a: [0.12, 0.82, 0.32], b: [0.45, 1.0, 0.55] },
  { a: [0.22, 0.75, 0.15], b: [0.55, 0.98, 0.4] },
  { a: [0.48, 0.15, 0.9], b: [0.72, 0.48, 1.0] },
  { a: [0.18, 0.28, 0.8], b: [0.55, 0.58, 1.0] },
  { a: [0.95, 0.52, 0.1], b: [1.0, 0.88, 0.32] },
  { a: [1.0, 0.28, 0.18], b: [1.0, 0.68, 0.45] },
  { a: [0.75, 0.1, 0.55], b: [0.98, 0.42, 0.85] },
  { a: [0.12, 0.52, 1.0], b: [0.5, 0.82, 1.0] },
  { a: [0.15, 0.78, 0.68], b: [0.48, 0.98, 0.88] },
  { a: [0.6, 0.2, 0.1], b: [0.98, 0.55, 0.22] },
  { a: [0.32, 0.58, 0.1], b: [0.65, 0.95, 0.35] },
  { a: [0.9, 0.15, 0.22], b: [1.0, 0.52, 0.48] },
  { a: [0.22, 0.15, 0.7], b: [0.55, 0.48, 0.98] },
];

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function buildSpecimen(id: number): PlantSpecimen {
  const seed = id * 9973 + 42;
  const rng = createRng(seed);
  const family = FAMILIES[(id - 1) % FAMILIES.length]!;
  const paletteIndex =
    Math.floor(((id - 1) / 80) * PALETTE.length + (id - 1) * 0.37) %
    PALETTE.length;
  const base = PALETTE[paletteIndex]!;
  const jitter = (c: RGB): RGB => [
    Math.min(1, Math.max(0, c[0] + range(rng, -0.04, 0.04))),
    Math.min(1, Math.max(0, c[1] + range(rng, -0.04, 0.04))),
    Math.min(1, Math.max(0, c[2] + range(rng, -0.04, 0.04))),
  ];
  const colorA = jitter(base.a);
  const colorB = jitter(base.b);
  const tint = mixRGB(colorA, colorB, 0.55);

  const genus = pick(rng, FAMILY_NAMES[family]);
  const epithetPool = [
    "lucida",
    "radiata",
    "spectabilis",
    "nobilis",
    "gracilis",
    "pulchra",
    "aurea",
    "violacea",
    "azurea",
    "rosea",
    "viridis",
    "flammea",
    "caelestis",
    "mirabilis",
    "tenuis",
    "grandiflora",
  ];
  const name = `${genus} ${pick(rng, epithetPool)}`;

  return {
    id,
    name,
    family,
    colorA,
    colorB,
    tint,
    seed,
    scale: range(rng, 0.88, 1.12),
    stemHeight: range(rng, 0.6, 1.3),
    stemRadius: range(rng, 0.05, 0.11),
    bloomScale: range(rng, 0.65, 1.2),
    petalCount: Math.floor(range(rng, 5, 14)),
    twist: range(rng, -1.1, 1.1),
    droop: range(rng, 0, 0.5),
    roughness: range(rng, 0.22, 0.48),
    emission: range(rng, 0.85, 1.35),
  };
}

export const SPECIMENS: PlantSpecimen[] = Array.from({ length: 80 }, (_, i) =>
  buildSpecimen(i + 1),
);

export function getSpecimen(index: number): PlantSpecimen {
  const i = ((index % 80) + 80) % 80;
  return SPECIMENS[i]!;
}

export function formatSpecimenId(id: number): string {
  return String(id).padStart(2, "0");
}

export function rgbToCss(c: RGB, alpha = 1): string {
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function paperTint(c: RGB, strength = 0.14): string {
  const r = Math.round(247 + (c[0] * 255 - 247) * strength);
  const g = Math.round(246 + (c[1] * 255 - 246) * strength);
  const b = Math.round(243 + (c[2] * 255 - 243) * strength);
  return `rgb(${r}, ${g}, ${b})`;
}
