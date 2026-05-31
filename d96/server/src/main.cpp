#include "../include/game_server.hpp"
#include <iostream>

int main() {
    GameServer server(23, 80, 40);
    
    if (!server.start()) {
        std::cerr << "Failed to start server" << std::endl;
        return 1;
    }
    
    server.run();
    return 0;
}
