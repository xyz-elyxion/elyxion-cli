# FindV8.cmake
# Locates a pre-built V8 monolithic library for standalone Windows builds.
#
# Sets:
#   V8_FOUND        - TRUE if V8 was found
#   V8_INCLUDE_DIR  - Path to v8/include
#   V8_LIBRARY      - Path to v8_monolith.lib
#   V8_DLLS         - Required runtime DLLs (v8_monolith.dll, etc.)
#
# Usage:
#   cmake -DV8_DIR=C:/path/to/v8/out/release ...

if(NOT V8_DIR)
    # Try common locations
    set(_v8_search_paths
        "${CMAKE_BINARY_DIR}/_deps/v8-build"
        "${CMAKE_SOURCE_DIR}/build/v8"
        "C:/v8"
    )
    foreach(_p ${_v8_search_paths})
        if(EXISTS "${_p}/include/v8.h")
            set(V8_DIR "${_p}")
            break()
        endif()
    endforeach()
endif()

if(V8_DIR AND EXISTS "${V8_DIR}/include/v8.h")
    set(V8_INCLUDE_DIR "${V8_DIR}/include")

    # Find the monolithic library
    find_library(V8_LIBRARY
        NAMES v8_monolith
        PATHS "${V8_DIR}"
        NO_DEFAULT_PATH
    )

    if(NOT V8_LIBRARY)
        # Try subdirectories
        find_library(V8_LIBRARY
            NAMES v8_monolith
            PATHS
                "${V8_DIR}/obj"
                "${V8_DIR}/lib"
                "${V8_DIR}"
            NO_DEFAULT_PATH
        )
    endif()

    # Find runtime DLLs (needed alongside the executable)
    file(GLOB_RECURSE V8_DLLS
        "${V8_DIR}/*.dll"
        "${V8_DIR}/*.bin"
    )

    if(V8_LIBRARY)
        message(STATUS "V8 library: ${V8_LIBRARY}")
        message(STATUS "V8 headers: ${V8_INCLUDE_DIR}")

        # libv8_monolith also needs these Windows libs
        find_library(WINMM_LIBRARY Winmm)
        find_library(DBGHELP_LIBRARY DbgHelp)
        find_library(SHLWAPI_LIBRARY Shlwapi)

        set(V8_FOUND TRUE)
    else()
        message(WARNING "V8 headers found at ${V8_DIR} but no v8_monolith library found")
        set(V8_FOUND FALSE)
    endif()
else()
    set(V8_FOUND FALSE)
endif()

if(NOT V8_FOUND)
    message(STATUS "V8 not found. Set V8_DIR to a pre-built V8 checkout.")
    message(STATUS "  Example: cmake -DV8_DIR=C:/path/to/v8/out/x64.release ...")
endif()

mark_as_advanced(V8_INCLUDE_DIR V8_LIBRARY WINMM_LIBRARY DBGHELP_LIBRARY SHLWAPI_LIBRARY)

# Handle the REQUIRED argument
include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(V8
    REQUIRED_VARS V8_LIBRARY V8_INCLUDE_DIR
)