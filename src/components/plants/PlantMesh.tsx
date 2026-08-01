import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { PlantSpecimen } from "@/lib/plants/types";
import { buildPlantGeometry } from "@/lib/plants/geometry";
import { bakeVertexColors, createPlantMaterial } from "@/lib/plants/materials";
import {
  colorAnimFor,
  sampleLiveColors,
  type LiveColors,
} from "@/lib/plants/anim";

const CACHE_VER = 20;
const geometryCache = new Map<string, ReturnType<typeof buildPlantGeometry>>();

function cacheKey(id: number) {
  return `${CACHE_VER}:${id}`;
}

function getGeometry(specimen: PlantSpecimen) {
  const key = cacheKey(specimen.id);
  let g = geometryCache.get(key);
  if (!g) {
    g = buildPlantGeometry(specimen);
    bakeVertexColors(g, specimen.colorA, specimen.colorB);
    geometryCache.set(key, g);
  }
  return g;
}

export function PlantMesh({
  specimen,
  night = false,
  onLiveColors,
}: {
  specimen: PlantSpecimen;
  night?: boolean;
  onLiveColors?: (live: LiveColors) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => getGeometry(specimen), [specimen]);
  const material = useMemo(() => createPlantMaterial(specimen), [specimen]);
  const anim = useMemo(() => colorAnimFor(specimen), [specimen]);
  const nightRef = useRef(night);
  nightRef.current = night;

  useLayoutEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    material.uniforms.uNight.value = night ? 1 : 0;
  }, [material, night]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const isNight = nightRef.current;
    if (group.current) {
      const breath =
        1 +
        Math.sin(t * anim.speed * 1.1 + anim.phase) *
          (0.004 + anim.pulse * (isNight ? 0.01 : 0.006));
      group.current.scale.setScalar(breath);
    }

    const live = sampleLiveColors(specimen, anim, t);
    const u = material.uniforms;
    u.uColorA.value.set(live.colorA[0], live.colorA[1], live.colorA[2]);
    u.uColorB.value.set(live.colorB[0], live.colorB[1], live.colorB[2]);
    u.uTintBoost.value.set(live.tint[0], live.tint[1], live.tint[2]);
    u.uMixShift.value = live.mixShift;
    // Keep base emission stable — intensity map in shader decides bloom hotspots
    u.uEmission.value = live.emission * (isNight ? 1.1 : 1);
    u.uNight.value = isNight ? 1 : 0;

    const sh = u.uSH.value as number[];
    if (sh && sh.length >= 3) {
      const e = live.emission;
      sh[0] = 0.9 * e;
      sh[1] = 0.9 * e;
      sh[2] = 0.92 * e;
      sh[6] = 0.4 + live.tint[0] * 0.16;
      sh[7] = 0.36 + live.tint[1] * 0.14;
      sh[8] = 0.32 + live.tint[2] * 0.12;
    }

    onLiveColors?.(live);
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
