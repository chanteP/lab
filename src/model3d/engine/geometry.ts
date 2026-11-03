import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
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

function signedVolume(geometry: THREE.BufferGeometry) {
    const positions = geometry.attributes.position;
    const index = geometry.index;
    const count = index?.count || positions.count;
    let volume = 0;
    for (let offset = 0; offset < count; offset += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(offset) : offset);
        const b = new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(offset + 1) : offset + 1);
        const c = new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(offset + 2) : offset + 2);
        volume += a.dot(b.cross(c)) / 6;
    }
    return volume;
}

function reflectExtrusion(geometry: THREE.BufferGeometry) {
    geometry.scale(1, 1, -1);
    reverseWinding(geometry);
}

function offsetAxisBox(base: THREE.BufferGeometry, offset: NonNullable<ModelEntity['faceOffset']>) {
    const normal = new THREE.Vector3(...offset.normal).normalize();
    const axis = Math.abs(normal.x) > 0.5 ? 0 : Math.abs(normal.y) > 0.5 ? 1 : 2;
    if (Math.abs(normal.getComponent(axis)) < 0.999) return null;
    base.computeBoundingBox();
    const box = base.boundingBox!;
    const positions = base.attributes.position;
    const epsilon = 0.01;
    for (let index = 0; index < positions.count; index++) {
        let onBoundary = false;
        for (let component = 0; component < 3; component++) {
            const value = positions.array[index * 3 + component];
            if (Math.abs(value - box.min.getComponent(component)) <= epsilon || Math.abs(value - box.max.getComponent(component)) <= epsilon) onBoundary = true;
        }
        if (!onBoundary) return null;
    }

    const selected = normal.getComponent(axis) > 0 ? box.max.getComponent(axis) : box.min.getComponent(axis);
    const opposite = normal.getComponent(axis) > 0 ? box.min.getComponent(axis) : box.max.getComponent(axis);
    const dragged = selected + offset.distance;
    box.min.setComponent(axis, Math.min(dragged, opposite));
    box.max.setComponent(axis, Math.max(dragged, opposite));
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const result = new THREE.BoxGeometry(size.x, size.y, size.z);
    result.translate(...center.toArray());
    return result;
}

export function applyEntityTransform(object: THREE.Object3D, entity: ModelEntity) {
    object.position.fromArray(entity.position);
    object.rotation.set(...entity.rotation.map(THREE.MathUtils.degToRad) as Vec3);
    object.scale.fromArray(entity.scale);
    object.updateMatrixWorld(true);
}

function subtractGeometry(base: THREE.BufferGeometry, cutter: THREE.BufferGeometry) {
    const brushA = new Brush(base), brushB = new Brush(cutter);
    brushA.updateMatrixWorld(true);
    brushB.updateMatrixWorld(true);
    const result = new Evaluator().evaluate(brushA, brushB, SUBTRACTION);
    const geometry = result.geometry;
    base.dispose();
    cutter.dispose();
    return geometry;
}

function unionGeometry(base: THREE.BufferGeometry, extension: THREE.BufferGeometry) {
    const brushA = new Brush(base), brushB = new Brush(extension);
    brushA.updateMatrixWorld(true);
    brushB.updateMatrixWorld(true);
    const result = new Evaluator().evaluate(brushA, brushB, ADDITION);
    base.dispose();
    extension.dispose();
    return result.geometry;
}

function offsetBoundedFace(base: THREE.BufferGeometry, normal: Vec3, distance: number) {
    base.computeBoundingBox();
    const box = base.boundingBox!;
    const direction = new THREE.Vector3(...normal).normalize();
    const axis = Math.abs(direction.x) > 0.5 ? 0 : Math.abs(direction.y) > 0.5 ? 1 : 2;
    const sign = Math.sign(direction.getComponent(axis)) || 1;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const shrink = distance < 0;
    const depth = Math.abs(distance);
    const dimensions = size.toArray();
    dimensions[axis] = shrink ? depth + 2 : depth;
    const boundary = sign > 0 ? box.max.getComponent(axis) : box.min.getComponent(axis);
    center.setComponent(axis, shrink ? boundary - sign * (depth / 2 - 1) : boundary + sign * depth / 2);
    const extension = new THREE.BoxGeometry(...dimensions as Vec3);
    extension.translate(...center.toArray());
    return shrink ? subtractGeometry(base, extension) : unionGeometry(base, extension);
}

