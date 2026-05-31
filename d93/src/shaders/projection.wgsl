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
@group(0) @binding(2) var pressureTex: texture_2d<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims: vec2<u32> = textureDimensions(velocityTex);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }
  
  let pos: vec2<i32> = vec2<i32>(id.xy);
  
  let L: f32 = textureLoad(pressureTex, pos + vec2<i32>(-1, 0), 0).x;
  let R: f32 = textureLoad(pressureTex, pos + vec2<i32>(1, 0), 0).x;
  let T: f32 = textureLoad(pressureTex, pos + vec2<i32>(0, -1), 0).x;
  let B: f32 = textureLoad(pressureTex, pos + vec2<i32>(0, 1), 0).x;
  
  let vel: vec2<f32> = textureLoad(velocityTex, pos, 0).xy;
  let gradP: vec2<f32> = 0.5 * vec2<f32>(R - L, B - T);
  
  let result: vec2<f32> = vel - gradP;
  
  textureStore(outputTex, pos, vec4<f32>(result, 0.0, 1.0));
}
