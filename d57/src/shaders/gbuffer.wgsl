struct GBufferPixel {
  albedo: vec3<f32>,
  normal: vec3<f32>,
  position: vec3<f32>,
  depth: f32,
  roughness: f32,
  metallic: f32,
}

@group(0) @binding(0) var<storage, read> positions: array<vec3<f32>>;
@group(0) @binding(1) var<storage, read> normals: array<vec3<f32>>;
@group(0) @binding(2) var<storage, read> colors: array<vec3<f32>>;
@group(0) @binding(3) var<storage, read_write> gbuffer: array<GBufferPixel>;
@group(0) @binding(4) var<storage, read_write> motionVectors: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> previousPositions: array<vec3<f32>>;

struct Uniforms {
  viewProj: mat4x4<f32>,
  prevViewProj: mat4x4<f32>,
  width: u32,
  height: u32,
  cameraPos: vec3<f32>,
}

@group(0) @binding(6) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn generate_gbuffer(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= uniforms.width || y >= uniforms.height) {
    return;
  }
  
  let idx = y * uniforms.width + x;
  let pos = positions[idx];
  let normal = normals[idx];
  let color = colors[idx];
  
  var g: GBufferPixel;
  g.albedo = color;
  g.normal = normalize(normal);
  g.position = pos;
  g.depth = length(pos - uniforms.cameraPos);
  g.roughness = 0.5;
  g.metallic = 0.0;
  
  gbuffer[idx] = g;
  
  let current_uv = vec2<f32>(f32(x) / f32(uniforms.width), f32(y) / f32(uniforms.height));
  
  let prev_pos = previousPositions[idx];
  if (all(prev_pos == vec3<f32>(0.0))) {
    motionVectors[idx] = vec2<f32>(0.0, 0.0);
  } else {
    let prev_proj = uniforms.prevViewProj * vec4<f32>(prev_pos, 1.0);
    let prev_uv_homo = prev_proj.xy / prev_proj.w;
    let prev_uv = prev_uv_homo * 0.5 + 0.5;
    motionVectors[idx] = prev_uv - current_uv;
  }
}

@compute @workgroup_size(8, 8)
fn estimate_motion_vector(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= uniforms.width || y >= uniforms.height) {
    return;
  }
  
  let idx = y * uniforms.width + x;
  
  if (motionVectors[idx] != vec2<f32>(0.0)) {
    return;
  }
  
  let center_g = gbuffer[idx];
  var best_match = vec2<f32>(0.0, 0.0);
  var best_similarity = -1.0;
  
  let search_radius = 5;
  for (var dy = -search_radius; dy <= search_radius; dy = dy + 1) {
    for (var dx = -search_radius; dx <= search_radius; dx = dx + 1) {
      let nx = i32(x) + dx;
      let ny = i32(y) + dy;
      
      if (nx >= 0 && nx < i32(uniforms.width) && ny >= 0 && ny < i32(uniforms.height)) {
        let nidx = u32(ny) * uniforms.width + u32(nx);
        let neighbor_g = gbuffer[nidx];
        
        let normal_sim = dot(center_g.normal, neighbor_g.normal);
        let depth_diff = abs(center_g.depth - neighbor_g.depth) / max(center_g.depth, 0.01);
        let depth_sim = exp(-depth_diff * 10.0);
        let albedo_diff = length(center_g.albedo - neighbor_g.albedo);
        let albedo_sim = exp(-albedo_diff * 5.0);
        
        let similarity = normal_sim * depth_sim * albedo_sim;
        
        if (similarity > best_similarity) {
          best_similarity = similarity;
          best_match = vec2<f32>(f32(dx), f32(dy));
        }
      }
    }
  }
  
  if (best_similarity > 0.7) {
    motionVectors[idx] = best_match * 0.5 / vec2<f32>(f32(uniforms.width), f32(uniforms.height));
  }
}
