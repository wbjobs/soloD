cmake_minimum_required(VERSION 3.14)
project(dungeon_server)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

FetchContent_Declare(
    entt
    GIT_REPOSITORY https://github.com/skypjack/entt.git
    GIT_TAG v3.12.2
)
FetchContent_MakeAvailable(entt)

add_executable(dungeon_server
    src/main.cpp
    src/bsp_map.cpp
    src/game_server.cpp
)

target_link_libraries(dungeon_server PRIVATE EnTT::EnTT)

if(WIN32)
    target_link_libraries(dungeon_server PRIVATE ws2_32)
endif()
