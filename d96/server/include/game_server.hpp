#ifndef GAME_SERVER_HPP
#define GAME_SERVER_HPP

#include <entt/entt.hpp>
#include "bsp_map.hpp"
#include "components.hpp"
#include <vector>
#include <string>
#include <unordered_map>
#include <mutex>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
typedef int socklen_t;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#define SOCKET int
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR (-1)
#define closesocket close
#endif

class GameServer {
public:
    GameServer(int port, int map_width = 80, int map_height = 40);
    ~GameServer();
    
    bool start();
    void run();
    void stop();
    
private:
    void init_network();
    void cleanup_network();
    void accept_new_client();
    void handle_client_input(int client_id);
    void broadcast_message(const std::string& message);
    void send_to_client(int client_id, const std::string& message);
    void remove_client(int client_id);
    
    void process_move(int client_id, int dx, int dy);
    bool is_valid_move(int x, int y, int exclude_client_id = -1);
    bool is_monster_valid_move(int x, y, entt::entity exclude_entity);
    void update_game_state();
    void spawn_initial_monsters();
    void monster_ai_loop();
    std::string get_map_display(int client_id);
    std::string get_player_list();
    
    void set_non_blocking(SOCKET sock);
    
    int next_monster_id;
    
    int port;
    bool running;
    BSPMap map;
    entt::registry registry;
    std::mutex game_mutex;
    
    SOCKET server_socket;
    std::unordered_map<int, SOCKET> client_sockets;
    std::unordered_map<int, entt::entity> client_to_entity;
    int next_client_id;
    
    fd_set read_fds;
};

#endif
