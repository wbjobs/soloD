EMCC = emcc
CXXFLAGS = -O3 -std=c++17 -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_RUNTIME_METHODS='["cwrap","getValue","setValue","UTF8ToString"]'
LDFLAGS = --bind

SOURCES = intra_prediction.cpp cu_encoder.cpp bitstream_writer.cpp hevc_encoder.cpp ml_mode_prediction.cpp
HEADERS = hevc_encoder.h intra_prediction.h cu_encoder.h bitstream_writer.h ml_mode_prediction.h

TARGET = ../public/hevc_encoder.js

all: $(TARGET)

$(TARGET): $(SOURCES) $(HEADERS)
	$(EMCC) $(SOURCES) $(CXXFLAGS) $(LDFLAGS) -o $(TARGET)

clean:
	rm -f $(TARGET) $(TARGET:.js=.wasm)

.PHONY: all clean
