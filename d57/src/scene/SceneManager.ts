import { Vec3, Sphere, Triangle, Material, SceneData, BVHNode } from '../types';
import { BVHBuilder } from '../bvh/BVHBuilder';

export class SceneManager {
  private spheres: Sphere[] = [];
  private triangles: Triangle[] = [];
  private materials: Material[] = [];
  private bvhNodes: BVHNode[] = [];
  private triangleIndices: number[] = [];
  private bvhBuilder: BVHBuilder;
  private changedTriangles: Set<number> = new Set();
  private dynamicMode: boolean = false;

  constructor() {
    this.bvhBuilder = new BVHBuilder();
    this.initializeDefaultScene();
  }

  private initializeDefaultScene(): void {
    this.materials = [
      { albedo: { x: 0.8, y: 0.8, z: 0.8 }, metallic: 0, roughness: 0.5, emission: { x: 0, y: 0, z: 0 }, ior: 1.5, transmission: 0 },
      { albedo: { x: 1.0, y: 0.2, z: 0.2 }, metallic: 0, roughness: 0.1, emission: { x: 0, y: 0, z: 0 }, ior: 1.5, transmission: 0 },
      { albedo: { x: 0.2, y: 1.0, z: 0.2 }, metallic: 0, roughness: 0.1, emission: { x: 0, y: 0, z: 0 }, ior: 1.5, transmission: 0 },
      { albedo: { x: 0.9, y: 0.9, z: 0.9 }, metallic: 1, roughness: 0.0, emission: { x: 0, y: 0, z: 0 }, ior: 1.5, transmission: 0 },
      { albedo: { x: 1.0, y: 1.0, z: 1.0 }, metallic: 0, roughness: 0.0, emission: { x: 0, y: 0, z: 0 }, ior: 1.5, transmission: 1 },
      { albedo: { x: 1.0, y: 0.8, z: 0.5 }, metallic: 0, roughness: 0.5, emission: { x: 15, y: 10, z: 5 }, ior: 1.5, transmission: 0 },
    ];

    this.addFloor();
    this.addCornellBox();
    this.addSpheres();
    this.addTestMesh();
    this.buildBVH();
  }

  private addFloor(): void {
    const y = -1.5;
    const size = 5;
    
    this.addQuad(
      { x: -size, y: y, z: -size },
      { x: size, y: y, z: -size },
      { x: size, y: y, z: size },
      { x: -size, y: y, z: size },
      0
    );
  }

  private addCornellBox(): void {
    const size = 3;
    const yMin = -1.5;
    const yMax = 3;
    
    this.addQuad(
      { x: -size, y: yMin, z: -size },
      { x: -size, y: yMin, z: size },
      { x: -size, y: yMax, z: size },
      { x: -size, y: yMax, z: -size },
      1
    );
    
    this.addQuad(
      { x: size, y: yMin, z: size },
      { x: size, y: yMin, z: -size },
      { x: size, y: yMax, z: -size },
      { x: size, y: yMax, z: size },
      2
    );
    
    this.addQuad(
      { x: -size, y: yMax, z: size },
      { x: size, y: yMax, z: size },
      { x: size, y: yMax, z: -size },
      { x: -size, y: yMax, z: -size },
      0
    );
    
    this.addQuad(
      { x: size, y: yMin, z: -size },
      { x: -size, y: yMin, z: -size },
      { x: -size, y: yMax, z: -size },
      { x: size, y: yMax, z: -size },
      0
    );

    const lightSize = 0.8;
    const lightY = yMax - 0.01;
    this.addQuad(
      { x: -lightSize, y: lightY, z: -lightSize },
      { x: lightSize, y: lightY, z: -lightSize },
      { x: lightSize, y: lightY, z: lightSize },
      { x: -lightSize, y: lightY, z: lightSize },
      5
    );
  }