function faceExtension(offset: NonNullable<ModelEntity['faceOffset']>, skipBottom = false) {
    const source = offset.vertices || [];
    const sourceIndices = offset.indices || [];
    if (source.length < 3 || !offset.distance) return new THREE.BufferGeometry();
    const vertices: THREE.Vector3[] = [];
    const vertexMap = new Map<string, number>();
    source.forEach((point) => {
        const key = point.map((value) => value.toFixed(5)).join(',');
        if (vertexMap.has(key)) return;
        vertexMap.set(key, vertices.length);
        vertices.push(new THREE.Vector3(...point));
    });
    const edgeCounts = new Map<string, [number, number, number]>();
    for (let index = 0; index + 2 < sourceIndices.length; index += 3) {
        const triangle = sourceIndices.slice(index, index + 3).map((vertex) => vertexMap.get(source[vertex].map((value) => value.toFixed(5)).join(','))!);
        [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
            const key = [triangle[a], triangle[b]].sort((x, y) => x - y).join(':');
            const edge = edgeCounts.get(key);
            if (edge) edge[2]++;
            else edgeCounts.set(key, [triangle[a], triangle[b], 1]);
        });
    }
    const boundary = [...edgeCounts.values()].filter((edge) => edge[2] === 1);
    if (!boundary.length) return new THREE.BufferGeometry();
    const normal = new THREE.Vector3(...offset.normal).normalize();
    const direction = normal.clone().multiplyScalar(Math.sign(offset.distance) || 1);
    const origin = vertices[0];
    const u = vertices[1].clone().sub(origin).normalize();
    const v = direction.clone().cross(u).normalize();
    const overlap = Math.min(0.001, Math.abs(offset.distance) / 1000 || 0.001);
    const depth = Math.abs(offset.distance) + overlap;
    const positions: number[] = [];
    const push = (vertex: number, z: number) => {
        const relative = vertices[vertex].clone().sub(origin);
        positions.push(relative.dot(u), relative.dot(v), z);
    };
    // Reuse the current face triangulation for caps; only boundary edges create side walls.
    for (let index = 0; index + 2 < sourceIndices.length; index += 3) {
        const triangle = sourceIndices.slice(index, index + 3).map((vertex) => vertexMap.get(source[vertex].map((value) => value.toFixed(5)).join(','))!);
        if (!skipBottom) triangle.forEach((vertex) => push(vertex, 0));
        triangle.forEach((vertex) => push(vertex, depth));
    }
    boundary.forEach(([a, b]) => {
        push(a, 0); push(b, 0); push(b, depth);
        push(a, 0); push(b, depth); push(a, depth);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
    geometry.computeVertexNormals();
    const basis = new THREE.Matrix4().makeBasis(u, v, direction);
    basis.setPosition(origin.clone().addScaledVector(direction, -overlap));
    geometry.applyMatrix4(basis);
    if (signedVolume(geometry) < 0) reverseWinding(geometry);
    return geometry;
}

function stitchFaceExtension(base: THREE.BufferGeometry, offset: NonNullable<ModelEntity['faceOffset']>) {
    const selected = new Set<string>();
    const source = offset.vertices || [], indices = offset.indices || [];
    for (let index = 0; index + 2 < indices.length; index += 3) {
        selected.add(indices.slice(index, index + 3).map((vertex) => source[vertex].map((value) => value.toFixed(4)).join(',')).sort().join('|'));
    }
    const positions = base.attributes.position;
    const baseIndex = base.index;
    const triangles: number[] = [];
    for (let index = 0; index < (baseIndex?.count || positions.count); index += 3) {
        const triangle = [0, 1, 2].map((corner) => baseIndex ? baseIndex.getX(index + corner) : index + corner);
        const key = triangle.map((vertex) => new THREE.Vector3().fromBufferAttribute(positions, vertex).toArray().map((value) => value.toFixed(4)).join(',')).sort().join('|');
        if (!selected.has(key)) triangles.push(...triangle);
    }
    const baseOuter = new THREE.BufferGeometry();
    Object.entries(base.attributes).forEach(([name, attribute]) => {
        const values: number[] = [];
        triangles.forEach((vertex) => {
            for (let component = 0; component < attribute.itemSize; component++) values.push(attribute.array[vertex * attribute.itemSize + component]);
        });
        baseOuter.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
    });
    const extension = faceExtension(offset, true);
    return mergeGeometries([baseOuter, extension], false) || unionGeometry(base, extension);
}

function clipFaceNegative(base: THREE.BufferGeometry, offset: NonNullable<ModelEntity['faceOffset']>) {
    const source = offset.vertices || [], sourceIndices = offset.indices || [];
    const normal = new THREE.Vector3(...offset.normal).normalize();
    const positions = base.attributes.position;
    const index = base.index;
    const selected = new Set<string>();
    const vertexTriangles = new Map<string, number[]>();
    const triangles: THREE.Vector3[][] = [];
    const triangleKeys: string[] = [];
    const pointKey = (point: THREE.Vector3) => point.toArray().map((value) => value.toFixed(4)).join(',');

    for (let cursor = 0; cursor < sourceIndices.length; cursor += 3) selected.add(sourceIndices.slice(cursor, cursor + 3).map((vertex) => pointKey(new THREE.Vector3(...source[vertex]))).sort().join('|'));
    for (let cursor = 0; cursor < (index?.count || positions.count); cursor += 3) {
        const triangle = [0, 1, 2].map((corner) => new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(cursor + corner) : cursor + corner));
        const triangleIndex = triangles.length;
        triangles.push(triangle);
        triangleKeys.push(triangle.map(pointKey).sort().join('|'));
        triangle.forEach((point) => vertexTriangles.set(pointKey(point), [...vertexTriangles.get(pointKey(point)) || [], triangleIndex]));
    }

    const affected = new Set<number>();
    triangles.forEach((triangle, triangleIndex) => {
        if (selected.has(triangleKeys[triangleIndex])) affected.add(triangleIndex);
    });
    [...affected].forEach((triangleIndex) => triangles[triangleIndex].forEach((point) => (vertexTriangles.get(pointKey(point)) || []).forEach((neighbor) => affected.add(neighbor))));

    let min = Infinity, max = -Infinity;
    triangles.forEach((triangle) => triangle.forEach((point) => {
        const projection = point.dot(normal);
        min = Math.min(min, projection);
        max = Math.max(max, projection);
    }));
    const dragged = max + offset.distance;
    const crossed = dragged < min - 0.0001;
    const limit = crossed ? min : dragged;
    const output: THREE.Vector3[] = [];
    const clip = (points: THREE.Vector3[]) => {
        const polygon: THREE.Vector3[] = [];
        for (let cursor = 0; cursor < points.length; cursor++) {
            const a = points[(cursor + points.length - 1) % points.length], b = points[cursor];
            const da = a.dot(normal) - limit, db = b.dot(normal) - limit;
            if ((da <= 0) !== (db <= 0)) polygon.push(a.clone().lerp(b, da / (da - db)));
            if (db <= 0) polygon.push(b.clone());
        }
        for (let cursor = 1; cursor + 1 < polygon.length; cursor++) output.push(polygon[0], polygon[cursor], polygon[cursor + 1]);
    };
    triangles.forEach((triangle, triangleIndex) => {
        if (selected.has(triangleKeys[triangleIndex])) return;
        if (affected.has(triangleIndex) && triangle.some((point) => point.dot(normal) > limit)) clip(triangle);
        else output.push(...triangle.map((point) => point.clone()));
    });
    if (!crossed) {
        for (let cursor = 0; cursor < sourceIndices.length; cursor += 3) {
            const triangle = sourceIndices.slice(cursor, cursor + 3).map((vertex) => new THREE.Vector3(...source[vertex]).addScaledVector(normal, offset.distance));
            const faceNormal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
            if (faceNormal.dot(normal) < 0) [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
            output.push(...triangle);
        }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(output);
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(output.length * 2), 2));
    geometry.computeVertexNormals();
    if (crossed) {
        const outside = faceExtension({ ...offset, distance: offset.distance + max - min });
        outside.translate(...normal.clone().multiplyScalar(min - max).toArray());
        return mergeGeometries([geometry, outside], false) || outside;
    }
    return geometry;
}

