cmake_minimum_required(VERSION 3.20)
project(TimescaleDB LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(BUILD_TESTS "Build tests" ON)
option(ENABLE_SIMD "Enable SIMD optimizations" ON)

if(MSVC)
    add_compile_options(/W4 /O2 /arch:AVX2)
else()
    add_compile_options(-Wall -Wextra -O3 -mavx2 -mfma)
endif()

if(ENABLE_SIMD)
    add_definitions(-DENABLE_SIMD)
endif()

find_package(Threads REQUIRED)
find_package(OpenSSL REQUIRED)

include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${CMAKE_SOURCE_DIR}/third_party)

file(GLOB_RECURSE SOURCES
    src/*.cpp
    src/storage/*.cpp
    src/index/*.cpp
    src/query/*.cpp
    src/http/*.cpp
    src/utils/*.cpp
)

file(GLOB_RECURSE HEADERS
    include/*.h
    include/*.hpp
)

add_library(timescale_core STATIC ${SOURCES} ${HEADERS})
target_link_libraries(timescale_core PUBLIC Threads::Threads OpenSSL::SSL OpenSSL::Crypto)

add_executable(timescaledb src/main.cpp)
target_link_libraries(timescaledb PRIVATE timescale_core)

if(BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
