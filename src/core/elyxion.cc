#include "elyxion.h"
#include "environment.h"
#include "isolate_data.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <libplatform/libplatform.h>
#include <uv.h>

namespace elyxion {

static uv_loop_t* default_loop = nullptr;
#ifndef ELYXION_AS_ADDON
static std::unique_ptr<v8::Platform> platform;
#endif

void InitPlatform() {
#ifndef ELYXION_AS_ADDON
  platform = v8::platform::NewDefaultPlatform();
  v8::V8::InitializePlatform(platform.get());
  v8::V8::Initialize();
#endif
}

void TearDownPlatform() {
#ifndef ELYXION_AS_ADDON
  v8::V8::Dispose();
  v8::V8::DisposePlatform();
#endif
}



int Start(int argc, char* argv[]) {
  v8::Isolate::CreateParams create_params;
  create_params.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  
  return StartWithIsolate(&create_params, argc, argv);
}

int StartWithIsolate(v8::Isolate::CreateParams* params, int argc, char* argv[]) {
#ifndef ELYXION_AS_ADDON
  InitPlatform();
#endif
  
  // Parse command line arguments
  bool run_interactive = false;
  std::string eval_string;
  std::string filename;
  
  for (int i = 1; i < argc; i++) {
    std::string arg(argv[i]);
    
    if (arg == "-e" || arg == "--eval") {
      if (i + 1 < argc) {
        eval_string = argv[++i];
      }
    } else if (arg == "-i" || arg == "--interactive") {
      run_interactive = true;
    } else if (arg == "--repl") {
      run_interactive = true;
    } else if (arg == "-v" || arg == "--version") {
      std::cout << "elyxion v" << ELYXION_VERSION_STRING << std::endl;
      TearDownPlatform();
      return 0;
    } else if (arg == "-h" || arg == "--help") {
      std::cout << "Usage: elyxion [options] [script.js | -e \"code\"]" << std::endl;
      std::cout << std::endl;
      std::cout << "Options:" << std::endl;
      std::cout << "  -e, --eval <code>     Evaluate code" << std::endl;
      std::cout << "  -i, --interactive     Start REPL" << std::endl;
      std::cout << "  -v, --version         Print version" << std::endl;
      std::cout << "  -h, --help            Print help" << std::endl;
      std::cout << std::endl;
      std::cout << "Examples:" << std::endl;
      std::cout << "  elyxion script.js     Run a script" << std::endl;
      std::cout << "  elyxion -e \"console.log('hello')\"" << std::endl;
      std::cout << "  elyxion --repl        Start interactive REPL" << std::endl;
      TearDownPlatform();
      return 0;
    } else if (arg[0] != '-') {
      filename = arg;
    }
  }
  
  // Create isolate and event loop
  v8::Isolate* isolate = v8::Isolate::New(*params);
  default_loop = uv_default_loop();
  
  {
    v8::Isolate::Scope isolate_scope(isolate);
    v8::HandleScope handle_scope(isolate);
    
    // Create environment
    Environment env(isolate, default_loop);
    
    // Initialize
    if (!env.Initialize(filename)) {
      std::cerr << "Failed to initialize elyxion" << std::endl;
      isolate->Dispose();
      uv_loop_close(default_loop);
      TearDownPlatform();
      return 1;
    }
    
    // Execute code or script
    if (!eval_string.empty()) {
      v8::Local<v8::String> source = 
          v8::String::NewFromUtf8(isolate, eval_string.c_str()).ToLocalChecked();
      v8::Local<v8::String> filename_str = 
          v8::String::NewFromUtf8(isolate, "[eval]").ToLocalChecked();
      
      v8::MaybeLocal<v8::Value> result = env.ExecuteString(source, filename_str);
      
    } else if (!filename.empty()) {
      // Read file
      std::ifstream file(filename);
      if (!file.is_open()) {
        std::cerr << "elyxion: cannot open file '" << filename << "'" << std::endl;
        isolate->Dispose();
        uv_loop_close(default_loop);
        TearDownPlatform();
        return 1;
      }
      
      std::stringstream buffer;
      buffer << file.rdbuf();
      std::string source_str = buffer.str();
      
      v8::Local<v8::String> source = 
          v8::String::NewFromUtf8(isolate, source_str.c_str()).ToLocalChecked();
      v8::Local<v8::String> filename_str = 
          v8::String::NewFromUtf8(isolate, filename.c_str()).ToLocalChecked();
      
    } else if (run_interactive) {
      // Start REPL
      std::cout << "elyxion v" << ELYXION_VERSION_STRING << " (V8 " 
                << v8::V8::GetVersion() << ")" << std::endl;
      std::cout << "Type '.help' for options" << std::endl;
      
      std::string line;
      while (true) {
        std::cout << "elyxion> ";
        
        if (!std::getline(std::cin, line)) {
          break;
        }
        
        if (line.empty()) continue;
        
        // Check for REPL commands
        if (line == ".exit" || line == ".quit") {
          break;
        } else if (line == ".help") {
          std::cout << "Commands:" << std::endl;
          std::cout << "  .exit, .quit    Exit REPL" << std::endl;
          std::cout << "  .help           Show this help" << std::endl;
          std::cout << "  .clear           Clear context" << std::endl;
          continue;
        } else if (line == ".clear") {
          // Will be implemented
          std::cout << "Context cleared" << std::endl;
          continue;
        }
        
        v8::Local<v8::String> source = 
            v8::String::NewFromUtf8(isolate, line.c_str()).ToLocalChecked();
        v8::Local<v8::String> filename_str = 
            v8::String::NewFromUtf8(isolate, "<repl>").ToLocalChecked();
        
        env.ExecuteString(source, filename_str, true);
      }
    }
    
    // Run the event loop
    env.Run();
  }
  
  // Cleanup
  isolate->Dispose();
  uv_loop_close(default_loop);
  TearDownPlatform();
  
  delete params->array_buffer_allocator;
  
  return 0;
}

v8::MaybeLocal<v8::Promise> PromiseResolve(v8::Local<v8::Context> context,
                                            v8::Local<v8::Value> value) {
  v8::Local<v8::Promise::Resolver> resolver;
  if (!v8::Promise::Resolver::New(context).ToLocal(&resolver)) {
    return v8::MaybeLocal<v8::Promise>();
  }
  (void)resolver->Resolve(context, value);
  return resolver->GetPromise();
}

}  // namespace elyxion

// Main entry point (only for standalone builds, not for addon builds)
#ifndef ELYXION_AS_ADDON
int main(int argc, char* argv[]) {
  return elyxion::Start(argc, argv);
}
#endif
