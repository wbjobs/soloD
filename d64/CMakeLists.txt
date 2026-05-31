cmake_minimum_required(VERSION 3.15)
project(DistributedTaskQueue)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 尝试不同的方式查找 ZeroMQ
find_package(ZeroMQ QUIET)

if(ZeroMQ_FOUND)
    message(STATUS "使用系统安装的 ZeroMQ")
    add_executable(publisher publisher.cpp)
    target_link_libraries(publisher ZeroMQ::libzmq)
else()
    # 尝试使用 pkg-config
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
        pkg_check_modules(ZeroMQ libzmq IMPORTED_TARGET)
        if(ZeroMQ_FOUND)
            message(STATUS "使用 pkg-config 找到的 ZeroMQ")
            add_executable(publisher publisher.cpp)
            target_link_libraries(publisher PkgConfig::ZeroMQ)
        endif()
    endif()
endif()

# 如果以上都失败，尝试直接链接
if(NOT TARGET publisher)
    message(STATUS "尝试直接链接 zmq 库")
    add_executable(publisher publisher.cpp)
    target_link_libraries(publisher zmq)
endif()

message(STATUS "CMake 配置完成")
