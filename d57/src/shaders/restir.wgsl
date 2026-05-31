struct Reservoir {
  position: vec3<f32>,
  normal: vec3<f32>,
  color: vec3<f32>,
  throughput: vec3<f32>,
  weight: f32,
  M: f32,
  W: f32,
  age: u32,
  valid: u32,
}

struct GBufferPixel {
  albedo: vec3<f32>,
  normal: vec3<f32>,
  position: vec3<f32>,
  depth: f32,
  roughness: f32,
  metallic: f32,
}

struct RestirSettings {
  width: u32,
  height: u32,
  frame: u32,
  spatialRadius: u32,
  temporalWeight: f32,
  enableSpatial: u32,
  enableTemporal: u32,
}

fn wang_hash(seed: u32) -> u32 {
  var s = seed;
  s = (s ^ 61u) ^ (s >> 16u);
  s = s + (s << 3u);
  s = s ^ (s >> 4u);
  s = s * 0x27d4eb2du;
  s = s ^ (s >> 15u);
  return s;
}

fn random_float(seed: ptr<function, u32>) -> f32 {
  *seed = wang_hash(*seed);
  return f32(*seed) / f32(0xffffffffu);
}

fn random_in_unit_disk(seed: ptr<function, u32>) -> vec2<f32> {
  var p: vec2<f32>;
  loop {
    p = vec2<f32>(random_float(seed) * 2.0 - 1.0, random_float(seed) * 2.0 - 1.0);
    if (dot(p, p) < 1.0) { break; }
  }
  return p;
}

fn random_unit_vector(seed: ptr<function, u32>) -> vec3<f32> {
  let a = random_float(seed) * 2.0 * 3.14159265;
  let z = random_float(seed) * 2.0 - 1.0;
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3<f32>(r * cos(a), r * sin(a), z);
}

