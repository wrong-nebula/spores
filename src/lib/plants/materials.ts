import * as THREE from "three";
import type { PlantSpecimen, RGB } from "./types";

/**
 * Keep vertex color as the mix channel (0 base → 1 tip).
 * Runtime shader blends uColorA / uColorB so colors can animate.
 */
export function bakeVertexColors(
  geo: THREE.BufferGeometry,
  _colorA: RGB,
  _colorB: RGB,
): void {
  const mixAttr = geo.getAttribute("color");
  const pos = geo.getAttribute("position");
  if (!mixAttr) {
    const colors = new Float32Array(pos.count * 3);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const span = Math.max(1e-5, bb.max.y - bb.min.y);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - bb.min.y) / span;
      const s = t * t * (3 - 2 * t);
      colors[i * 3] = s;
      colors[i * 3 + 1] = s;
      colors[i * 3 + 2] = s;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return;
  }
  for (let i = 0; i < mixAttr.count; i++) {
    const t = Math.min(1, Math.max(0, mixAttr.getX(i)));
    const s = t * t * (3 - 2 * t);
    mixAttr.setXYZ(i, s, s, s);
  }
  mixAttr.needsUpdate = true;
}

/**
 * Self-lit plant material with spherical-harmonics form lighting.
 * Night bloom fuel is driven by a gradient × chroma intensity map —
 * only hotspots (vivid tips / high-mix colors) exceed bloom threshold.
 */
