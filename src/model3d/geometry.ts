import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import type { GeometryQuality, ModelDocument, ModelEntity, Vec3 } from './types';

function qualityValues(quality: GeometryQuality) {
    if (quality === 'preview') return { radial: 48, sphere: 48, edge: 4 };
    if (quality === 'ultra') return { radial: 256, sphere: 192, edge: 16 };
    return { radial: 128, sphere: 128, edge: 10 };
}

function chamferedBox(width: number, height: number, depth: number, size: number) {
    const x = width / 2;
    const y = height / 2;
    const z = depth / 2;
    const points: THREE.Vector3[] = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
        points.push(new THREE.Vector3(a * (x - size), b * y, c * z));
        points.push(new THREE.Vector3(a * x, b * (y - size), c * z));
        points.push(new THREE.Vector3(a * x, b * y, c * (z - size)));
    }
    return new ConvexGeometry(points);
}

function treatedCylinder(radius: number, height: number, entity: ModelEntity, quality: GeometryQuality) {
    const edge = entity.edge!;
    const size = Math.min(edge.size, radius * 0.48, height * 0.48);
    const half = height / 2;
    const profile: THREE.Vector2[] = [new THREE.Vector2(0, -half), new THREE.Vector2(radius - size, -half)];
    if (edge.type === 'chamfer') {
        profile.push(new THREE.Vector2(radius, -half + size), new THREE.Vector2(radius, half - size));
    } else {
        const segments = qualityValues(quality).edge;
        for (let i = 1; i <= segments; i++) {
            const angle = -Math.PI / 2 + (i / segments) * Math.PI / 2;
            profile.push(new THREE.Vector2(radius - size + Math.cos(angle) * size, -half + size + Math.sin(angle) * size));
        }
        profile.push(new THREE.Vector2(radius, half - size));
        for (let i = 1; i <= segments; i++) {
            const angle = (i / segments) * Math.PI / 2;
            profile.push(new THREE.Vector2(radius - size + Math.cos(angle) * size, half - size + Math.sin(angle) * size));
        }
    }
    profile.push(new THREE.Vector2(0, half));
    return new THREE.LatheGeometry(profile, qualityValues(quality).radial);
}

export function applyEntityTransform(object: THREE.Object3D, entity: ModelEntity) {
    object.position.fromArray(entity.position);
    object.rotation.set(...entity.rotation.map(THREE.MathUtils.degToRad) as Vec3);
    object.scale.fromArray(entity.scale);
    object.updateMatrixWorld(true);
}

function baseGeometry(entity: ModelEntity, quality: GeometryQuality, document: ModelDocument): THREE.BufferGeometry {
    const q = qualityValues(quality);
    const edge = entity.edge;
    if (entity.kind === 'box') {
        const width = entity.width!;
        const height = entity.height!;
        const depth = entity.depth!;
        if (!edge) return new THREE.BoxGeometry(width, height, depth);
        const size = Math.min(edge.size, width * 0.48, height * 0.48, depth * 0.48);
        return edge.type === 'fillet'
            ? new RoundedBoxGeometry(width, height, depth, q.edge, size)
            : chamferedBox(width, height, depth, size);
    }
    if (entity.kind === 'cylinder') {
        return edge
            ? treatedCylinder(entity.radius!, entity.height!, entity, quality)
            : new THREE.CylinderGeometry(entity.radius!, entity.radius!, entity.height!, q.radial, 1, false);
    }
    if (entity.kind === 'sphere') {
        return new THREE.SphereGeometry(entity.radius!, q.sphere, Math.max(16, q.sphere / 2));
    }
    const shape = new THREE.Shape();
    const points = entity.points || [];
    const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
    if (points.length < 3) return new THREE.BufferGeometry();
    // Plane sketches store local U/V coordinates. Legacy sketches retain their original X/Z mapping.
    shape.moveTo(points[0][0], plane ? points[0][1] : -points[0][1]);
    points.slice(1).forEach(([x, y]) => shape.lineTo(x, plane ? y : -y));
    shape.closePath();
    const size = edge ? Math.min(edge.size, entity.depth! * 0.24) : 0;
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: entity.depth! - size * 2,
        steps: 1,
        bevelEnabled: !!edge,
        bevelThickness: size,
        bevelSize: size,
        bevelOffset: 0,
        bevelSegments: edge?.type === 'fillet' ? q.edge : 1,
        curveSegments: 12,
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    if (plane) {
        geometry.translate(0, 0, -(box.min.z + box.max.z) / 2);
        const u = new THREE.Vector3(...plane.u);
        const v = new THREE.Vector3(...plane.v);
        const normal = new THREE.Vector3(...plane.normal);
        const basis = new THREE.Matrix4().makeBasis(u, v, normal);
        basis.setPosition(new THREE.Vector3(...plane.origin));
        geometry.applyMatrix4(basis);
    } else {
        geometry.rotateX(-Math.PI / 2);
        geometry.computeBoundingBox();
        const legacyBox = geometry.boundingBox!;
        geometry.translate(0, -(legacyBox.min.y + legacyBox.max.y) / 2, 0);
    }
    return geometry;
}

export function createMaterial(color: string) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.08 });
}

export function buildEntityMesh(
    entity: ModelEntity,
    document: ModelDocument,
    quality: GeometryQuality = 'preview',
    stack: string[] = [],
): THREE.Mesh {
    if (stack.includes(entity.id)) throw new Error('检测到循环布尔引用');
    let mesh: THREE.Mesh;
    if (entity.kind !== 'boolean') {
        mesh = new THREE.Mesh(baseGeometry(entity, quality, document), createMaterial(entity.color));
    } else {
        const [aId, bId] = entity.operands || [];
        const a = document.entities.find((item) => item.id === aId);
        const b = document.entities.find((item) => item.id === bId);
        if (!a || !b) throw new Error(`${entity.name} 缺少布尔操作数`);
        const brushA = new Brush(buildEntityMesh(a, document, quality, [...stack, entity.id]).geometry);
        const brushB = new Brush(buildEntityMesh(b, document, quality, [...stack, entity.id]).geometry);
        applyEntityTransform(brushA, a);
        applyEntityTransform(brushB, b);
        brushA.updateMatrixWorld(true);
        brushB.updateMatrixWorld(true);
        const evaluator = new Evaluator();
        evaluator.useGroups = false;
        const operation = entity.operation === 'union' ? ADDITION : entity.operation === 'intersect' ? INTERSECTION : SUBTRACTION;
        mesh = evaluator.evaluate(brushA, brushB, operation);
        mesh.material = createMaterial(entity.color);
        brushA.geometry.dispose();
        brushB.geometry.dispose();
    }
    mesh.name = entity.name;
    mesh.userData.entityId = entity.id;
    mesh.geometry.clearGroups();
    applyEntityTransform(mesh, entity);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

export function buildScene(document: ModelDocument, quality: GeometryQuality = 'preview') {
    const group = new THREE.Group();
    group.name = 'Model';
    document.entities.filter((entity) => entity.visible).forEach((entity) => {
        try {
            group.add(buildEntityMesh(entity, document, quality));
        } catch (error) {
            console.error(error);
        }
    });
    group.updateMatrixWorld(true);
    return group;
}
