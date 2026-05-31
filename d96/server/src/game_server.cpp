#include "../include/game_server.hpp"
#include <iostream>
#include <sstream>
#include <cstring>
#include <algorithm>
#include <cmath>
#include <thread>

#ifdef _WIN32
#include <io.h>
#include <winsock2.h>
#endif

GameServer::GameServer(int port, int map_width, int map_height)
    : port(port), running(false), map(map_width, map_height), next_client_id(1), next_monster_id(1) {
    map.generate();
    spawn_initial_monsters();
}

GameServer::~GameServer() {
    stop();
}

void GameServer::init_network() {
#ifdef _WIN32
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);
#endif
}

void GameServer::cleanup_network() {
#ifdef _WIN32
    WSACleanup();
#endif
}

void GameServer::set_non_blocking(SOCKET sock) {
#ifdef _WIN32
    u_long mode = 1;
    ioctlsocket(sock, FIONBIO, &mode);
#else
    int flags = fcntl(sock, F_GETFL, 0);
    fcntl(sock, F_SETFL, flags | O_NONBLOCK);
#endif
}

void GameServer::spawn_initial_monsters() {
    std::vector<std::string> monster_types = {"goblin", "orc", "skeleton", "demon"};
    int num_monsters = 8;
    
    for (int i = 0; i < num_monsters; ++i) {
        auto pos = map.get_random_floor();
        std::string type = monster_types[std::rand() % monster_types.size()];
        
        auto entity = registry.create();
        registry.emplace<Position>(entity, pos.first, pos.second);
        registry.emplace<Enemy>(entity, type);
        
        std::cout << "Spawned " << type << " at (" << pos.first << ", " << pos.second << ")" << std::endl;
    }
    
    next_monster_id = num_monsters + 1;
}

bool GameServer::start() {
    init_network();
    
    server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket == INVALID_SOCKET) {
        std::cerr << "Failed to create socket" << std::endl;
        return false;
    }
    
    int opt = 1;
#ifdef _WIN32
    setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
    setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif
    
    sockaddr_in server_addr;
    std::memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port);
    
    if (bind(server_socket, (sockaddr*)&server_addr, sizeof(server_addr)) == SOCKET_ERROR) {
        std::cerr << "Failed to bind socket" << std::endl;
        closesocket(server_socket);
        return false;
    }
    
    if (listen(server_socket, 5) == SOCKET_ERROR) {
        std::cerr << "Failed to listen" << std::endl;
        closesocket(server_socket);
        return false;
    }
    
    set_non_blocking(server_socket);
    
    running = true;
    std::cout << "Server started on port " << port << std::endl;
    std::cout << "Map generated with monsters:" << std::endl;
    map.print();
    return true;
}

void GameServer::accept_new_client() {
    sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);
    SOCKET client_socket = accept(server_socket, (sockaddr*)&client_addr, &client_len);
    
    if (client_socket == INVALID_SOCKET) return;
    
    set_non_blocking(client_socket);
    
    std::lock_guard<std::mutex> lock(game_mutex);
    
    int client_id = next_client_id++;
    client_sockets[client_id] = client_socket;
    
    auto start_pos = map.get_random_floor();
    auto player_entity = registry.create();
    registry.emplace<Position>(player_entity, start_pos.first, start_pos.second);
    registry.emplace<Player>(player_entity, "Player" + std::to_string(client_id), client_id);
    
    client_to_entity[client_id] = player_entity;
    
    std::cout << "Client " << client_id << " connected at (" << start_pos.first << ", " << start_pos.second << ")" << std::endl;
    
    std::string welcome = "\x1B[H\x1B[2J";
    welcome += "Welcome to Dungeon! Use WASD to move.\r\n";
    welcome += "Monsters roaming - Watch out!\r\n";
    send_to_client(client_id, welcome);
    send_to_client(client_id, get_map_display(client_id));
}

void GameServer::handle_client_input(int client_id) {
    char buffer[1024];
    
    SOCKET socket;
    {
        std::lock_guard<std::mutex> lock(game_mutex);
        if (client_sockets.find(client_id) == client_sockets.end()) return;
        socket = client_sockets[client_id];
    }
    
    int bytes_received = recv(socket, buffer, sizeof(buffer) - 1, 0);
    if (bytes_received <= 0) {
        remove_client(client_id);
        return;
    }
    
    buffer[bytes_received] = '\0';
    
    std::lock_guard<std::mutex> lock(game_mutex);
    
    for (int i = 0; i < bytes_received; ++i) {
        char c = buffer[i];
        switch (c) {
            case 'w': case 'W': process_move(client_id, 0, -1); break;
            case 's': case 'S': process_move(client_id, 0, 1); break;
            case 'a': case 'A': process_move(client_id, -1, 0); break;
            case 'd': case 'D': process_move(client_id, 1, 0); break;
            default: break;
        }
    }
}

