import * as THREE from 'three';

interface OctreeNode {
  min: THREE.Vector3;
  max: THREE.Vector3;
  children: OctreeNode[] | null;
  pointIndices: number[];
}

export class FrustumCulling {
  private positions: Float32Array;
  private totalPoints: number;
  private octree: OctreeNode | null = null;
  private visibleIndices: Uint32Array;
  private frustum: THREE.Frustum;
  private projScreenMatrix: THREE.Matrix4;

  constructor(positions: Float32Array, totalPoints: number) {
    this.positions = positions;
    this.totalPoints = totalPoints;
    this.visibleIndices = new Uint32Array(totalPoints);
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
  }

  buildOctree(maxDepth: number = 6, maxPointsPerNode: number = 1000): void {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < this.totalPoints; i++) {
      const x = this.positions[i * 3];
      const y = this.positions[i * 3 + 1];
      const z = this.positions[i * 3 + 2];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    const allIndices = Array.from({ length: this.totalPoints }, (_, i) => i);
    this.octree = this.buildNode(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ),
      allIndices,
      0,
      maxDepth,
      maxPointsPerNode
    );
  }

  private buildNode(
    min: THREE.Vector3,
    max: THREE.Vector3,
    indices: number[],
    depth: number,
    maxDepth: number,
    maxPointsPerNode: number
  ): OctreeNode {
    if (depth >= maxDepth || indices.length <= maxPointsPerNode) {
      return { min, max, children: null, pointIndices: indices };
    }

    const mid = new THREE.Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2
    );

    const children: number[][] = Array.from({ length: 8 }, () => []);

    for (const idx of indices) {
      const x = this.positions[idx * 3];
      const y = this.positions[idx * 3 + 1];
      const z = this.positions[idx * 3 + 2];

      let childIndex = 0;
      if (x > mid.x) childIndex |= 1;
      if (y > mid.y) childIndex |= 2;
      if (z > mid.z) childIndex |= 4;
      children[childIndex].push(idx);
    }

    const childNodes: OctreeNode[] = [];
    for (let i = 0; i < 8; i++) {
      if (children[i].length === 0) continue;

      const cMin = new THREE.Vector3(
        (i & 1) ? mid.x : min.x,
        (i & 2) ? mid.y : min.y,
        (i & 4) ? mid.z : min.z
      );
      const cMax = new THREE.Vector3(
        (i & 1) ? max.x : mid.x,
        (i & 2) ? max.y : mid.y,
        (i & 4) ? max.z : mid.z
      );

      childNodes.push(this.buildNode(cMin, cMax, children[i], depth + 1, maxDepth, maxPointsPerNode));
    }

    return { min, max, children: childNodes, pointIndices: [] };
  }

  update(camera: THREE.PerspectiveCamera): { visibleCount: number; visibleIndices: Uint32Array } {
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    let visibleCount = 0;

    if (this.octree) {
      visibleCount = this.cullNode(this.octree, 0);
    } else {
      for (let i = 0; i < this.totalPoints; i++) {
        const x = this.positions[i * 3];
        const y = this.positions[i * 3 + 1];
        const z = this.positions[i * 3 + 2];
        if (this.frustum.containsPoint(new THREE.Vector3(x, y, z))) {
          this.visibleIndices[visibleCount++] = i;
        }
      }
    }

    return { visibleCount, visibleIndices: this.visibleIndices };
  }

  private cullNode(node: OctreeNode, count: number): number {
    const sphere = new THREE.Sphere();
    const center = new THREE.Vector3(
      (node.min.x + node.max.x) / 2,
      (node.min.y + node.max.y) / 2,
      (node.min.z + node.max.z) / 2
    );
    const radius = Math.sqrt(
      Math.pow((node.max.x - node.min.x) / 2, 2) +
      Math.pow((node.max.y - node.min.y) / 2, 2) +
      Math.pow((node.max.z - node.min.z) / 2, 2)
    );
    sphere.set(center, radius);

    if (!this.frustum.intersectsSphere(sphere)) {
      return count;
    }

    if (node.children === null) {
      for (const idx of node.pointIndices) {
        const x = this.positions[idx * 3];
        const y = this.positions[idx * 3 + 1];
        const z = this.positions[idx * 3 + 2];
        if (this.frustum.containsPoint(new THREE.Vector3(x, y, z))) {
          this.visibleIndices[count++] = idx;
        }
      }
      return count;
    }

    for (const child of node.children) {
      count = this.cullNode(child, count);
    }

    return count;
  }

  getTotalPoints(): number {
    return this.totalPoints;
  }
}
