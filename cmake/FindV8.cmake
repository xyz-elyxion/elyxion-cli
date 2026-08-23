# FindV8.cmake
# Locates a pre-built standalone V8 SDK and monolithic library.
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
    # Try common locations on each platform.
    set(_v8_search_paths
        "${CMAKE_BINARY_DIR}/v8"
        "${CMAKE_SOURCE_DIR}/build/v8"
        "${CMAKE_SOURCE_DIR}/.v8"
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

    # Find the monolithic library produced by a standalone V8 build.
    find_library(V8_LIBRARY
        NAMES v8_monolith v8_monolith.lib libv8_monolith.a
        PATHS "${V8_DIR}" "${V8_DIR}/lib" "${V8_DIR}/lib64" "${V8_DIR}/obj"
        NO_DEFAULT_PATH
    )

    if(NOT V8_LIBRARY)
        message(WARNING "V8 headers found at ${V8_DIR} but no v8_monolith library found")
    endif()

    # Find optional V8 platform library and runtime data files.
    find_library(V8_PLATFORM_LIBRARY
        NAMES v8_libplatform libv8_libplatform
        PATHS "${V8_DIR}" "${V8_DIR}/lib" "${V8_DIR}/lib64" "${V8_DIR}/obj"
        NO_DEFAULT_PATH
    )
    file(GLOB_RECURSE V8_DLLS
        "${V8_DIR}/*.dll"
        "${V8_DIR}/*.bin"
        "${V8_DIR}/*.dat"
    )

    if(V8_LIBRARY)
        message(STATUS "V8 library: ${V8_LIBRARY}")
        message(STATUS "V8 headers: ${V8_INCLUDE_DIR}")

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

mark_as_advanced(V8_INCLUDE_DIR V8_LIBRARY V8_PLATFORM_LIBRARY WINMM_LIBRARY DBGHELP_LIBRARY SHLWAPI_LIBRARY)

# Handle the REQUIRED argument
include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(V8
    REQUIRED_VARS V8_LIBRARY V8_INCLUDE_DIR
)