fn ggx_sample_hemisphere(normal: vec3<f32>, roughness: f32, seed: ptr<function, u32>) -> vec3<f32> {
  let a = roughness * roughness;
  let a2 = a * a;
  
  let u1 = random_float(seed);
  let u2 = random_float(seed);
  
  let phi = 2.0 * 3.14159265 * u2;
  let cosTheta = sqrt((1.0 - u1) / (1.0 + (a2 - 1.0) * u1));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  
  var h = vec3<f32>(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
  
  var up = vec3<f32>(0.0, 1.0, 0.0);
  if (abs(normal.y) > 0.99) {
    up = vec3<f32>(1.0, 0.0, 0.0);
  }
  
  let tangent = normalize(cross(up, normal));
  let bitangent = cross(normal, tangent);
  
  return normalize(tangent * h.x + bitangent * h.y + normal * h.z);
}

fn luminance(color: vec3<f32>) -> f32 {
  return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn pdf_mis_weight(pdf1: f32, pdf2: f32) -> f32 {
  let p1 = pdf1 * pdf1;
  let p2 = pdf2 * pdf2;
  return p1 / (p1 + p2 + 0.0001);
}

fn gaussian_weight(distance: f32, sigma: f32) -> f32 {
  return exp(-distance * distance / (2.0 * sigma * sigma));
}

@group(0) @binding(0) var<storage, read> inputColor: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> outputColor: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> reservoirs: array<Reservoir>;
@group(0) @binding(3) var<storage, read> historyReservoirs: array<Reservoir>;
@group(0) @binding(4) var<storage, read> gbuffer: array<GBufferPixel>;
@group(0) @binding(5) var<storage, read> motionVectors: array<vec2<f32>>;
@group(0) @binding(6) var<uniform> settings: RestirSettings;

fn reservoir_update(reservoir: ptr<function, Reservoir>, sample: Reservoir, weight: f32, seed: ptr<function, u32>) {
  (*reservoir).M = (*reservoir).M + 1.0;
  (*reservoir).weight = (*reservoir).weight + weight;
  
  let r = random_float(seed);
  if (r * (*reservoir).weight < weight) {
    (*reservoir).position = sample.position;
    (*reservoir).normal = sample.normal;
    (*reservoir).color = sample.color;
    (*reservoir).throughput = sample.throughput;
    (*reservoir).valid = 1u;
  }
}

fn reservoir_merge(a: ptr<function, Reservoir>, b: Reservoir, seed: ptr<function, u32>) {
  if (b.valid == 0u) { return; }
  
  let combined_weight = (*a).weight + b.weight;
  if (combined_weight < 0.0001) { return; }
  
  let r = random_float(seed);
  if (r * combined_weight < b.weight) {
    (*a).position = b.position;
    (*a).normal = b.normal;
    (*a).color = b.color;
    (*a).throughput = b.throughput;
  }
  
  (*a).weight = combined_weight;
  (*a).M = (*a).M + b.M;
}

fn clamp_reservoir_weight(reservoir: ptr<function, Reservoir>, max_m: f32) {
  let clamped_m = min((*reservoir).M, max_m);
  if ((*reservoir).M > 0.0) {
    (*reservoir).weight = (*reservoir).weight * (clamped_m / (*reservoir).M);
    (*reservoir).M = clamped_m;
  }
}

fn reproject_pixel(x: u32, y: u32, mv: vec2<f32>) -> vec2<i32> {
  let fx = f32(x) + mv.x * f32(settings.width);
  let fy = f32(y) + mv.y * f32(settings.height);
  return vec2<i32>(i32(fx), i32(fy));
}

fn is_uv_valid(uv: vec2<i32>) -> bool {
  return uv.x >= 0 && uv.x < i32(settings.width) && uv.y >= 0 && uv.y < i32(settings.height);
}

fn calculate_similarity(a: GBufferPixel, b: GBufferPixel) -> f32 {
  let normal_diff = 1.0 - abs(dot(a.normal, b.normal));
  let depth_diff = abs(a.depth - b.depth) / max(abs(a.depth), 0.01);
  let albedo_diff = length(a.albedo - b.albedo);
  
  let normal_weight = exp(-normal_diff * 8.0);
  let depth_weight = exp(-depth_diff * 4.0);
  let albedo_weight = exp(-albedo_diff * 2.0);
  
  return normal_weight * depth_weight * albedo_weight;
}

@compute @workgroup_size(8, 8)
fn restir_temporal_pass(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= settings.width || y >= settings.height) {
    return;
  }
  
  let idx = y * settings.width + x;
  
  var current_reservoir = reservoirs[idx];
  let current_gbuffer = gbuffer[idx];
  let mv = motionVectors[idx];
  
  let history_uv = reproject_pixel(x, y, mv);
  
  if (settings.enableTemporal == 1u && is_uv_valid(history_uv)) {
    let history_idx = u32(history_uv.y) * settings.width + u32(history_uv.x);
    var history_reservoir = historyReservoirs[history_idx];
    let history_gbuffer = gbuffer[history_idx];
    
    let similarity = calculate_similarity(current_gbuffer, history_gbuffer);
    
    if (similarity > 0.3 && history_reservoir.valid == 1u) {
      history_reservoir.age = min(history_reservoir.age + 1u, 30u);
      
      var seed = wang_hash(x * 73856093u ^ y * 19349663u ^ settings.frame * 83492791u);
      
      let temporal_weight = settings.temporalWeight * similarity;
      history_reservoir.weight = history_reservoir.weight * temporal_weight;
      
      reservoir_merge(&current_reservoir, history_reservoir, &seed);
    }
  }
  
  if (current_reservoir.M > 0.0) {
    current_reservoir.W = current_reservoir.weight / (current_reservoir.M + 0.0001);
  }
  
  reservoirs[idx] = current_reservoir;
}

@compute @workgroup_size(8, 8)
fn restir_spatial_pass(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= settings.width || y >= settings.height) {
    return;
  }
  
  let idx = y * settings.width + x;
  
  if (settings.enableSpatial == 0u) {
    return;
  }
  
  var center_reservoir = reservoirs[idx];
  let center_gbuffer = gbuffer[idx];
  
  var seed = wang_hash(x * 73856093u ^ y * 19349663u ^ settings.frame * 83492791u);
  
  let radius = i32(settings.spatialRadius);
  var samples_taken = 0u;
  let max_samples = 5u;
  
  for (var dy = -radius; dy <= radius; dy = dy + 1) {
    for (var dx = -radius; dx <= radius; dx = dx + 1) {
      if (dx == 0 && dy == 0) { continue; }
      if (samples_taken >= max_samples) { break; }
      
      let nx = i32(x) + dx;
      let ny = i32(y) + dy;
      
      if (nx >= 0 && nx < i32(settings.width) && ny >= 0 && ny < i32(settings.height)) {
        let nidx = u32(ny) * settings.width + u32(nx);
        var neighbor_reservoir = reservoirs[nidx];
        let neighbor_gbuffer = gbuffer[nidx];
        
        let similarity = calculate_similarity(center_gbuffer, neighbor_gbuffer);
        
        if (similarity > 0.5 && neighbor_reservoir.valid == 1u) {
          neighbor_reservoir.weight = neighbor_reservoir.weight * similarity;
          reservoir_merge(&center_reservoir, neighbor_reservoir, &seed);
          samples_taken = samples_taken + 1u;
        }
      }
    }
  }
  
  clamp_reservoir_weight(&center_reservoir, 20.0);
  
  if (center_reservoir.M > 0.0) {
    center_reservoir.W = center_reservoir.weight / (center_reservoir.M + 0.0001);
  }
  
  reservoirs[idx] = center_reservoir;
}

@compute @workgroup_size(8, 8)
fn restir_shade_pass(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= settings.width || y >= settings.height) {
    return;
  }
  
  let idx = y * settings.width + x;
  
  let reservoir = reservoirs[idx];
  let input = inputColor[idx];
  
  if (reservoir.valid == 1u && reservoir.W > 0.001) {
    let direct_light = reservoir.color * reservoir.throughput * reservoir.W;
    var final_color = input.rgb + direct_light * 0.5;
    final_color = mix(input.rgb, final_color, 0.7);
    outputColor[idx] = vec4<f32>(final_color, input.a);
  } else {
    outputColor[idx] = input;
  }
}
