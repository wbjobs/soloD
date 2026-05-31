#include "cu_partition.h"
#include <cstring>
#include <algorithm>

CUPartition::CUPartition() {
    m_total_cost = 0;
    m_pred_buffer = new uint8_t[MAX_CU_SIZE * MAX_CU_SIZE];
}

CUPartition::~CUPartition() {
    delete[] m_pred_buffer;
}

uint64_t CUPartition::compute_cu_cost(const uint8_t* yuv, int stride,
                                        int x, int y, int size, int qp, int bit_depth,
                                        int& best_mode) {
    const uint8_t* orig = yuv + y * stride + x;
    
    best_mode = m_intra_pred.get_best_mode(orig, stride, orig, stride,
                                            size, size, bit_depth, qp);
    
    m_intra_pred.predict(m_pred_buffer, size, orig, stride,
                         size, size, best_mode, bit_depth);
    
    return m_satd_cost.compute_cost(orig, stride, m_pred_buffer, size,
                                     size, size, bit_depth, qp, true);
}

uint64_t CUPartition::recursive_partition(const uint8_t* yuv, int stride,
                                            int x, int y, int size, int depth,
                                            int max_depth, int qp, int bit_depth) {
    int best_mode;
    uint64_t cost_not_split = compute_cu_cost(yuv, stride, x, y, size, qp, bit_depth, best_mode);
    
    int split_cost = 64;
    cost_not_split += split_cost;
    
    if (depth >= max_depth || size <= MIN_CU_SIZE) {
        CodingUnit cu;
        cu.x = x;
        cu.y = y;
        cu.width = size;
        cu.height = size;
        cu.depth = depth;
        cu.intra_mode = best_mode;
        cu.split_flag = 0;
        cu.qp = qp;
        m_cu_tree.push_back(cu);
        return cost_not_split;
    }
    
    int half_size = size / 2;
    uint64_t cost_split = 0;
    
    cost_split += recursive_partition(yuv, stride, x, y, half_size, depth + 1, max_depth, qp, bit_depth);
    cost_split += recursive_partition(yuv, stride, x + half_size, y, half_size, depth + 1, max_depth, qp, bit_depth);
    cost_split += recursive_partition(yuv, stride, x, y + half_size, half_size, depth + 1, max_depth, qp, bit_depth);
    cost_split += recursive_partition(yuv, stride, x + half_size, y + half_size, half_size, depth + 1, max_depth, qp, bit_depth);
    
    if (cost_not_split < cost_split) {
        for (int i = 0; i < 4; i++) {
            if (!m_cu_tree.empty() && m_cu_tree.back().depth == depth + 1) {
                m_cu_tree.pop_back();
            }
        }
        
        CodingUnit cu;
        cu.x = x;
        cu.y = y;
        cu.width = size;
        cu.height = size;
        cu.depth = depth;
        cu.intra_mode = best_mode;
        cu.split_flag = 0;
        cu.qp = qp;
        m_cu_tree.push_back(cu);
        return cost_not_split;
    }
    
    return cost_split;
}

void CUPartition::process_ctu(const uint8_t* yuv, int stride, int ctu_x, int ctu_y,
                                int ctu_size, int max_depth, int qp, int bit_depth) {
    m_cu_tree.clear();
    m_total_cost = recursive_partition(yuv, stride, ctu_x, ctu_y, ctu_size, 0, max_depth, qp, bit_depth);
}
