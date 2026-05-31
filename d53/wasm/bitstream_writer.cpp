#include "bitstream_writer.h"
#include <string.h>

BitstreamWriter::BitstreamWriter() : bitPos(0), bytePos(0), currentByte(0) {
    buffer.reserve(1024 * 1024);
}

BitstreamWriter::~BitstreamWriter() {
}

void BitstreamWriter::writeBits(uint32_t value, int numBits) {
    for (int i = numBits - 1; i >= 0; i--) {
        int bit = (value >> i) & 1;
        currentByte = (currentByte << 1) | bit;
        bitPos++;
        
        if (bitPos == 8) {
            buffer.push_back(currentByte);
            bytePos++;
            currentByte = 0;
            bitPos = 0;
        }
    }
}

void BitstreamWriter::writeByte(uint8_t byte) {
    if (bitPos == 0) {
        buffer.push_back(byte);
        bytePos++;
    } else {
        writeBits(byte, 8);
    }
}

void BitstreamWriter::writeStartCode() {
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x01);
}

void BitstreamWriter::alignToByte() {
    if (bitPos > 0) {
        currentByte <<= (8 - bitPos);
        buffer.push_back(currentByte);
        bytePos++;
        currentByte = 0;
        bitPos = 0;
    }
}

void BitstreamWriter::clear() {
    buffer.clear();
    bitPos = 0;
    bytePos = 0;
    currentByte = 0;
}

void BitstreamWriter::writeExpGolomb(int value) {
    int codeNum = value;
    int leadingZeros = 0;
    int temp = codeNum + 1;
    
    while (temp > 1) {
        temp >>= 1;
        leadingZeros++;
    }
    
    writeBits(0, leadingZeros);
    writeBits(codeNum + 1, leadingZeros + 1);
}

void BitstreamWriter::writeSEGolomb(int value) {
    int codeNum;
    if (value > 0) {
        codeNum = 2 * value - 1;
    } else {
        codeNum = -2 * value;
    }
    writeExpGolomb(codeNum);
}

void BitstreamWriter::writeNALU(const uint8_t* data, size_t size) {
    writeStartCode();
    for (size_t i = 0; i < size; i++) {
        writeByte(data[i]);
    }
}

void BitstreamWriter::writeVPS() {
    writeStartCode();
    writeByte(0x40);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x1F);
}

void BitstreamWriter::writeSPS(int width, int height, int qp) {
    writeStartCode();
    writeByte(0x42);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x01);
    writeByte(0x01);
    writeByte(0x60);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x03);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x03);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x03);
    writeByte(0x00);
    writeByte(0x5D);
    writeByte(0xAC);
    writeByte(0x59);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x0F);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x04);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x23);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x03);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x03);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x03);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x03);
    writeByte(0x00);
    writeByte(0x02);
    writeByte(0x10);
    writeByte(0x00);
    writeByte(0x04);
    writeByte(0x00);
    writeByte(0x08);
    writeByte(0x23);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x07);
    writeByte(0x02);
}

void BitstreamWriter::writePPS() {
    writeStartCode();
    writeByte(0x44);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x01);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x00);
    writeByte(0x05);
    writeByte(0x02);
    writeByte(0x10);
    writeByte(0x00);
    writeByte(0x04);
    writeByte(0x00);
    writeByte(0x08);
    writeByte(0x02);
}

void BitstreamWriter::writeSliceHeader(int frameNum) {
    writeStartCode();
    writeByte(0x02);
    writeByte(0x01);
    writeExpGolomb(0);
    writeExpGolomb(0);
    writeBits(0, 1);
    writeExpGolomb(frameNum);
    writeExpGolomb(0);
    writeBits(0, 1);
    writeBits(0, 1);
    writeExpGolomb(0);
}

void BitstreamWriter::writeEndOfSlice() {
    alignToByte();
}
