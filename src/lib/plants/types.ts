export type PlantFamily =
  | "cap"
  | "lotus"
  | "anemone"
  | "vase"
  | "spire"
  | "cluster"
  | "fan"
  | "bell"
  | "palm"
  | "orb"
  | "star"
  | "droop"
  | "helix"
  | "ring"
  | "bud"
  | "frond";

export type RGB = [number, number, number];

export interface PlantSpecimen {
  id: number;
  name: string;
  family: PlantFamily;
  /** Base / stem color (linear-ish 0-1 RGB) */
  colorA: RGB;
  /** Tip / bloom color */
  colorB: RGB;
  /** Soft paper-tint dominant color (sRGB 0-1) */
  tint: RGB;
  seed: number;
  scale: number;
  stemHeight: number;
  stemRadius: number;
  bloomScale: number;
  petalCount: number;
  twist: number;
  droop: number;
  roughness: number;
  emission: number;
}

export const FAMILY_NAMES: Record<PlantFamily, string[]> = {
  cap: ["Mycena", "Amanita", "Boletus", "Coprinus", "Lepiota"],
  lotus: ["Nelumbo", "Nymphaea", "Victoria", "Euryale", "Brasenia"],
  anemone: ["Anemonia", "Heteractis", "Stichodactyla", "Entacmaea", "Condylactis"],
  vase: ["Nepenthes", "Sarracenia", "Darlingtonia", "Heliamphora", "Cephalotus"],
  spire: ["Digitalis", "Lupinus", "Delphinium", "Verbascum", "Echium"],
  cluster: ["Allium", "Hydrangea", "Sambucus", "Viburnum", "Cornus"],
  fan: ["Iris", "Gladiolus", "Freesia", "Crocosmia", "Ixia"],
  bell: ["Campanula", "Digitalis", "Fritillaria", "Hyacinthus", "Muscari"],
  palm: ["Chamaedorea", "Rhapis", "Cycas", "Zamia", "Howea"],
  orb: ["Allium", "Echinops", "Gomphrena", "Craspedia", "Scabiosa"],
  star: ["Aster", "Cosmos", "Dahlia", "Zinnia", "Coreopsis"],
  droop: ["Fuchsia", "Wisteria", "Dicentra", "Aquilegia", "Clematis"],
  helix: ["Ipomoea", "Passiflora", "Lonicera", "Humulus", "Convolvulus"],
  ring: ["Helianthus", "Rudbeckia", "Echinacea", "Gaillardia", "Ratibida"],
  bud: ["Rosa", "Paeonia", "Camellia", "Magnolia", "Gardenia"],
  frond: ["Nephrolepis", "Adiantum", "Pteris", "Asplenium", "Davallia"],
};
