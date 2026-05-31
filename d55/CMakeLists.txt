cmake_minimum_required(VERSION 3.20)
project(TimescaleDB VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -march=native -ffast-math")
endif()

option(BUILD_TESTS "Build tests" ON)
option(BUILD_BENCHMARKS "Build benchmarks" ON)

find_package(Threads REQUIRED)
find_package(OpenSSL REQUIRED)

include_directories(${PROJECT_SOURCE_DIR}/include)

file(GLOB_RECURSE CORE_SOURCES
    ${PROJECT_SOURCE_DIR}/src/*.cpp
)
list(FILTER CORE_SOURCES EXCLUDE REGEX ".*main\\.cpp$")

file(GLOB_RECURSE HEADERS
    ${PROJECT_SOURCE_DIR}/include/*.h
    ${PROJECT_SOURCE_DIR}/include/*.hpp
)

add_library(timescale_core STATIC ${CORE_SOURCES} ${HEADERS})
target_link_libraries(timescale_core PUBLIC Threads::Threads OpenSSL::SSL OpenSSL::Crypto)

if(WIN32)
    target_link_libraries(timescale_core PUBLIC ws2_32)
endif()

add_executable(timescale_db ${PROJECT_SOURCE_DIR}/src/main.cpp)
target_link_libraries(timescale_db PRIVATE timescale_core)

if(BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

if(BUILD_BENCHMARKS)
    add_subdirectory(benchmarks)
endif()
