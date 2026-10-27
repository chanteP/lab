import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { profileClosed, profilePoints, profileShape } from './profiles';
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
    const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
    const points = entity.points || [];
    if (points.length < 2 || (entity.profileType !== 'circle' && points.length < 3)) return new THREE.BufferGeometry();
    const shape = profileShape(entity.profileType || 'polygon', points, quality === 'preview' ? 64 : 128);
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
    if (entity.draftAngle) {
        const center = points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
        const radius = Math.max(1, ...points.map((point) => Math.hypot(point[0] - center[0], point[1] - center[1])));
        const positions = geometry.attributes.position;
        for (let index = 0; index < positions.count; index++) {
            const z = positions.getZ(index);
            const factor = Math.max(0.05, 1 - z * Math.tan(THREE.MathUtils.degToRad(entity.draftAngle)) / radius);
            positions.setX(index, center[0] + (positions.getX(index) - center[0]) * factor);
            positions.setY(index, center[1] + (positions.getY(index) - center[1]) * factor);
        }
    }
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    if (plane) {
        if (entity.sideMode === 'one') geometry.translate(0, 0, -box.min.z);
        else geometry.translate(0, 0, -(box.min.z + box.max.z) / 2);
        if (entity.direction === -1) geometry.scale(1, 1, -1);
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
    if (entity.kind === 'sketch') {
        const type = entity.profileType || 'polygon';
        const source = entity.points || [];
        const closed = profileClosed(type);
        const geometry = closed ? new THREE.ShapeGeometry(profileShape(type, source)) : new THREE.BufferGeometry().setFromPoints(profilePoints(type, source).map((point) => new THREE.Vector3(point[0], point[1], 0)));
        const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
        if (plane) geometry.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal)).setPosition(new THREE.Vector3(...plane.origin)));
        else geometry.rotateX(-Math.PI / 2);
        const material = closed
            ? new THREE.MeshBasicMaterial({ color: '#3185d8', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
            : new THREE.LineBasicMaterial({ color: '#3185d8' });
        mesh = closed ? new THREE.Mesh(geometry, material) : new THREE.Line(geometry, material) as unknown as THREE.Mesh;
    } else if (entity.kind !== 'boolean') {
        const profile = entity.profileId ? document.entities.find((item) => item.id === entity.profileId) : null;
        const geometryEntity = profile ? { ...entity, points: profile.points, profileType: profile.profileType, planeId: profile.planeId } : entity;
        mesh = new THREE.Mesh(baseGeometry(geometryEntity, quality, document), createMaterial(entity.color));
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

export function buildScene(document: ModelDocument, quality: GeometryQuality = 'preview', includeSketches = true) {
    const group = new THREE.Group();
    group.name = 'Model';
    document.entities.filter((entity) => entity.visible && (includeSketches || entity.kind !== 'sketch')).forEach((entity) => {
        try {
            group.add(buildEntityMesh(entity, document, quality));
        } catch (error) {
            console.error(error);
        }
    });
    group.updateMatrixWorld(true);
    return group;
}
