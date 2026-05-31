#pragma once

#include "core/common.h"
#include <vector>
#include <random>
#include <memory>

namespace timescale {

template<typename K, typename V>
struct SkipListNode {
    K key;
    V value;
    std::vector<std::unique_ptr<SkipListNode<K, V>>> forward;

    SkipListNode(K k, V v, int level)
        : key(k), value(v), forward(level + 1) {}
};

template<typename K, typename V>
class SkipList {
public:
    SkipList(int max_level = 16)
        : max_level_(max_level),
          current_level_(0),
          head_(std::make_unique<SkipListNode<K, V>>(K{}, V{}, max_level_)),
          dist_(0, 1) {}

    void insert(K key, V value) {
        std::vector<SkipListNode<K, V>*> update(max_level_ + 1);
        SkipListNode<K, V>* x = head_.get();

        for (int i = current_level_; i >= 0; --i) {
            while (x->forward[i] && x->forward[i]->key < key) {
                x = x->forward[i].get();
            }
            update[i] = x;
        }

        x = x->forward[0].get();
        if (x && x->key == key) {
            x->value = value;
            return;
        }

        int new_level = random_level();
        if (new_level > current_level_) {
            for (int i = current_level_ + 1; i <= new_level; ++i) {
                update[i] = head_.get();
            }
            current_level_ = new_level;
        }

        auto new_node = std::make_unique<SkipListNode<K, V>>(key, value, new_level);
        for (int i = 0; i <= new_level; ++i) {
            new_node->forward[i] = std::move(update[i]->forward[i]);
            update[i]->forward[i] = std::move(new_node);
            new_node = std::unique_ptr<SkipListNode<K, V>>(update[i]->forward[i].get());
        }
    }

    bool find(K key, V& value) const {
        SkipListNode<K, V>* x = head_.get();
        for (int i = current_level_; i >= 0; --i) {
            while (x->forward[i] && x->forward[i]->key < key) {
                x = x->forward[i].get();
            }
        }
        x = x->forward[0].get();
        if (x && x->key == key) {
            value = x->value;
            return true;
        }
        return false;
    }

    std::vector<V> find_range(K start, K end) const {
        std::vector<V> result;
        SkipListNode<K, V>* x = head_.get();

        for (int i = current_level_; i >= 0; --i) {
            while (x->forward[i] && x->forward[i]->key < start) {
                x = x->forward[i].get();
            }
        }

        x = x->forward[0].get();
        while (x && x->key <= end) {
            result.push_back(x->value);
            x = x->forward[0].get();
        }

        return result;
    }

    bool remove(K key) {
        std::vector<SkipListNode<K, V>*> update(max_level_ + 1);
        SkipListNode<K, V>* x = head_.get();

        for (int i = current_level_; i >= 0; --i) {
            while (x->forward[i] && x->forward[i]->key < key) {
                x = x->forward[i].get();
            }
            update[i] = x;
        }

        x = x->forward[0].get();
        if (!x || x->key != key) {
            return false;
        }

        for (int i = 0; i <= current_level_; ++i) {
            if (update[i]->forward[i].get() != x) {
                break;
            }
            update[i]->forward[i] = std::move(x->forward[i]);
        }

        while (current_level_ > 0 && !head_->forward[current_level_]) {
            --current_level_;
        }

        return true;
    }

private:
    int random_level() {
        int level = 0;
        while (level < max_level_ && dist_(rng_) < 0.5) {
            ++level;
        }
        return level;
    }

    int max_level_;
    int current_level_;
    std::unique_ptr<SkipListNode<K, V>> head_;
    std::mt19937 rng_{std::random_device{}()};
    std::uniform_real_distribution<double> dist_;
};

}
