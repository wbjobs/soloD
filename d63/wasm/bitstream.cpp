#include "bitstream.h"
#include <cstring>
#include <algorithm>
#include <cmath>

BitstreamWriter::BitstreamWriter() {
    reset();
}

BitstreamWriter::~BitstreamWriter() {
}

void BitstreamWriter::reset() {
    m_buffer.clear();
    m_current_word = 0;
    m_bits_left = 32;
    m_bit_offset = 0;
}

void BitstreamWriter::clear() {
    reset();
}

int BitstreamWriter::count_leading_zeros(uint32_t value) {
    if (value == 0) return 32;
    int count = 0;
    while ((value & 0x80000000) == 0) {
        count++;
        value <<= 1;
    }
    return count;
}

void BitstreamWriter::flush_byte() {
    if (m_bits_left <= 24) {
        uint8_t byte = (uint8_t)((m_current_word >> 24) & 0xFF);
        m_buffer.push_back(byte);
        m_current_word <<= 8;
        m_bits_left += 8;
        
        if (m_buffer.size() >= 3 &&
            m_buffer[m_buffer.size() - 3] == 0 &&
            m_buffer[m_buffer.size() - 2] == 0 &&
            m_buffer[m_buffer.size() - 1] <= 3) {
            m_buffer.push_back(0x03);
        }
    }
}

void BitstreamWriter::write_bits(uint32_t value, int num_bits) {
    while (num_bits > 0) {
        int bits_to_write = std::min(num_bits, m_bits_left);
        uint32_t mask = (bits_to_write == 32) ? 0xFFFFFFFF : ((1 << bits_to_write) - 1);
        uint32_t shifted_value = (value & mask) << (m_bits_left - bits_to_write);
        m_current_word |= shifted_value;
        m_bits_left -= bits_to_write;
        num_bits -= bits_to_write;
        value >>= bits_to_write;
        
        flush_byte();
    }
}

void BitstreamWriter::write_ue(uint32_t value) {
    value++;
    int leading_zeros = count_leading_zeros(value);
    int code_num = 31 - leading_zeros;
    
    write_bits(0, code_num);
    write_bits(value, code_num + 1);
}

void BitstreamWriter::write_se(int32_t value) {
    if (value > 0) {
        write_ue(2 * value - 1);
    } else {
        write_ue(-2 * value);
    }
}

void BitstreamWriter::align() {
    while (m_bits_left < 32) {
        write_bits(0, 1);
    }
}

void BitstreamWriter::write_start_code() {
    align();
    m_buffer.push_back(0x00);
    m_buffer.push_back(0x00);
    m_buffer.push_back(0x00);
    m_buffer.push_back(0x01);
}

void BitstreamWriter::write_nal_header(int nal_unit_type, int temporal_id) {
    write_bits(0, 1);
    write_bits(nal_unit_type, 6);
    write_bits(0, 6);
    write_bits(temporal_id + 1, 3);
    write_bits(0, 1);
}

void BitstreamWriter::write_vps(int width, int height, int bit_depth) {
    write_start_code();
    write_nal_header(32, 0);
    
    write_bits(0, 4);
    write_bits(1, 2);
    write_bits(0, 6);
    write_bits(1, 3);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 4);
    write_bits(0, 3);
    write_bits(0, 1);
    write_bits(0, 1);
    
    int max_pic_order_cnt = 16;
    write_bits(max_pic_order_cnt, 4);
    write_bits(1, 8);
    write_bits(1, 8);
    
    write_bits(0, 1);
    write_bits(0, 1);
    
    rbsp_trailing_bits();
}