  private addSpheres(): void {
    this.spheres.push(
      { center: { x: -1, y: -0.8, z: 0 }, radius: 0.7, materialIndex: 3 },
      { center: { x: 1, y: -0.8, z: 0.5 }, radius: 0.7, materialIndex: 4 },
      { center: { x: 0, y: 0.5, z: -1 }, radius: 0.5, materialIndex: 0 }
    );
  }

  private addTestMesh(): void {
    const cubeCenter = { x: 0, y: -1, z: 1.5 };
    const cubeSize = 0.6;
    
    this.addCube(cubeCenter, cubeSize, 1);
  }

  private addQuad(v0: Vec3, v1: Vec3, v2: Vec3, v3: Vec3, materialIndex: number): void {
    const normal1 = this.computeNormal(v0, v1, v2);
    const normal2 = this.computeNormal(v0, v2, v3);
    
    this.triangles.push(
      { v0, v1, v2, normal: normal1, materialIndex },
      { v0, v1: v2, v2: v3, normal: normal2, materialIndex }
    );
  }

  private addCube(center: Vec3, size: number, materialIndex: number): void {
    const s = size / 2;
    const faces = [
      [{ x: -s, y: -s, z: -s }, { x: s, y: -s, z: -s }, { x: s, y: -s, z: s }, { x: -s, y: -s, z: s }],
      [{ x: -s, y: s, z: s }, { x: s, y: s, z: s }, { x: s, y: s, z: -s }, { x: -s, y: s, z: -s }],
      [{ x: -s, y: -s, z: -s }, { x: -s, y: -s, z: s }, { x: -s, y: s, z: s }, { x: -s, y: s, z: -s }],
      [{ x: s, y: -s, z: s }, { x: s, y: -s, z: -s }, { x: s, y: s, z: -s }, { x: s, y: s, z: s }],
      [{ x: -s, y: -s, z: s }, { x: s, y: -s, z: s }, { x: s, y: s, z: s }, { x: -s, y: s, z: s }],
      [{ x: s, y: -s, z: -s }, { x: -s, y: -s, z: -s }, { x: -s, y: s, z: -s }, { x: s, y: s, z: -s }]
    ];

    for (const face of faces) {
      const [a, b, c, d] = face.map(v => ({
        x: v.x + center.x,
        y: v.y + center.y,
        z: v.z + center.z
      }));
      this.addQuad(a, b, c, d, materialIndex);
    }
  }

  private computeNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
    const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
    const cross = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x
    };
    const len = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z);
    return { x: cross.x / len, y: cross.y / len, z: cross.z / len };
  }

  buildBVH(): void {
    const result = this.bvhBuilder.build(this.triangles);
    this.bvhNodes = result.nodes;
    this.triangleIndices = result.triangleIndices;
    this.changedTriangles.clear();
  }

  rebuildBVHIncremental(): void {
    if (this.changedTriangles.size === 0) return;
    
    const result = this.bvhBuilder.rebuildIncremental(this.triangles);
    this.bvhNodes = result.nodes;
    this.triangleIndices = result.triangleIndices;
    this.changedTriangles.clear();
  }

  getSceneData(): SceneData {
    return {
      spheres: [...this.spheres],
      triangles: [...this.triangles],
      materials: [...this.materials],
      bvhNodes: [...this.bvhNodes],
      triangleIndices: [...this.triangleIndices]
    };
  }

  getTriangleCount(): number {
    return this.triangles.length;
  }

  getSphereCount(): number {
    return this.spheres.length;
  }

  getMaterialCount(): number {
    return this.materials.length;
  }

  getBVHNodeCount(): number {
    return this.bvhNodes.length;
  }

  setDynamicMode(enabled: boolean): void {
    this.dynamicMode = enabled;
  }

  isDynamicMode(): boolean {
    return this.dynamicMode;
  }

  markTriangleChanged(index: number): void {
    this.changedTriangles.add(index);
  }

  addGLTFModel(_gltfData: unknown): void {
    console.warn('GLTF loading will be implemented in SceneManager');
  }
}