function offsetArbitraryFace(base: THREE.BufferGeometry, offset: NonNullable<ModelEntity['faceOffset']>) {
    return offset.distance > 0 ? stitchFaceExtension(base, offset) : clipFaceNegative(base, offset);
}

function baseGeometry(entity: ModelEntity, quality: GeometryQuality, document: ModelDocument): THREE.BufferGeometry {
    if (entity.axisBox) {
        const box = entity.axisBox;
        const size = new THREE.Vector3(...box.max).sub(new THREE.Vector3(...box.min));
        const center = new THREE.Vector3(...box.max).add(new THREE.Vector3(...box.min)).multiplyScalar(0.5);
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        geometry.translate(...center.toArray());
        return entity.faceOffset?.distance ? offsetAxisBox(geometry, entity.faceOffset) || geometry : geometry;
    }
    if (entity.meshGeometry?.positions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(entity.meshGeometry.positions, 3));
        if (entity.meshGeometry.indices.length) geometry.setIndex(entity.meshGeometry.indices);
        geometry.computeVertexNormals();
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        if (entity.faceOffset?.distance && entity.faceOffset.vertices) {
            const box = offsetAxisBox(geometry, entity.faceOffset);
            return box || offsetArbitraryFace(geometry, entity.faceOffset);
        }
        return geometry;
    }
    const q = qualityValues(quality);
    if (entity.kind === 'box') {
        const width = entity.width!;
        const height = entity.height!;
        const depth = entity.depth!;
        const base = new THREE.BoxGeometry(width, height, depth);
        if (!entity.faceOffset?.distance) return base;
        const normal = new THREE.Vector3(...entity.faceOffset.normal).normalize();
        const axis = Math.abs(normal.x) > 0.5 ? 0 : Math.abs(normal.y) > 0.5 ? 1 : 2;
        const sign = Math.sign(normal.getComponent(axis)) || 1;
        const thickness = entity.faceOffset.distance;
        const dimensions = [width, height, depth];
        dimensions[axis] = Math.abs(dimensions[axis] + thickness);
        const geometry = new THREE.BoxGeometry(...dimensions as Vec3);
        geometry.translate(...new THREE.Vector3().setComponent(axis, sign * thickness / 2).toArray());
        base.dispose();
        return geometry;
    }
    if (entity.kind === 'cylinder') {
        const base = new THREE.CylinderGeometry(entity.radius!, entity.radius!, entity.height!, q.radial, 1, false);
        if (!entity.faceOffset?.distance || Math.abs(entity.faceOffset.normal[1]) < 0.5) return base;
        const sign = Math.sign(entity.faceOffset.normal[1]) || 1;
        const geometry = new THREE.CylinderGeometry(entity.radius!, entity.radius!, Math.abs(entity.height! + entity.faceOffset.distance), q.radial, 1, false);
        geometry.translate(0, sign * entity.faceOffset.distance / 2, 0);
        base.dispose();
        return geometry;
    }
    if (entity.kind === 'sphere') {
        return new THREE.SphereGeometry(entity.radius!, q.sphere, Math.max(16, q.sphere / 2));
    }
    const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
    let sourceEntity = entity;
    let fixedBoundary = 0;
    const planeNormal = plane ? new THREE.Vector3(...plane.normal).normalize() : null;
    const faceNormal = entity.faceOffset ? new THREE.Vector3(...entity.faceOffset.normal).normalize() : null;
    const axialOffset = !!(plane && planeNormal && faceNormal && entity.faceOffset?.distance && Math.abs(faceNormal.dot(planeNormal)) > 0.9);
    if (axialOffset && planeNormal && faceNormal) {
        const originalDirection = entity.direction === -1 ? -1 : 1;
        const selectedDirection = Math.sign(faceNormal.dot(planeNormal)) || 1;
        const half = entity.sideMode === 'symmetric' ? entity.depth! / 2 : 0;
        const selected = selectedDirection === originalDirection ? originalDirection * (entity.depth! - half) : -originalDirection * half;
        const fixed = selectedDirection === originalDirection ? -originalDirection * half : originalDirection * (entity.depth! - half);
        const dragged = selected + selectedDirection * entity.faceOffset!.distance;
        const vector = dragged - fixed;
        fixedBoundary = fixed;
        sourceEntity = { ...entity, depth: Math.abs(vector), direction: (Math.sign(vector) || originalDirection) as 1 | -1, sideMode: 'one', faceOffset: null };
    }
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
    if (axialOffset && planeNormal) geometry.translate(...planeNormal.multiplyScalar(fixedBoundary).toArray());
    else if (entity.faceOffset?.distance && entity.faceOffset.vertices) {
        const offsetGeometry = offsetArbitraryFace(geometry, entity.faceOffset);
        if (offsetGeometry !== geometry) return offsetGeometry;
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
        mesh = closed ? new THREE.Mesh(geometry, material) : new THREE.Line(geometry, material) as unknown as THREE.Mesh;
        if (openGeometry) {
            const outline = new THREE.LineSegments(openGeometry, new THREE.LineBasicMaterial({ color: SKETCH_COLORS.line }));
            outline.userData.compoundOutline = true;
            mesh.add(outline);
        }
    } else if (entity.kind !== 'boolean' || entity.meshGeometry) {
        const profile = entity.profileId ? document.entities.find((item) => item.id === entity.profileId) : null;
        const geometryEntity = profile ? { ...entity, points: profile.points, parts: profile.parts, profileType: profile.profileType, planeId: profile.planeId, curves: profile.curves, sides: profile.sides, sectorAngle: profile.sectorAngle, open: profile.open, profileStartAngle: profile.profileStartAngle, analyticCurves: profile.analyticCurves } : entity;
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
        if (entity.faceOffset?.distance) mesh.geometry = entity.faceOffset.vertices
            ? offsetArbitraryFace(mesh.geometry, entity.faceOffset)
            : offsetBoundedFace(mesh.geometry, entity.faceOffset.normal, entity.faceOffset.distance);
        mesh.material = createMaterial(entity.color);
        brushA.geometry.dispose();
        brushB.geometry.dispose();
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
