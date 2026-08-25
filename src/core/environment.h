#ifndef ELYXION_ENVIRONMENT_H_
#define ELYXION_ENVIRONMENT_H_

#include <string>
#include <memory>
#include <vector>
#include <unordered_map>
#include <uv.h>
#include <v8.h>

namespace elyxion {

class Environment;

// Holds a libuv TCP server and its JS connection callback.
struct TCPListener {
  uv_tcp_t handle;
  v8::Global<v8::Function> on_connection;
  v8::Isolate* isolate;
  Environment* env;
};

class Environment {
 public:
  Environment(v8::Isolate* isolate, uv_loop_t* loop, const std::string& resource_root);
  ~Environment();

  // Disable copy
  Environment(const Environment&) = delete;
  Environment& operator=(const Environment&) = delete;

  // Initialization
  bool Initialize(const std::string& main_script);
  bool Run();
  void SetArgv(int argc, char* argv[]);

  // Getters
  v8::Isolate* isolate() const { return isolate_; }
  uv_loop_t* event_loop() const { return loop_; }
  v8::Local<v8::Context> context() const { return context_.Get(isolate_); }

  // Handle scope
  v8::HandleScope* handle_scope() { return &handle_scope_; }

  // Error handling
  void PrintStackTrace(v8::Local<v8::Value> error);

  // Script execution
  v8::MaybeLocal<v8::Value> ExecuteString(
      v8::Local<v8::String> source,
      v8::Local<v8::Value> filename,
      bool print_result = false);

  // Bootstrap
  bool Bootstrap();

  // Module system (standalone builds)
  void SetupRequire();
  v8::Local<v8::Value> NativeRequire(const std::string& id);
  v8::MaybeLocal<v8::Value> LoadJSFile(const std::string& path);
  void RegisterBuiltin(const std::string& name, const std::string& path);

 private:
  // Setup functions
  void SetupProcessObject();
  void SetupGlobalObject();
  void SetupCallbacks();
  void SetupNativeFunctions();

  // Data
  v8::Isolate* isolate_;
  uv_loop_t* loop_;
  std::string resource_root_;
  std::string current_module_dir_;
  v8::HandleScope handle_scope_;
  v8::Global<v8::Context> context_;
  bool running_;

  // References to JS objects
  v8::Global<v8::Object> process_;
  v8::Global<v8::Object> global_;

  // Module cache
  std::unordered_map<std::string, v8::Global<v8::Object>> module_cache_;
  std::unordered_map<std::string, std::string> builtin_modules_;

  // TCP listeners
  int next_listener_id_ = 1;
  std::unordered_map<int, TCPListener*> tcp_listeners_;
};

}  // namespace elyxion

#endif  // ELYXION_ENVIRONMENT_H_
