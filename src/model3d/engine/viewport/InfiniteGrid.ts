import * as THREE from 'three';
import { AXIS_COLORS, VIEWPORT_COLORS } from '../../config/colors';

/** World-space adaptive grid with 5x major lines and camera/viewport fading. */
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
                uFadeCenter: { value: new THREE.Vector3() },
                uFadeRadius: { value: 100 },
                uMinorColor: { value: new THREE.Color(VIEWPORT_COLORS.gridMinor) },
                uMajorColor: { value: new THREE.Color(VIEWPORT_COLORS.gridMajor) },
                uXAxisColor: { value: new THREE.Color(AXIS_COLORS.x) },
                uZAxisColor: { value: new THREE.Color(AXIS_COLORS.z) },
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
                uniform vec3 uFadeCenter;
                uniform float uFadeRadius;
                uniform vec3 uMinorColor;
                uniform vec3 uMajorColor;
                uniform vec3 uXAxisColor;
                uniform vec3 uZAxisColor;
                varying vec3 vWorldPosition;
                varying vec2 vGridPosition;

                float gridLine(vec2 coordinate, float size, float width) {
                    vec2 scaled = coordinate / size;
                    vec2 grid = abs(fract(scaled - 0.5) - 0.5) / (fwidth(scaled) * width);
                    return 1.0 - min(min(grid.x, grid.y), 1.0);
                }

                void main() {
                    float minor = gridLine(vGridPosition, uGridSize, 1.0);
                    float major = gridLine(vGridPosition, uGridSize * 5.0, 1.25);
                    float xAxis = 1.0 - min(abs(vGridPosition.y) / (fwidth(vGridPosition.y) * 1.5), 1.0);
                    float zAxis = 1.0 - min(abs(vGridPosition.x) / (fwidth(vGridPosition.x) * 1.5), 1.0);
                    float radiusFade = 1.0 - smoothstep(uFadeRadius * 2.0, uFadeRadius * 3.0, distance(vWorldPosition, uFadeCenter));
                    // Major lines remain subtle so axis colors and model geometry stay visually dominant.
                    float alpha = max(minor * 0.42, major * 0.32) * radiusFade;
                    vec3 color = mix(uMinorColor, uMajorColor, major);
                    color = mix(color, uXAxisColor, xAxis);
                    color = mix(color, uZAxisColor, zAxis);
                    alpha = max(alpha, max(xAxis, zAxis) * 0.9 * radiusFade);
                    if (alpha < 0.003) discard;
                    gl_FragColor = vec4(color, alpha);
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

    setPlaneOrientation(normal: THREE.Vector3) {
        const xz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
        this.mesh.quaternion.copy(orientation).multiply(xz);
    }

    resetOrientation() {
        this.mesh.rotation.set(-Math.PI / 2, 0, 0);
    }

    setFade(center: THREE.Vector3, radius: number) {
        this.material.uniforms.uFadeCenter.value.copy(center);
        this.material.uniforms.uFadeRadius.value = Math.max(0.001, radius);
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
