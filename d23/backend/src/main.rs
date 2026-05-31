mod enemy;
mod game;
mod map;

use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use game::GameState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct GameProgress {
    current_difficulty: u32,
    last_clear_time: Option<f32>,
    best_clear_time: Option<f32>,
    total_games_played: u32,
    total_victories: u32,
}

struct AppState {
    game: Mutex<Option<GameState>>,
    progress: Mutex<GameProgress>,
}

#[derive(Deserialize)]
struct MoveRequest {
    direction: String,
}

async fn new_game(data: web::Data<AppState>) -> impl Responder {
    let mut game = data.game.lock().unwrap();
    let progress = data.progress.lock().unwrap();
    
    *game = Some(GameState::with_difficulty(
        progress.current_difficulty,
        progress.last_clear_time,
        progress.best_clear_time,
    ));
    
    let game_ref = game.as_ref().unwrap();
    let response = game_ref.get_response(format!("难度 {} 开始！地图大小: {}x{}, 敌人数量: {}", 
        progress.current_difficulty, game_ref.map.width, game_ref.map.height, game_ref.enemies.len()), Vec::new());
    
    HttpResponse::Ok().json(response)
}

async fn next_game(data: web::Data<AppState>) -> impl Responder {
    let mut game = data.game.lock().unwrap();
    let mut progress = data.progress.lock().unwrap();
    
    progress.total_games_played += 1;
    
    if let Some(ref current_game) = *game {
        if current_game.victory {
            let clear_time = current_game.get_elapsed_time();
            progress.total_victories += 1;
            progress.last_clear_time = Some(clear_time);
            
            if progress.best_clear_time.is_none() || Some(clear_time) < progress.best_clear_time {
                progress.best_clear_time = Some(clear_time);
            }
            
            let next_diff = current_game.calculate_next_difficulty(clear_time);
            progress.current_difficulty = next_diff;
        }
    }
    
    *game = Some(GameState::with_difficulty(
        progress.current_difficulty,
        progress.last_clear_time,
        progress.best_clear_time,
    ));
    
    let game_ref = game.as_ref().unwrap();
    let difficulty_info = game_ref.get_difficulty_info();
    
    let message = if game_ref.difficulty_level > 1 {
        format!("难度提升到 {}！地图大小: {}x{}, 敌人数量: {}", 
            difficulty_info.current_level, difficulty_info.map_size, difficulty_info.map_size, difficulty_info.enemy_count)
    } else {
        format!("新游戏开始！难度: {}, 地图大小: {}x{}, 敌人数量: {}", 
            difficulty_info.current_level, difficulty_info.map_size, difficulty_info.map_size, difficulty_info.enemy_count)
    };
    
    let response = game_ref.get_response(message, Vec::new());
    HttpResponse::Ok().json(response)
}

async fn get_progress(data: web::Data<AppState>) -> impl Responder {
    let progress = data.progress.lock().unwrap();
    HttpResponse::Ok().json(&*progress)
}

async fn move_player(
    move_req: web::Json<MoveRequest>,
    data: web::Data<AppState>,
) -> impl Responder {
    let mut game = data.game.lock().unwrap();
    let progress = data.progress.lock().unwrap();
    
    if game.is_none() {
        *game = Some(GameState::with_difficulty(
            progress.current_difficulty,
            progress.last_clear_time,
            progress.best_clear_time,
        ));
    }
    
    let game_ref = game.as_mut().unwrap();
    
    let (dx, dy) = match move_req.direction.as_str() {
        "north" | "up" | "w" => (0, -1),
        "east" | "right" | "d" => (1, 0),
        "south" | "down" | "s" => (0, 1),
        "west" | "left" | "a" => (-1, 0),
        _ => return HttpResponse::BadRequest().body("无效的方向"),
    };
    
    let response = game_ref.move_player(dx, dy);
    HttpResponse::Ok().json(response)
}

async fn get_state(data: web::Data<AppState>) -> impl Responder {
    let game = data.game.lock().unwrap();
    
    if game.is_none() {
        return HttpResponse::NotFound().body("游戏未开始");
    }
    
    let game_ref = game.as_ref().unwrap();
    let response = game_ref.get_response("".to_string(), Vec::new());
    HttpResponse::Ok().json(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("音频地牢服务器启动中...");
    println!("监听地址: http://localhost:8080");
    
    let app_state = web::Data::new(AppState {
        game: Mutex::new(None),
        progress: Mutex::new(GameProgress {
            current_difficulty: 1,
            last_clear_time: None,
            best_clear_time: None,
            total_games_played: 0,
            total_victories: 0,
        }),
    });
    
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .route("/api/game/new", web::post().to(new_game))
            .route("/api/game/next", web::post().to(next_game))
            .route("/api/game/move", web::post().to(move_player))
            .route("/api/game/state", web::get().to(get_state))
            .route("/api/game/progress", web::get().to(get_progress))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