export function createPlantMaterial(specimen: PlantSpecimen): THREE.ShaderMaterial {
  const tint = specimen.tint;
  const e = specimen.emission;
  const sh = new Float32Array(27);
  sh[0] = 0.9 * e;
  sh[1] = 0.9 * e;
  sh[2] = 0.92 * e;
  sh[3] = 0.2;
  sh[4] = 0.26;
  sh[5] = 0.18;
  sh[6] = 0.4 + tint[0] * 0.16;
  sh[7] = 0.36 + tint[1] * 0.14;
  sh[8] = 0.32 + tint[2] * 0.12;
  sh[9] = 0.16;
  sh[10] = 0.14;
  sh[11] = 0.12;
  sh[12] = tint[0] * 0.08;
  sh[13] = tint[1] * 0.06;
  sh[14] = tint[2] * 0.05;
  sh[15] = 0.07;
  sh[16] = 0.06;
  sh[17] = 0.05;
  sh[18] = 0.06;
  sh[19] = 0.05;
  sh[20] = 0.04;
  sh[21] = 0.04;
  sh[22] = 0.03;
  sh[23] = 0.03;
  sh[24] = tint[0] * 0.03;
  sh[25] = tint[1] * 0.025;
  sh[26] = tint[2] * 0.02;

  const roughness = Math.min(0.72, Math.max(0.38, specimen.roughness + 0.18));

  return new THREE.ShaderMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    uniforms: {
      uEmission: { value: specimen.emission },
      uRoughness: { value: roughness },
      uSH: { value: Array.from(sh) },
      uColorA: { value: new THREE.Vector3(specimen.colorA[0], specimen.colorA[1], specimen.colorA[2]) },
      uColorB: { value: new THREE.Vector3(specimen.colorB[0], specimen.colorB[1], specimen.colorB[2]) },
      uMixShift: { value: 0 },
      uTintBoost: { value: new THREE.Vector3(tint[0], tint[1], tint[2]) },
      uNight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vMix;
      varying vec3 vNormalW;
      varying vec3 vPosW;

      void main() {
        vMix = color.r;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPosW = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEmission;
      uniform float uRoughness;
      uniform float uSH[27];
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uMixShift;
      uniform vec3 uTintBoost;
      uniform float uNight;

      varying float vMix;
      varying vec3 vNormalW;
      varying vec3 vPosW;

      vec3 shIrradiance(vec3 n) {
        vec3 r = vec3(uSH[0], uSH[1], uSH[2]) * 0.282095;
        r += vec3(uSH[3], uSH[4], uSH[5]) * 0.488603 * n.y;
        r += vec3(uSH[6], uSH[7], uSH[8]) * 0.488603 * n.z;
        r += vec3(uSH[9], uSH[10], uSH[11]) * 0.488603 * n.x;
        r += vec3(uSH[12], uSH[13], uSH[14]) * 1.092548 * n.x * n.y;
        r += vec3(uSH[15], uSH[16], uSH[17]) * 1.092548 * n.y * n.z;
        r += vec3(uSH[18], uSH[19], uSH[20]) * 0.315392 * (3.0 * n.z * n.z - 1.0);
        r += vec3(uSH[21], uSH[22], uSH[23]) * 1.092548 * n.x * n.z;
        r += vec3(uSH[24], uSH[25], uSH[26]) * 0.546274 * (n.x * n.x - n.y * n.y);
        return max(r, vec3(0.0));
      }

      float softSpec(vec3 n, vec3 H, float rough) {
        float ndh = max(dot(n, H), 0.0);
        float hard = mix(28.0, 10.0, rough);
        float soft = mix(10.0, 4.0, rough);
        float a = pow(ndh, hard);
        float b = pow(ndh, soft);
        return mix(b, a, 0.35) * (1.0 - rough * 0.45);
      }

      // Bloom intensity map: gradient position × local color energy
      float bloomIntensityMap(float mixT, vec3 albedo) {
        float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
        float maxC = max(albedo.r, max(albedo.g, albedo.b));
        float minC = min(albedo.r, min(albedo.g, albedo.b));
        float sat = maxC > 1e-4 ? (maxC - minC) / maxC : 0.0;

        // Follow the candy gradient: base stays calm, tip / high-mix lights up
        float grad = smoothstep(0.22, 0.92, mixT);
        // Soft mid-band so blooms sit on the vivid transition, not only the pole
        float mid = smoothstep(0.35, 0.55, mixT) * (1.0 - smoothstep(0.75, 0.98, mixT));
        float gradW = max(grad * 0.85, mid * 0.55);

        // Chromatic energy — saturated / bright colors push the map
        float chroma = sat * sat * (0.45 + lum * 0.55);
        // Relative lift of tip color vs dimmer base (favors the gradient hot end)
        float tipBias = mixT * mixT;

        float iMap = gradW * 0.5 + chroma * 0.85 + tipBias * lum * 0.45;
        // Concentrate into hotspots so bloom doesn't wash the whole mesh
        iMap = clamp(iMap, 0.0, 1.0);
        return pow(iMap, 1.65);
      }

      void main() {
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;

        float m = clamp(vMix + uMixShift, 0.0, 1.0);
        m = m * m * (3.0 - 2.0 * m);
        vec3 albedo = mix(uColorA, uColorB, m);
        albedo = mix(albedo, uTintBoost, 0.08);

        float iMap = bloomIntensityMap(m, albedo);

        vec3 V = normalize(cameraPosition - vPosW);

        vec3 sh = shIrradiance(n);
        float shL = max(dot(sh, vec3(0.2126, 0.7152, 0.0722)), 0.12);
        float form = 0.72 + 0.38 * (shL / (shL + 0.5));

        vec3 L = normalize(vec3(0.32, 0.96, 0.42));
        vec3 L2 = normalize(vec3(-0.55, 0.35, -0.35));
        float wrap = 0.4;
        float ndl = max(0.0, (dot(n, L) + wrap) / (1.0 + wrap));
        float ndl2 = max(0.0, (dot(n, L2) + wrap) / (1.0 + wrap)) * 0.28;
        form *= 0.78 + 0.32 * ndl + ndl2;

        // Night: dim overall form so only intensity-mapped emission blooms
        form = mix(form, 0.38 + 0.22 * ndl, uNight);

        vec3 H = normalize(V + L);
        float specAmt = softSpec(n, H, uRoughness) * 0.22 * (1.0 - uRoughness * 0.35);
        vec3 spec = mix(vec3(1.0), albedo, 0.55) * specAmt;
        spec *= mix(1.0, 0.4, uNight);

        float fres = pow(1.0 - max(dot(n, V), 0.0), 2.6);
        // Rim only where intensity map is high (avoids whole-shell glow)
        vec3 rim = albedo * fres * 0.14 * uEmission * mix(1.0, iMap * 1.4, uNight);

        // Day emission is even; night self-light is weighted by intensity map
        float emitDay = uEmission;
        float emitNight = uEmission * (0.35 + iMap * 1.45);
        float emit = mix(emitDay, emitNight, uNight);

        vec3 color = albedo * form * (0.74 + emit * mix(0.36, 0.22, uNight));
        // Broad fill stays below bloom threshold in night
        color += albedo * emit * mix(0.2, 0.12, uNight);
        color += spec;
        color += rim;

        // Bloom fuel ONLY from intensity map × gradient color (not whole body)
        // Hotspots push luminance over UnrealBloom threshold; cool base does not.
        float fuel = iMap * iMap * uNight;
        color += albedo * fuel * (0.95 + uEmission * 0.55);
        color += albedo * albedo * fuel * 0.65;

        // Day: soft tonemap. Night: leave headroom for Reinhard + selective bloom
        float tm = mix(0.2, 0.1, uNight);
        color = color / (color * tm + 1.0);
        color = pow(max(color, 0.0), vec3(mix(0.95, 0.92, uNight)));

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}
