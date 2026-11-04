import * as THREE from 'three';
import { evaluateBoolean } from './modeling/ManifoldKernel';
import { normalizeBakedGeometryNormals } from './modeling/ManifoldKernel';
import { evaluateFaceExtrusion } from './modeling/FaceExtrusion';
import { profileClosed, profilePoints, profileShape } from './profiles';
import { SKETCH_COLORS } from '../config/colors';
import type { GeometryQuality, ModelDocument, ModelEntity, Vec3 } from '../types';

function qualityValues(quality: GeometryQuality) {
    if (quality === 'preview') return { radial: 48, sphere: 48 };
    if (quality === 'ultra') return { radial: 256, sphere: 192 };
    return { radial: 128, sphere: 128 };
}

function reverseWinding(geometry: THREE.BufferGeometry) {
    if (geometry.index) {
        const index = geometry.index;
        for (let offset = 0; offset < index.count; offset += 3) {
            const b = index.getX(offset + 1);
            index.setX(offset + 1, index.getX(offset + 2));
            index.setX(offset + 2, b);
        }
        index.needsUpdate = true;
    } else {
        Object.values(geometry.attributes).forEach((attribute) => {
            const array = attribute.array as unknown as number[];
            for (let offset = 0; offset < attribute.count; offset += 3) {
                for (let component = 0; component < attribute.itemSize; component++) {
                    const a = (offset + 1) * attribute.itemSize + component;
                    const b = (offset + 2) * attribute.itemSize + component;
                    [array[a], array[b]] = [array[b], array[a]];
                }
            }
            attribute.needsUpdate = true;
        });
    }
}

function reflectExtrusion(geometry: THREE.BufferGeometry) {
    geometry.scale(1, 1, -1);
    reverseWinding(geometry);
}

export function applyEntityTransform(object: THREE.Object3D, entity: ModelEntity) {
    object.position.fromArray(entity.position);
    object.rotation.set(...entity.rotation.map(THREE.MathUtils.degToRad) as Vec3);
    object.scale.fromArray(entity.scale);
    object.updateMatrixWorld(true);
}

