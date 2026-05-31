struct Params {
  resolution: vec2<f32>,
  dt: f32,
  velocity: f32,
  viscosity: f32,
  gravity: f32,
  vorticity: f32,
}

struct MouseInput {
  position: vec2<f32>,
  direction: vec2<f32>,
  pressure: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> mouse: MouseInput;
@group(0) @binding(2) var velocityTex: texture_2d<f32>;
@group(0) @binding(3) var dyeTex: texture_2d<f32>;
@group(0) @binding(4) var velocityOutput: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var dyeOutput: texture_storage_2d<rgba32float, write>;

fn hash(p: vec2<f32>) -> vec3<f32> {
  var p3: vec3<f32> = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims: vec2<u32> = textureDimensions(velocityTex);
  if (id.x >= dims.x || id.y >= dims.y) {
    return;
  }
  
  let pos: vec2<i32> = vec2<i32>(id.xy);
  let uv: vec2<f32> = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(dims);
  
  var vel: vec2<f32> = textureLoad(velocityTex, pos, 0).xy;
  var dye: vec3<f32> = textureLoad(dyeTex, pos, 0).rgb;
  
  if (mouse.pressure > 0.0) {
    let mouseUv: vec2<f32> = mouse.position / params.resolution;
    let delta: vec2<f32> = uv - mouseUv;
    let dist: f32 = length(delta);
    let radius: f32 = 0.05;
    
    if (dist < radius) {
      let falloff: f32 = 1.0 - smoothstep(0.0, radius, dist);
      
      let dirVel: vec2<f32> = mouse.direction * falloff * mouse.pressure * params.velocity;
      
      let normalizedDelta: vec2<f32> = delta / max(dist, 0.001);
      let tangentDir: vec2<f32> = vec2<f32>(-normalizedDelta.y, normalizedDelta.x);
      let speed: f32 = length(mouse.direction) * params.velocity * params.vorticity;
      let vortexVel: vec2<f32> = tangentDir * falloff * speed * 2.0;
      
      vel += dirVel + vortexVel;
      
      let color: vec3<f32> = hash(mouseUv * 100.0);
      dye = mix(dye, color, falloff * mouse.pressure * 0.5);
    }
  }
  
  vel.y += params.gravity * params.dt * 0.1;
  
  textureStore(velocityOutput, pos, vec4<f32>(vel, 0.0, 1.0));
  textureStore(dyeOutput, pos, vec4<f32>(dye, 1.0));
}
