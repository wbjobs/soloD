use rand::Rng;
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TileType {
    Floor,
    Wall,
    Stairs,
}

#[derive(Debug, Clone)]
pub struct Map {
    pub width: usize,
    pub height: usize,
    pub tiles: Vec<TileType>,
    pub player_start: (usize, usize),
    pub stairs_pos: (usize, usize),
    pub revealed: HashSet<(usize, usize)>,
}

impl Map {
    pub fn new(width: usize, height: usize) -> Self {
        let mut tiles = vec![TileType::Wall; width * height];
        let mut rng = rand::thread_rng();
        
        let num_rooms = 8 + rng.gen_range(0..5);
        let mut rooms = Vec::new();
        
        for _ in 0..num_rooms {
            let room_width = rng.gen_range(3..7);
            let room_height = rng.gen_range(3..7);
            let room_x = rng.gen_range(1..width - room_width - 1);
            let room_y = rng.gen_range(1..height - room_height - 1);
            
            let new_room = (room_x, room_y, room_width, room_height);
            let mut overlaps = false;
            
            for &(x, y, w, h) in &rooms {
                if room_x < x + w + 1 && room_x + room_width + 1 > x &&
                   room_y < y + h + 1 && room_y + room_height + 1 > y {
                    overlaps = true;
                    break;
                }
            }
            
            if !overlaps {
                Self::carve_room(&mut tiles, width, &new_room);
                if let Some(&(prev_x, prev_y, prev_w, prev_h)) = rooms.last() {
                    let prev_center = (prev_x + prev_w / 2, prev_y + prev_h / 2);
                    let new_center = (room_x + room_width / 2, room_y + room_height / 2);
                    Self::carve_corridor(&mut tiles, width, prev_center, new_center);
                }
                rooms.push(new_room);
            }
        }
        
        let player_start = if let Some(&(x, y, w, h)) = rooms.first() {
            (x + w / 2, y + h / 2)
        } else {
            (width / 2, height / 2)
        };
        
        let stairs_pos = if let Some(&(x, y, w, h)) = rooms.last() {
            (x + w / 2, y + h / 2)
        } else {
            (width - 2, height - 2)
        };
        
        tiles[stairs_pos.1 * width + stairs_pos.0] = TileType::Stairs;
        
        Map {
            width,
            height,
            tiles,
            player_start,
            stairs_pos,
            revealed: HashSet::new(),
        }
    }
    
    fn carve_room(tiles: &mut Vec<TileType>, width: usize, room: &(usize, usize, usize, usize)) {
        let (x, y, w, h) = *room;
        for dy in 0..h {
            for dx in 0..w {
                let idx = (y + dy) * width + (x + dx);
                tiles[idx] = TileType::Floor;
            }
        }
    }
    
    fn carve_corridor(tiles: &mut Vec<TileType>, width: usize, start: (usize, usize), end: (usize, usize)) {
        let (mut x, mut y) = start;
        let (end_x, end_y) = end;
        
        while x != end_x {
            let idx = y * width + x;
            tiles[idx] = TileType::Floor;
            if x < end_x { x += 1 } else { x -= 1 }
        }
        
        while y != end_y {
            let idx = y * width + x;
            tiles[idx] = TileType::Floor;
            if y < end_y { y += 1 } else { y -= 1 }
        }
        
        let idx = end_y * width + end_x;
        tiles[idx] = TileType::Floor;
    }
    
    pub fn get_tile(&self, x: usize, y: usize) -> TileType {
        if x >= self.width || y >= self.height {
            TileType::Wall
        } else {
            self.tiles[y * self.width + x]
        }
    }
    
    pub fn is_walkable(&self, x: usize, y: usize) -> bool {
        matches!(self.get_tile(x, y), TileType::Floor | TileType::Stairs)
    }
    
    pub fn get_surrounding_tiles(&self, x: usize, y: usize) -> [TileType; 4] {
        [
            if y > 0 { self.get_tile(x, y - 1) } else { TileType::Wall },
            if x < self.width - 1 { self.get_tile(x + 1, y) } else { TileType::Wall },
            if y < self.height - 1 { self.get_tile(x, y + 1) } else { TileType::Wall },
            if x > 0 { self.get_tile(x - 1, y) } else { TileType::Wall },
        ]
    }
}
