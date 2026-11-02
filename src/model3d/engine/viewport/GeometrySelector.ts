import * as THREE from 'three';
import type { ModelEntity, Vec3 } from '../../types';

export type GeometryAnchor = { id: string; key: string; normal: Vec3; localNormal: Vec3; point: Vec3; type: 'face' | 'edge'; planar: boolean; vertices: Vec3[]; indices: number[] };
type Surface = { vertices: Vec3[]; indices: number[]; point: Vec3; planar: boolean };
type MeshSurfaces = { triangleSurfaces: number[]; surfaces: Surface[] };

/** Converts mesh hits into stable face/edge overlays without changing the source mesh. */
export class GeometrySelector {
    private readonly surfaceCache = new Map<string, MeshSurfaces>();

    clear() {
        this.surfaceCache.clear();
    }

    collectSurface(mesh: THREE.Mesh, hit: THREE.Intersection): Surface {
        const cached = this.surfaceCache.get(mesh.uuid) || this.buildSurfaces(mesh);
        const start = hit.faceIndex ?? Math.floor((hit.face?.a || 0) / 3);
        return cached.surfaces[cached.triangleSurfaces[start]] || cached.surfaces[0];
    }

    private buildSurfaces(mesh: THREE.Mesh) {
        mesh.updateWorldMatrix(true, false);
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        const index = geometry.index;
        const triangles: { vertices: number[]; normal: THREE.Vector3 }[] = [];
        const vertexToTriangles = new Map<string, number[]>();
        const triangleCount = Math.floor((index?.count || positions?.count || 0) / 3);

        // Adjacency is shared by every hit on this mesh; each connected surface is built only once.
        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
            const vertices = [0, 1, 2].map((offset) => index ? index.getX(triangleIndex * 3 + offset) : triangleIndex * 3 + offset);
            const points = vertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(positions, vertex));
            const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
            triangles.push({ vertices, normal });
            vertices.forEach((vertex, offset) => {
                const key = points[offset].toArray().map((value) => value.toFixed(4)).join(',');
                const list = vertexToTriangles.get(key) || [];
                list.push(triangleIndex);
                vertexToTriangles.set(key, list);
            });
        }

        const triangleSurfaces = Array.from({ length: triangleCount }, () => -1);
        const surfaces: Surface[] = [];
        const threshold = Math.cos(THREE.MathUtils.degToRad(15));
        for (let start = 0; start < triangleCount; start++) {
            if (triangleSurfaces[start] >= 0) continue;
            const surfaceIndex = surfaces.length;
            const queue = [start];
            const visited = new Set<number>();
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const current = queue[cursor];
                if (visited.has(current)) continue;
                visited.add(current);
                triangleSurfaces[current] = surfaceIndex;
                triangles[current].vertices.forEach((vertex) => {
                    const point = new THREE.Vector3().fromBufferAttribute(positions, vertex);
                    const key = point.toArray().map((value) => value.toFixed(4)).join(',');
                    (vertexToTriangles.get(key) || []).forEach((neighbor) => {
                        if (!visited.has(neighbor) && triangles[current].normal.dot(triangles[neighbor].normal) >= threshold) queue.push(neighbor);
                    });
                });
            }

            const vertices: Vec3[] = [];
            const indices: number[] = [];
            const center = new THREE.Vector3();
            const planar = [...visited].every((triangleIndex) => triangles[triangleIndex].normal.dot(triangles[start].normal) > 0.9999);
            [...visited].sort((a, b) => a - b).forEach((triangleIndex) => {
                triangles[triangleIndex].vertices.forEach((vertex) => {
                    const point = new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld);
                    center.add(point);
                    vertices.push(point.toArray());
                    indices.push(indices.length);
                });
            });
            surfaces.push({ vertices, indices, planar, point: center.multiplyScalar(1 / Math.max(1, vertices.length)).toArray() as Vec3 });
        }

        const result = { triangleSurfaces, surfaces };
        this.surfaceCache.set(mesh.uuid, result);
        return result;
    }

    createFaceAnchor(hit: THREE.Intersection, entity?: ModelEntity): GeometryAnchor {
        const mesh = hit.object as THREE.Mesh;
        const localNormal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone();
        const normal = localNormal.clone().transformDirection(mesh.matrixWorld);
        const triangle = hit.face ? [hit.face.a, hit.face.b, hit.face.c].map((index) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld)) : [hit.point.clone()];
        let vertices = triangle;
        let indices = [0, 1, 2];
        let point = hit.point.clone();
        let planar = true;
        let surfaceKey = 'triangle';

        if (entity?.kind === 'box') {
            const dimensions = [entity.width!, entity.height!, entity.depth!];
            const axis = Math.abs(localNormal.x) > 0.5 ? 0 : Math.abs(localNormal.y) > 0.5 ? 1 : 2;
            surfaceKey = `${axis}:${Math.sign(localNormal.getComponent(axis)) || 1}`;
            const u = (axis + 1) % 3, v = (axis + 2) % 3;
            const sign = Math.sign(localNormal.getComponent(axis)) || 1;
            vertices = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
                const local = [0, 0, 0];
                local[axis] = sign * dimensions[axis] / 2;
                local[u] = su * dimensions[u] / 2;
                local[v] = sv * dimensions[v] / 2;
                return new THREE.Vector3(...local as Vec3).applyMatrix4(mesh.matrixWorld);
            });
            point = vertices.reduce((center, vertex) => center.add(vertex), new THREE.Vector3()).multiplyScalar(0.25);
            indices = [0, 1, 2, 0, 2, 3];
        } else {
            const surface = this.collectSurface(mesh, hit);
            if (surface?.vertices.length) {
                planar = surface.planar;
                const cached = this.surfaceCache.get(mesh.uuid);
                surfaceKey = String(cached?.surfaces.indexOf(surface) ?? 0);
                vertices = surface.vertices.map((point) => new THREE.Vector3(...point));
                indices = surface.indices;
            }
        }
        const id = mesh.userData.entityId;
        return { id, key: `${id}:face:${surfaceKey}`, normal: normal.toArray(), localNormal: localNormal.toArray(), point: point.toArray(), type: 'face', planar, vertices: vertices.map((vertex) => vertex.toArray()), indices };
    }

    createEdgeAnchor(hit: THREE.Intersection): GeometryAnchor {
        const positions = (hit.object as THREE.LineSegments).geometry.attributes.position;
        hit.object.updateWorldMatrix(true, false);
        const pointKey = (index: number) => [positions.getX(index), positions.getY(index), positions.getZ(index)].map((value) => value.toFixed(4)).join(',');
        const adjacency = new Map<string, number[]>();
        for (let segment = 0; segment < Math.floor(positions.count / 2); segment++) {
            [segment * 2, segment * 2 + 1].forEach((index) => {
                const key = pointKey(index);
                adjacency.set(key, [...adjacency.get(key) || [], segment]);
            });
        }

        // Degree-two display edges form circles and other smooth loops; box corners still select one segment.
        const startSegment = Math.floor((hit.index || 0) / 2);
        const visited = new Set([startSegment]);
        const ordered = [startSegment * 2, startSegment * 2 + 1];
        const extend = (fromStart: boolean) => {
            let current = fromStart ? ordered[0] : ordered[ordered.length - 1];
            while (true) {
                const connected = adjacency.get(pointKey(current)) || [];
                if (connected.length !== 2) break;
                const next = connected.find((segment) => !visited.has(segment));
                if (next === undefined) break;
                visited.add(next);
                const a = next * 2, b = a + 1;
                const other = pointKey(a) === pointKey(current) ? b : a;
                if (fromStart) ordered.unshift(other);
                else ordered.push(other);
                current = other;
            }
        };
        extend(false);
        extend(true);
        const vertices = ordered.map((index) => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(hit.object.matrixWorld));
        const point = vertices[0].clone().lerp(vertices[1], 0.5);
        let owner: THREE.Object3D | null = hit.object;
        while (owner && !owner.userData.entityId) owner = owner.parent;
        const id = owner?.userData.entityId || '';
        const edgeKey = [...new Set(ordered.map(pointKey))].sort().join('|');
        return { id, key: `${id}:edge:${edgeKey}`, normal: [0, 1, 0], localNormal: [0, 1, 0], point: point.toArray(), type: 'edge', planar: false, vertices: vertices.map((vertex) => vertex.toArray()), indices: [0, 1] };
    }
}