void BitstreamWriter::write_sps(int width, int height, int qp, int bit_depth) {
    write_start_code();
    write_nal_header(33, 0);
    
    write_bits(0, 4);
    write_bits(1, 3);
    write_bits(0, 3);
    write_bits(0, 6);
    write_bits(0, 4);
    write_bits(0, 4);
    write_bits(0, 4);
    write_bits(3, 2);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_bits(1, 2);
    write_bits(1, 2);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    int log2_ctu_size = 6;
    write_bits(log2_ctu_size - 3, 3);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_bits(1, 3);
    write_bits(1, 3);
    write_bits(3, 2);
    write_bits(1, 2);
    
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_ue(0);
    write_ue(0);
    write_ue(0);
    
    write_bits(0, 1);
    write_bits(0, 1);
    
    int pic_width_in_ctus = (width + 63) / 64;
    int pic_height_in_ctus = (height + 63) / 64;
    write_ue(pic_width_in_ctus - 1);
    write_ue(pic_height_in_ctus - 1);
    
    write_bits(1, 1);
    write_bits(1, 1);
    
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_ue(0);
    write_ue(0);
    
    write_bits(1, 1);
    write_ue(qp);
    
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_bits(1, 1);
    write_bits(1, 1);
    write_bits(1, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(1, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_bits(1, 8);
    write_bits(0, 8);
    write_bits(1, 8);
    write_bits(0, 8);
    
    write_bits(0, 1);
    write_bits(0, 1);
    
    rbsp_trailing_bits();
}

void BitstreamWriter::write_pps(int sps_id, int qp) {
    write_start_code();
    write_nal_header(34, 0);
    
    write_bits(0, 4);
    write_ue(sps_id);
    write_bits(1, 1);
    write_bits(1, 1);
    write_bits(0, 2);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_ue(3);
    write_ue(0);
    write_ue(0);
    write_se(qp - 26);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(1, 1);
    write_bits(1, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    
    write_ue(0);
    write_ue(0);
    write_ue(0);
    write_ue(0);
    
    rbsp_trailing_bits();
}

void BitstreamWriter::write_slice_header(int first_ctu_addr, int slice_type, int qp) {
    write_start_code();
    write_nal_header(20, 0);
    
    write_bits(0, 1);
    write_ue(0);
    write_ue(0);
    write_bits(1, 1);
    write_ue(0);
    write_ue(slice_type);
    write_bits(0, 1);
    write_ue(0);
    write_ue(0);
    write_bits(0, 1);
    write_ue(first_ctu_addr);
    write_bits(0, 1);
    write_bits(1, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_se(qp - 26);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
    write_bits(0, 1);
}

void BitstreamWriter::write_coding_unit(const CodingUnit& cu, int ctu_size) {
    write_ue(cu.depth);
    
    if (cu.depth < 3) {
        write_bits(cu.split_flag, 1);
    }
    
    if (cu.split_flag == 0 || cu.depth >= 3) {
        write_bits(0, 2);
        write_bits(0, 3);
        write_intra_mode(cu.intra_mode, cu.width);
        write_bits(0, 5);
        write_bits(0, 1);
    }
}

void BitstreamWriter::write_intra_mode(int mode, int size) {
    if (mode == 0) {
        write_bits(1, 1);
    } else if (mode == 1) {
        write_bits(0, 1);
        write_bits(1, 1);
    } else {
        write_bits(0, 1);
        write_bits(0, 1);
        write_ue(mode - 2);
    }
}

void BitstreamWriter::write_coeffs(const int16_t* coeff, int width, int height) {
    int num_non_zero = 0;
    for (int i = 0; i < width * height; i++) {
        if (coeff[i] != 0) {
            num_non_zero++;
        }
    }
    
    write_ue(num_non_zero);
    
    if (num_non_zero > 0) {
        for (int i = 0; i < width * height; i++) {
            if (coeff[i] != 0) {
                int abs_val = std::abs((int)coeff[i]);
                int sign = coeff[i] > 0 ? 0 : 1;
                write_ue(abs_val - 1);
                write_bits(sign, 1);
            }
        }
    }
}

void BitstreamWriter::rbsp_trailing_bits() {
    write_bits(1, 1);
    while (m_bits_left < 32) {
        write_bits(0, 1);
    }
}

const uint8_t* BitstreamWriter::get_data() const {
    return m_buffer.data();
}

size_t BitstreamWriter::get_size() const {
    return m_buffer.size();
}
