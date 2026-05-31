import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const ELEMENT_COLORS = {
  C: 0x909090,
  O: 0xff0000,
  N: 0x0000ff,
  S: 0xffff00,
  P: 0xff8c00,
  H: 0xffffff,
  DEFAULT: 0x00ff00
};

const ELEMENT_RADII = {
  C: 0.4,
  O: 0.35,
  N: 0.35,
  S: 0.45,
  P: 0.45,
  H: 0.25,
  DEFAULT: 0.3
};

const LOW_RES_SEGMENTS = 8;
const HIGH_RES_SEGMENTS = 16;
const SCALE_FACTOR = 0.3;

function ProteinViewer({ atoms, residues, colorMode, selectedResidue, onResidueSelect, renderMode = 'auto', simulationUpdate = null }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const instancedMeshRef = useRef(null);
  const atomDataRef = useRef([]);
  const residueMapRef = useRef({});
  const dummyRef = useRef(new THREE.Object3D());
  const [hoveredAtom, setHoveredAtom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const getColorByMode = useCallback((atom, residue) => {
    switch (colorMode) {
      case 'element':
        return ELEMENT_COLORS[atom.element] || ELEMENT_COLORS.DEFAULT;
      case 'hydrophobicity':
        if (!residue) return 0x888888;
        const hydro = residue.hydrophobicity;
        if (hydro > 2) return 0xff4444;
        if (hydro > 0) return 0xffaa00;
        if (hydro > -2) return 0x00aaff;
        return 0x0044ff;
      case 'charge':
        if (!residue) return 0x888888;
        const charge = residue.charge;
        if (charge > 0) return 0xff0000;
        if (charge < 0) return 0x0000ff;
        return 0x888888;
      default:
        return 0x88ccff;
    }
  }, [colorMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      2000
    );
    camera.position.set(0, 0, 50);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: window.devicePixelRatio <= 1.5,
      powerPreference: 'high-performance'
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = false;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = true;
    controls.autoRotate = false;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight1.position.set(50, 50, 50);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-50, -50, -50);
    scene.add(directionalLight2);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current || !atoms || !residues || atoms.length === 0) return;

    setIsLoading(true);

    if (instancedMeshRef.current) {
      sceneRef.current.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      if (Array.isArray(instancedMeshRef.current.material)) {
        instancedMeshRef.current.material.forEach(m => m.dispose());
      } else {
        instancedMeshRef.current.material.dispose();
      }
      instancedMeshRef.current = null;
    }

    const residueMap = {};
    residues.forEach(r => {
      residueMap[r.id] = r;
    });
    residueMapRef.current = residueMap;
    atomDataRef.current = atoms;

    setTimeout(() => {
      if (!sceneRef.current) return;

      const atomCount = atoms.length;
      const useLowRes = atomCount > 20000;
      const segments = useLowRes ? LOW_RES_SEGMENTS : HIGH_RES_SEGMENTS;

      const geometryCache = {};
      const elementGroups = {};

      atoms.forEach((atom, index) => {
        const element = atom.element || 'DEFAULT';
        if (!elementGroups[element]) {
          elementGroups[element] = [];
        }
        elementGroups[element].push({ atom, index });
      });

      const group = new THREE.Group();

      Object.entries(elementGroups).forEach(([element, atomList]) => {
        if (atomList.length === 0) return;

        const radius = ELEMENT_RADII[element] || ELEMENT_RADII.DEFAULT;
        
        if (!geometryCache[radius]) {
          geometryCache[radius] = new THREE.SphereGeometry(radius, segments, segments);
        }
        
        const geometry = geometryCache[radius];
        const material = new THREE.MeshPhongMaterial({
          shininess: 30,
          flatShading: useLowRes
        });

        const instancedMesh = new THREE.InstancedMesh(geometry, material, atomList.length);
        instancedMesh.frustumCulled = true;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        atomList.forEach((item, i) => {
          const { atom, index: globalIndex } = item;
          const residue = residueMap[atom.residue_id];
          
          dummy.position.set(
            atom.x * SCALE_FACTOR,
            atom.y * SCALE_FACTOR,
            atom.z * SCALE_FACTOR
          );
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(i, dummy.matrix);

          const atomColor = getColorByMode(atom, residue);
          color.setHex(atomColor);
          instancedMesh.setColorAt(i, color);

          instancedMesh.userData[`idx_${i}`] = { atom, residue, global_index: globalIndex };
        });

        instancedMesh.instanceColor.needsUpdate = true;
        instancedMesh.userData.element = element;
        group.add(instancedMesh);
      });

      instancedMeshRef.current = group;
      sceneRef.current.add(group);

      if (cameraRef.current && atoms.length > 0) {
        const center = new THREE.Vector3();
        const positions = atoms.slice(0, Math.min(atoms.length, 1000)).map(a => 
          new THREE.Vector3(a.x * SCALE_FACTOR, a.y * SCALE_FACTOR, a.z * SCALE_FACTOR)
        );
        positions.forEach(p => center.add(p));
        center.divideScalar(positions.length);
        
        cameraRef.current.lookAt(center);
        if (controlsRef.current) {
          controlsRef.current.target.copy(center);
        }

        const bbox = new THREE.Box3().setFromObject(group);
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = cameraRef.current.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));
        cameraRef.current.position.z = center.z + cameraZ * 0.8;
      }

      setIsLoading(false);
    }, 10);
  }, [atoms, residues, getColorByMode]);

  useEffect(() => {
    if (!instancedMeshRef.current || !atomDataRef.current) return;

    const residueMap = residueMapRef.current;
    const group = instancedMeshRef.current;

    group.children.forEach(instancedMesh => {
      const count = instancedMesh.count;
      for (let i = 0; i < count; i++) {
        const data = instancedMesh.userData[`idx_${i}`];
        if (data) {
          const { atom, residue } = data;
          const color = new THREE.Color(getColorByMode(atom, residue));
          instancedMesh.setColorAt(i, color);
        }
      }
      instancedMesh.instanceColor.needsUpdate = true;
    });
  }, [colorMode, getColorByMode]);

  useEffect(() => {
    if (!instancedMeshRef.current) return;

    const group = instancedMeshRef.current;
    group.children.forEach(instancedMesh => {
      const count = instancedMesh.count;
      for (let i = 0; i < count; i++) {
        const data = instancedMesh.userData[`idx_${i}`];
        if (data && data.residue) {
          const material = instancedMesh.material;
          if (data.residue.id === selectedResidue) {
            const color = new THREE.Color(0x00ff00);
            instancedMesh.setColorAt(i, color);
          } else {
            const color = new THREE.Color(getColorByMode(data.atom, data.residue));
            instancedMesh.setColorAt(i, color);
          }
        }
      }
      instancedMesh.instanceColor.needsUpdate = true;
    });
  }, [selectedResidue, getColorByMode]);

  useEffect(() => {
    if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseMove = (event) => {
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      
      if (instancedMeshRef.current) {
        let found = false;
        for (const instancedMesh of instancedMeshRef.current.children) {
          const intersects = raycaster.intersectObject(instancedMesh);
          if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
            const instanceId = intersects[0].instanceId;
            const data = instancedMesh.userData[`idx_${instanceId}`];
            if (data && data.atom) {
              setHoveredAtom(data.atom);
              found = true;
              break;
            }
          }
        }
        if (!found) {
          setHoveredAtom(null);
        }
      }
    };

    const handleClick = (event) => {
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);

      if (instancedMeshRef.current) {
        for (const instancedMesh of instancedMeshRef.current.children) {
          const intersects = raycaster.intersectObject(instancedMesh);
          if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
            const instanceId = intersects[0].instanceId;
            const data = instancedMesh.userData[`idx_${instanceId}`];
            if (data && data.residue && onResidueSelect) {
              onResidueSelect(data.residue.id);
              break;
            }
          }
        }
      }
    };

    rendererRef.current.domElement.addEventListener('mousemove', handleMouseMove);
    rendererRef.current.domElement.addEventListener('click', handleClick);

    return () => {
      if (rendererRef.current) {
        rendererRef.current.domElement.removeEventListener('mousemove', handleMouseMove);
        rendererRef.current.domElement.removeEventListener('click', handleClick);
      }
    };
}
  }, [onResidueSelect]);

  // Handle simulation updates
  useEffect(() => {
    if (!simulationUpdate || !instancedMeshRef.current || !atoms) return;
    
    const { atoms: updatedAtoms, sample_rate } = simulationUpdate;
    if (!updatedAtoms) return;
    
    const group = instancedMeshRef.current;
    
    group.children.forEach((instancedMesh, elementIndex) => {
      const count = instancedMesh.count;
      
      for (let i = 0; i < count; i++) {
        const data = instancedMesh.userData[`idx_${i}`];
        if (!data) continue;
        
        const globalIdx = data.global_index;
        const sampleIdx = Math.floor(globalIdx / (sample_rate || 1));
        
        // Find update for this atom
        const update = updatedAtoms.find(a => a.idx === sampleIdx * (sample_rate || 1) || a.idx === globalIdx);
        if (update) {
          instancedMesh.getMatrixAt(i, dummyRef.current.matrix);
          dummyRef.current.matrix.decompose(
            dummyRef.current.position,
            dummyRef.current.quaternion,
            dummyRef.current.scale
          );
          dummyRef.current.position.set(
            update.x * SCALE_FACTOR,
            update.y * SCALE_FACTOR,
            update.z * SCALE_FACTOR
          );
          dummyRef.current.updateMatrix();
          instancedMesh.setMatrixAt(i, dummyRef.current.matrix);
        }
      }
      
      instancedMesh.instanceMatrix.needsUpdate = true;
    });
  }, [simulationUpdate]);

  return (
    <div className="viewer-container" ref={containerRef}>
      {!atoms && (
        <div className="empty-state">
          <div className="empty-state-icon">🔬</div>
          <div className="empty-state-text">Upload a PDB file to visualize protein structure</div>
        </div>
      )}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div>Processing protein structure...</div>
        </div>
      )}
      {hoveredAtom && (
        <div className="info-panel">
          <div className="residue-name">
            {hoveredAtom.residue_name} {hoveredAtom.residue_id}
          </div>
          <div>Atom: {hoveredAtom.name} ({hoveredAtom.element})</div>
          <div>Position: ({hoveredAtom.x.toFixed(2)}, {hoveredAtom.y.toFixed(2)}, {hoveredAtom.z.toFixed(2)})</div>
        </div>
      )}
    </div>
  );
}

export default ProteinViewer;
