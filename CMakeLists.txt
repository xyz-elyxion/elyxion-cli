cmake_minimum_required(VERSION 3.15)

# =============================================================================
# Elyxion CLI - JavaScript Runtime
# Build system using CMake (replaces node-gyp / binding.gyp)
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
set(NODE_VERSION "22.23.2" CACHE STRING "Node.js version for V8/libuv headers")
option(ELYXION_AUTO_DOWNLOAD "Auto-download Node.js headers and library" ON)
option(ELYXION_AS_ADDON "Build as Node.js addon (.node) instead of standalone executable" ON)
set(NODE_DIST_DIR "" CACHE PATH "Path to extracted Node.js distribution (standalone builds)")

# ---- Find or Download Node.js Headers ----
set(NODE_HEADERS_DIR "" CACHE PATH "Path to Node.js include directory (containing v8.h)")

if(NODE_HEADERS_DIR STREQUAL "" OR NOT EXISTS "${NODE_HEADERS_DIR}/v8.h")
    if(NODE_DIST_DIR AND EXISTS "${NODE_DIST_DIR}/include/node/v8.h")
        set(NODE_HEADERS_DIR "${NODE_DIST_DIR}/include/node")
    elseif(ELYXION_AUTO_DOWNLOAD)
        message(STATUS "Downloading Node.js v${NODE_VERSION} headers...")

        include(FetchContent)
        FetchContent_Declare(
            node_headers
            URL "https://nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-headers.tar.gz"
        )

        FetchContent_GetProperties(node_headers)
        if(NOT node_headers_POPULATED)
            FetchContent_Populate(node_headers)
        endif()

        set(NODE_HEADERS_DIR "${node_headers_SOURCE_DIR}/include/node")
    else()
        message(FATAL_ERROR
            "Node.js headers not found. Set NODE_HEADERS_DIR or enable auto-download:\n"
            "  cmake -DELYXION_AUTO_DOWNLOAD=ON .."
        )
    endif()
endif()

message(STATUS "Node.js headers: ${NODE_HEADERS_DIR}")

# ---- Source Files ----
set(ELYXION_SOURCES
    src/core/elyxion.cc
    src/core/environment.cc
    src/loop/event_loop.cc
)

# ---- Build Target ----
if(ELYXION_AS_ADDON)
    # ===== Build as Node.js addon (.node shared module) =====
    add_library(elyxion MODULE ${ELYXION_SOURCES})
    target_compile_definitions(elyxion PRIVATE ELYXION_AS_ADDON)

    set_target_properties(elyxion PROPERTIES
        PREFIX ""
        SUFFIX ".node"
        CXX_VISIBILITY_PRESET hidden
        VISIBILITY_INLINES_HIDDEN ON
    )
