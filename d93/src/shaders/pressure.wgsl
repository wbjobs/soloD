struct Params {
  resolution: vec2<f32>,
  dt: f32,
  velocity: f32,
  viscosity: f32,
  gravity: f32,
  vorticity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var pressureTex: texture_2d<f32>;
@group(0) @binding(2) var divergenceTex: texture_2d<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims: vec2<u32> = textureDimensions(pressureTex);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }
  
  let pos: vec2<i32> = vec2<i32>(id.xy);
  
  let L: f32 = textureLoad(pressureTex, pos + vec2<i32>(-1, 0), 0).x;
  let R: f32 = textureLoad(pressureTex, pos + vec2<i32>(1, 0), 0).x;
  let T: f32 = textureLoad(pressureTex, pos + vec2<i32>(0, -1), 0).x;
  let B: f32 = textureLoad(pressureTex, pos + vec2<i32>(0, 1), 0).x;
  let div: f32 = textureLoad(divergenceTex, pos, 0).x;
  
  let pressure: f32 = (L + R + T + B - div) * 0.25;
  
  textureStore(outputTex, pos, vec4<f32>(pressure, 0.0, 0.0, 1.0));
}
