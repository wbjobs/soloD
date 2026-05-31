struct Params {
  resolution: vec2<f32>,
  dt: f32,
  velocity: f32,
  viscosity: f32,
  gravity: f32,
  vorticity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var velocityTex: texture_2d<f32>;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba32float, write>;

fn bilerp(tex: texture_2d<f32>, uv: vec2<f32>) -> vec4<f32> {
  let dims: vec2<f32> = vec2<f32>(textureDimensions(tex));
  let st: vec2<f32> = uv * dims - 0.5;
  let iuv: vec2<f32> = floor(st);
  let fuv: vec2<f32> = fract(st);
  
  let a: vec4<f32> = textureLoad(tex, vec2<i32>(iuv), 0);
  let b: vec4<f32> = textureLoad(tex, vec2<i32>(iuv + vec2<f32>(1.0, 0.0)), 0);
  let c: vec4<f32> = textureLoad(tex, vec2<i32>(iuv + vec2<f32>(0.0, 1.0)), 0);
  let d: vec4<f32> = textureLoad(tex, vec2<i32>(iuv + vec2<f32>(1.0, 1.0)), 0);
  
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims: vec2<u32> = textureDimensions(inputTex);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }
  
  let uv: vec2<f32> = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(dims);
  
  let vel: vec2<f32> = textureLoad(velocityTex, vec2<i32>(id.xy), 0).xy;
  let prevUv: vec2<f32> = uv - vel * params.dt * params.velocity;
  
  let result: vec4<f32> = bilerp(inputTex, prevUv);
  
  textureStore(outputTex, vec2<i32>(id.xy), result);
}
