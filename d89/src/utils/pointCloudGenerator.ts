class SimplexNoise {
  private perm: number[];

  constructor(seed: number = Math.random()) {
    this.perm = [];
    const p = [];
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    let n = 256;
    let random = seed;
    while (n > 1) {
      random = (random * 16807) % 2147483647;
      const k = (random % n);
      n--;
      [p[n], p[k]] = [p[k], p[n]];
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = this.perm[X] + Y;
    const B = this.perm[X + 1] + Y;
    return this.lerp(v,
      this.lerp(u, this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y)),
      this.lerp(u, this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1))
    );
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}

export interface PointCloudData {
  positions: Float32Array;
  colors: Float32Array;
  pointCount: number;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

export function generateTerrainPointCloud(pointCount: number = 1000000): PointCloudData {
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const noise = new SimplexNoise(42);

  const gridSize = Math.ceil(Math.sqrt(pointCount));
  const scale = 200;
  const heightScale = 50;

  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < pointCount; i++) {
    const gridX = i % gridSize;
    const gridZ = Math.floor(i / gridSize);
    
    const x = (gridX / gridSize - 0.5) * scale + (Math.random() - 0.5) * 0.5;
    const z = (gridZ / gridSize - 0.5) * scale + (Math.random() - 0.5) * 0.5;
    
    const noise1 = noise.noise2D(x * 0.02, z * 0.02);
    const noise2 = noise.noise2D(x * 0.05, z * 0.05) * 0.5;
    const noise3 = noise.noise2D(x * 0.1, z * 0.1) * 0.25;
    const y = (noise1 + noise2 + noise3) * heightScale;

    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  const yRange = maxY - minY;
  for (let i = 0; i < pointCount; i++) {
    const y = positions[i * 3 + 1];
    const normalizedY = (y - minY) / yRange;
    
    let r, g, b;
    if (normalizedY < 0.2) {
      r = 0.3; g = 0.5; b = 0.7;
    } else if (normalizedY < 0.4) {
      r = 0.4; g = 0.65; b = 0.35;
    } else if (normalizedY < 0.6) {
      r = 0.55; g = 0.5; b = 0.35;
    } else if (normalizedY < 0.8) {
      r = 0.65; g = 0.6; b = 0.55;
    } else {
      r = 0.95; g = 0.95; b = 0.95;
    }
    
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  return {
    positions,
    colors,
    pointCount,
    boundingBox: {
      min: { x: -scale / 2, y: minY, z: -scale / 2 },
      max: { x: scale / 2, y: maxY, z: scale / 2 }
    }
  };
}
