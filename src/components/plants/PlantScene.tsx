import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  SelectiveBloom,
  Selection,
  Select,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize } from "postprocessing";
import * as THREE from "three";
import type { PlantSpecimen } from "@/lib/plants/types";
import type { LiveColors } from "@/lib/plants/anim";
import { PlantMesh } from "./PlantMesh";
import { Spores } from "./Spores";

type DragState = {
  active: boolean;
  pointerId: number | null;
  lastX: number;
  lastY: number;
  velX: number;
  velY: number;
  target: { x: number; y: number };
};

const PAPER = new THREE.Color("#f7f6f3");
const NIGHT = new THREE.Color(0x000000);
const PAPER_RGB = { r: 247 / 255, g: 246 / 255, b: 243 / 255 };

type LiveSpill = LiveColors & {
  glow: number;
};

function chromaEnergy(c: [number, number, number]): number {
  const lum = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  const maxC = Math.max(c[0], c[1], c[2]);
  const minC = Math.min(c[0], c[1], c[2]);
  const sat = maxC > 1e-4 ? (maxC - minC) / maxC : 0;
  return sat * sat * (0.4 + lum * 0.6);
}

function glowFromLive(live: LiveColors): number {
  const tip = chromaEnergy(live.colorB);
  const base = chromaEnergy(live.colorA);
  const mix = 0.55 + live.mixShift * 0.5;
  const grad = Math.min(1, Math.max(0, mix));
  const iMap = Math.pow(grad * 0.5 + tip * 0.85 + grad * tip * 0.4 + base * 0.15, 1.35);
  return live.emission * (0.35 + iMap * 0.9);
}

function CameraRig() {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const dist = aspect < 0.75 ? 4.7 : aspect < 1.1 ? 4.35 : 4.1;
    const elev = aspect < 0.75 ? 1.45 : 1.28;
    camera.position.set(0, elev, dist);
    camera.near = 0.1;
    camera.far = 40;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = aspect < 0.75 ? 34 : 30;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(0, 0.48, 0);
  }, [camera, size.width, size.height]);

  return null;
}

