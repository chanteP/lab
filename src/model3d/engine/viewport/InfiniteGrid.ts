import * as THREE from 'three';
import { VIEWPORT_COLORS } from '../../config/colors';

/** World-space adaptive grid with 10x major lines and camera/viewport fading. */
export class InfiniteGrid {
    readonly mesh: THREE.Mesh;
    private readonly material: THREE.ShaderMaterial;
    private gridSize = 0;

    constructor() {
        this.material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
                uGridSize: { value: this.gridSize },
                uResolution: { value: new THREE.Vector2(1, 1) },
                uMinorColor: { value: new THREE.Color(VIEWPORT_COLORS.gridMinor) },
                uMajorColor: { value: new THREE.Color(VIEWPORT_COLORS.gridMajor) },
            },
            vertexShader: `
                uniform float uGridSize;
                varying vec3 vWorldPosition;
                varying vec2 vGridPosition;
                void main() {
                    vec4 world = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = world.xyz;
                    vGridPosition = position.xy * uGridSize * 600.0;
                    gl_Position = projectionMatrix * viewMatrix * world;
                }
            `,
            fragmentShader: `
                uniform float uGridSize;
                uniform vec2 uResolution;
                uniform vec3 uMinorColor;
                uniform vec3 uMajorColor;
                varying vec3 vWorldPosition;
                varying vec2 vGridPosition;

                float gridLine(vec2 coordinate, float size, float width) {
                    vec2 scaled = coordinate / size;
                    vec2 grid = abs(fract(scaled - 0.5) - 0.5) / (fwidth(scaled) * width);
                    return 1.0 - min(min(grid.x, grid.y), 1.0);
                }

                void main() {
                    float minor = gridLine(vGridPosition, uGridSize, 1.0);
                    float major = gridLine(vGridPosition, uGridSize * 10.0, 1.65);
                    vec2 viewport = gl_FragCoord.xy / uResolution;
                    float edge = min(min(viewport.x, 1.0 - viewport.x), min(viewport.y, 1.0 - viewport.y));
                    float edgeFade = smoothstep(0.0, 0.09, edge);
                    float cameraFade = 1.0 - smoothstep(uGridSize * 120.0, uGridSize * 600.0, distance(cameraPosition, vWorldPosition));
                    // Major lines remain subtle so axis colors and model geometry stay visually dominant.
                    float alpha = max(minor * 0.42, major * 0.45) * edgeFade * cameraFade;
                    if (alpha < 0.003) discard;
                    gl_FragColor = vec4(mix(uMinorColor, uMajorColor, major), alpha);
                }
            `,
        });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = -0.02;
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = -10;
        this.setSize(this.gridSize);
    }

    setSize(size: number) {
        if (size === this.gridSize) return;
        this.gridSize = size;
        this.material.uniforms.uGridSize.value = size;
        this.mesh.scale.setScalar(size * 600);
    }

    setVisible(visible: boolean) { this.mesh.visible = visible; }

    resize(renderer: THREE.WebGLRenderer) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        this.material.uniforms.uResolution.value.copy(size);
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
