struct DenoiseSettings {
  width: u32,
  height: u32,
  filterRadius: u32,
  sigmaSpace: f32,
  sigmaColor: f32,
  sigmaNormal: f32,
  sigmaDepth: f32,
  adaptiveRadius: u32,
}

struct GBufferPixel {
  albedo: vec3<f32>,
  normal: vec3<f32>,
  position: vec3<f32>,
  depth: f32,
  roughness: f32,
  metallic: f32,
}

@group(0) @binding(0) var<storage, read> inputColor: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> outputColor: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> gbuffer: array<GBufferPixel>;
@group(0) @binding(3) var<storage, read> variance: array<f32>;
@group(0) @binding(4) var<uniform> settings: DenoiseSettings;

fn wang_hash(seed: u32) -> u32 {
  var s = seed;
  s = (s ^ 61u) ^ (s >> 16u);
  s = s + (s << 3u);
  s = s ^ (s >> 4u);
  s = s * 0x27d4eb2du;
  s = s ^ (s >> 15u);
  return s;
}

fn calculate_adaptive_radius(variance: f32, roughness: f32) -> u32 {
  let base_radius = f32(settings.filterRadius);
  let variance_factor = min(variance * 50.0, 1.0);
  let roughness_factor = roughness;
  
  let factor = 0.3 + variance_factor * 0.4 + roughness_factor * 0.3;
  return u32(max(1.0, base_radius * factor));
}

fn calculate_pixel_weight(
  center_g: GBufferPixel,
  neighbor_g: GBufferPixel,
  center_c: vec3<f32>,
  neighbor_c: vec3<f32>,
  dx: i32,
  dy: i32,
  sigma_s: f32,
  sigma_c: f32,
  sigma_n: f32,
  sigma_d: f32
) -> f32 {
  let dist_sq = f32(dx * dx + dy * dy);
  let spatial_weight = exp(-dist_sq / (2.0 * sigma_s * sigma_s));
  
  let color_diff = length(center_c - neighbor_c);
  let color_weight = exp(-color_diff * color_diff / (2.0 * sigma_c * sigma_c));
  
  let normal_dot = abs(dot(center_g.normal, neighbor_g.normal));
  let normal_weight = pow(normal_dot, 1.0 / sigma_n);
  
  let depth_diff = abs(center_g.depth - neighbor_g.depth);
  let depth_weight = exp(-depth_diff * depth_diff / (2.0 * sigma_d * sigma_d));
  
  let roughness_diff = abs(center_g.roughness - neighbor_g.roughness);
  let roughness_weight = exp(-roughness_diff * 4.0);
  
  return spatial_weight * color_weight * normal_weight * depth_weight * roughness_weight;
}

@compute @workgroup_size(8, 8)
fn bilateral_filter(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= settings.width || y >= settings.height) {
    return;
  }
  
  let idx = y * settings.width + x;
  
  let center_color = inputColor[idx].rgb;
  let center_g = gbuffer[idx];
  let pixel_variance = variance[idx];
  
  let adaptive_radius = if settings.adaptiveRadius == 1u {
    calculate_adaptive_radius(pixel_variance, center_g.roughness)
  } else {
    settings.filterRadius
  };
  
  var sum_color = vec3<f32>(0.0);
  var sum_weight = 0.0;
  
  let sigma_s = f32(settings.sigmaSpace);
  let sigma_c = settings.sigmaColor;
  let sigma_n = settings.sigmaNormal;
  let sigma_d = settings.sigmaDepth;
  
  let radius = i32(adaptive_radius);
  
  for (var dy = -radius; dy <= radius; dy = dy + 1) {
    for (var dx = -radius; dx <= radius; dx = dx + 1) {
      let nx = i32(x) + dx;
      let ny = i32(y) + dy;
      
      if (nx >= 0 && nx < i32(settings.width) && ny >= 0 && ny < i32(settings.height)) {
        let nidx = u32(ny) * settings.width + u32(nx);
        let neighbor_color = inputColor[nidx].rgb;
        let neighbor_g = gbuffer[nidx];
        
        let weight = calculate_pixel_weight(
          center_g, neighbor_g,
          center_color, neighbor_color,
          dx, dy,
          sigma_s, sigma_c, sigma_n, sigma_d
        );
        
        sum_color = sum_color + neighbor_color * weight;
        sum_weight = sum_weight + weight;
      }
    }
  }
  
  if (sum_weight > 0.0001) {
    let filtered_color = sum_color / sum_weight;
    let blend = min(pixel_variance * 10.0, 1.0);
    let final_color = mix(center_color, filtered_color, 0.7 + blend * 0.3);
    outputColor[idx] = vec4<f32>(final_color, 1.0);
  } else {
    outputColor[idx] = vec4<f32>(center_color, 1.0);
  }
}

@compute @workgroup_size(8, 8)
fn smart_antilag(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= settings.width || y >= settings.height) {
    return;
  }
  
  let idx = y * settings.width + x;
  
  var variance = 0.0;
  let center = inputColor[idx].rgb;
  
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let nx = i32(x) + dx;
      let ny = i32(y) + dy;
      
      if (nx >= 0 && nx < i32(settings.width) && ny >= 0 && ny < i32(settings.height)) {
        let nidx = u32(ny) * settings.width + u32(nx);
        let diff = length(center - inputColor[nidx].rgb);
        variance = variance + diff * diff;
      }
    }
  }
  
  variance = variance / 9.0;
  
  let sharpness = exp(-variance * 200.0);
  
  if (sharpness > 0.5) {
    var laplacian = center * 5.0;
    var count = 5.0;
    
    for (var axis = 0; axis < 2; axis = axis + 1) {
      for (var dir = -1; dir <= 1; dir = dir + 2) {
        let nx = i32(x) + select(dir, 0, axis == 1);
        let ny = i32(y) + select(0, dir, axis == 1);
        
        if (nx >= 0 && nx < i32(settings.width) && ny >= 0 && ny < i32(settings.height)) {
          let nidx = u32(ny) * settings.width + u32(nx);
          laplacian = laplacian - inputColor[nidx].rgb;
        }
      }
    }
    
    let sharpened = center + laplacian * (sharpness - 0.5) * 0.5;
    outputColor[idx] = vec4<f32>(clamp(sharpened, vec3<f32>(0.0), vec3<f32>(100.0)), 1.0);
  } else {
    outputColor[idx] = vec4<f32>(center, 1.0);
  }
}