void GameServer::process_move(int client_id, int dx, int dy) {
    if (client_to_entity.find(client_id) == client_to_entity.end()) return;
    
    auto entity = client_to_entity[client_id];
    if (!registry.valid(entity)) return;
    
    auto* pos = registry.try_get<Position>(entity);
    if (!pos) return;
    
    int new_x = pos->x + dx;
    int new_y = pos->y + dy;
    
    if (is_valid_move(new_x, new_y, client_id)) {
        pos->x = new_x;
        pos->y = new_y;
    }
    
    update_game_state();
}

bool GameServer::is_valid_move(int x, int y, int exclude_client_id) {
    if (!map.is_floor(x, y)) {
        return false;
    }
    
    auto player_view = registry.view<Position, Player>();
    for (auto entity : player_view) {
        auto& pos = player_view.get<Position>(entity);
        auto& player = player_view.get<Player>(entity);
        
        if (player.client_id != exclude_client_id && pos.x == x && pos.y == y) {
            return false;
        }
    }
    
    auto monster_view = registry.view<Position, Enemy>();
    for (auto entity : monster_view) {
        auto& pos = monster_view.get<Position>(entity);
        if (pos.x == x && pos.y == y) {
            return false;
        }
    }
    
    return true;
}

bool GameServer::is_monster_valid_move(int x, int y, entt::entity exclude_entity) {
    if (!map.is_floor(x, y)) {
        return false;
    }
    
    auto player_view = registry.view<Position, Player>();
    for (auto entity : player_view) {
        auto& pos = player_view.get<Position>(entity);
        if (pos.x == x && pos.y == y) {
            return false;
        }
    }
    
    auto monster_view = registry.view<Position, Enemy>();
    for (auto entity : monster_view) {
        if (entity == exclude_entity) continue;
        auto& pos = monster_view.get<Position>(entity);
        if (pos.x == x && pos.y == y) {
            return false;
        }
    }
    
    return true;
}

