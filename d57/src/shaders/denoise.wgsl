struct PushConstants {
  width: u32,
  height: u32,
  startY: u32,
  endY: u32,
}

@group(0) @binding(0) var<storage, read> input: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> output: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> constants: PushConstants;

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn linear_to_srgb(x: vec3<f32>) -> vec3<f32> {
  return select(1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - 0.055, 12.92 * x, x <= vec3<f32>(0.0031308));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let x = global_id.x;
  let y = global_id.y;
  let effectiveHeight = constants.endY - constants.startY;
  
  if (x >= constants.width || y >= effectiveHeight) {
    return;
  }
  
  let idx = y * constants.width + x;
  
  var sum = vec3<f32>(0.0);
  var weightSum = 0.0;
  let center = vec3<f32>(input[idx].x, input[idx].y, input[idx].z);
  
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      let nx = i32(x) + dx;
      let ny = i32(y) + dy;
      
      if (nx >= 0 && nx < i32(constants.width) && ny >= 0 && ny < i32(effectiveHeight)) {
        let nidx = u32(ny) * constants.width + u32(nx);
        let neighbor = vec3<f32>(input[nidx].x, input[nidx].y, input[nidx].z);
        
        let dist = length(neighbor - center);
        let spatialWeight = 1.0 - 0.5 * sqrt(f32(dx * dx + dy * dy) / 2.0);
        let rangeWeight = exp(-dist * 10.0);
        let weight = spatialWeight * rangeWeight;
        
        sum = sum + neighbor * weight;
        weightSum = weightSum + weight;
      }
    }
  }
  
  var color = sum / weightSum;
  color = aces(color);
  color = linear_to_srgb(color);
  
  output[idx] = vec4<f32>(color, 1.0);
}
