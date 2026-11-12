import * as THREE from 'three';
import { SKETCH_COLORS } from '../../config/colors';
import { SKETCH_STYLE } from '../../config/const';

export interface HatchUniforms {
    uHatchColor: THREE.IUniform<THREE.Color>;
    uHatchOpacity: THREE.IUniform<number>;
    uHatchScale: THREE.IUniform<number>;
    uHatchSpacing: THREE.IUniform<number>;
    uHatchLineWidth: THREE.IUniform<number>;
}

interface HatchOptions {
    color?: string | THREE.Color;
    opacity?: number;
    scale?: number;
}

/** Adds stable plane-UV diagonal hatching without changing the host material's lighting or selection state. */
export function applyHatchPattern(material: THREE.Material, options: HatchOptions = {}): HatchUniforms {
    const uniforms: HatchUniforms = {
        uHatchColor: { value: new THREE.Color(options.color || SKETCH_COLORS.line) },
        uHatchOpacity: { value: options.opacity ?? SKETCH_STYLE.hatchOpacity },
        uHatchScale: { value: options.scale ?? 1 },
        uHatchSpacing: { value: SKETCH_STYLE.hatchSpacing },
        uHatchLineWidth: { value: SKETCH_STYLE.hatchLineWidth },
    };
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `varying vec2 vHatchUv;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvHatchUv = uv;');
        shader.fragmentShader = `
            uniform vec3 uHatchColor;
            uniform float uHatchOpacity;
            uniform float uHatchScale;
            uniform float uHatchSpacing;
            uniform float uHatchLineWidth;
            varying vec2 vHatchUv;
            ${shader.fragmentShader}
        `;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            float hatchCoordinate = (vHatchUv.x + vHatchUv.y) * uHatchScale;
            float hatchPhase = mod(hatchCoordinate, uHatchSpacing);
            float hatchDistance = min(hatchPhase, uHatchSpacing - hatchPhase);
            float hatchAntialias = max(fwidth(hatchCoordinate), 0.0001);
            float hatchLine = 1.0 - smoothstep(uHatchLineWidth * 0.5, uHatchLineWidth * 0.5 + hatchAntialias, hatchDistance);
            diffuseColor.rgb = mix(diffuseColor.rgb, uHatchColor, hatchLine);
            diffuseColor.a = mix(diffuseColor.a, uHatchOpacity, hatchLine);
        `);
    };
    material.customProgramCacheKey = () => 'model3d-plane-hatch-v1';
    material.userData.hatchPattern = true;
    return uniforms;
}
