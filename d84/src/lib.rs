use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
    pub old_x: f64,
    pub old_y: f64,
    pub pinned: bool,
    pub mass: f64,
}

#[wasm_bindgen]
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct Spring {
    pub p1_idx: usize,
    pub p2_idx: usize,
    pub rest_length: f64,
    pub stiffness: f64,
}

#[wasm_bindgen]
pub struct SoftBody {
    points: Vec&lt;Point&gt;,
    springs: Vec&lt;Spring&gt;,
    gravity: f64,
    damping: f64,
    point_radius: f64,
    width: f64,
    height: f64,
    max_stretch_ratio: f64,
    max_correction_ratio: f64,
    friction: f64,
}

#[wasm_bindgen]
impl SoftBody {
    pub fn new(center_x: f64, center_y: f64, size: usize, spacing: f64) -&gt; SoftBody {
        console_error_panic_hook::set_once();
        
        let mut points = Vec::new();
        let mut springs = Vec::new();
        
        let start_x = center_x - (size as f64 * spacing) / 2.0;
        let start_y = center_y - (size as f64 * spacing) / 2.0;
        
        for j in 0..size {
            for i in 0..size {
                let x = start_x + i as f64 * spacing;
                let y = start_y + j as f64 * spacing;
                points.push(Point {
                    x,
                    y,
                    old_x: x,
                    old_y: y,
                    pinned: false,
                    mass: 1.0,
                });
            }
        }
        
        let stiffness = 0.5;
        let diagonal_stiffness = 0.3;
        
        for j in 0..size {
            for i in 0..size {
                let idx = j * size + i;
                
                if i &lt; size - 1 {
                    springs.push(Spring {
                        p1_idx: idx,
                        p2_idx: idx + 1,
                        rest_length: spacing,
                        stiffness,
                    });
                }
                
                if j &lt; size - 1 {
                    springs.push(Spring {
                        p1_idx: idx,
                        p2_idx: idx + size,
                        rest_length: spacing,
                        stiffness,
                    });
                }
                
                if i &lt; size - 1 &amp;&amp; j &lt; size - 1 {
                    springs.push(Spring {
                        p1_idx: idx,
                        p2_idx: idx + size + 1,
                        rest_length: spacing * 2.0_f64.sqrt(),
                        stiffness: diagonal_stiffness,
                    });
                    springs.push(Spring {
                        p1_idx: idx + 1,
                        p2_idx: idx + size,
                        rest_length: spacing * 2.0_f64.sqrt(),
                        stiffness: diagonal_stiffness,
                    });
                }
                
                if i &lt; size - 2 {
                    springs.push(Spring {
                        p1_idx: idx,
                        p2_idx: idx + 2,
                        rest_length: spacing * 2.0,
                        stiffness: stiffness * 0.5,
                    });
                }
                if j &lt; size - 2 {
                    springs.push(Spring {
                        p1_idx: idx,
                        p2_idx: idx + size * 2,
                        rest_length: spacing * 2.0,
                        stiffness: stiffness * 0.5,
                    });
                }
            }
        }
        
        SoftBody {
            points,
            springs,
            gravity: 0.5,
            damping: 0.99,
            point_radius: spacing * 0.4,
            width: 2000.0,
            height: 1500.0,
            max_stretch_ratio: 1.5,
            max_correction_ratio: 0.2,
            friction: 0.01,
        }
    }
    
    pub fn update(&amp;mut self, dt: f64, iterations: usize) {
        let max_velocity = 50.0;
        let friction = self.friction;
        
        for point in &amp;mut self.points {
            if !point.pinned {
                let mut vx = (point.x - point.old_x) * self.damping;
                let mut vy = (point.y - point.old_y) * self.damping;
                
                let speed = (vx * vx + vy * vy).sqrt();
                if speed &gt; max_velocity {
                    let scale = max_velocity / speed;
                    vx *= scale;
                    vy *= scale;
                }
                
                vx *= 1.0 - friction;
                vy *= 1.0 - friction;
                
                point.old_x = point.x;
                point.old_y = point.y;
                
                point.x += vx;
                point.y += vy + self.gravity * dt * dt;
            }
        }
        
        for _ in 0..iterations {
            self.solve_springs();
            self.solve_collisions();
            self.solve_boundaries();
        }
    }
    
    fn solve_springs(&amp;mut self) {
        let max_stretch = self.max_stretch_ratio;
        let max_correction = self.max_correction_ratio;
        
        for spring in &amp;self.springs {
            let p1 = self.points[spring.p1_idx];
            let p2 = self.points[spring.p2_idx];
            
            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let dist = (dx * dx + dy * dy).sqrt();
            
            if dist &lt; 0.0001 {
                continue;
            }
            
            let max_length = spring.rest_length * max_stretch;
            let min_length = spring.rest_length * (2.0 - max_stretch);
            
            let mut corrected_dist = dist;
            if dist &gt; max_length {
                corrected_dist = max_length;
            } else if dist &lt; min_length {
                corrected_dist = min_length;
            }
            
            let diff = (corrected_dist - spring.rest_length) / dist * spring.stiffness;
            let mut offset_x = dx * diff * 0.5;
            let mut offset_y = dy * diff * 0.5;
            
            let max_offset = spring.rest_length * max_correction;
            let offset_mag = (offset_x * offset_x + offset_y * offset_y).sqrt();
            if offset_mag &gt; max_offset {
                let scale = max_offset / offset_mag;
                offset_x *= scale;
                offset_y *= scale;
            }
            
            if !self.points[spring.p1_idx].pinned {
                self.points[spring.p1_idx].x += offset_x;
                self.points[spring.p1_idx].y += offset_y;
            }
            if !self.points[spring.p2_idx].pinned {
                self.points[spring.p2_idx].x -= offset_x;
                self.points[spring.p2_idx].y -= offset_y;
            }
        }
    }
    
