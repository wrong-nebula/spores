import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PlantSpecimen } from "@/lib/plants/types";
import type { LiveColors } from "@/lib/plants/anim";

export type SporeProfile = {
  count: number;
  size: number;
  speed: number;
  spread: number;
  lift: number;
  tipBias: number;
  opacity: number;
};

/** Per-specimen spore personality — ~40% release none. */
export function sporeProfileFor(specimen: PlantSpecimen): SporeProfile {
  const s = specimen.seed;
  const n1 = ((s * 1103515245 + 12345) >>> 0) / 0xffffffff;
  const n2 = ((s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
  const n3 = ((s * 214013 + 2531011) >>> 0) / 0xffffffff;

  if (n1 < 0.4) {
    return { count: 0, size: 0, speed: 0, spread: 0, lift: 0, tipBias: 0.5, opacity: 0 };
  }

  // Slightly leaner tiers — quality held by soft shader + selective bloom
  const tier = n2 < 0.55 ? 0 : n2 < 0.85 ? 1 : 2;
  const count =
    tier === 0
      ? 8 + Math.floor(n3 * 8)
      : tier === 1
        ? 14 + Math.floor(n3 * 10)
        : 22 + Math.floor(n3 * 12);

  return {
    count,
    size: 0.012 + n1 * 0.014 + tier * 0.004,
    speed: 0.08 + n2 * 0.12 + tier * 0.03,
    spread: 0.35 + n3 * 0.35 + tier * 0.08,
    lift: 0.15 + n1 * 0.35,
    tipBias: 0.35 + n2 * 0.5,
    opacity: 0.22 + n3 * 0.16 + tier * 0.05,
  };
}

type Particle = {
  ox: number;
  oy: number;
  oz: number;
  phase: number;
  speed: number;
  yBase: number;
  yAmp: number;
  size: number;
  mix: number;
};

/**
 * Tiny floating spores — night only.
 * Mid-strength glow on the brightest; cheap CPU path (no per-frame attribute churn
 * when hidden; lit packed into aSize.w-style via aLit only when visible).
 */
export function Spores({
  specimen,
  night,
  liveRef,
}: {
  specimen: PlantSpecimen;
  night: boolean;
  liveRef: React.MutableRefObject<LiveColors & { glow: number }>;
}) {
  const profile = useMemo(() => sporeProfileFor(specimen), [specimen]);
  const pointsRef = useRef<THREE.Points>(null);
  const nightRef = useRef(night);
  nightRef.current = night;
  const fade = useRef(0);

  const { geometry, particles, posArr, litArr } = useMemo(() => {
    const count = profile.count;
    const n = Math.max(1, count);
    const posArr = new Float32Array(n * 3);
    const aSize = new Float32Array(n);
    const aMix = new Float32Array(n);
    const litArr = new Float32Array(n);
    const parts: Particle[] = [];

    let state = (specimen.seed ^ 0x9e3779b9) >>> 0;
    const rnd = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0xffffffff;
    };

    for (let i = 0; i < count; i++) {
      const theta = rnd() * Math.PI * 2;
      const r = (0.15 + rnd() * profile.spread) * (0.7 + rnd() * 0.5);
      const yBase = 0.12 + rnd() * (0.55 + profile.lift);
      const p: Particle = {
        ox: Math.cos(theta) * r,
        oy: yBase,
        oz: Math.sin(theta) * r,
        phase: rnd() * Math.PI * 2,
        speed: profile.speed * (0.55 + rnd() * 0.9),
        yBase,
        yAmp: 0.04 + rnd() * 0.1,
        size: profile.size * (0.55 + rnd() * 0.9),
        mix: rnd() < profile.tipBias ? 0.55 + rnd() * 0.45 : rnd() * 0.45,
      };
      parts.push(p);
      posArr[i * 3] = p.ox;
      posArr[i * 3 + 1] = p.oy;
      posArr[i * 3 + 2] = p.oz;
      aSize[i] = p.size;
      aMix[i] = p.mix;
      litArr[i] = 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute("aMix", new THREE.BufferAttribute(aMix, 1));
    geo.setAttribute("aLit", new THREE.BufferAttribute(litArr, 1));
    return { geometry: geo, particles: parts, posArr, litArr };
  }, [specimen, profile]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uColorA: { value: new THREE.Color(1, 0.5, 0.2) },
        uColorB: { value: new THREE.Color(1, 0.8, 0.3) },
        uOpacity: { value: 0 },
        uGlow: { value: 1 },
        uPixelRatio: {
          value: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1),
        },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aMix;
        attribute float aLit;
        uniform float uPixelRatio;
        uniform float uGlow;
        varying float vMix;
        varying float vAlpha;
        varying float vLit;
        void main() {
          vMix = aMix;
          vLit = aLit;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(-mv.z, 0.5);
          float hot = smoothstep(0.55, 1.15, aLit * uGlow);
          // Mid glow: modest size boost only on hot spores
          float sizeBoost = 0.88 + aLit * 0.18 * uGlow + hot * 0.28;
          gl_PointSize = aSize * sizeBoost * uPixelRatio * (290.0 / dist);
          gl_PointSize = clamp(gl_PointSize, 0.6, 8.0);
          vAlpha = smoothstep(8.0, 1.2, gl_PointSize);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uOpacity;
        uniform float uGlow;
        varying float vMix;
        varying float vAlpha;
        varying float vLit;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float d = length(p);
          float core = smoothstep(1.0, 0.12, d);
          float mid = smoothstep(1.0, 0.4, d);
          float halo = smoothstep(1.0, 0.0, d);

          float lit = vLit * (0.3 + uGlow * 1.05);
          float hot = smoothstep(0.65, 1.2, lit);

          float body = core * 0.9 + mid * 0.3;
          // Soft halo on brightest only — middle ground (not blown out)
          float bloomHalo = halo * hot * hot * 0.85;

          float a = (body * 0.88 + bloomHalo * 0.4) * uOpacity * vAlpha * lit;
          if (a < 0.004) discard;

          vec3 col = mix(uColorA, uColorB, vMix);
          col = mix(col * 0.72, col, clamp(uGlow * 0.55 + lit * 0.35, 0.0, 1.0));
          // Moderate HDR lift — enough for selective bloom, not a flare
          float hdr = 1.0 + hot * (0.85 + uGlow * 0.55);
          col *= (0.75 + lit * 0.55) * hdr;

          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }
      `,
    });
  }, []);

  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock, gl }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const want = nightRef.current && profile.count > 0;
    const target = want ? 1 : 0;
    fade.current += (target - fade.current) * Math.min(1, dt * 3.2);

    if (!pointsRef.current) return;

    // Fully hidden: skip all particle work
    if (fade.current < 0.01) {
      pointsRef.current.visible = false;
      material.uniforms.uOpacity.value = 0;
      return;
    }
    pointsRef.current.visible = true;

    const live = liveRef.current;
    material.uniforms.uPixelRatio.value = Math.min(2, gl.getPixelRatio());
    material.uniforms.uColorA.value.setRGB(live.colorA[0], live.colorA[1], live.colorA[2]);
    material.uniforms.uColorB.value.setRGB(live.colorB[0], live.colorB[1], live.colorB[2]);
    material.uniforms.uGlow.value = live.glow;

    const t = clock.elapsedTime;
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const litAttr = geometry.getAttribute("aLit") as THREE.BufferAttribute;

    const ly = 0.48 + live.mixShift * 0.12;
    const eps = 0.08;
    const L = 0.22;
    const glowCap = Math.min(1.3, live.glow);

    const count = particles.length;
    for (let i = 0; i < count; i++) {
      const p = particles[i]!;
      const tt = t * p.speed + p.phase;
      const swirl = tt * 0.15;
      const cs = Math.cos(swirl);
      const sn = Math.sin(swirl);
      const x = p.ox * cs - p.oz * sn;
      const z = p.ox * sn + p.oz * cs;
      const y =
        p.yBase +
        Math.sin(tt * 1.1) * p.yAmp +
        Math.sin(tt * 0.37 + p.phase) * p.yAmp * 0.45;
      const px = x + Math.sin(tt * 0.9 + p.phase * 2.1) * 0.02;
      const pz = z + Math.cos(tt * 0.75 + p.phase) * 0.02;

      const i3 = i * 3;
      posArr[i3] = px;
      posArr[i3 + 1] = y;
      posArr[i3 + 2] = pz;

      const dx = px;
      const dy = y - ly;
      const dz = pz;
      const r2 = dx * dx + dy * dy + dz * dz;
      let inv = L / (r2 + eps);
      if (inv > 1.35) inv = 1.35;
      else if (inv < 0.08) inv = 0.08;
      litArr[i] = inv * (0.85 + p.mix * 0.4 * glowCap);
    }
    posAttr.needsUpdate = true;
    litAttr.needsUpdate = true;

    const cycle = 0.55 + Math.min(1.15, live.glow) * 0.7 + live.emission * 0.12;
    material.uniforms.uOpacity.value = fade.current * profile.opacity * cycle;
  });

  if (profile.count === 0) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}
