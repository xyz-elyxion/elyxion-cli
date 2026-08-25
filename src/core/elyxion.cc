#include "elyxion.h"
#include "environment.h"
#include "isolate_data.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <cstdlib>
#include <filesystem>
#include <libplatform/libplatform.h>
#include <uv.h>

namespace elyxion {

static uv_loop_t* default_loop = nullptr;

static std::string ResourceRoot(const char* executable) {
  const std::filesystem::path executable_path = std::filesystem::absolute(executable).parent_path();
  const std::filesystem::path candidates[] = {
      std::filesystem::path(ELYXION_BUILD_RESOURCE_DIR),
      std::filesystem::path(ELYXION_SOURCE_DIR) / "lib",
      executable_path / "lib",
      executable_path.parent_path() / "lib",
      std::filesystem::current_path() / "lib"};
  for (const auto& candidate : candidates) {
    if (std::filesystem::exists(candidate / "bootstrap.js")) {
      return candidate.string();
    }
  }
  return std::filesystem::path(ELYXION_SOURCE_DIR).append("lib").string();
}

static std::unique_ptr<v8::Platform> platform;

void InitPlatform() {
  platform = v8::platform::NewDefaultPlatform();
  v8::V8::InitializePlatform(platform.get());
  v8::V8::Initialize();
}

void TearDownPlatform() {
  v8::V8::Dispose();
  v8::V8::DisposePlatform();
}



int Start(int argc, char* argv[]) {
  v8::Isolate::CreateParams create_params;
  create_params.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  
  return StartWithIsolate(&create_params, argc, argv);
}

// Helper: execute a string in the environment
static bool ExecuteFileContent(Environment& env, const std::string& source_str, 
                                const std::string& filename_str) {
  v8::Isolate* isolate = env.isolate();
  v8::Local<v8::String> source = 
      v8::String::NewFromUtf8(isolate, source_str.c_str()).ToLocalChecked();
  v8::Local<v8::String> fname = 
      v8::String::NewFromUtf8(isolate, filename_str.c_str()).ToLocalChecked();
  
  v8::TryCatch try_catch(isolate);
  v8::MaybeLocal<v8::Value> result = env.ExecuteString(source, fname);
  
  if (result.IsEmpty()) {
    if (try_catch.HasCaught()) env.PrintStackTrace(try_catch.Exception());
    return false;
  }
  return true;
}

int StartWithIsolate(v8::Isolate::CreateParams* params, int argc, char* argv[]) {
  InitPlatform();
  std::unique_ptr<v8::ArrayBuffer::Allocator> allocator(
      params->array_buffer_allocator);
  
  // Parse command line arguments
  bool run_interactive = false;
  bool print_result = false;
  std::string eval_string;
  std::string filename;
  std::string require_module;
  bool package_manager = false;
  
  for (int i = 1; i < argc; i++) {
    std::string arg(argv[i]);
    
    if (arg == "--package-manager") {
      package_manager = true;
    } else if (arg == "-e" || arg == "--eval") {
      if (i + 1 < argc) {
        eval_string = argv[++i];
      }
    } else if (arg == "-p" || arg == "--print") {
      print_result = true;
      if (i + 1 < argc) eval_string = argv[++i];
    } else if (arg == "-r" || arg == "--require") {
      if (i + 1 < argc) {
        require_module = argv[++i];
      }
    } else if (arg == "-i" || arg == "--interactive") {
      run_interactive = true;
    } else if (arg == "--repl") {
      run_interactive = true;
    } else if (arg == "--upgrade" || arg == "--update") {
      std::cout << "elyxion: checking for updates..." << std::endl;
      int ret = 0;
#ifdef _WIN32
      ret = std::system("powershell -NoProfile -Command \"iwr -useb https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.ps1 | iex\"");
#else
      ret = std::system("curl -fsSL https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.sh | bash");
#endif
      if (ret != 0) {
        std::cerr << "elyxion: upgrade failed. You can manually reinstall:" << std::endl;
        std::cerr << "  curl -fsSL https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.sh | bash" << std::endl;
      }
      return ret;
    } else if ((arg == "-v" || arg == "--version") && !package_manager) {
      std::cout << "elyxion v" << ELYXION_VERSION_STRING << std::endl;
      TearDownPlatform();
      return 0;
    } else if ((arg == "-h" || arg == "--help") && !package_manager) {
      std::cout << "Usage: elyxion [options] [script.js | -e \"code\"]" << std::endl;
      std::cout << std::endl;
      std::cout << "Options:" << std::endl;
      std::cout << "  -e, --eval <code>     Evaluate code" << std::endl;
      std::cout << "  -p, --print <code>    Evaluate and print result" << std::endl;
      std::cout << "  -r, --require <mod>   Require module before script" << std::endl;
      std::cout << "  -i, --interactive     Start REPL" << std::endl;
      std::cout << "  -v, --version         Print version" << std::endl;
      std::cout << "  -h, --help            Print help" << std::endl;
      std::cout << "  --upgrade, --update   Upgrade to the latest version" << std::endl;
      std::cout << "  --check-updates       Check for newer versions" << std::endl;
      std::cout << std::endl;
      std::cout << "Examples:" << std::endl;
      std::cout << "  elyxion script.js     Run a script" << std::endl;
      std::cout << "  elyxion -e \"console.log('hello')\"" << std::endl;
      std::cout << "  elyxion --repl        Start interactive REPL" << std::endl;
      TearDownPlatform();
      return 0;
    } else if (arg[0] != '-') {
      if (filename.empty()) filename = arg;
    }
  }
  
  // Create isolate and event loop
  v8::Isolate* isolate = v8::Isolate::New(*params);
  default_loop = uv_default_loop();
  int exit_code = 0;
  
  do {
    v8::Isolate::Scope isolate_scope(isolate);
    v8::HandleScope handle_scope(isolate);
    
    // Create environment
    Environment env(isolate, default_loop, ResourceRoot(argv[0]));
    
    // Initialize
    if (!env.Initialize(filename)) {
      std::cerr << "Failed to initialize elyxion" << std::endl;
      exit_code = 1;
      break;
    }
    env.SetArgv(argc, argv);
    
    // Load bootstrap JS from disk (provides EventEmitter, Buffer, etc.)
    // After this, overwrite require with the C++ native version
    {
      const std::string bootstrap_path = ResourceRoot(argv[0]) + "/bootstrap.js";
      std::ifstream bootstrap_file(bootstrap_path);
      if (bootstrap_file.is_open()) {
        std::stringstream bbuf;
        bbuf << bootstrap_file.rdbuf();
        if (!ExecuteFileContent(env, bbuf.str(), bootstrap_path)) {
          std::cerr << "Failed to bootstrap runtime" << std::endl;
        }
        // Override require with C++ native version
        env.SetupRequire();
      }
    }
    
    // Handle pre-require modules
    if (!require_module.empty()) {
      std::stringstream preload;
      preload << "require('" << require_module << "');";
      ExecuteFileContent(env, preload.str(), "[require]");
    }
    
    // Execute code or script
    if (package_manager) {
      if (!ExecuteFileContent(env, "require('./pkg/cli.js').run(process.argv.slice(2));", "[elyx]")) {
        std::cerr << "elyx: package manager is unavailable" << std::endl;
        exit_code = 1;
        break;
      }
    } else if (!eval_string.empty()) {
      if (print_result) {
        v8::Local<v8::String> source = v8::String::NewFromUtf8(isolate, eval_string.c_str()).ToLocalChecked();
        v8::Local<v8::String> name = v8::String::NewFromUtf8(isolate, "[eval]").ToLocalChecked();
        if (env.ExecuteString(source, name, true).IsEmpty()) {
          exit_code = 1;
          break;
        }
      } else {
        if (!ExecuteFileContent(env, eval_string, "[eval]")) {
          exit_code = 1;
          break;
        }
      }
      
    } else if (!filename.empty()) {
      if (!std::filesystem::exists(filename)) {
        std::cerr << "elyxion: cannot open file '" << filename << "'" << std::endl;
        exit_code = 1;
        break;
      }
      v8::Local<v8::Value> script_result;
      if (!env.LoadJSFile(std::filesystem::absolute(filename).string()).ToLocal(&script_result)) {
        exit_code = 1;
        break;
      }
      
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
          std::cout << "Context cleared" << std::endl;
          continue;
        }
        
        v8::Local<v8::String> source = 
            v8::String::NewFromUtf8(isolate, line.c_str()).ToLocalChecked();
        v8::Local<v8::String> filename_str = 
            v8::String::NewFromUtf8(isolate, "<repl>").ToLocalChecked();
        
        env.ExecuteString(source, filename_str, true);
      }
    } else if (uv_guess_handle(0) != UV_TTY) {
      std::stringstream stdin_buffer;
      stdin_buffer << std::cin.rdbuf();
      ExecuteFileContent(env, stdin_buffer.str(), "[stdin]");
    }
    
    // Run the event loop
    env.Run();
  } while (false);
  
  // Cleanup after the Isolate::Scope has exited.
  isolate->Dispose();
  uv_loop_close(default_loop);
  TearDownPlatform();
  
  params->array_buffer_allocator = nullptr;
  
  return exit_code;
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
int main(int argc, char* argv[]) {
  return elyxion::Start(argc, argv);
}
