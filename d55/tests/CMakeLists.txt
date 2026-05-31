enable_testing()

add_executable(unit_tests
    inverted_index_test.cpp
    memtable_test.cpp
    query_engine_test.cpp
)
target_link_libraries(unit_tests PRIVATE timescale_core)
add_test(NAME unit_tests COMMAND unit_tests)

add_executable(window_boundary_test
    timeseries_window_test.cpp
)
target_link_libraries(window_boundary_test PRIVATE timescale_core)
add_test(NAME window_boundary_test COMMAND window_boundary_test)