function baseGeometry(entity: ModelEntity, quality: GeometryQuality, document: ModelDocument): THREE.BufferGeometry {
    if (entity.axisBox) {
        const box = entity.axisBox;
        const size = new THREE.Vector3(...box.max).sub(new THREE.Vector3(...box.min));
        const center = new THREE.Vector3(...box.max).add(new THREE.Vector3(...box.min)).multiplyScalar(0.5);
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        geometry.translate(...center.toArray());
        return entity.faceOffset?.distance ? evaluateFaceExtrusion(geometry, entity.faceOffset).geometry : geometry;
    }
    if (entity.meshGeometry) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(entity.meshGeometry.positions, 3));
        if (entity.meshGeometry.indices.length) geometry.setIndex(entity.meshGeometry.indices);
        geometry.userData.mergeFromVert = new Uint32Array(entity.meshGeometry.mergeFromVert || []);
        geometry.userData.mergeToVert = new Uint32Array(entity.meshGeometry.mergeToVert || []);
        geometry.userData.sourceFaceIDs = new Uint32Array(entity.meshGeometry.sourceFaceIDs || []);
        if (entity.meshGeometry.normals?.length === entity.meshGeometry.positions.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(entity.meshGeometry.normals, 3));

        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        if (entity.faceOffset?.distance && entity.faceOffset.vertices) {
            return evaluateFaceExtrusion(geometry, entity.faceOffset).geometry;
        }
        if (!entity.meshGeometry.normals) return normalizeBakedGeometryNormals(geometry);
        return geometry;
    }
    const q = qualityValues(quality);
    if (entity.kind === 'box') {
        const width = entity.width!;
        const height = entity.height!;
        const depth = entity.depth!;
        const base = new THREE.BoxGeometry(width, height, depth);
        if (!entity.faceOffset?.distance) return base;
        const result = evaluateFaceExtrusion(base, entity.faceOffset).geometry;
        base.dispose();
        return result;
    }
    if (entity.kind === 'cylinder') {
        const base = new THREE.CylinderGeometry(entity.radius!, entity.radius!, entity.height!, q.radial, 1, false);
        if (!entity.faceOffset?.distance) return base;
        const result = evaluateFaceExtrusion(base, entity.faceOffset).geometry;
        base.dispose();
        return result;
    }
    if (entity.kind === 'sphere') {
        return new THREE.SphereGeometry(entity.radius!, q.sphere, Math.max(16, q.sphere / 2));
    }
    const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
    const sourceEntity = entity;
    const planeNormal = plane ? new THREE.Vector3(...plane.normal).normalize() : null;
    const faceNormal = entity.faceOffset ? new THREE.Vector3(...entity.faceOffset.normal).normalize() : null;
    const points = sourceEntity.points || [];
    if (!entity.parts?.length && (points.length < 2 || (entity.profileType !== 'circle' && points.length < 3))) return new THREE.BufferGeometry();
    const shape = entity.parts?.length
        ? entity.parts.filter((part) => part.closed && part.points.length >= 3).map((part) => new THREE.Shape(part.points.map(([x, y]) => new THREE.Vector2(x, y))))
        : profileShape(sourceEntity.profileType || 'polygon', points, quality === 'preview' ? 64 : 128, sourceEntity.curves, sourceEntity.sides, sourceEntity.sectorAngle, sourceEntity.open, sourceEntity.profileStartAngle, sourceEntity.analyticCurves);
    if (Array.isArray(shape) && !shape.length) return new THREE.BufferGeometry();
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: sourceEntity.depth!,
        steps: 1,
        bevelEnabled: false,
        curveSegments: 12,
    });
    if (sourceEntity.draftAngle) {
        const center = points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
        const radius = Math.max(1, ...points.map((point) => Math.hypot(point[0] - center[0], point[1] - center[1])));
        const positions = geometry.attributes.position;
        for (let index = 0; index < positions.count; index++) {
            const z = positions.getZ(index);
            const factor = Math.max(0.05, 1 - z * Math.tan(THREE.MathUtils.degToRad(sourceEntity.draftAngle)) / radius);
            positions.setX(index, center[0] + (positions.getX(index) - center[0]) * factor);
            positions.setY(index, center[1] + (positions.getY(index) - center[1]) * factor);
        }
    }
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    if (plane) {
        if (sourceEntity.sideMode === 'one') geometry.translate(0, 0, -box.min.z);
        else geometry.translate(0, 0, -(box.min.z + box.max.z) / 2);
        if (sourceEntity.direction === -1) reflectExtrusion(geometry);
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
    if (entity.faceOffset?.distance && entity.faceOffset.vertices) {
        return evaluateFaceExtrusion(geometry, entity.faceOffset).geometry;
    }
    return geometry;
}

export function createMaterial(color: string) {
    return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
}

function disposeOperand(mesh: THREE.Mesh) {
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
}

function evaluateSignedBoolean(entity: ModelEntity, document: ModelDocument, quality: GeometryQuality, stack: string[]) {
    const ids = entity.operands || [];
    const signs = entity.operandSigns || {};
    const positive = ids.filter((id) => (signs[id] || 1) === 1);
    const negative = ids.filter((id) => signs[id] === -1);
    if (!positive.length) throw new Error('至少保留一个目标实体');

    const combine = (operandIds: string[], operation: BooleanOperation) => {
        let geometry: THREE.BufferGeometry | null = null;
        for (const id of operandIds) {
            const source = document.entities.find((item) => item.id === id);
            if (!source) throw new Error(`${entity.name} 缺少布尔操作数`);
            const operand = buildEntityMesh(source, document, quality, [...stack, entity.id]);
            const transformed = operand.geometry.clone().applyMatrix4(operand.matrixWorld);
            disposeOperand(operand);
            if (!geometry) geometry = transformed;
            else {
                const result = evaluateBoolean(geometry, transformed, operation);
                geometry.dispose();
                transformed.dispose();
                geometry = result;
            }
        }
        return geometry || new THREE.BufferGeometry();
    };

    let result = combine(positive, entity.operation === 'intersect' ? 'intersect' : 'union');
    if (negative.length && result.attributes.position?.count) {
        const tools = combine(negative, 'union');
        const next = evaluateBoolean(result, tools, 'subtract');
        result.dispose();
        tools.dispose();
        result = next;
    }
    return result;
}

