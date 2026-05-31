struct Params {
  resolution: vec2<f32>,
  dt: f32,
  velocity: f32,
  viscosity: f32,
  gravity: f32,
}

struct MouseInput {
  position: vec2<f32>,
  direction: vec2<f32>,
  pressure: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> mouse: MouseInput;

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
