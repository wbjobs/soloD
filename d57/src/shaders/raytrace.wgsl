struct Vec3 {
  x: f32,
  y: f32,
  z: f32,
}

struct Material {
  albedo: Vec3,
  metallic: f32,
  roughness: f32,
  emission: Vec3,
  ior: f32,
  transmission: f32,
}

struct Sphere {
  center: Vec3,
  radius: f32,
  materialIndex: u32,
}

struct Triangle {
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
  normal: Vec3,
  materialIndex: u32,
}

struct BVHNode {
  min: Vec3,
  max: Vec3,
  leftChild: i32,
  rightChild: i32,
  triangleStart: i32,
  triangleCount: i32,
}

struct Camera {
  position: Vec3,
  forward: Vec3,
  up: Vec3,
  right: Vec3,
  fov: f32,
}

struct RenderSettings {
  samplesPerPixel: u32,
  maxBounces: u32,
  frame: u32,
  adaptiveSampling: u32,
  denoising: u32,
  width: u32,
  height: u32,
  startY: u32,
  endY: u32,
  globalStartY: u32,
  globalEndY: u32,
  borderOverlap: u32,
  gpuIndex: u32,
  totalGPUs: u32,
}

struct Ray {
  origin: Vec3,
  direction: Vec3,
}

struct HitResult {
  hit: bool,
  t: f32,
  point: Vec3,
  normal: Vec3,
  materialIndex: u32,
  frontFace: bool,
}

struct GBufferPixel {
  albedo: vec3<f32>,
  normal: vec3<f32>,
  position: vec3<f32>,
  depth: f32,
  roughness: f32,
  metallic: f32,
}

struct Reservoir {
  position: vec3<f32>,
  normal: vec3<f32>,
  color: vec3<f32>,
  throughput: vec3<f32>,
  weight: f32,
  M: f32,
  W: f32,
  age: u32,
  valid: u32,
}

@group(0) @binding(0) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(1) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(2) var<storage, read> materials: array<Material>;
@group(0) @binding(3) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(4) var<storage, read> triangleIndices: array<u32>;
@group(0) @binding(5) var<uniform> camera: Camera;
@group(0) @binding(6) var<uniform> settings: RenderSettings;
@group(0) @binding(7) var<storage, read_write> accumulator: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> sampleCount: array<u32>;
@group(0) @binding(9) var<storage, read_write> variance: array<f32>;
@group(0) @binding(10) var<storage, read_write> borderWeights: array<f32>;
@group(0) @binding(11) var<storage, read_write> gbuffer: array<GBufferPixel>;
@group(0) @binding(12) var<storage, read_write> reservoirs: array<Reservoir>;
@group(0) @binding(13) var<storage, read_write> motionVectors: array<vec2<f32>>;