export interface BooleanRegion { key: string; geometry: THREE.BufferGeometry; center: Vec3 }

/** Decomposes operands into disjoint Venn regions so each region can be controlled independently. */
export function buildBooleanRegions(document: ModelDocument, operandIds: string[], quality: GeometryQuality = 'preview'): BooleanRegion[] {
    if (operandIds.length > 6) throw new Error('布尔操作最多支持 6 个实体，避免区域组合过多');
    const regions: BooleanRegion[] = [];
    for (let mask = 1; mask < (1 << operandIds.length); mask++) {
        const operandSigns = Object.fromEntries(operandIds.map((id, index) => [id, mask & (1 << index) ? 1 as const : -1 as const]));
        const entity: ModelEntity = {
            id: `__region_${mask}`, parentId: null, name: `区域 ${mask}`, kind: 'boolean', color: '#9a9a9a', visible: true,
            position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], operation: 'intersect', operands: operandIds, operandSigns,
        };
        const mesh = buildEntityMesh(entity, document, quality);
        if (!mesh.geometry.attributes.position?.count) { mesh.geometry.dispose(); continue; }
        const center = mesh.geometry.boundingBox?.getCenter(new THREE.Vector3()) || new THREE.Vector3();
        regions.push({ key: String(mask), geometry: mesh.geometry, center: center.toArray() });
    }
    return regions;
}

