#include "hevc_common.h"
#include "intra_prediction.h"
#include "cu_partition.h"
#include "transform.h"
#include "bitstream.h"
#include <cstdlib>
#include <cstring>

class HEVCEncoderImpl {
public:
    HEVCEncoderImpl(int width, int height, int qp) 
        : m_width(width), m_height(height), m_qp(qp), m_bit_depth(8) {
        m_cu_partition = new CUPartition();
        m_transform = new Transform();
        m_bitstream = new BitstreamWriter();
        m_intra_pred = new IntraPrediction();
        
        m_yuv_size = width * height * 3 / 2;
        m_yuv_buffer = new uint8_t[m_yuv_size];
        
        init();
    }
    
    ~HEVCEncoderImpl() {
        delete m_cu_partition;
        delete m_transform;
        delete m_bitstream;
        delete m_intra_pred;
        delete[] m_yuv_buffer;
    }
    
    void init() {
        m_first_frame = true;
        m_ctu_size = 64;
        m_max_depth = 3;
    }
    
    int encode_frame(const uint8_t* yuv_data) {
        memcpy(m_yuv_buffer, yuv_data, m_yuv_size);
        
        m_bitstream->reset();
        
        if (m_first_frame) {
            m_bitstream->write_vps(m_width, m_height, m_bit_depth);
            m_bitstream->write_sps(m_width, m_height, m_qp, m_bit_depth);
            m_bitstream->write_pps(0, m_qp);
            m_first_frame = false;
        }
        
        m_bitstream->write_slice_header(0, 2, m_qp);
        
        int pic_width_in_ctus = (m_width + m_ctu_size - 1) / m_ctu_size;
        int pic_height_in_ctus = (m_height + m_ctu_size - 1) / m_ctu_size;
        
        for (int ctu_y = 0; ctu_y < pic_height_in_ctus; ctu_y++) {
            for (int ctu_x = 0; ctu_x < pic_width_in_ctus; ctu_x++) {
                int x = ctu_x * m_ctu_size;
                int y = ctu_y * m_ctu_size;
                
                encode_ctu(x, y);
            }
        }
        
        m_bitstream->rbsp_trailing_bits();
        
        return 0;
    }
    
    void encode_ctu(int ctu_x, int ctu_y) {
        uint8_t* src_y = m_yuv_buffer;
        int stride = m_width;
        
        m_cu_partition->process_ctu(src_y, stride, ctu_x, ctu_y, 
                                      m_ctu_size, m_max_depth, m_qp, m_bit_depth);
        
        const std::vector<CodingUnit>& cu_tree = m_cu_partition->get_cu_tree();
        
        for (const auto& cu : cu_tree) {
            m_bitstream->write_coding_unit(cu, m_ctu_size);
        }
    }
    
    const uint8_t* get_bitstream() const {
        return m_bitstream->get_data();
    }
    
    size_t get_bitstream_size() const {
        return m_bitstream->get_size();
    }

private:
    int m_width;
    int m_height;
    int m_qp;
    int m_bit_depth;
    int m_ctu_size;
    int m_max_depth;
    bool m_first_frame;
    
    size_t m_yuv_size;
    uint8_t* m_yuv_buffer;
    
    CUPartition* m_cu_partition;
    Transform* m_transform;
    BitstreamWriter* m_bitstream;
    IntraPrediction* m_intra_pred;
};

extern "C" {

HEVCEncoder* hevc_encoder_init(int width, int height, int qp) {
    HEVCEncoder* encoder = (HEVCEncoder*)malloc(sizeof(HEVCEncoder));
    if (!encoder) return nullptr;
    
    encoder->config.width = width;
    encoder->config.height = height;
    encoder->config.qp = qp;
    encoder->config.max_depth = 3;
    encoder->config.use_satd = 1;
    
    HEVCEncoderImpl* impl = new HEVCEncoderImpl(width, height, qp);
    encoder->cu_tree = (CodingUnit*)impl;
    
    return encoder;
}

void hevc_encoder_destroy(HEVCEncoder* encoder) {
    if (encoder) {
        HEVCEncoderImpl* impl = (HEVCEncoderImpl*)encoder->cu_tree;
        delete impl;
        free(encoder);
    }
}

int hevc_encoder_encode_frame(HEVCEncoder* encoder, const uint8_t* yuv_data) {
    if (!encoder || !yuv_data) return -1;
    
    HEVCEncoderImpl* impl = (HEVCEncoderImpl*)encoder->cu_tree;
    return impl->encode_frame(yuv_data);
}

uint8_t* hevc_encoder_get_bitstream(HEVCEncoder* encoder) {
    if (!encoder) return nullptr;
    
    HEVCEncoderImpl* impl = (HEVCEncoderImpl*)encoder->cu_tree;
    return const_cast<uint8_t*>(impl->get_bitstream());
}

size_t hevc_encoder_get_bitstream_size(HEVCEncoder* encoder) {
    if (!encoder) return 0;
    
    HEVCEncoderImpl* impl = (HEVCEncoderImpl*)encoder->cu_tree;
    return impl->get_bitstream_size();
}

}
