use crate::map::Map;
use rand::Rng;
use std::collections::VecDeque;

#[derive(Debug, Clone)]
pub struct Enemy {
    pub id: u32,
    pub x: usize,
    pub y: usize,
    pub hp: i32,
    pub max_hp: i32,
    pub damage: i32,
    pub name: String,
    pub aggro: bool,
}

impl Enemy {
    pub fn new(id: u32, x: usize, y: usize, enemy_type: &str) -> Self {
        match enemy_type {
            "goblin" => Enemy {
                id,
                x,
                y,
                hp: 15,
                max_hp: 15,
                damage: 5,
                name: "哥布林".to_string(),
                aggro: false,
            },
            "skeleton" => Enemy {
                id,
                x,
                y,
                hp: 20,
                max_hp: 20,
                damage: 8,
                name: "骷髅兵".to_string(),
                aggro: false,
            },
            _ => Enemy {
                id,
                x,
                y,
                hp: 10,
                max_hp: 10,
                damage: 3,
                name: "老鼠".to_string(),
                aggro: false,
            },
        }
    }
    
    pub fn distance_to(&self, x: usize, y: usize) -> f32 {
        let dx = (self.x as i32 - x as i32).abs() as f32;
        let dy = (self.y as i32 - y as i32).abs() as f32;
        (dx * dx + dy * dy).sqrt()
    }
    
    pub fn update_ai(&mut self, player_x: usize, player_y: usize, map: &Map) {
        let distance = self.distance_to(player_x, player_y);
        
        if distance <= 5.0 {
            self.aggro = true;
        }
        
        if self.aggro && distance > 1.5 {
            self.move_towards(player_x, player_y, map);
        }
    }
    
    fn move_towards(&mut self, target_x: usize, target_y: usize, map: &Map) {
        let mut rng = rand::thread_rng();
        
        let directions = [
            (0, -1),
            (1, 0),
            (0, 1),
            (-1, 0),
        ];
        
        let mut best_dir = None;
        let mut best_dist = f32::INFINITY;
        
        for &(dx, dy) in &directions {
            let new_x = (self.x as i32 + dx) as usize;
            let new_y = (self.y as i32 + dy) as usize;
            
            if map.is_walkable(new_x, new_y) {
                let dist = ((new_x as i32 - target_x as i32).pow(2) + 
                           (new_y as i32 - target_y as i32).pow(2)) as f32;
                if dist < best_dist {
                    best_dist = dist;
                    best_dir = Some((dx, dy));
                }
            }
        }
        
        if let Some((dx, dy)) = best_dir {
            if rng.gen::<f32>() < 0.8 {
                self.x = (self.x as i32 + dx) as usize;
                self.y = (self.y as i32 + dy) as usize;
            }
        }
    }
}

pub fn spawn_enemies(map: &Map, count: usize) -> Vec<Enemy> {
    let mut enemies = Vec::new();
    let mut rng = rand::thread_rng();
    let mut enemy_id = 0;
    
    let enemy_types = ["goblin", "skeleton", "rat"];
    
    for _ in 0..count {
        let mut spawned = false;
        let mut attempts = 0;
        
        while !spawned && attempts < 100 {
            let x = rng.gen_range(1..map.width - 1);
            let y = rng.gen_range(1..map.height - 1);
            
            let dist_to_player = ((x as i32 - map.player_start.0 as i32).pow(2) + 
                                (y as i32 - map.player_start.1 as i32).pow(2)) as f32;
            
            if map.is_walkable(x, y) && dist_to_player > 5.0 {
                let enemy_type = enemy_types[rng.gen_range(0..enemy_types.len())];
                enemies.push(Enemy::new(enemy_id, x, y, enemy_type));
                enemy_id += 1;
                spawned = true;
            }
            
            attempts += 1;
        }
    }
    
    enemies
}
