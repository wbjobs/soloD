CXX = em++
AR = emar

CFLAGS = -O3 -Wall -Wextra -std=c++17
CFLAGS += -s WASM=1
CFLAGS += -s ALLOW_MEMORY_GROWTH=1
CFLAGS += -s EXPORTED_FUNCTIONS='["_malloc", "_free", "_hevc_encoder_init", "_hevc_encoder_encode_frame", "_hevc_encoder_destroy", "_hevc_encoder_get_bitstream", "_hevc_encoder_get_bitstream_size"]'
CFLAGS += -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "getValue", "setValue", "UTF8ToString"]'
CFLAGS += -s MODULARIZE=1
CFLAGS += -s EXPORT_NAME="HEVCEncoderModule"
CFLAGS += -I.

SRCS = hevc_encoder.cpp \
       intra_prediction.cpp \
       satd_cost.cpp \
       cu_partition.cpp \
       bitstream.cpp \
       transform.cpp

OBJS = $(SRCS:.cpp=.o)

TARGET = ../public/hevc_encoder.js

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CFLAGS) -o $@ $(OBJS)

%.o: %.cpp
	$(CXX) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET) $(TARGET:.js=.wasm)

.PHONY: all clean
