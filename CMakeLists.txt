cmake_minimum_required(VERSION 3.15)

# =============================================================================
# Elyxion CLI - JavaScript Runtime
# Standalone CMake build for the V8 runtime
# =============================================================================

project(elyxion
    VERSION 1.0.0
    LANGUAGES CXX C
    DESCRIPTION "Elyxion CLI - JavaScript Runtime"
)

# ---- C++ Standard ----
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ---- Configuration Options ----
option(ELYXION_AUTO_DOWNLOAD_LIBUV "Download libuv when no system libuv is available" ON)
set(V8_DIR "" CACHE PATH "Standalone V8 SDK directory containing include/v8.h")
set(LIBUV_DIR "" CACHE PATH "Optional libuv installation prefix")

# ---- Find standalone V8 headers and library ----
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
find_package(V8 REQUIRED)

# ---- Find or build libuv ----
include(FetchContent)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(LIBUV_BUILD_TESTS OFF CACHE BOOL "" FORCE)

if(LIBUV_DIR)
    find_path(LIBUV_INCLUDE_DIR uv.h PATHS "${LIBUV_DIR}/include" NO_DEFAULT_PATH)
    find_library(LIBUV_LIBRARY NAMES uv_a uv libuv PATHS "${LIBUV_DIR}/lib" "${LIBUV_DIR}/lib64" NO_DEFAULT_PATH)
endif()

if(NOT LIBUV_INCLUDE_DIR OR NOT LIBUV_LIBRARY)
    find_path(LIBUV_INCLUDE_DIR uv.h)
    find_library(LIBUV_LIBRARY NAMES uv_a uv libuv)
endif()

if(LIBUV_INCLUDE_DIR AND LIBUV_LIBRARY)
    add_library(elyxion_libuv UNKNOWN IMPORTED)
    if(WIN32)
        set_target_properties(elyxion_libuv PROPERTIES
            IMPORTED_IMPLIB "${LIBUV_LIBRARY}"
            INTERFACE_INCLUDE_DIRECTORIES "${LIBUV_INCLUDE_DIR}"
        )
    else()
        set_target_properties(elyxion_libuv PROPERTIES
            IMPORTED_LOCATION "${LIBUV_LIBRARY}"
            INTERFACE_INCLUDE_DIRECTORIES "${LIBUV_INCLUDE_DIR}"
        )
    endif()
elseif(ELYXION_AUTO_DOWNLOAD_LIBUV)
    FetchContent_Declare(
        libuv
        URL "https://dist.libuv.org/dist/v1.48.0/libuv-v1.48.0.tar.gz"
    )
    FetchContent_MakeAvailable(libuv)
    add_library(elyxion_libuv ALIAS uv_a)
    set(LIBUV_INCLUDE_DIR "${libuv_SOURCE_DIR}/include")
else()
    message(FATAL_ERROR "libuv was not found; set LIBUV_DIR or enable ELYXION_AUTO_DOWNLOAD_LIBUV")
endif()

# ---- Source Files ----
set(ELYXION_SOURCES
    src/core/elyxion.cc
    src/core/environment.cc
    src/loop/event_loop.cc
)

# ---- Build standalone executable ----
add_executable(elyxion ${ELYXION_SOURCES})

target_compile_definitions(elyxion PRIVATE
    ELYXION_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}"
    ELYXION_BUILD_RESOURCE_DIR="${CMAKE_BINARY_DIR}/runtime/lib"
)

target_include_directories(elyxion PRIVATE
    ${V8_INCLUDE_DIR}
    ${LIBUV_INCLUDE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(elyxion PRIVATE
    elyxion_libuv
    ${V8_LIBRARY}
)

if(V8_PLATFORM_LIBRARY)
    target_link_libraries(elyxion PRIVATE ${V8_PLATFORM_LIBRARY})
endif()

# ---- Platform-Specific Configuration ----

if(WIN32)
    target_link_libraries(elyxion PRIVATE ${WINMM_LIBRARY} ${DBGHELP_LIBRARY} ${SHLWAPI_LIBRARY} ws2_32 userenv iphlpapi psapi)
    target_compile_options(elyxion PRIVATE /W3 /EHsc /wd4100 /wd4127 /wd4324 /wd4505 /wd4512)
elseif(APPLE)
    find_library(COCOA_FRAMEWORK Cocoa)
    find_library(COREFOUNDATION_FRAMEWORK CoreFoundation)
    find_library(SECURITY_FRAMEWORK Security)
    target_link_libraries(elyxion PRIVATE ${COCOA_FRAMEWORK} ${COREFOUNDATION_FRAMEWORK} ${SECURITY_FRAMEWORK})
    target_compile_options(elyxion PRIVATE -Wall -Wextra -Wno-unused-parameter)
else()
    find_package(Threads REQUIRED)
    target_link_libraries(elyxion PRIVATE Threads::Threads ${CMAKE_DL_LIBS})
    target_compile_options(elyxion PRIVATE -Wall -Wextra -Wno-unused-parameter)
endif()

add_custom_command(TARGET elyxion POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/runtime"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_CURRENT_SOURCE_DIR}/lib" "${CMAKE_BINARY_DIR}/runtime/lib"
    COMMENT "Copying Elyxion runtime files"
)

install(TARGETS elyxion RUNTIME DESTINATION bin)
install(DIRECTORY lib/ DESTINATION lib)
install(PROGRAMS bin/elyx DESTINATION bin)
install(FILES bin/elyxion.cmd bin/elyx.cmd DESTINATION bin)
install(FILES README.md LICENSE DESTINATION share/elyxion)

message(STATUS "")
message(STATUS "========================================")
message(STATUS "  Elyxion v${PROJECT_VERSION}")
message(STATUS "  Target: standalone executable")
message(STATUS "  V8: ${V8_LIBRARY}")
message(STATUS "========================================")