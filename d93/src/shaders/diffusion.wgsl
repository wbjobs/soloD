struct Params {
  resolution: vec2<f32>,
  dt: f32,
  velocity: f32,
  viscosity: f32,
  gravity: f32,
  vorticity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims: vec2<u32> = textureDimensions(inputTex);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }
  
  let pos: vec2<i32> = vec2<i32>(id.xy);
  let center: vec4<f32> = textureLoad(inputTex, pos, 0);
  
  let alpha: f32 = params.dt * params.viscosity * 10.0;
  
  let L: vec4<f32> = textureLoad(inputTex, pos + vec2<i32>(-1, 0), 0);
  let R: vec4<f32> = textureLoad(inputTex, pos + vec2<i32>(1, 0), 0);
  let T: vec4<f32> = textureLoad(inputTex, pos + vec2<i32>(0, -1), 0);
  let B: vec4<f32> = textureLoad(inputTex, pos + vec2<i32>(0, 1), 0);
  
  let diffused: vec4<f32> = (center + alpha * (L + R + T + B)) / (1.0 + 4.0 * alpha);
  
  textureStore(outputTex, pos, diffused);
}
