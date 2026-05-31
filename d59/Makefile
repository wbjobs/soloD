# PostgreSQL extension makefile for hnsw

MODULES = hnsw
EXTENSION = hnsw
DATA = hnsw--1.0.sql
PGFILEDESC = "HNSW - Hierarchical Navigable Small World vector index"

# Source files
OBJS = hnsw.o hnsw_insert.o hnsw_search.o hnsw_delete.o hnsw_vacuum.o hnsw_build.o hnsw_distance.o hnsw_utils.o hnsw_slab.o hnsw_quantize.o

# PostgreSQL build infrastructure
PG_CONFIG = pg_config
PGXS := $(shell $(PG_CONFIG) --pgxs)
include $(PGXS)

# Compiler flags for SIMD support
ifeq ($(shell uname -m),x86_64)
CFLAGS += -mavx2 -mavx512f -mavx512dq
endif

# Enable pthread for parallel build
CFLAGS += -pthread
LDFLAGS += -pthread

# Optimizations
CFLAGS += -O3 -ffast-math
