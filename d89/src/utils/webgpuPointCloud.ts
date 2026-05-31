import * as THREE from 'three';

const vertexShader = `
uniform float minHeight;
uniform float maxHeight;
uniform float pointSize;

varying float vHeight;
varying vec3 vColor;

void main() {
  vHeight = position.y;
  
  float normalizedHeight = (position.y - minHeight) / (maxHeight - minHeight);
  normalizedHeight = clamp(normalizedHeight, 0.0, 1.0);
  
  vec3 color;
  if (normalizedHeight < 0.25) {
    float t = normalizedHeight / 0.25;
    color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t);
  } else if (normalizedHeight < 0.5) {
    float t = (normalizedHeight - 0.25) / 0.25;
    color = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), t);
  } else if (normalizedHeight < 0.75) {
    float t = (normalizedHeight - 0.5) / 0.25;
    color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), t);
  } else {
    float t = (normalizedHeight - 0.75) / 0.25;
    color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), t);
  }
  
  vColor = color;
  
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = pointSize * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
varying float vHeight;
varying vec3 vColor;

void main() {
  float r = distance(gl_PointCoord, vec2(0.5));
  if (r > 0.5) {
    discard;
  }
  
  float alpha = 1.0 - smoothstep(0.0, 0.5, r);
  gl_FragColor = vec4(vColor, alpha);
}
`;

export interface HeightHeatmapMaterialOptions {
  minHeight: number;
  maxHeight: number;
  pointSize: number;
}

export function createHeightHeatmapMaterial(options: HeightHeatmapMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      minHeight: { value: options.minHeight },
      maxHeight: { value: options.maxHeight },
      pointSize: { value: options.pointSize },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function updateHeatmapMaterial(
  material: THREE.ShaderMaterial,
  options: Partial<HeightHeatmapMaterialOptions>
): void {
  if (options.minHeight !== undefined) {
    material.uniforms.minHeight.value = options.minHeight;
  }
  if (options.maxHeight !== undefined) {
    material.uniforms.maxHeight.value = options.maxHeight;
  }
  if (options.pointSize !== undefined) {
    material.uniforms.pointSize.value = options.pointSize;
  }
}
