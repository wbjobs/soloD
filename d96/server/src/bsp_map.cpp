#include "../include/bsp_map.hpp"
#include <iostream>
#include <algorithm>
#include <climits>

BSPMap::BSPMap(int width, int height) : width(width), height(height) {
    std::srand(std::time(nullptr));
    tiles.resize(height, std::vector<char>(width, '#'));
}

BSPMap::~BSPMap() {
    clear_map();
}

void BSPMap::clear_map() {
    for (auto& row : tiles) {
        std::fill(row.begin(), row.end(), '#');
    }
    rooms.clear();
    root.reset();
}

void BSPMap::build(Node* node, int depth) {
    if (!node || depth <= 0) return;
    
    const int MIN_SIZE = 8;
    bool split_horizontal = (std::rand() % 2 == 0);
    
    if (split_horizontal) {
        if (node->h < MIN_SIZE * 2) return;
        int min_split = node->y + MIN_SIZE;
        int max_split = node->y + node->h - MIN_SIZE;
        if (min_split >= max_split) return;
        
        int split = min_split + std::rand() % (max_split - min_split);
        
        node->left = std::make_unique<Node>(node->x, node->y, node->w, split - node->y);
        node->right = std::make_unique<Node>(node->x, split, node->w, node->y + node->h - split);
    } else {
        if (node->w < MIN_SIZE * 2) return;
        int min_split = node->x + MIN_SIZE;
        int max_split = node->x + node->w - MIN_SIZE;
        if (min_split >= max_split) return;
        
        int split = min_split + std::rand() % (max_split - min_split);
        
        node->left = std::make_unique<Node>(node->x, node->y, split - node->x, node->h);
        node->right = std::make_unique<Node>(split, node->y, node->x + node->w - split, node->h);
    }
    
    build(node->left.get(), depth - 1);
    build(node->right.get(), depth - 1);
}

void BSPMap::carve_room(int x, int y, int w, int h) {
    int start_x = std::max(1, x);
    int start_y = std::max(1, y);
    int end_x = std::min(width - 1, x + w);
    int end_y = std::min(height - 1, y + h);
    
    for (int iy = start_y; iy < end_y; ++iy) {
        for (int ix = start_x; ix < end_x; ++ix) {
            tiles[iy][ix] = '.';
        }
    }
}

void BSPMap::create_rooms(Node* node) {
    if (!node) return;
    
    if (node->left || node->right) {
        create_rooms(node->left.get());
        create_rooms(node->right.get());
    } else {
        const int MIN_ROOM = 4;
        const int MAX_ROOM_PADDING = 3;
        
        int room_max_w = std::max(MIN_ROOM, node->w - MAX_ROOM_PADDING);
        int room_max_h = std::max(MIN_ROOM, node->h - MAX_ROOM_PADDING);
        int room_w = MIN_ROOM + std::rand() % std::max(1, room_max_w - MIN_ROOM + 1);
        int room_h = MIN_ROOM + std::rand() % std::max(1, room_max_h - MIN_ROOM + 1);
        
        int x_offset = 1 + std::rand() % std::max(1, node->w - room_w - 1);
        int y_offset = 1 + std::rand() % std::max(1, node->h - room_h - 1);
        
        int room_x = node->x + x_offset;
        int room_y = node->y + y_offset;
        
        rooms.push_back(std::make_unique<Room>(room_x, room_y, room_w, room_h));
        node->room = rooms.back().get();
        
        carve_room(room_x, room_y, room_w, room_h);
    }
}

void BSPMap::carve_h_corridor(int x1, int x2, int y) {
    int start = std::max(0, std::min(x1, x2));
    int end = std::min(width - 1, std::max(x1, x2));
    for (int x = start; x <= end; ++x) {
        if (y >= 0 && y < height) {
            tiles[y][x] = '.';
        }
    }
}

void BSPMap::carve_v_corridor(int y1, int y2, int x) {
    int start = std::max(0, std::min(y1, y2));
    int end = std::min(height - 1, std::max(y1, y2));
    for (int y = start; y <= end; ++y) {
        if (x >= 0 && x < width) {
            tiles[y][x] = '.';
        }
    }
}

Room* BSPMap::find_room_in_node(Node* node) {
    if (!node) return nullptr;
    if (node->room) return node->room;
    Room* left = find_room_in_node(node->left.get());
    if (left) return left;
    return find_room_in_node(node->right.get());
}

void BSPMap::create_corridors(Node* node) {
    if (!node || !node->left || !node->right) return;
    
    create_corridors(node->left.get());
    create_corridors(node->right.get());
    
    Room* left_room = find_room_in_node(node->left.get());
    Room* right_room = find_room_in_node(node->right.get());
    
    if (left_room && right_room) {
        int lx = left_room->x + left_room->w / 2;
        int ly = left_room->y + left_room->h / 2;
        int rx = right_room->x + right_room->w / 2;
        int ry = right_room->y + right_room->h / 2;
        
        if (std::rand() % 2 == 0) {
            carve_h_corridor(lx, rx, ly);
            carve_v_corridor(ly, ry, rx);
        } else {
            carve_v_corridor(ly, ry, lx);
            carve_h_corridor(lx, rx, ry);
        }
    }
}

void BSPMap::generate() {
    clear_map();
    
    root = std::make_unique<Node>(0, 0, width, height);
    build(root.get(), 4);
    create_rooms(root.get());
    create_corridors(root.get());
}

bool BSPMap::in_bounds(int x, int y) const {
    return x >= 0 && x < width && y >= 0 && y < height;
}

bool BSPMap::is_wall(int x, int y) const {
    return !in_bounds(x, y) || tiles[y][x] == '#';
}

bool BSPMap::is_floor(int x, int y) const {
    return in_bounds(x, y) && tiles[y][x] == '.';
}

std::pair<int, int> BSPMap::get_random_floor() const {
    std::vector<std::pair<int, int>> floors;
    floors.reserve(width * height / 2);
    
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            if (tiles[y][x] == '.') {
                floors.emplace_back(x, y);
            }
        }
    }
    
    if (!floors.empty()) {
        return floors[std::rand() % floors.size()];
    }
    return {width / 2, height / 2};
}

void BSPMap::print() const {
    for (const auto& row : tiles) {
        for (char c : row) {
            std::cout << c;
        }
        std::cout << std::endl;
    }
}
