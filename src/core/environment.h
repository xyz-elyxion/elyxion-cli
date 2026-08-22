#ifndef ELYXION_ENVIRONMENT_H_
#define ELYXION_ENVIRONMENT_H_

#include <string>
#include <memory>
#include <vector>
#include <uv.h>
#include <v8.h>

namespace elyxion {

class Environment {
 public:
  Environment(v8::Isolate* isolate, uv_loop_t* loop);
  ~Environment();

  // Disable copy
  Environment(const Environment&) = delete;
  Environment& operator=(const Environment&) = delete;

  // Initialization
  bool Initialize(const std::string& main_script);
  bool Run();

  // Getters
  v8::Isolate* isolate() const { return isolate_; }
  uv_loop_t* event_loop() const { return loop_; }
  v8::Local<v8::Context> context() const { return context_.Get(isolate_); }

  // Scope management
  class Scope {
   public:
    explicit Scope(Environment* env);
    ~Scope();
   private:
    Environment* env_;
  };

  // Handle scope
  v8::HandleScope* handle_scope() { return &handle_scope_; }

  // Error handling
  v8::TryCatch* try_catch() { return &try_catch_; }
  void PrintStackTrace(v8::Local<v8::Value> error);

  // Script execution
  v8::MaybeLocal<v8::Value> ExecuteString(
      v8::Local<v8::String> source,
      v8::Local<v8::Value> filename,
      bool print_result = false);

  // Bootstrap
  bool Bootstrap();

 private:
  // Setup functions
  void SetupProcessObject();
  void SetupGlobalObject();
  void SetupCallbacks();
  void SetupTimeouts();

  // Built-in module loading
  void LoadBuiltins();
  v8::MaybeLocal<v8::Object> GetBuiltin(const std::string& name);

  // Promise support
  static void PromiseHook(v8::PromiseHookType type,
                          v8::Local<v8::Promise> promise,
                          v8::Local<v8::Value> parent);

  // Unhandled rejection tracking
  static void HostPromiseRejectCallback(
      v8::PromiseRejectMessage message);

  // Data
  v8::Isolate* isolate_;
  uv_loop_t* loop_;
  v8::HandleScope handle_scope_;
  v8::Global<v8::Context> context_;
  v8::TryCatch try_catch_;
  bool running_;

  // References to JS objects
  v8::Global<v8::Object> process_;
  v8::Global<v8::Object> global_;
};

}  // namespace elyxion

#endif  // ELYXION_ENVIRONMENT_H_
