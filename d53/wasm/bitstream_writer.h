#ifndef BITSTREAM_WRITER_H
#define BITSTREAM_WRITER_H

#include <stdint.h>
#include <vector>

class BitstreamWriter {
public:
    BitstreamWriter();
    ~BitstreamWriter();
    
    void writeBits(uint32_t value, int numBits);
    void writeByte(uint8_t byte);
    void writeNALU(const uint8_t* data, size_t size);
    void writeStartCode();
    void alignToByte();
    
    const uint8_t* getData() const { return buffer.data(); }
    size_t getSize() const { return bytePos + (bitPos > 0 ? 1 : 0); }
    void clear();
    
    void writeVPS();
    void writeSPS(int width, int height, int qp);
    void writePPS();
    void writeSliceHeader(int frameNum);
    void writeEndOfSlice();
    
private:
    void writeExpGolomb(int value);
    void writeSEGolomb(int value);
    
    std::vector<uint8_t> buffer;
    int bitPos;
    int bytePos;
    uint8_t currentByte;
};

#endif