fn vec3_add(a: Vec3, b: Vec3) -> Vec3 {
  return Vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

fn vec3_sub(a: Vec3, b: Vec3) -> Vec3 {
  return Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

fn vec3_mul(a: Vec3, b: f32) -> Vec3 {
  return Vec3(a.x * b, a.y * b, a.z * b);
}

fn vec3_mul_vec3(a: Vec3, b: Vec3) -> Vec3 {
  return Vec3(a.x * b.x, a.y * b.y, a.z * b.z);
}

fn vec3_dot(a: Vec3, b: Vec3) -> f32 {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

fn vec3_cross(a: Vec3, b: Vec3) -> Vec3 {
  return Vec3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}

fn vec3_length(v: Vec3) -> f32 {
  return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

fn vec3_normalize(v: Vec3) -> Vec3 {
  let len = vec3_length(v);
  if (len == 0.0) { return Vec3(0.0, 0.0, 0.0); }
  return vec3_mul(v, 1.0 / len);
}

fn wang_hash(seed: u32) -> u32 {
  var s = seed;
  s = (s ^ 61u) ^ (s >> 16u);
  s = s + (s << 3u);
  s = s ^ (s >> 4u);
  s = s * 0x27d4eb2du;
  s = s ^ (s >> 15u);
  return s;
}

fn random_uint(seed: ptr<function, u32>) -> u32 {
  *seed = wang_hash(*seed);
  return *seed;
}

fn random_float(seed: ptr<function, u32>) -> f32 {
  let v = random_uint(seed);
  return f32(v) / f32(0xffffffffu);
}

fn calculate_border_weight(y: u32, startY: u32, endY: u32, overlap: u32) -> f32 {
  let fy = f32(y);
  let fStart = f32(startY);
  let fEnd = f32(endY);
  let fOverlap = f32(overlap);
  
  var topWeight = 1.0;
  if (fy < fStart + fOverlap) {
    topWeight = (fy - fStart) / fOverlap;
  }
  
  var bottomWeight = 1.0;
  if (fy > fEnd - fOverlap - 1.0) {
    bottomWeight = (fEnd - 1.0 - fy) / fOverlap;
  }
  
  var weight = min(topWeight, bottomWeight);
  weight = smoothstep(0.0, 1.0, weight);
  return max(weight, 0.01);
}

fn random_in_unit_sphere(seed: ptr<function, u32>) -> Vec3 {
  var p: Vec3;
  loop {
    p = Vec3(
      random_float(seed) * 2.0 - 1.0,
      random_float(seed) * 2.0 - 1.0,
      random_float(seed) * 2.0 - 1.0
    );
    if (vec3_dot(p, p) < 1.0) { break; }
  }
  return p;
}

fn random_unit_vector(seed: ptr<function, u32>) -> Vec3 {
  return vec3_normalize(random_in_unit_sphere(seed));
}

fn intersect_sphere(ray: Ray, sphere: Sphere) -> HitResult {
  var result: HitResult;
  result.hit = false;
  
  let oc = vec3_sub(ray.origin, sphere.center);
  let a = vec3_dot(ray.direction, ray.direction);
  let half_b = vec3_dot(oc, ray.direction);
  let c = vec3_dot(oc, oc) - sphere.radius * sphere.radius;
  let discriminant = half_b * half_b - a * c;
  
  if (discriminant < 0.0) {
    return result;
  }
  
  let sqrt_d = sqrt(discriminant);
  var t = (-half_b - sqrt_d) / a;
  
  if (t < 0.001 || t > 10000.0) {
    t = (-half_b + sqrt_d) / a;
    if (t < 0.001 || t > 10000.0) {
      return result;
    }
  }
  
  result.hit = true;
  result.t = t;
  result.point = vec3_add(ray.origin, vec3_mul(ray.direction, t));
  let outward_normal = vec3_normalize(vec3_sub(result.point, sphere.center));
  result.frontFace = vec3_dot(ray.direction, outward_normal) < 0.0;
  result.normal = if result.frontFace { outward_normal } else { vec3_mul(outward_normal, -1.0) };
  result.materialIndex = sphere.materialIndex;
  
  return result;
}

fn intersect_triangle(ray: Ray, tri: Triangle) -> HitResult {
  var result: HitResult;
  result.hit = false;
  
  let e1 = vec3_sub(tri.v1, tri.v0);
  let e2 = vec3_sub(tri.v2, tri.v0);
  let h = vec3_cross(ray.direction, e2);
  let a = vec3_dot(e1, h);
  
  if (a > -0.0001 && a < 0.0001) {
    return result;
  }
  
  let f = 1.0 / a;
  let s = vec3_sub(ray.origin, tri.v0);
  let u = f * vec3_dot(s, h);
  
  if (u < 0.0 || u > 1.0) {
    return result;
  }
  
  let q = vec3_cross(s, e1);
  let v = f * vec3_dot(ray.direction, q);
  
  if (v < 0.0 || u + v > 1.0) {
    return result;
  }
  
  let t = f * vec3_dot(e2, q);
  
  if (t < 0.001 || t > 10000.0) {
    return result;
  }
  
  result.hit = true;
  result.t = t;
  result.point = vec3_add(ray.origin, vec3_mul(ray.direction, t));
  result.frontFace = vec3_dot(ray.direction, tri.normal) < 0.0;
  result.normal = if result.frontFace { tri.normal } else { vec3_mul(tri.normal, -1.0) };
  result.materialIndex = tri.materialIndex;
  
  return result;
}

fn intersect_aabb(ray: Ray, min: Vec3, max: Vec3) -> bool {
  var tmin = (min.x - ray.origin.x) / ray.direction.x;
  var tmax = (max.x - ray.origin.x) / ray.direction.x;
  
  if (tmin > tmax) { let temp = tmin; tmin = tmax; tmax = temp; }
  
  var tymin = (min.y - ray.origin.y) / ray.direction.y;
  var tymax = (max.y - ray.origin.y) / ray.direction.y;
  
  if (tymin > tymax) { let temp = tymin; tymin = tymax; tymax = temp; }
  
  if ((tmin > tymax) || (tymin > tmax)) { return false; }
  
  if (tymin > tmin) { tmin = tymin; }
  if (tymax < tmax) { tmax = tymax; }
  
  var tzmin = (min.z - ray.origin.z) / ray.direction.z;
  var tzmax = (max.z - ray.origin.z) / ray.direction.z;
  
  if (tzmin > tzmax) { let temp = tzmin; tzmin = tzmax; tzmax = temp; }
  
  if ((tmin > tzmax) || (tzmin > tmax)) { return false; }
  
  if (tzmin > tmin) { tmin = tzmin; }
  if (tzmax < tmax) { tmax = tzmax; }
  
  return tmax > 0.001;
}

fn intersect_scene(ray: Ray) -> HitResult {
  var closest: HitResult;
  closest.hit = false;
  closest.t = 10000.0;
  
  for (var i: u32 = 0u; i < arrayLength(&spheres); i = i + 1u) {
    let hit = intersect_sphere(ray, spheres[i]);
    if (hit.hit && hit.t < closest.t) {
      closest = hit;
    }
  }
  
  if (arrayLength(&bvhNodes) > 0u) {
    var nodeStack: array<i32, 64>;
    var stackPtr = 0;
    nodeStack[stackPtr] = 0i32;
    stackPtr = stackPtr + 1;
    
    while (stackPtr > 0) {
      stackPtr = stackPtr - 1;
      let nodeIdx = u32(nodeStack[stackPtr]);
      if (nodeIdx >= arrayLength(&bvhNodes)) { continue; }
      
      let node = bvhNodes[nodeIdx];
      
      if (!intersect_aabb(ray, node.min, node.max)) {
        continue;
      }
      
      if (node.triangleCount > 0i32) {
        for (var i: i32 = 0i32; i < node.triangleCount; i = i + 1i32) {
          let triIdx = triangleIndices[u32(node.triangleStart + i)];
          if (triIdx >= u32(arrayLength(&triangles))) { continue; }
          
          let hit = intersect_triangle(ray, triangles[triIdx]);
          if (hit.hit && hit.t < closest.t) {
            closest = hit;
          }
        }
      } else {
        if (node.leftChild >= 0i32) {
          nodeStack[stackPtr] = node.leftChild;
          stackPtr = stackPtr + 1;
        }
        if (node.rightChild >= 0i32) {
          nodeStack[stackPtr] = node.rightChild;
          stackPtr = stackPtr + 1;
        }
      }
    }
  }
  
  return closest;
}

fn fresnel_schlick(cosTheta: f32, f0: f32) -> f32 {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

fn reflect(v: Vec3, n: Vec3) -> Vec3 {
  return vec3_sub(v, vec3_mul(n, 2.0 * vec3_dot(v, n)));
}

fn refract(uv: Vec3, n: Vec3, etai_over_etat: f32) -> Vec3 {
  let cos_theta = min(vec3_dot(vec3_mul(uv, -1.0), n), 1.0);
  let r_out_perp = vec3_mul(vec3_add(uv, vec3_mul(n, cos_theta)), etai_over_etat);
  let r_out_parallel = vec3_mul(n, -sqrt(abs(1.0 - vec3_dot(r_out_perp, r_out_perp))));
  return vec3_add(r_out_perp, r_out_parallel);
}

fn trace_ray(ray: Ray, seed: ptr<function, u32>) -> Vec3 {
  var color = Vec3(0.0, 0.0, 0.0);
  var throughput = Vec3(1.0, 1.0, 1.0);
  var currentRay = ray;
  
  for (var bounce: u32 = 0u; bounce < settings.maxBounces; bounce = bounce + 1u) {
    let hit = intersect_scene(currentRay);
    
    if (!hit.hit) {
      let t = 0.5 * (currentRay.direction.y + 1.0);
      let sky = vec3_add(
        vec3_mul(Vec3(1.0, 1.0, 1.0), 1.0 - t),
        vec3_mul(Vec3(0.5, 0.7, 1.0), t)
      );
      color = vec3_add(color, vec3_mul_vec3(throughput, sky));
      break;
    }
    
    let mat = materials[hit.materialIndex];
    color = vec3_add(color, vec3_mul_vec3(throughput, mat.emission));
    
    let f0 = mix(0.04, 1.0, mat.metallic);
    let cosTheta = min(vec3_dot(vec3_mul(currentRay.direction, -1.0), hit.normal), 1.0);
    let reflectProb = fresnel_schlick(cosTheta, f0);
    
    let r = random_float(seed);
    
    if (mat.transmission > 0.5 && r < mat.transmission) {
      let refractionRatio = if hit.frontFace { 1.0 / mat.ior } else { mat.ior };
      currentRay.origin = hit.point;
      currentRay.direction = vec3_normalize(refract(currentRay.direction, hit.normal, refractionRatio));
      throughput = vec3_mul_vec3(throughput, mat.albedo);
    } else if (r < reflectProb + mat.metallic * 0.5) {
      let fuzz = mat.roughness * mat.roughness;
      var reflected = reflect(currentRay.direction, hit.normal);
      if (fuzz > 0.0) {
        reflected = vec3_normalize(vec3_add(reflected, vec3_mul(random_in_unit_sphere(seed), fuzz)));
      }
      currentRay.origin = hit.point;
      currentRay.direction = reflected;
      let specularColor = mix(Vec3(1.0, 1.0, 1.0), mat.albedo, mat.metallic);
      throughput = vec3_mul_vec3(throughput, specularColor);
    } else {
      var scatterDir = vec3_add(hit.normal, random_unit_vector(seed));
      if (abs(scatterDir.x) < 0.0001 && abs(scatterDir.y) < 0.0001 && abs(scatterDir.z) < 0.0001) {
        scatterDir = hit.normal;
      }
      currentRay.origin = hit.point;
      currentRay.direction = vec3_normalize(scatterDir);
      throughput = vec3_mul_vec3(throughput, mat.albedo);
    }
    
    let p = max(max(throughput.x, throughput.y), throughput.z);
    if (random_float(seed) > p) {
      break;
    }
    throughput = vec3_mul(throughput, 1.0 / p);
  }
  
  return color;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let localY = global_id.y;
  let y = localY + settings.globalStartY;
  let x = global_id.x;
  let localHeight = settings.globalEndY - settings.globalStartY;
  
  if (x >= settings.width || localY >= localHeight) {
    return;
  }
  
  let localIdx = localY * settings.width + x;
  
  var seed = wang_hash(x * 1973u + y * 9277u + settings.frame * 26699u);
  seed = seed | 1u;
  
  var samplesToTake = settings.samplesPerPixel;
  
  if (settings.adaptiveSampling == 1u && sampleCount[localIdx] > 16u) {
    let v = variance[localIdx];
    if (v < 0.001) {
      samplesToTake = max(1u, settings.samplesPerPixel / 4u);
    } else if (v < 0.01) {
      samplesToTake = max(4u, settings.samplesPerPixel / 2u);
    }
  }
  
  var color = vec3<f32>(0.0, 0.0, 0.0);
  
  for (var s: u32 = 0u; s < samplesToTake; s = s + 1u) {
    let u = (f32(x) + random_float(&seed)) / f32(settings.width);
    let v = (f32(y) + random_float(&seed)) / f32(settings.height);
    
    let aspect = f32(settings.width) / f32(settings.height);
    let scale = tan(radians(camera.fov) * 0.5);
    
    var rayDir = Vec3(
      (2.0 * u - 1.0) * aspect * scale,
      (1.0 - 2.0 * v) * scale,
      -1.0
    );
    
    rayDir = vec3_normalize(vec3_add(
      vec3_add(
        vec3_mul(camera.right, rayDir.x),
        vec3_mul(camera.up, rayDir.y)
      ),
      camera.forward
    ));
    
    let ray = Ray(camera.position, rayDir);
    let sample = trace_ray(ray, &seed);
    color = color + vec3<f32>(sample.x, sample.y, sample.z);
  }
  
  color = color / f32(samplesToTake);
  
  let oldCount = f32(sampleCount[localIdx]);
  let newCount = oldCount + 1.0;
  let oldColor = vec3<f32>(accumulator[localIdx].x, accumulator[localIdx].y, accumulator[localIdx].z);
  let newColor = (oldColor * oldCount + color) / newCount;
  
  if (settings.adaptiveSampling == 1u) {
    let diff = length(newColor - oldColor);
    variance[localIdx] = (variance[localIdx] * oldCount + diff * diff) / newCount;
  }
  
  let weight = calculate_border_weight(y, settings.globalStartY, settings.globalEndY, settings.borderOverlap);
  
  accumulator[localIdx] = vec4<f32>(newColor, weight);
  borderWeights[localIdx] = weight;
  sampleCount[localIdx] = u32(newCount);
  
  let cam_pos = vec3<f32>(camera.position.x, camera.position.y, camera.position.z);
  
  var first_ray_dir = Vec3(
    (2.0 * (f32(x) + 0.5) / f32(settings.width) - 1.0) * (f32(settings.width) / f32(settings.height)) * tan(radians(camera.fov) * 0.5),
    (1.0 - 2.0 * (f32(y) + 0.5) / f32(settings.height)) * tan(radians(camera.fov) * 0.5),
    -1.0
  );
  
  first_ray_dir = vec3_normalize(vec3_add(
    vec3_add(
      vec3_mul(camera.right, first_ray_dir.x),
      vec3_mul(camera.up, first_ray_dir.y)
    ),
    camera.forward
  ));
  
  let first_ray = Ray(camera.position, first_ray_dir);
  let first_hit = intersect_scene(first_ray);
  
  if (first_hit.hit) {
    let mat = materials[first_hit.materialIndex];
    
    var g: GBufferPixel;
    g.albedo = vec3<f32>(mat.albedo.x, mat.albedo.y, mat.albedo.z);
    g.normal = vec3<f32>(first_hit.normal.x, first_hit.normal.y, first_hit.normal.z);
    g.position = vec3<f32>(first_hit.point.x, first_hit.point.y, first_hit.point.z);
    g.depth = length(vec3<f32>(first_hit.point.x, first_hit.point.y, first_hit.point.z) - cam_pos);
    g.roughness = mat.roughness;
    g.metallic = mat.metallic;
    
    gbuffer[localIdx] = g;
    
    var r: Reservoir;
    r.position = g.position;
    r.normal = g.normal;
    r.color = newColor;
    r.throughput = vec3<f32>(1.0, 1.0, 1.0);
    r.weight = 1.0;
    r.M = 1.0;
    r.W = 1.0;
    r.age = 0u;
    r.valid = 1u;
    
    reservoirs[localIdx] = r;
  } else {
    var g: GBufferPixel;
    g.albedo = vec3<f32>(0.5, 0.7, 1.0);
    g.normal = vec3<f32>(0.0, 1.0, 0.0);
    g.position = cam_pos + vec3<f32>(first_ray_dir.x, first_ray_dir.y, first_ray_dir.z) * 1000.0;
    g.depth = 1000.0;
    g.roughness = 1.0;
    g.metallic = 0.0;
    
    gbuffer[localIdx] = g;
    
    var r: Reservoir;
    r.valid = 0u;
    r.weight = 0.0;
    r.M = 0.0;
    r.W = 0.0;
    
    reservoirs[localIdx] = r;
  }
  
  motionVectors[localIdx] = vec2<f32>(0.0, 0.0);
}
