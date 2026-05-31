import { Vec3, Triangle, BVHNode } from '../types';

interface AABB {
  min: Vec3;
  max: Vec3;
}

interface BVHBuildNode {
  bounds: AABB;
  left: number;
  right: number;
  triangleIndices: number[];
  parent: number;
  splitAxis: number;
}

export class BVHBuilder {
  private triangles: Triangle[] = [];
  private buildNodes: BVHBuildNode[] = [];
  private triangleIndices: number[] = [];
  private nodeCounter: number = 0;

  build(triangles: Triangle[]): { nodes: BVHNode[]; triangleIndices: number[] } {
    this.triangles = [...triangles];
    this.buildNodes = [];
    this.triangleIndices = [];
    this.nodeCounter = 0;

    if (triangles.length === 0) {
      return { nodes: [], triangleIndices: [] };
    }

    const initialIndices: number[] = [];
    for (let i = 0; i < triangles.length; i++) {
      initialIndices.push(i);
    }

    this.recursiveBuild(initialIndices, -1);
    const compactNodes = this.compactNodes();

    return {
      nodes: compactNodes,
      triangleIndices: this.triangleIndices
    };
  }

  private recursiveBuild(triangleIndices: number[], parentIndex: number): number {
    const nodeIndex = this.nodeCounter++;
    const bounds = this.computeBounds(triangleIndices);

    const buildNode: BVHBuildNode = {
      bounds,
      left: -1,
      right: -1,
      triangleIndices: [],
      parent: parentIndex,
      splitAxis: -1
    };

    this.buildNodes[nodeIndex] = buildNode;

    if (triangleIndices.length <= 4) {
      buildNode.triangleIndices = triangleIndices;
      return nodeIndex;
    }

    const axis = this.chooseSplitAxis(bounds);
    buildNode.splitAxis = axis;
    
    const splitPosition = this.computeSplitPosition(triangleIndices, axis, bounds);
    
    const leftIndices: number[] = [];
    const rightIndices: number[] = [];

    for (const idx of triangleIndices) {
      const tri = this.triangles[idx];
      const centroid = this.getCentroid(tri);
      const pos = [centroid.x, centroid.y, centroid.z][axis];
      
      if (pos < splitPosition) {
        leftIndices.push(idx);
      } else {
        rightIndices.push(idx);
      }
    }

    if (leftIndices.length === 0 || rightIndices.length === 0) {
      buildNode.triangleIndices = triangleIndices;
      return nodeIndex;
    }

    buildNode.left = this.recursiveBuild(leftIndices, nodeIndex);
    buildNode.right = this.recursiveBuild(rightIndices, nodeIndex);

    return nodeIndex;
  }

  private computeBounds(indices: number[]): AABB {
    const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
    const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (const idx of indices) {
      const tri = this.triangles[idx];
      
      for (const v of [tri.v0, tri.v1, tri.v2]) {
        min.x = Math.min(min.x, v.x);
        min.y = Math.min(min.y, v.y);
        min.z = Math.min(min.z, v.z);
        max.x = Math.max(max.x, v.x);
        max.y = Math.max(max.y, v.y);
        max.z = Math.max(max.z, v.z);
      }
    }

    return { min, max };
  }

  private chooseSplitAxis(bounds: AABB): number {
    const dx = bounds.max.x - bounds.min.x;
    const dy = bounds.max.y - bounds.min.y;
    const dz = bounds.max.z - bounds.min.z;

    if (dx >= dy && dx >= dz) return 0;
    if (dy >= dx && dy >= dz) return 1;
    return 2;
  }

  private computeSplitPosition(indices: number[], axis: number, bounds: AABB): number {
    const positions: number[] = [];
    
    for (const idx of indices) {
      const tri = this.triangles[idx];
      const centroid = this.getCentroid(tri);
      positions.push([centroid.x, centroid.y, centroid.z][axis]);
    }

    positions.sort((a, b) => a - b);
    const median = positions[Math.floor(positions.length / 2)];
    
    const min = [bounds.min.x, bounds.min.y, bounds.min.z][axis];
    const max = [bounds.max.x, bounds.max.y, bounds.max.z][axis];
    
    if (median <= min || median >= max) {
      return (min + max) * 0.5;
    }

    return median;
  }

  private getCentroid(tri: Triangle): Vec3 {
    return {
      x: (tri.v0.x + tri.v1.x + tri.v2.x) / 3,
      y: (tri.v0.y + tri.v1.y + tri.v2.y) / 3,
      z: (tri.v0.z + tri.v1.z + tri.v2.z) / 3
    };
  }

  private compactNodes(): BVHNode[] {
    const nodes: BVHNode[] = [];
    const nodeMap = new Map<number, number>();
    
    const flatten = (oldIndex: number): number => {
      if (oldIndex === -1) return -1;
      if (nodeMap.has(oldIndex)) return nodeMap.get(oldIndex)!;

      const newIndex = nodes.length;
      nodeMap.set(oldIndex, newIndex);

      const oldNode = this.buildNodes[oldIndex];
      
      let triangleStart = -1;
      let triangleCount = 0;

      if (oldNode.triangleIndices.length > 0) {
        triangleStart = this.triangleIndices.length;
        triangleCount = oldNode.triangleIndices.length;
        this.triangleIndices.push(...oldNode.triangleIndices);
      }

      nodes.push({
        min: oldNode.bounds.min,
        max: oldNode.bounds.max,
        leftChild: flatten(oldNode.left),
        rightChild: flatten(oldNode.right),
        triangleStart,
        triangleCount
      });

      return newIndex;
    };

    flatten(0);
    return nodes;
  }

  rebuildIncremental(triangles: Triangle[]): { nodes: BVHNode[]; triangleIndices: number[] } {
    return this.build(triangles);
  }
}
