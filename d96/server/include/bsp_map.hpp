#ifndef BSP_MAP_HPP
#define BSP_MAP_HPP

#include <vector>
#include <cstdlib>
#include <ctime>
#include <memory>

struct Room {
    int x, y, w, h;
    bool connected;
    
    Room(int x = 0, int y = 0, int w = 0, int h = 0)
        : x(x), y(y), w(w), h(h), connected(false) {}
};

class BSPMap {
public:
    BSPMap(int width, int height);
    ~BSPMap();
    
    void generate();
    bool is_wall(int x, int y) const;
    bool is_floor(int x, int y) const;
    bool in_bounds(int x, int y) const;
    std::pair<int, int> get_random_floor() const;
    void print() const;
    
    int get_width() const { return width; }
    int get_height() const { return height; }
    
private:
    struct Node {
        int x, y, w, h;
        std::unique_ptr<Node> left;
        std::unique_ptr<Node> right;
        Room* room;
        
        Node(int x, int y, int w, int h)
            : x(x), y(y), w(w), h(h), left(nullptr), right(nullptr), room(nullptr) {}
    };
    
    void build(Node* node, int depth);
    void create_rooms(Node* node);
    void create_corridors(Node* node);
    void carve_room(int x, int y, int w, int h);
    void carve_h_corridor(int x1, int x2, int y);
    void carve_v_corridor(int y1, int y2, int x);
    void clear_map();
    Room* find_room_in_node(Node* node);
    
    int width;
    int height;
    std::vector<std::vector<char>> tiles;
    std::vector<std::unique_ptr<Room>> rooms;
    std::unique_ptr<Node> root;
};

#endif
