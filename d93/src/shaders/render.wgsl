struct Params {
  resolution: vec2<f32>,
  dt: f32,
  velocity: f32,
  viscosity: f32,
  gravity: f32,
  vorticity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var dyeTex: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  var pos: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );
  
  var uv: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0)
  );
  
  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertex_index], 0.0, 1.0);
  output.uv = uv[vertex_index];
  return output;
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let K: vec4<f32> = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p: vec3<f32> = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

@fragment
fn fragment_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let texUV: vec2<i32> = vec2<i32>(floor(uv * vec2<f32>(textureDimensions(dyeTex))));
  let dye: vec3<f32> = textureLoad(dyeTex, texUV, 0).rgb;
  
  let intensity: f32 = length(dye);
  let hue: f32 = 0.5 + intensity * 0.3;
  let saturation: f32 = 0.7;
  let value: f32 = min(intensity * 2.0, 1.0);
  
  var color: vec3<f32> = hsv2rgb(vec3<f32>(hue, saturation, value));
  
  let bgColor: vec3<f32> = vec3<f32>(0.02, 0.05, 0.1);
  color = mix(bgColor, color, smoothstep(0.0, 0.3, intensity));
  
  return vec4<f32>(color, 1.0);
}