function evaluateRegionSelection(entity: ModelEntity, document: ModelDocument, quality: GeometryQuality) {
    const signs = entity.regionSigns || {};
    let result: THREE.BufferGeometry | null = null;
    buildBooleanRegions(document, entity.operands || [], quality).forEach((region) => {
        if (signs[region.key] !== 1) { region.geometry.dispose(); return; }
        if (!result) result = region.geometry;
        else {
            const next = evaluateBoolean(result, region.geometry, 'union');
            result.dispose();
            region.geometry.dispose();
            result = next;
        }
    });
    return result || new THREE.BufferGeometry();
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
        const closed = entity.parts?.length ? entity.parts.some((part) => part.closed) : !entity.open && profileClosed(type);
        const compoundShapes = entity.parts?.filter((part) => part.closed && part.points.length >= 3).map((part) => new THREE.Shape(part.points.map(([x, y]) => new THREE.Vector2(x, y))));
        const geometry = entity.parts?.length
            ? compoundShapes?.length ? new THREE.ShapeGeometry(compoundShapes) : new THREE.BufferGeometry()
            : closed ? new THREE.ShapeGeometry(profileShape(type, source, 64, entity.curves, entity.sides, entity.sectorAngle, entity.open, entity.profileStartAngle, entity.analyticCurves)) : new THREE.BufferGeometry().setFromPoints(profilePoints(type, source, 64, entity.curves, entity.sides, entity.sectorAngle, entity.open, entity.profileStartAngle, entity.analyticCurves).map((point) => new THREE.Vector3(point[0], point[1], 0)));
        const openVertices: THREE.Vector3[] = [];
        entity.parts?.filter((part) => !part.closed).forEach((part) => {
            for (let index = 0; index < part.points.length - 1; index++) openVertices.push(new THREE.Vector3(...part.points[index], 0), new THREE.Vector3(...part.points[index + 1], 0));
        });
        const openGeometry = openVertices.length ? new THREE.BufferGeometry().setFromPoints(openVertices) : null;
        const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
        const matrix = plane ? new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal)).setPosition(new THREE.Vector3(...plane.origin)) : new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        geometry.applyMatrix4(matrix);
        openGeometry?.applyMatrix4(matrix);
        const material = closed
            ? new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.fill, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
            : new THREE.LineBasicMaterial({ color: SKETCH_COLORS.line });
        material.userData.sketchBaseColor = material.color.getHex();
        material.userData.sketchBaseOpacity = material.opacity;
        mesh = closed ? new THREE.Mesh(geometry, material) : new THREE.Line(geometry, material) as unknown as THREE.Mesh;
        if (openGeometry) {
            const outline = new THREE.LineSegments(openGeometry, new THREE.LineBasicMaterial({ color: SKETCH_COLORS.line }));
            outline.userData.compoundOutline = true;
            mesh.add(outline);
        }
    } else if (entity.kind !== 'boolean' || entity.meshGeometry) {
        // Committed bodies use their own profile snapshot; source sketches are History references only.
        mesh = new THREE.Mesh(baseGeometry(entity, quality, document), createMaterial(entity.color));
    } else {
        if (entity.regionSigns) {
            mesh = new THREE.Mesh(evaluateRegionSelection(entity, document, quality));
            mesh.material = createMaterial(entity.color);
            mesh.name = entity.name;
            mesh.userData.entityId = entity.id;
            mesh.geometry.clearGroups();
            applyEntityTransform(mesh, entity);
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            return mesh;
        }
        if (entity.operandSigns) {
            mesh = new THREE.Mesh(evaluateSignedBoolean(entity, document, quality, stack));
            if (entity.faceOffset?.distance) mesh.geometry = evaluateFaceExtrusion(mesh.geometry, entity.faceOffset).geometry;
            mesh.material = createMaterial(entity.color);
            mesh.name = entity.name;
            mesh.userData.entityId = entity.id;
            mesh.geometry.clearGroups();
            applyEntityTransform(mesh, entity);
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            return mesh;
        }
        const [aId, bId] = entity.operands || [];
        const a = document.entities.find((item) => item.id === aId);
        const b = document.entities.find((item) => item.id === bId);
        if (!a || !b) throw new Error(`${entity.name} 缺少布尔操作数`);
        const geometryA = buildEntityMesh(a, document, quality, [...stack, entity.id]);
        const geometryB = buildEntityMesh(b, document, quality, [...stack, entity.id]);
        const transformedA = geometryA.geometry.clone().applyMatrix4(geometryA.matrixWorld);
        const transformedB = geometryB.geometry.clone().applyMatrix4(geometryB.matrixWorld);
        const resultGeometry = evaluateBoolean(transformedA, transformedB, entity.operation || 'subtract');
        transformedA.dispose();
        transformedB.dispose();
        geometryA.geometry.dispose();
        geometryB.geometry.dispose();
        mesh = new THREE.Mesh(resultGeometry);
        if (entity.faceOffset?.distance) mesh.geometry = evaluateFaceExtrusion(mesh.geometry, entity.faceOffset).geometry;
        mesh.material = createMaterial(entity.color);
    }
    mesh.name = entity.name;
    mesh.userData.entityId = entity.id;
    mesh.geometry.clearGroups();
    applyEntityTransform(mesh, entity);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
}

export function buildScene(document: ModelDocument, quality: GeometryQuality = 'preview', includeSketches = true) {
    const group = new THREE.Group();
    group.name = 'Model';
    document.entities.filter((entity) => {
        if (!entity.visible || (!includeSketches && entity.kind === 'sketch')) return false;
        if (entity.kind === 'sketch' && entity.planeId) return document.planes.find((plane) => plane.id === entity.planeId)?.visible !== false;
        return true;
    }).forEach((entity) => {
        try {
            group.add(buildEntityMesh(entity, document, quality));
        } catch (error) {
            console.error(error);
        }
    });
    group.updateMatrixWorld(true);
    return group;
}
