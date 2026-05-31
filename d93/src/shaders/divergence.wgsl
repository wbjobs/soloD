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
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims: vec2<u32> = textureDimensions(velocityTex);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }
  
  let pos: vec2<i32> = vec2<i32>(id.xy);
  
  let L: vec2<f32> = textureLoad(velocityTex, pos + vec2<i32>(-1, 0), 0).xy;
  let R: vec2<f32> = textureLoad(velocityTex, pos + vec2<i32>(1, 0), 0).xy;
  let T: vec2<f32> = textureLoad(velocityTex, pos + vec2<i32>(0, -1), 0).xy;
  let B: vec2<f32> = textureLoad(velocityTex, pos + vec2<i32>(0, 1), 0).xy;
  
  let divergence: f32 = 0.5 * ((R.x - L.x) + (B.y - T.y));
  
  textureStore(outputTex, pos, vec4<f32>(divergence, 0.0, 0.0, 1.0));
}
