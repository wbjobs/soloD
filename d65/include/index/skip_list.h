#pragma once

#include "common/common.h"
#include <vector>
#include <random>
#include <cstring>

namespace timescale::index {

template<typename K, typename V>
struct SkipListNode {
    K key;
    V value;
    std::vector<SkipListNode*> forward;
    
    SkipListNode(const K& k, const V& v, int level) 
        : key(k), value(v), forward(level + 1, nullptr) {}
};

template<typename K, typename V>
class SkipList {
public:
    explicit SkipList(int max_level = 16, double p = 0.5);
    ~SkipList();
    
    bool insert(const K& key, const V& value);
    bool remove(const K& key);
    bool contains(const K& key) const;
    const V* find(const K& key) const;
    std::vector<V> range_query(const K& start, const K& end) const;
    
    size_t size() const { return size_; }
    void clear();

private:
    int random_level();
    
    int max_level_;
    double p_;
    int current_level_;
    SkipListNode<K, V>* head_;
    size_t size_;
    mutable std::mt19937 rng_;
};

using TimeSeriesSkipList = SkipList<Timestamp, SeriesID>;

template<typename K, typename V>
SkipList<K, V>::SkipList(int max_level, double p)
    : max_level_(max_level), p_(p), current_level_(0), size_(0), rng_(std::random_device{}()) {
    head_ = new SkipListNode<K, V>(K{}, V{}, max_level_);
}

template<typename K, typename V>
SkipList<K, V>::~SkipList() {
    clear();
    delete head_;
}

template<typename K, typename V>
int SkipList<K, V>::random_level() {
    int level = 0;
    std::uniform_real_distribution<double> dist(0.0, 1.0);
    while (dist(rng_) < p_ && level < max_level_) {
        level++;
    }
    return level;
}

template<typename K, typename V>
bool SkipList<K, V>::insert(const K& key, const V& value) {
    std::vector<SkipListNode<K, V>*> update(max_level_ + 1, nullptr);
    SkipListNode<K, V>* current = head_;
    
    for (int i = current_level_; i >= 0; --i) {
        while (current->forward[i] != nullptr && current->forward[i]->key < key) {
            current = current->forward[i];
        }
        update[i] = current;
    }
    
    current = current->forward[0];
    
    if (current != nullptr && current->key == key) {
        return false;
    }
    
    int new_level = random_level();
    
    if (new_level > current_level_) {
        for (int i = current_level_ + 1; i <= new_level; ++i) {
            update[i] = head_;
        }
        current_level_ = new_level;
    }
    
    SkipListNode<K, V>* new_node = new SkipListNode<K, V>(key, value, new_level);
    
    for (int i = 0; i <= new_level; ++i) {
        new_node->forward[i] = update[i]->forward[i];
        update[i]->forward[i] = new_node;
    }
    
    size_++;
    return true;
}

template<typename K, typename V>
bool SkipList<K, V>::remove(const K& key) {
    std::vector<SkipListNode<K, V>*> update(max_level_ + 1, nullptr);
    SkipListNode<K, V>* current = head_;
    
    for (int i = current_level_; i >= 0; --i) {
        while (current->forward[i] != nullptr && current->forward[i]->key < key) {
            current = current->forward[i];
        }
        update[i] = current;
    }
    
    current = current->forward[0];
    
    if (current == nullptr || current->key != key) {
        return false;
    }
    
    for (int i = 0; i <= current_level_; ++i) {
        if (update[i]->forward[i] != current) {
            break;
        }
        update[i]->forward[i] = current->forward[i];
    }
    
    delete current;
    
    while (current_level_ > 0 && head_->forward[current_level_] == nullptr) {
        current_level_--;
    }
    
    size_--;
    return true;
}

template<typename K, typename V>
bool SkipList<K, V>::contains(const K& key) const {
    return find(key) != nullptr;
}

template<typename K, typename V>
const V* SkipList<K, V>::find(const K& key) const {
    SkipListNode<K, V>* current = head_;
    
    for (int i = current_level_; i >= 0; --i) {
        while (current->forward[i] != nullptr && current->forward[i]->key < key) {
            current = current->forward[i];
        }
    }
    
    current = current->forward[0];
    
    if (current != nullptr && current->key == key) {
        return &current->value;
    }
    
    return nullptr;
}

template<typename K, typename V>
std::vector<V> SkipList<K, V>::range_query(const K& start, const K& end) const {
    std::vector<V> result;
    SkipListNode<K, V>* current = head_;
    
    for (int i = current_level_; i >= 0; --i) {
        while (current->forward[i] != nullptr && current->forward[i]->key < start) {
            current = current->forward[i];
        }
    }
    
    current = current->forward[0];
    
    while (current != nullptr && current->key <= end) {
        result.push_back(current->value);
        current = current->forward[0];
    }
    
    return result;
}

template<typename K, typename V>
void SkipList<K, V>::clear() {
    SkipListNode<K, V>* current = head_->forward[0];
    while (current != nullptr) {
        SkipListNode<K, V>* next = current->forward[0];
        delete current;
        current = next;
    }
    
    for (int i = 0; i <= max_level_; ++i) {
        head_->forward[i] = nullptr;
    }
    
    current_level_ = 0;
    size_ = 0;
}

}
