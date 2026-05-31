use crate::enemy::{spawn_enemies, Enemy};
use crate::map::{Map, TileType};
use serde::Serialize;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
pub struct PlayerState {
    pub x: usize,
    pub y: usize,
    pub hp: i32,
    pub max_hp: i32,
    pub level: i32,
    pub exp: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnemyInfo {
    pub id: u32,
    pub name: String,
    pub distance: f32,
    pub direction: String,
    pub hp: i32,
    pub max_hp: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioFeedback {
    pub direction: String,
    pub sound_type: String,
    pub volume: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct DifficultyInfo {
    pub current_level: u32,
    pub map_size: usize,
    pub enemy_count: usize,
    pub player_hp: i32,
    pub last_clear_time: Option<f32>,
    pub best_clear_time: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameStateResponse {
    pub player: PlayerState,
    pub surrounding: [String; 4],
    pub enemies: Vec<EnemyInfo>,
    pub audio_feedback: Vec<AudioFeedback>,
    pub message: String,
    pub game_over: bool,
    pub victory: bool,
    pub game_time: f32,
    pub difficulty: DifficultyInfo,
}

pub struct GameState {
    pub map: Map,
    pub player: PlayerState,
    pub enemies: Vec<Enemy>,
    pub game_over: bool,
    pub victory: bool,
    pub start_time: Instant,
    pub difficulty_level: u32,
    pub last_clear_time: Option<f32>,
    pub best_clear_time: Option<f32>,
}

impl GameState {
    pub fn new() -> Self {
        Self::with_difficulty(1, None, None)
    }

    pub fn with_difficulty(
        difficulty_level: u32, 
        last_clear_time: Option<f32>,
        best_clear_time: Option<f32>
    ) -> Self {
        let (map_size, enemy_count, player_hp) = Self::calculate_difficulty_params(difficulty_level);
        
        let map = Map::new(map_size, map_size);
        let enemies = spawn_enemies(&map, enemy_count);
        
        GameState {
            map,
            player: PlayerState {
                x: map.player_start.0,
                y: map.player_start.1,
                hp: player_hp,
                max_hp: player_hp,
                level: 1,
                exp: 0,
            },
            enemies,
            game_over: false,
            victory: false,
            start_time: Instant::now(),
            difficulty_level,
            last_clear_time,
            best_clear_time,
        }
    }

    fn calculate_difficulty_params(difficulty_level: u32) -> (usize, usize, i32) {
        let level = difficulty_level.min(10);
        
        let base_size = 20 + (level * 3) as usize;
        let base_enemies = 5 + (level * 2) as usize;
        let base_hp = 50 + (level * 5) as i32;
        
        (base_size, base_enemies, base_hp)
    }

    pub fn calculate_next_difficulty(&self, clear_time: f32) -> u32 {
        let target_time = 60.0 + (self.difficulty_level as f32) * 15.0;
        let time_ratio = clear_time / target_time;
        
        let mut next_difficulty = self.difficulty_level;
        
        if time_ratio < 0.5 {
            next_difficulty += 2;
        } else if time_ratio < 0.8 {
            next_difficulty += 1;
        } else if time_ratio > 2.0 {
            next_difficulty = next_difficulty.saturating_sub(1);
        }
        
        next_difficulty.min(10).max(1)
    }

    pub fn get_elapsed_time(&self) -> f32 {
        self.start_time.elapsed().as_secs_f32()
    }

    pub fn get_difficulty_info(&self) -> DifficultyInfo {
        let (map_size, enemy_count, player_hp) = Self::calculate_difficulty_params(self.difficulty_level);
        
        DifficultyInfo {
            current_level: self.difficulty_level,
            map_size,
            enemy_count,
            player_hp,
            last_clear_time: self.last_clear_time,
            best_clear_time: self.best_clear_time,
        }
    }
    
    pub fn move_player(&mut self, dx: i32, dy: i32) -> GameStateResponse {
        if self.game_over {
            return self.get_response("游戏已结束".to_string(), Vec::new());
        }
        
        let new_x = (self.player.x as i32 + dx) as usize;
        let new_y = (self.player.y as i32 + dy) as usize;
        
        let mut message = String::new();
        let mut action_audio = Vec::new();
        
        if self.map.is_walkable(new_x, new_y) {
            self.player.x = new_x;
            self.player.y = new_y;
            
            let dir_name = match (dx, dy) {
                (0, -1) => "north",
                (1, 0) => "east",
                (0, 1) => "south",
                (-1, 0) => "west",
                _ => "unknown",
            };
            
            action_audio.push(AudioFeedback {
                direction: dir_name.to_string(),
                sound_type: "footstep".to_string(),
                volume: 1.0,
            });
            
            if self.map.get_tile(new_x, new_y) == TileType::Stairs {
                self.victory = true;
                message = "你找到了楼梯！恭喜通关！".to_string();
            }
            
            self.check_enemy_collision(&mut message);
            
            self.update_enemies(&mut message);
        } else {
            let dir_name = match (dx, dy) {
                (0, -1) => "north",
                (1, 0) => "east",
                (0, 1) => "south",
                (-1, 0) => "west",
                _ => "unknown",
            };
            
            action_audio.push(AudioFeedback {
                direction: dir_name.to_string(),
                sound_type: "wall_hit".to_string(),
                volume: 0.8,
            });
            
            message = "前方是墙壁，无法通过。".to_string();
        }
        
        self.get_response(message, action_audio)
    }
    
    fn check_enemy_collision(&mut self, message: &mut String) {
        let mut dead_enemies = Vec::new();
        
        for (idx, enemy) in self.enemies.iter_mut().enumerate() {
            if enemy.x == self.player.x && enemy.y == self.player.y {
                enemy.hp -= 10;
                message.push_str(&format!("你攻击了{}！", enemy.name));
                
                if enemy.hp <= 0 {
                    dead_enemies.push(idx);
                    self.player.exp += 10;
                    message.push_str(&format!("{}被击败了！", enemy.name));
                }
            }
        }
        
        for &idx in dead_enemies.iter().rev() {
            self.enemies.remove(idx);
        }
    }
    
    fn update_enemies(&mut self, message: &mut String) {
        for enemy in &mut self.enemies {
            enemy.update_ai(self.player.x, self.player.y, &self.map);
            
            if enemy.x == self.player.x && enemy.y == self.player.y {
                self.player.hp -= enemy.damage;
                message.push_str(&format!("{}攻击了你，造成{}点伤害！", enemy.name, enemy.damage));
                
                if self.player.hp <= 0 {
                    self.game_over = true;
                    message.push_str("你被击败了...");
                }
            }
        }
    }
    
    fn get_response(&self, message: String, action_audio: Vec<AudioFeedback>) -> GameStateResponse {
        let surrounding_tiles = self.map.get_surrounding_tiles(self.player.x, self.player.y);
        let surrounding = [
            Self::tile_to_string(surrounding_tiles[0]),
            Self::tile_to_string(surrounding_tiles[1]),
            Self::tile_to_string(surrounding_tiles[2]),
            Self::tile_to_string(surrounding_tiles[3]),
        ];
        
        let mut enemies: Vec<EnemyInfo> = self.enemies.iter()
            .map(|e| {
                let distance = e.distance_to(self.player.x, self.player.y);
                let direction = self.get_direction_to_enemy(e);
                EnemyInfo {
                    id: e.id,
                    name: e.name.clone(),
                    distance,
                    direction,
                    hp: e.hp,
                    max_hp: e.max_hp,
                }
            })
            .filter(|e| e.distance <= 8.0)
            .collect();
        
        enemies.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap());
        
        let mut audio_feedback = action_audio;
        for enemy in &enemies {
            if enemy.distance <= 5.0 {
                audio_feedback.push(AudioFeedback {
                    direction: enemy.direction.clone(),
                    sound_type: "enemy_growl".to_string(),
                    volume: (1.0 - enemy.distance / 5.0).max(0.2),
                });
            }
        }
        
        for (i, tile) in surrounding.iter().enumerate() {
            if tile == "wall" {
                let direction = match i {
                    0 => "north",
                    1 => "east",
                    2 => "south",
                    3 => "west",
                    _ => "unknown",
                };
                audio_feedback.push(AudioFeedback {
                    direction: direction.to_string(),
                    sound_type: "wall_echo".to_string(),
                    volume: 0.3,
                });
            }
        }
        
        GameStateResponse {
            player: self.player.clone(),
            surrounding,
            enemies,
            audio_feedback,
            message,
            game_over: self.game_over,
            victory: self.victory,
            game_time: self.get_elapsed_time(),
            difficulty: self.get_difficulty_info(),
        }
    }
    
    fn tile_to_string(tile: TileType) -> String {
        match tile {
            TileType::Floor => "floor".to_string(),
            TileType::Wall => "wall".to_string(),
            TileType::Stairs => "stairs".to_string(),
        }
    }
    
    fn get_direction_to_enemy(&self, enemy: &Enemy) -> String {
        let dx = enemy.x as i32 - self.player.x as i32;
        let dy = enemy.y as i32 - self.player.y as i32;
        
        let threshold = 0.5;
        let dx_abs = dx.abs() as f32;
        let dy_abs = dy.abs() as f32;
        
        if dx_abs > 0.0 && dy_abs > 0.0 {
            let ratio = dx_abs / dy_abs;
            if ratio > (1.0 + threshold) {
                if dx > 0 { "east".to_string() } else { "west".to_string() }
            } else if ratio < (1.0 - threshold) {
                if dy < 0 { "north".to_string() } else { "south".to_string() }
            } else {
                match (dx > 0, dy < 0) {
                    (true, true) => "northeast".to_string(),
                    (true, false) => "southeast".to_string(),
                    (false, true) => "northwest".to_string(),
                    (false, false) => "southwest".to_string(),
                }
            }
        } else if dx_abs > dy_abs {
            if dx > 0 { "east".to_string() } else { "west".to_string() }
        } else {
            if dy < 0 { "north".to_string() } else { "south".to_string() }
        }
    }
}