    fn solve_collisions(&amp;mut self) {
        let cell_size = self.point_radius * 4.0;
        let grid_width = (self.width / cell_size) as usize + 2;
        let grid_height = (self.height / cell_size) as usize + 2;
        
        let mut grid: Vec&lt;Vec&lt;usize&gt;&gt; = vec![Vec::new(); grid_width * grid_height];
        
        for (idx, point) in self.points.iter().enumerate() {
            let gx = (point.x / cell_size).max(0.0).min((grid_width - 1) as f64) as usize;
            let gy = (point.y / cell_size).max(0.0).min((grid_height - 1) as f64) as usize;
            grid[gy * grid_width + gx].push(idx);
        }
        
        let min_dist = self.point_radius * 2.0;
        let repulsion = 0.3;
        
        for gy in 0..grid_height {
            for gx in 0..grid_width {
                let cell_idx = gy * grid_width + gx;
                
                for dy in 0..=1 {
                    for dx in 0..=1 {
                        let ngx = gx + dx;
                        let ngy = gy + dy;
                        if ngx &gt;= grid_width || ngy &gt;= grid_height {
                            continue;
                        }
                        let neighbor_idx = ngy * grid_width + ngx;
                        
                        for &amp;i in &amp;grid[cell_idx] {
                            for &amp;j in &amp;grid[neighbor_idx] {
                                if i &gt;= j {
                                    continue;
                                }
                                
                                let pi = self.points[i];
                                let pj = self.points[j];
                                
                                let dx = pj.x - pi.x;
                                let dy = pj.y - pi.y;
                                let dist_sq = dx * dx + dy * dy;
                                
                                if dist_sq &lt; min_dist * min_dist &amp;&amp; dist_sq &gt; 0.0001 {
                                    let dist = dist_sq.sqrt();
                                    let overlap = (min_dist - dist) / dist * repulsion;
                                    let ox = dx * overlap * 0.5;
                                    let oy = dy * overlap * 0.5;
                                    
                                    if !self.points[i].pinned {
                                        self.points[i].x -= ox;
                                        self.points[i].y -= oy;
                                    }
                                    if !self.points[j].pinned {
                                        self.points[j].x += ox;
                                        self.points[j].y += oy;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    fn solve_boundaries(&amp;mut self) {
        let margin = self.point_radius;
        let ground = self.height - margin;
        
        for point in &amp;mut self.points {
            if point.x &lt; margin {
                point.x = margin;
            }
            if point.x &gt; self.width - margin {
                point.x = self.width - margin;
            }
            if point.y &lt; margin {
                point.y = margin;
            }
            if point.y &gt; ground {
                point.y = ground;
                point.old_y = point.y + (point.y - point.old_y) * 0.5;
            }
        }
    }
    
    pub fn apply_force(&amp;mut self, x: f64, y: f64, radius: f64, fx: f64, fy: f64) {
        for point in &amp;mut self.points {
            let dx = point.x - x;
            let dy = point.y - y;
            let dist = (dx * dx + dy * dy).sqrt();
            
            if dist &lt; radius {
                let strength = 1.0 - dist / radius;
                point.x += fx * strength;
                point.y += fy * strength;
            }
        }
    }
    
    pub fn get_points(&amp;self) -&gt; JsValue {
        JsValue::from_serde(&amp;self.points).unwrap()
    }
    
    pub fn get_springs(&amp;self) -&gt; JsValue {
        JsValue::from_serde(&amp;self.springs).unwrap()
    }
    
    pub fn reset(&amp;mut self, center_x: f64, center_y: f64, size: usize, spacing: f64) {
        let start_x = center_x - (size as f64 * spacing) / 2.0;
        let start_y = center_y - (size as f64 * spacing) / 2.0;
        
        let mut idx = 0;
        for j in 0..size {
            for i in 0..size {
                let x = start_x + i as f64 * spacing;
                let y = start_y + j as f64 * spacing;
                if idx &lt; self.points.len() {
                    self.points[idx].x = x;
                    self.points[idx].y = y;
                    self.points[idx].old_x = x;
                    self.points[idx].old_y = y;
                }
                idx += 1;
            }
        }
    }
    
    pub fn set_dimensions(&amp;mut self, width: f64, height: f64) {
        self.width = width;
        self.height = height;
    }
    
    pub fn set_damping(&amp;mut self, damping: f64) {
        self.damping = damping.clamp(0.0, 1.0);
    }
    
    pub fn set_friction(&amp;mut self, friction: f64) {
        self.friction = friction.clamp(0.0, 1.0);
    }
    
    pub fn set_gravity(&amp;mut self, gravity: f64) {
        self.gravity = gravity;
    }
    
    pub fn set_stiffness(&amp;mut self, stiffness: f64) {
        for spring in &amp;mut self.springs {
            spring.stiffness = spring.stiffness / 0.5 * stiffness;
        }
    }
}
