{
  "targets": [
    {
      "target_name": "elyxion",
      "sources": [
        "src/core/elyxion.cc",
        "src/core/environment.cc",
        "src/loop/event_loop.cc"
      ],
      "include_dirs": [
        "src/core",
        "src/loop",
        "<!(node -e \"require('path').join(process.cwd(), 'include')\")"
      ],
      "conditions": [
        ["OS=='linux'", {
          "libraries": [
            "-lpthread"
          ]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"],
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
          }
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
