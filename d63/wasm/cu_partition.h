#ifndef CU_PARTITION_H
#define CU_PARTITION_H

#include "hevc_common.h"
#include "intra_prediction.h"
#include "satd_cost.h"
#include <cstdint>
#include <vector>

class CUPartition {
public:
    CUPartition();
    ~CUPartition();

    void process_ctu(const uint8_t* yuv, int stride, int ctu_x, int ctu_y,
                     int ctu_size, int max_depth, int qp, int bit_depth);
    
    const std::vector<CodingUnit>& get_cu_tree() const { return m_cu_tree; }
    
    uint64_t get_total_cost() const { return m_total_cost; }

private:
    uint64_t recursive_partition(const uint8_t* yuv, int stride,
                                  int x, int y, int size, int depth,
                                  int max_depth, int qp, int bit_depth);
    
    uint64_t compute_cu_cost(const uint8_t* yuv, int stride,
                              int x, int y, int size, int qp, int bit_depth,
                              int& best_mode);
    
    IntraPrediction m_intra_pred;
    SATDCost m_satd_cost;
    std::vector<CodingUnit> m_cu_tree;
    uint64_t m_total_cost;
    uint8_t* m_pred_buffer;
};

#endif
