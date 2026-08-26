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
class EventLoop;

// Holds a libuv TCP listening socket and its JS on-connection callback.
struct TCPListener {
  uv_tcp_t handle;
  v8::Global<v8::Function> on_connection;
  v8::Isolate* isolate;
  Environment* env;
};

// Holds a libuv TCP connection (accepted socket) and its JS callbacks.
struct TCPConnection {
  uv_tcp_t handle;
  v8::Global<v8::Function> on_data;
  v8::Global<v8::Function> on_end;
  v8::Global<v8::Function> on_error;
  v8::Isolate* isolate;
  Environment* env;
  bool closed = false;
  char read_buf[65536];
};

class Environment {
 public:
  Environment(v8::Isolate* isolate, uv_loop_t* loop, const std::string& resource_root,
              EventLoop* event_loop = nullptr);
  ~Environment();

  Environment(const Environment&) = delete;
  Environment& operator=(const Environment&) = delete;

  bool Initialize(const std::string& main_script);
  bool Run();
  void SetArgv(int argc, char* argv[]);

  v8::Isolate* isolate() const { return isolate_; }
  uv_loop_t* event_loop() const { return loop_; }
  EventLoop* timer_loop() const { return event_loop_; }
  v8::Local<v8::Context> context() const { return context_.Get(isolate_); }

  void PrintStackTrace(v8::Local<v8::Value> error);

  v8::MaybeLocal<v8::Value> ExecuteString(
      v8::Local<v8::String> source,
      v8::Local<v8::Value> filename,
      bool print_result = false);

  bool Bootstrap();

  void SetupRequire();
  v8::Local<v8::Value> NativeRequire(const std::string& id);
  v8::MaybeLocal<v8::Value> LoadJSFile(const std::string& path);
  void RegisterBuiltin(const std::string& name, const std::string& path);

  // TCP helpers exposed to SetupNativeFunctions (defined below)
  int AllocListenerId() { return next_listener_id_++; }
  int AllocConnectionId() { return next_conn_id_++; }
  std::unordered_map<int, TCPListener*>& listeners() { return tcp_listeners_; }
  std::unordered_map<int, TCPConnection*>& connections() { return tcp_connections_; }

 private:
  void SetupProcessObject();
  void SetupGlobalObject();
  void SetupCallbacks();
  void SetupNativeFunctions();

  v8::Isolate* isolate_;
  uv_loop_t* loop_;
  EventLoop* event_loop_;
  std::string resource_root_;
  std::string current_module_dir_;
  v8::HandleScope handle_scope_;
  v8::Global<v8::Context> context_;
  bool running_;

  v8::Global<v8::Object> process_;
  v8::Global<v8::Object> global_;

  std::unordered_map<std::string, v8::Global<v8::Object>> module_cache_;
  std::unordered_map<std::string, std::string> builtin_modules_;

  int next_listener_id_ = 1;
  int next_conn_id_ = 1;
  std::unordered_map<int, TCPListener*> tcp_listeners_;
  std::unordered_map<int, TCPConnection*> tcp_connections_;
};

}  // namespace elyxion

#endif  // ELYXION_ENVIRONMENT_H_