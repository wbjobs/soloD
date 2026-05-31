#ifndef BITSTREAM_H
#define BITSTREAM_H

#include "hevc_common.h"
#include <cstdint>
#include <vector>

class BitstreamWriter {
public:
    BitstreamWriter();
    ~BitstreamWriter();

    void write_bits(uint32_t value, int num_bits);
    void write_ue(uint32_t value);
    void write_se(int32_t value);
    void align();
    
    void write_start_code();
    void write_nal_header(int nal_unit_type, int temporal_id = 0);
    
    void write_vps(int width, int height, int bit_depth = 8);
    void write_sps(int width, int height, int qp = 26, int bit_depth = 8);
    void write_pps(int sps_id = 0, int qp = 26);
    void write_slice_header(int first_ctu_addr = 0, int slice_type = 2, int qp = 26);
    
    void write_coding_unit(const CodingUnit& cu, int ctu_size);
    void write_intra_mode(int mode, int size);
    void write_coeffs(const int16_t* coeff, int width, int height);
    
    void rbsp_trailing_bits();
    
    const uint8_t* get_data() const;
    size_t get_size() const;
    
    void clear();
    void reset();

private:
    void flush_byte();
    int count_leading_zeros(uint32_t value);
    
    std::vector<uint8_t> m_buffer;
    uint32_t m_current_word;
    int m_bits_left;
    int m_bit_offset;
};

#endif
