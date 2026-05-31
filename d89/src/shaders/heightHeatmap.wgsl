struct Uniforms {
  viewProjectionMatrix: mat4x4<f32>,
  minHeight: f32,
  maxHeight: f32,
  pointSize: f32,
  padding: f32,
};

struct VertexInput {
  @location(0) position: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) height: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.viewProjectionMatrix * vec4<f32>(input.position, 1.0);
  output.height = input.position.y;
  output.position.w = output.position.w;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let normalizedHeight = (input.height - uniforms.minHeight) / (uniforms.maxHeight - uniforms.minHeight);
  let clampedHeight = clamp(normalizedHeight, 0.0, 1.0);
  
  var color: vec3<f32>;
  
  if (clampedHeight < 0.25) {
    let t = clampedHeight / 0.25;
    color = mix(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(0.0, 1.0, 1.0), t);
  } 
  else if (clampedHeight < 0.5) {
    let t = (clampedHeight - 0.25) / 0.25;
    color = mix(vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(0.0, 1.0, 0.0), t);
  }
  else if (clampedHeight < 0.75) {
    let t = (clampedHeight - 0.5) / 0.25;
    color = mix(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 1.0, 0.0), t);
  }
  else {
    let t = (clampedHeight - 0.75) / 0.25;
    color = mix(vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), t);
  }
  
  return vec4<f32>(color, 1.0);
}