function GroundGlow({
  liveRef,
  night,
}: {
  liveRef: React.MutableRefObject<LiveSpill>;
  night: boolean;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const nightRef = useRef(night);
  nightRef.current = night;

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uColorA: { value: new THREE.Color(1, 0.3, 0.1) },
        uColorB: { value: new THREE.Color(1, 0.7, 0.2) },
        uTint: { value: new THREE.Color(1, 0.5, 0.2) },
        uEmission: { value: 1 },
        uGlow: { value: 1 },
        uMix: { value: 0.5 },
        uStrength: { value: 1 },
        uNight: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uTint;
        uniform float uEmission;
        uniform float uGlow;
        uniform float uMix;
        uniform float uStrength;
        uniform float uNight;
        varying vec2 vUv;

        float softDisc(float d, float r, float softness) {
          return smoothstep(r, r - softness, d);
        }

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float d = length(p);

          float coreD = softDisc(d, 0.52, 0.52);
          float haloD = softDisc(d, 1.05, 0.9);
          float aDay = (coreD * 0.4 + haloD * 0.16) * uStrength;
          vec3 paper = vec3(0.969, 0.965, 0.953);
          vec3 dayCol = mix(paper, uTint, 0.92);

          float bodyCore = softDisc(d, 0.55, 0.55);
          float bodyHalo = softDisc(d, 1.0, 0.85);
          float bodyW = bodyCore * 0.55 + bodyHalo * 0.35;

          float tipR = mix(0.48, 0.32, clamp(uGlow * 0.35, 0.0, 1.0));
          float tipCore = softDisc(d, tipR, tipR * 0.95);
          float tipHalo = softDisc(d, tipR + 0.38, 0.5);
          float tipW = tipCore * 0.85 + tipHalo * 0.4;

          float tipBias = clamp(0.4 + uMix * 0.55, 0.15, 0.95);
          float tipAmp = tipW * tipBias * uGlow;
          float bodyAmp = bodyW * (0.45 + uEmission * 0.25) * (1.0 - tipBias * 0.35);

          vec3 emitCol = uColorA * bodyAmp + uColorB * tipAmp;
          float emitEnergy = bodyAmp + tipAmp;
          vec3 nightCol = emitEnergy > 1e-4
            ? emitCol / max(emitEnergy, 0.35)
            : uTint;
          nightCol = mix(nightCol, uTint, 0.12);

          float aNight = emitEnergy * 0.42 * uStrength;
          aNight *= softDisc(d, 1.05, 0.95);
          aNight = clamp(aNight, 0.0, 0.72);

          float a = mix(aDay, aNight, uNight);
          vec3 col = mix(dayCol, nightCol, uNight);
          col = mix(col, col * col * 1.05 + col * 0.2, uNight * 0.25);

          gl_FragColor = vec4(col, a);
        }
      `,
    });
  }, []);

  useEffect(() => () => mat.dispose(), [mat]);

  useFrame(() => {
    if (!matRef.current) return;
    const live = liveRef.current;
    const u = matRef.current.uniforms;
    u.uColorA.value.setRGB(live.colorA[0], live.colorA[1], live.colorA[2]);
    u.uColorB.value.setRGB(live.colorB[0], live.colorB[1], live.colorB[2]);
    u.uTint.value.setRGB(live.tint[0], live.tint[1], live.tint[2]);
    u.uEmission.value = live.emission;
    u.uGlow.value = live.glow;
    u.uMix.value = 0.5 + live.mixShift;
    u.uNight.value = nightRef.current ? 1 : 0;

    const lum =
      live.tint[0] * 0.2126 + live.tint[1] * 0.7152 + live.tint[2] * 0.0722;
    u.uStrength.value = nightRef.current
      ? 0.9 + live.glow * 0.45 + lum * 0.2
      : 0.95 + lum * 0.4;
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.001, 0]}
      material={mat}
      ref={(m) => {
        if (m) matRef.current = m.material as THREE.ShaderMaterial;
      }}
      renderOrder={-1}
    >
      {/* Slightly lower segment count — soft disc is filter-limited, not geo */}
      <circleGeometry args={[night ? 1.3 : 1.4, 64]} />
    </mesh>
  );
}

function PaperTint({
  liveRef,
  night,
}: {
  liveRef: React.MutableRefObject<LiveSpill>;
  night: boolean;
}) {
  const { scene, gl } = useThree();
  const bg = useMemo(() => PAPER.clone(), []);
  const nightRef = useRef(night);
  nightRef.current = night;

  useEffect(() => {
    scene.background = bg;
    gl.setClearColor(bg, 1);
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl, scene, bg]);

  useEffect(() => {
    gl.toneMapping = night ? THREE.ReinhardToneMapping : THREE.NoToneMapping;
    gl.toneMappingExposure = night ? 1.05 : 1;
  }, [gl, night]);

  useFrame(() => {
    const t = liveRef.current.tint;
    if (nightRef.current) {
      bg.copy(NIGHT);
      gl.setClearColor(NIGHT, 1);
      document.body.style.setProperty("--paper-bg", "#000000");
      document.body.style.setProperty(
        "--plant-tint",
        `rgb(${Math.round(t[0] * 255)}, ${Math.round(t[1] * 255)}, ${Math.round(t[2] * 255)})`,
      );
      return;
    }
    const k = 0.07;
    bg.r = PAPER_RGB.r + (t[0] - PAPER_RGB.r) * k;
    bg.g = PAPER_RGB.g + (t[1] - PAPER_RGB.g) * k;
    bg.b = PAPER_RGB.b + (t[2] - PAPER_RGB.b) * k;
    gl.setClearColor(bg, 1);

    const r = Math.round(bg.r * 255);
    const g = Math.round(bg.g * 255);
    const b = Math.round(bg.b * 255);
    document.body.style.setProperty("--paper-bg", `rgb(${r}, ${g}, ${b})`);
    document.body.style.setProperty(
      "--plant-tint",
      `rgb(${Math.round(t[0] * 255)}, ${Math.round(t[1] * 255)}, ${Math.round(t[2] * 255)})`,
    );
  });

  return null;
}

/**
 * Night post stack — half-res bloom buffers (resolutionScale) keep cost down
 * while mipmap blur preserves soft quality. Spore SelectiveBloom is mid-strength.
 */
function NightEffects({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <EffectComposer
      multisampling={0}
      enableNormalPass={false}
      // Half-res post targets: large quality win, bloom still soft via mipmapBlur
      resolutionScale={0.5}
      frameBufferType={THREE.HalfFloatType}
    >
      <Bloom
        luminanceThreshold={0.32}
        luminanceSmoothing={0.4}
        intensity={0.95}
        radius={0.5}
        mipmapBlur
        kernelSize={KernelSize.MEDIUM}
        blendFunction={BlendFunction.ADD}
      />
      {/* Middle-ground spore glow (was 2.4 / LARGE) */}
      <SelectiveBloom
        lights={[]}
        luminanceThreshold={0.22}
        luminanceSmoothing={0.4}
        intensity={1.35}
        radius={0.55}
        mipmapBlur
        kernelSize={KernelSize.MEDIUM}
        blendFunction={BlendFunction.ADD}
        ignoreBackground
      />
    </EffectComposer>
  );
}

function RotatingPlant({
  specimen,
  dragRef,
  night,
}: {
  specimen: PlantSpecimen;
  dragRef: React.MutableRefObject<DragState>;
  night: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const current = useRef({ x: 0.06, y: 0.35 });
  const liveRef = useRef<LiveSpill>({
    colorA: specimen.colorA,
    colorB: specimen.colorB,
    tint: specimen.tint,
    emission: specimen.emission,
    mixShift: 0,
    glow: specimen.emission,
  });

  const onLiveColors = useMemo(() => {
    return (live: LiveColors) => {
      liveRef.current = {
        ...live,
        glow: glowFromLive(live),
      };
    };
  }, []);

  useEffect(() => {
    liveRef.current = {
      colorA: specimen.colorA,
      colorB: specimen.colorB,
      tint: specimen.tint,
      emission: specimen.emission,
      mixShift: 0,
      glow: specimen.emission,
    };
  }, [specimen]);

  useFrame((_, rawDelta) => {
    const d = Math.min(rawDelta, 0.05);
    const drag = dragRef.current;
    const target = drag.target;

    if (!drag.active) {
      target.y += drag.velX;
      target.x += drag.velY;
      drag.velX *= Math.pow(0.9, d * 60);
      drag.velY *= Math.pow(0.9, d * 60);
      if (Math.abs(drag.velX) < 0.00012 && Math.abs(drag.velY) < 0.00012) {
        target.y += d * 0.16;
      }
    }

    target.x = THREE.MathUtils.clamp(target.x, -0.08, 0.22);

    const k = 1 - Math.pow(0.0008, d);
    current.current.x += (target.x - current.current.x) * k;
    current.current.y += (target.y - current.current.y) * k;

    if (root.current) {
      root.current.rotation.order = "YXZ";
      root.current.rotation.x = current.current.x;
      root.current.rotation.y = current.current.y;
    }
  });

  return (
    <Selection>
      <PaperTint liveRef={liveRef} night={night} />
      <GroundGlow liveRef={liveRef} night={night} />
      <group ref={root}>
        <PlantMesh specimen={specimen} night={night} onLiveColors={onLiveColors} />
        <Select enabled={night}>
          <Spores specimen={specimen} night={night} liveRef={liveRef} />
        </Select>
      </group>
      <NightEffects enabled={night} />
    </Selection>
  );
}

export function PlantScene({
  specimen,
  night = false,
}: {
  specimen: PlantSpecimen;
  night?: boolean;
}) {
  const dragRef = useRef<DragState>({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    velX: 0,
    velY: 0,
    target: { x: 0.06, y: 0.35 },
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const d = dragRef.current;
      d.active = true;
      d.pointerId = e.pointerId;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.velX = 0;
      d.velY = 0;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.target.y += dx * 0.0055;
      d.target.x += dy * 0.0018;
      d.velX = dx * 0.0055 * 0.4;
      d.velY = dy * 0.0018 * 0.3;
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d.pointerId !== e.pointerId) return;
      d.active = false;
      d.pointerId = null;
      el.style.cursor = "grab";
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    dragRef.current.target.y += 0.35;
    dragRef.current.target.x = 0.06;
    dragRef.current.velX = 0.012;
  }, [specimen.id]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 touch-none select-none"
      style={{
        cursor: "grab",
        background: night ? "#000000" : "var(--paper-bg, #f7f6f3)",
      }}
      aria-label="3D plant specimen — drag to rotate"
    >
      <Canvas
        // Cap night DPR a touch lower for post cost; day stays crisp up to 2
        dpr={night ? [1, 1.5] : [1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: night ? THREE.ReinhardToneMapping : THREE.NoToneMapping,
          stencil: false,
          depth: true,
        }}
        camera={{ position: [0, 1.28, 4.2], fov: 30, near: 0.1, far: 40 }}
        style={{ width: "100%", height: "100%" }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, 0.48, 0);
          // Avoid expensive floating-point clear unless night post needs it
          gl.autoClear = true;
        }}
      >
        <CameraRig />
        <RotatingPlant specimen={specimen} dragRef={dragRef} night={night} />
      </Canvas>
    </div>
  );
}
