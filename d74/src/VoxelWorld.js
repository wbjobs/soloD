import * as THREE from 'three';

export class VoxelWorld {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cellSliceSize = cellSize * cellSize;
        this.cell = new Uint8Array(cellSize * cellSize * cellSize);
        this.mesh = null;
        this.geometry = null;
        this.material = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide
        });
    }

    computeVoxelOffset(x, y, z) {
        const { cellSize, cellSliceSize } = this;
        const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0;
        const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0;
        const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0;
        return voxelY * cellSliceSize + voxelZ * cellSize + voxelX;
    }

    getCellIdForVoxel(x, y, z) {
        const { cellSize } = this;
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        const cellZ = Math.floor(z / cellSize);
        return `${cellX},${cellY},${cellZ}`;
    }

    addCellForVoxel(x, y, z) {
        const cellId = this.getCellIdForVoxel(x, y, z);
        if (!this.cells) {
            this.cells = {};
        }
        if (!this.cells[cellId]) {
            const { cellSize } = this;
            this.cells[cellId] = new Uint8Array(cellSize * cellSize * cellSize);
        }
        return this.cells[cellId];
    }

    getCellForVoxel(x, y, z) {
        if (!this.cells) {
            return null;
        }
        const cellId = this.getCellIdForVoxel(x, y, z);
        return this.cells[cellId];
    }

    setVoxel(x, y, z, v) {
        const cell = this.addCellForVoxel(x, y, z);
        const offset = this.computeVoxelOffset(x, y, z);
        cell[offset] = v;
    }

    getVoxel(x, y, z) {
        const cell = this.getCellForVoxel(x, y, z);
        if (!cell) {
            return 0;
        }
        const offset = this.computeVoxelOffset(x, y, z);
        return cell[offset];
    }

    generateGeometryData() {
        const { cellSize } = this;
        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];
        const startX = 0;
        const startY = 0;
        const startZ = 0;
        const endX = cellSize;
        const endY = cellSize;
        const endZ = cellSize;

        const faces = [
            { dir: [0, 1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
            { dir: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },
            { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]] },
            { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
            { dir: [0, 0, 1], corners: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },
            { dir: [0, 0, -1], corners: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]] },
        ];

        const recordVoxel = (v, offset) => {
            const r = ((v >> 5) & 0x7) / 7;
            const g = ((v >> 2) & 0x7) / 7;
            const b = ((v >> 0) & 0x3) / 3;
            for (let i = 0; i < 4; ++i) {
                positions.push(...positions.slice(positions.length - 3 * 4, positions.length - 3 * (4 - i)));
                normals.push(...faces[offset].dir);
                colors.push(r, g, b);
            }
            const ndx = positions.length / 3 - 4;
            indices.push(
                ndx, ndx + 1, ndx + 2,
                ndx, ndx + 2, ndx + 3,
            );
        };

        for (let y = startY; y < endY; ++y) {
            for (let z = startZ; z < endZ; ++z) {
                for (let x = startX; x < endX; ++x) {
                    const v = this.getVoxel(x, y, z);
                    if (v) {
                        for (let f = 0; f < 6; ++f) {
                            const face = faces[f];
                            const neighborX = x + face.dir[0];
                            const neighborY = y + face.dir[1];
                            const neighborZ = z + face.dir[2];
                            const neighborV = this.getVoxel(neighborX, neighborY, neighborZ);
                            if (!neighborV) {
                                for (const corner of face.corners) {
                                    positions.push(
                                        (x + corner[0] - 0.5),
                                        (y + corner[1] - 0.5),
                                        (z + corner[2] - 0.5)
                                    );
                                    normals.push(...face.dir);
                                    const r = ((v >> 5) & 0x7) / 7;
                                    const g = ((v >> 2) & 0x7) / 7;
                                    const b = ((v >> 0) & 0x3) / 3;
                                    colors.push(r, g, b);
                                }
                                const ndx = positions.length / 3 - 4;
                                indices.push(
                                    ndx, ndx + 1, ndx + 2,
                                    ndx, ndx + 2, ndx + 3,
                                );
                            }
                        }
                    }
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            indices: new Uint16Array(indices),
        };
    }

    generateGeometry() {
        const { positions, normals, colors, indices } = this.generateGeometryData();
        
        if (this.geometry) {
            this.geometry.dispose();
        }
        
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        
        if (this.mesh) {
            this.mesh.geometry = this.geometry;
        } else {
            this.mesh = new THREE.Mesh(this.geometry, this.material);
        }
    }
}

export class VoxelMesh extends THREE.Mesh {
    constructor(color) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color });
        super(geometry, material);
        this.castShadow = true;
        this.receiveShadow = true;
    }
}