void GameServer::monster_ai_loop() {
    while (running) {
        double current_time = std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();
        
        {
            std::lock_guard<std::mutex> lock(game_mutex);
            
            auto monster_view = registry.view<Position, Enemy>();
            auto player_view = registry.view<Position, Player>();
            
            bool has_players = !player_view.empty();
            
            for (auto monster_entity : monster_view) {
                auto& monster_pos = monster_view.get<Position>(monster_entity);
                auto& monster = monster_view.get<Enemy>(monster_entity);
                
                if (current_time - monster.last_move < monster.speed) {
                    continue;
                }
                
                if (!has_players) continue;
                
                entt::entity nearest_player = entt::null;
                float nearest_dist = 1e9f;
                Position nearest_pos;
                
                for (auto player_entity : player_view) {
                    auto& player_pos = player_view.get<Position>(player_entity);
                    float dx = player_pos.x - monster_pos.x;
                    float dy = player_pos.y - monster_pos.y;
                    float dist = std::sqrt(dx*dx + dy*dy);
                    
                    if (dist < nearest_dist) {
                        nearest_dist = dist;
                        nearest_player = player_entity;
                        nearest_pos = player_pos;
                    }
                }
                
                if (nearest_player != entt::null && nearest_dist <= 15.0f) {
                    int dx = 0, dy = 0;
                    
                    if (nearest_pos.x > monster_pos.x) dx = 1;
                    else if (nearest_pos.x < monster_pos.x) dx = -1;
                    
                    if (nearest_pos.y > monster_pos.y) dy = 1;
                    else if (nearest_pos.y < monster_pos.y) dy = -1;
                    
                    bool moved = false;
                    if ((std::rand() % 2 == 0 || dy == 0) && dx != 0) {
                        int new_x = monster_pos.x + dx;
                        int new_y = monster_pos.y;
                        if (is_monster_valid_move(new_x, new_y, monster_entity)) {
                            monster_pos.x = new_x;
                            monster.last_move = current_time;
                            moved = true;
                        }
                    }
                    
                    if (!moved && dy != 0) {
                        int new_x = monster_pos.x;
                        int new_y = monster_pos.y + dy;
                        if (is_monster_valid_move(new_x, new_y, monster_entity)) {
                            monster_pos.y = new_y;
                            monster.last_move = current_time;
                        }
                    }
                }
            }
            
            if (has_players) {
                update_game_state();
            }
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

void GameServer::update_game_state() {
    for (auto& [client_id, socket] : client_sockets) {
        send_to_client(client_id, get_map_display(client_id));
    }
}

std::string GameServer::get_map_display(int client_id) {
    std::stringstream ss;
    
    ss << "\x1B[H";
    
    if (client_to_entity.find(client_id) == client_to_entity.end()) {
        return "";
    }
    
    auto entity = client_to_entity[client_id];
    if (!registry.valid(entity)) return "";
    
    auto* player_pos = registry.try_get<Position>(entity);
    if (!player_pos) return "";
    
    int view_width = 40;
    int view_height = 20;
    int start_x = std::max(0, player_pos->x - view_width / 2);
    int start_y = std::max(0, player_pos->y - view_height / 2);
    int end_x = std::min(map.get_width(), start_x + view_width);
    int end_y = std::min(map.get_height(), start_y + view_height);
    
    for (int y = start_y; y < end_y; ++y) {
        for (int x = start_x; x < end_x; ++x) {
            char c = map.is_wall(x, y) ? '#' : '.';
            
            auto monster_view = registry.view<Position, Enemy>();
            for (auto monster_entity : monster_view) {
                auto& pos = monster_view.get<Position>(monster_entity);
                auto& monster = monster_view.get<Enemy>(monster_entity);
                if (pos.x == x && pos.y == y) {
                    c = monster.get_symbol();
                    break;
                }
            }
            
            auto player_view = registry.view<Position, Player>();
            for (auto e : player_view) {
                auto& pos = player_view.get<Position>(e);
                auto& player = player_view.get<Player>(e);
                if (pos.x == x && pos.y == y) {
                    if (player.client_id == client_id) {
                        c = '@';
                    } else {
                        c = 'P';
                    }
                }
            }
            
            ss << c;
        }
        ss << "\r\n";
    }
    
    int player_count = 0;
    auto player_view = registry.view<Position, Player>();
    for (auto e : player_view) { player_count++; }
    
    int monster_count = 0;
    auto monster_view = registry.view<Position, Enemy>();
    for (auto e : monster_view) { monster_count++; }
    
    ss << "\r\n";
    ss << "Players online: " << player_count << "  Monsters: " << monster_count << "\r\n";
    ss << "Your position: (" << player_pos->x << ", " << player_pos->y << ")\r\n";
    ss << "Use WASD to move - Monsters are chasing you!\r\n";
    ss << "----------------------------------------\r\n";
    
    return ss.str();
}

void GameServer::send_to_client(int client_id, const std::string& message) {
    if (client_sockets.find(client_id) == client_sockets.end()) return;
    
    SOCKET socket = client_sockets[client_id];
    send(socket, message.c_str(), static_cast<int>(message.length()), 0);
}

void GameServer::broadcast_message(const std::string& message) {
    for (auto& [client_id, socket] : client_sockets) {
        send(socket, message.c_str(), static_cast<int>(message.length()), 0);
    }
}

void GameServer::remove_client(int client_id) {
    std::lock_guard<std::mutex> lock(game_mutex);
    
    std::cout << "Client " << client_id << " disconnecting..." << std::endl;
    
    if (client_sockets.find(client_id) != client_sockets.end()) {
        SOCKET socket = client_sockets[client_id];
        closesocket(socket);
        client_sockets.erase(client_id);
    }
    
    if (client_to_entity.find(client_id) != client_to_entity.end()) {
        auto entity = client_to_entity[client_id];
        if (registry.valid(entity)) {
            registry.destroy(entity);
        }
        client_to_entity.erase(client_id);
    }
    
    std::cout << "Client " << client_id << " disconnected" << std::endl;
}

void GameServer::run() {
    std::thread ai_thread(&GameServer::monster_ai_loop, this);
    ai_thread.detach();
    
    timeval timeout;
    
    while (running) {
        FD_ZERO(&read_fds);
        FD_SET(server_socket, &read_fds);
        SOCKET max_fd = server_socket;
        
        std::vector<int> client_ids;
        {
            std::lock_guard<std::mutex> lock(game_mutex);
            for (auto& [client_id, socket] : client_sockets) {
                FD_SET(socket, &read_fds);
                if (socket > max_fd) max_fd = socket;
                client_ids.push_back(client_id);
            }
        }
        
        timeout.tv_sec = 0;
        timeout.tv_usec = 100000;
        
#ifdef _WIN32
        int activity = select(0, &read_fds, nullptr, nullptr, &timeout);
#else
        int activity = select(max_fd + 1, &read_fds, nullptr, nullptr, &timeout);
#endif
        
        if (activity < 0) continue;
        
        if (FD_ISSET(server_socket, &read_fds)) {
            accept_new_client();
        }
        
        for (int client_id : client_ids) {
            SOCKET socket;
            {
                std::lock_guard<std::mutex> lock(game_mutex);
                if (client_sockets.find(client_id) == client_sockets.end()) continue;
                socket = client_sockets[client_id];
            }
            
            if (FD_ISSET(socket, &read_fds)) {
                handle_client_input(client_id);
            }
        }
    }
}

void GameServer::stop() {
    running = false;
    
    std::vector<int> client_ids;
    for (auto& [client_id, socket] : client_sockets) {
        client_ids.push_back(client_id);
    }
    for (int client_id : client_ids) {
        remove_client(client_id);
    }
    
#ifdef _WIN32
    closesocket(server_socket);
#else
    close(server_socket);
#endif
    
    cleanup_network();
}