else()
    # ===== Build as standalone executable =====

    # --- Build libuv from source ---
    include(FetchContent)
    set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
    set(LIBUV_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(
        libuv
        URL "https://dist.libuv.org/dist/v1.48.0/libuv-v1.48.0.tar.gz"
    )
    FetchContent_MakeAvailable(libuv)
    message(STATUS "libuv: built from source (v1.48.0)")

    # --- Build executable ---
    add_executable(elyxion ${ELYXION_SOURCES})

    # --- V8 linking: different approach per platform ---
    if(WIN32)
        # Windows: use FindV8.cmake (set V8_DIR to a pre-built V8 checkout)
        list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
        find_package(V8 QUIET)
        if(V8_FOUND)
            message(STATUS "V8: standalone (V8_DIR=${V8_DIR})")
        endif()
    else()
        # Linux/macOS: download Node.js distribution for libnode
        if(NODE_DIST_DIR AND EXISTS "${NODE_DIST_DIR}")
            message(STATUS "Using Node.js distribution: ${NODE_DIST_DIR}")
        else()
            message(STATUS "Downloading Node.js v${NODE_VERSION} for standalone linking...")

            if(APPLE)
                if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
                    set(_NODE_PLATFORM "darwin-arm64")
                else()
                    set(_NODE_PLATFORM "darwin-x64")
                endif()
            else()
                if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
                    set(_NODE_PLATFORM "linux-arm64")
                elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|amd64")
                    set(_NODE_PLATFORM "linux-x64")
                else()
                    set(_NODE_PLATFORM "linux-x64")
                endif()
            endif()

            set(_NODE_TARBALL "node-v${NODE_VERSION}-${_NODE_PLATFORM}.tar.xz")
            set(_NODE_URL "https://nodejs.org/dist/v${NODE_VERSION}/${_NODE_TARBALL}")

            FetchContent_Declare(
                node_dist
                URL "${_NODE_URL}"
            )
            FetchContent_GetProperties(node_dist)
            if(NOT node_dist_POPULATED)
                FetchContent_Populate(node_dist)
            endif()

            set(NODE_DIST_DIR "${node_dist_SOURCE_DIR}")
        endif()

        # Find libnode
        if(APPLE)
            find_library(LIBNODE_LIBRARY
                NAMES libnode.127 node
                PATHS "${NODE_DIST_DIR}/lib"
                NO_DEFAULT_PATH
            )
        else()
            find_library(LIBNODE_LIBRARY
                NAMES libnode.so.127 node
                PATHS "${NODE_DIST_DIR}/lib"
                NO_DEFAULT_PATH
            )
        endif()

        if(NOT LIBNODE_LIBRARY OR NOT EXISTS "${LIBNODE_LIBRARY}")
            message(FATAL_ERROR
                "Could not find libnode in ${NODE_DIST_DIR}/lib\n"
                "Make sure NODE_DIST_DIR points to an extracted Node.js distribution."
            )
        endif()

        message(STATUS "libnode: ${LIBNODE_LIBRARY}")
        set(V8_FOUND TRUE)
    endif()

    # --- Link libraries ---
    if(V8_FOUND)
        if(WIN32 AND V8_LIBRARY)
            target_link_libraries(elyxion PRIVATE
                uv_a
                ${V8_LIBRARY}
                ${WINMM_LIBRARY}
                ${DBGHELP_LIBRARY}
                ${SHLWAPI_LIBRARY}
            )
        elseif(LIBNODE_LIBRARY)
            target_link_libraries(elyxion PRIVATE
                uv_a
                ${LIBNODE_LIBRARY}
            )
        else()
            message(FATAL_ERROR "No V8 library found for standalone build")
        endif()
    else()
        if(WIN32)
            message(FATAL_ERROR
                "V8 not found for Windows standalone build.\n"
                "Build V8 first: .\\scripts\\build-v8.ps1 -Version 12.2.282\n"
                "Then run: cmake -DV8_DIR=build/v8 ..."
            )
        else()
            message(FATAL_ERROR "No V8/libnode library found for standalone build")
        endif()
    endif()

    # Set rpath so libnode is found next to the binary at runtime
    if(APPLE)
        set_target_properties(elyxion PROPERTIES
            INSTALL_RPATH "@loader_path"
            BUILD_RPATH "${NODE_DIST_DIR}/lib"
        )
    elseif(NOT WIN32)
        set_target_properties(elyxion PROPERTIES
            INSTALL_RPATH "$ORIGIN"
            BUILD_RPATH "${NODE_DIST_DIR}/lib"
        )
    endif()
endif()

target_include_directories(elyxion PRIVATE
    ${NODE_HEADERS_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# ---- Platform-Specific Configuration ----

if(WIN32)
    # ===== Windows =====
    if(ELYXION_AS_ADDON)
        if(CMAKE_SIZEOF_VOID_P EQUAL 8)
            set(_NODE_LIB_ARCH "win-x64")
        else()
            set(_NODE_LIB_ARCH "win-x86")
        endif()

        set(_NODE_LIB_URL "https://nodejs.org/download/release/v${NODE_VERSION}/${_NODE_LIB_ARCH}/node.lib")
        set(_NODE_LIB_PATH "${CMAKE_BINARY_DIR}/node.lib")

        if(NOT EXISTS ${_NODE_LIB_PATH})
            message(STATUS "Downloading node.lib for ${_NODE_LIB_ARCH}...")
            file(DOWNLOAD
                ${_NODE_LIB_URL}
                ${_NODE_LIB_PATH}
                STATUS _download_status
            )
            list(GET _download_status 0 _status_code)
            if(NOT _status_code EQUAL 0)
                message(FATAL_ERROR "Failed to download node.lib: ${_NODE_LIB_URL}")
            endif()
        else()
            message(STATUS "Using cached node.lib: ${_NODE_LIB_PATH}")
        endif()

        target_link_libraries(elyxion PRIVATE ${_NODE_LIB_PATH})
    endif()

    target_compile_options(elyxion PRIVATE /W3 /EHsc)
    target_compile_options(elyxion PRIVATE /wd4100 /wd4127 /wd4324 /wd4505 /wd4512)

elseif(APPLE)
    # ===== macOS =====
    if(ELYXION_AS_ADDON)
        target_link_libraries(elyxion PRIVATE "-undefined dynamic_lookup")
    else()
        find_library(COCOA_FRAMEWORK Cocoa)
        find_library(COREFOUNDATION_FRAMEWORK CoreFoundation)
        find_library(SECURITY_FRAMEWORK Security)

        target_link_libraries(elyxion PRIVATE
            ${COCOA_FRAMEWORK}
            ${COREFOUNDATION_FRAMEWORK}
            ${SECURITY_FRAMEWORK}
        )
    endif()

    target_compile_options(elyxion PRIVATE -Wall -Wextra -Wno-unused-parameter)

else()
    # ===== Linux / Unix =====
    if(ELYXION_AS_ADDON)
        target_link_libraries(elyxion PRIVATE pthread dl)
    else()
        find_package(Threads REQUIRED)
        target_link_libraries(elyxion PRIVATE
            Threads::Threads
            ${CMAKE_DL_LIBS}
        )
    endif()

    target_compile_options(elyxion PRIVATE -Wall -Wextra -Wno-unused-parameter)
endif()

# ---- Post-Build: Copy .node to standard location ----
if(ELYXION_AS_ADDON AND NOT DEFINED CMAKE_OSX_ARCHITECTURES)
    add_custom_command(TARGET elyxion POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/Release
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            $<TARGET_FILE:elyxion>
            ${CMAKE_BINARY_DIR}/Release/elyxion.node
        COMMENT "Copying elyxion.node to build/Release/"
    )
endif()

# ---- Install ----
if(ELYXION_AS_ADDON)
    install(TARGETS elyxion
        LIBRARY DESTINATION lib
    )
else()
    install(TARGETS elyxion
        RUNTIME DESTINATION bin
    )
endif()

# ---- Summary ----
message(STATUS "")
message(STATUS "════════════════════════════════════════")
message(STATUS "  Elyxion v${PROJECT_VERSION}")
message(STATUS "────────────────────────────────────────")
message(STATUS "  Build type:    ${CMAKE_BUILD_TYPE}")
if(ELYXION_AS_ADDON)
    message(STATUS "  Target:        Node.js addon (.node)")
else()
    message(STATUS "  Target:        Standalone executable")
endif()
message(STATUS "  Compiler:      ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")
message(STATUS "  Platform:      ${CMAKE_SYSTEM_NAME} ${CMAKE_SYSTEM_PROCESSOR}")
message(STATUS "  Node.js:       v${NODE_VERSION}")
message(STATUS "════════════════════════════════════════")
message(STATUS "")