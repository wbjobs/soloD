#ifndef COMPONENTS_HPP
#define COMPONENTS_HPP

#include <string>

struct Position {
    int x;
    int y;
    
    Position(int x = 0, int y = 0) : x(x), y(y) {}
};

struct Player {
    std::string name;
    int health;
    int attack;
    int client_id;
    
    Player(const std::string& name = "", int client_id = -1) 
        : name(name), health(100), attack(10), client_id(client_id) {}
};

struct Enemy {
    std::string type;
    int health;
    int attack;
    float speed;
    double last_move;
    
    Enemy(const std::string& type = "goblin") 
        : type(type), health(50), attack(5), speed(0.3f), last_move(0.0) {}
        
    char get_symbol() const {
        if (type == "goblin") return 'G';
        if (type == "orc") return 'O';
        if (type == "skeleton") return 'S';
        if (type == "demon") return 'D';
        return 'M';
    }
};

#endif
