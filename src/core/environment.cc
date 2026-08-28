#include "environment.h"
#include "elyxion.h"
#include "loop/event_loop.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <cerrno>
#include <thread>
#include <atomic>
#include <mutex>
#include <deque>
#include <set>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <cstdio>
#else
#include <netdb.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <poll.h>
#include <sys/wait.h>
#include <sys/socket.h>
#include <unistd.h>
extern char** environ;
#endif

#ifdef ELYXION_HAS_OPENSSL
#include <openssl/ssl.h>
#include <openssl/err.h>
#endif

namespace elyxion {

#ifdef ELYXION_HAS_OPENSSL
// The TLS worker entry points are stored here as plain function pointers so
// V8 callbacks (which must be non-capturing function pointers) can reach the
// per-connection worker loop and the libuv async drain without capturing any
// local lambda. They are assigned once in SetupNativeFunctions on the main
// thread, before any __elyxion_tls_* call is invoked from JavaScript.
static void (*g_tls_work_loop)(TLSClient*, std::string, int) = nullptr;
static void (*g_tls_drain)(uv_async_t*) = nullptr;
#endif

Environment::Environment(v8::Isolate* isolate, uv_loop_t* loop, const std::string& resource_root,
                         EventLoop* event_loop)
    : isolate_(isolate),
      loop_(loop),
      event_loop_(event_loop),
      resource_root_(resource_root),
      current_module_dir_(resource_root),
      handle_scope_(isolate),
      running_(false) {
}

Environment::~Environment() {
  // Cleanup global handles
  process_.Reset();
  global_.Reset();
  context_.Reset();
}

bool Environment::Initialize(const std::string& main_script) {
  // Create context
  v8::Local<v8::ObjectTemplate> global_template = 
      v8::ObjectTemplate::New(isolate_);
  
  // Setup global functions
  global_template->Set(
      v8::String::NewFromUtf8(isolate_, "print").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        for (int i = 0; i < info.Length(); i++) {
          if (i > 0) std::cout << " ";
          v8::String::Utf8Value str(info.GetIsolate(), info[i]);
          std::cout << *str;
        }
        std::cout << std::endl;
      }));

  v8::Local<v8::Context> context = v8::Context::New(isolate_, nullptr, global_template);
  context_.Reset(isolate_, context);

  // Setup globals
  v8::Context::Scope context_scope(context);
  
  SetupProcessObject();
  SetupGlobalObject();
  
  // Bootstrap the runtime (SetupRequire is called after bootstrap in elyxion.cc)
  if (!Bootstrap()) {
    return false;
  }

  return true;
}

void Environment::SetArgv(int argc, char* argv[]) {
  v8::HandleScope scope(isolate_);
  v8::Context::Scope context_scope(context());
  v8::Local<v8::Object> process = process_.Get(isolate_);
  v8::Local<v8::Array> argv_array = v8::Array::New(isolate_, argc);
  for (int i = 0; i < argc; ++i) {
    argv_array->Set(context(), static_cast<uint32_t>(i),
        v8::String::NewFromUtf8(isolate_, argv[i]).ToLocalChecked()).Check();
  }
  process->Set(context(), v8::String::NewFromUtf8(isolate_, "argv").ToLocalChecked(), argv_array).Check();
}

void Environment::SetupProcessObject() {
  v8::Context::Scope context_scope(context());
  
  v8::Local<v8::Object> process = v8::Object::New(isolate_);
  
  // Process properties
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "pid").ToLocalChecked(),
      v8::Integer::New(isolate_, uv_os_getpid())).Check();
  
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "ppid").ToLocalChecked(),
      v8::Integer::New(isolate_, uv_os_getppid())).Check();
  
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "version").ToLocalChecked(),
      v8::String::NewFromUtf8(isolate_, ELYXION_VERSION_STRING).ToLocalChecked()).Check();

  v8::Local<v8::Object> versions = v8::Object::New(isolate_);
  versions->Set(context(), v8::String::NewFromUtf8(isolate_, "elyxion").ToLocalChecked(),
      v8::String::NewFromUtf8(isolate_, ELYXION_VERSION_STRING).ToLocalChecked()).Check();
  versions->Set(context(), v8::String::NewFromUtf8(isolate_, "v8").ToLocalChecked(),
      v8::String::NewFromUtf8(isolate_, v8::V8::GetVersion()).ToLocalChecked()).Check();
  process->Set(context(), v8::String::NewFromUtf8(isolate_, "versions").ToLocalChecked(), versions).Check();
  
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "platform").ToLocalChecked(),
      v8::String::NewFromUtf8(isolate_, 
#ifdef _WIN32
        "win32"
#elif defined(__APPLE__)
        "darwin"
#else
        "linux"
#endif
      ).ToLocalChecked()).Check();
  
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "arch").ToLocalChecked(),
      v8::String::NewFromUtf8(isolate_,
#ifdef __x86_64__
        "x64"
#elif defined(__aarch64__)
        "arm64"
#else
        "ia32"
#endif
      ).ToLocalChecked()).Check();
  
  // Process.argv
  v8::Local<v8::Array> argv = v8::Array::New(isolate_);
  // argv will be populated in Start()
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "argv").ToLocalChecked(),
      argv).Check();
  
  // Process methods
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "exit").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        int exit_code = info.Length() > 0 ? info[0]->Int32Value(info.GetIsolate()->GetCurrentContext()).FromMaybe(0) : 0;
        exit(exit_code);
      })->GetFunction(context()).ToLocalChecked()).Check();

  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "nextTick").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() > 0 && info[0]->IsFunction()) {
          std::vector<v8::Local<v8::Value>> args;
          for (int i = 1; i < info.Length(); ++i) args.push_back(info[i]);
          info[0].As<v8::Function>()->Call(
              info.GetIsolate()->GetCurrentContext(),
              info.GetIsolate()->GetCurrentContext()->Global(),
              static_cast<int>(args.size()), args.empty() ? nullptr : args.data()).ToLocalChecked();
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_readline").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() > 0) {
          v8::String::Utf8Value prompt(info.GetIsolate(), info[0]);
          std::cout << *prompt << std::flush;
        }
        std::string line;
        if (std::getline(std::cin, line)) {
          info.GetReturnValue().Set(v8::String::NewFromUtf8(info.GetIsolate(), line.c_str()).ToLocalChecked());
        } else {
          info.GetReturnValue().Set(v8::Null(info.GetIsolate()));
        }
      })->GetFunction(context()).ToLocalChecked()).Check();
  
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "cwd").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        char cwd[4096];
        size_t size = sizeof(cwd);
        if (uv_cwd(cwd, &size) == 0) {
          info.GetReturnValue().Set(
              v8::String::NewFromUtf8(info.GetIsolate(), cwd).ToLocalChecked());
        }
      })->GetFunction(context()).ToLocalChecked()).Check();
  
  process->Set(context(),
      v8::String::NewFromUtf8(isolate_, "env").ToLocalChecked(),
      v8::Object::New(isolate_)).Check();
  
  // Populate process.env
  v8::Local<v8::Object> env = process->Get(context(),
      v8::String::NewFromUtf8(isolate_, "env").ToLocalChecked()).ToLocalChecked().As<v8::Object>();
  
#ifdef _WIN32
  // Windows environment variables
  // TODO: Add Windows env support
#else
  for (char** envp = ::environ; *envp; envp++) {
    std::string entry(*envp);
    size_t eq = entry.find('=');
    if (eq != std::string::npos) {
      v8::Local<v8::String> key = v8::String::NewFromUtf8(isolate_, entry.substr(0, eq).c_str()).ToLocalChecked();
      v8::Local<v8::String> value = v8::String::NewFromUtf8(isolate_, entry.substr(eq + 1).c_str()).ToLocalChecked();
      env->Set(context(), key, value).Check();
    }
  }
#endif
  
  process_.Reset(isolate_, process);
  
  // Add to global
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "process").ToLocalChecked(),
      process).Check();
}

void Environment::SetupGlobalObject() {
  v8::Context::Scope context_scope(context());
  
  // Add __elyxion_version__
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_version__").ToLocalChecked(),
      v8::String::NewFromUtf8(isolate_, ELYXION_VERSION_STRING).ToLocalChecked()).Check();
  
  // Add console object
  v8::Local<v8::Object> console = v8::Object::New(isolate_);
  
  auto log_func = [](const v8::FunctionCallbackInfo<v8::Value>& info) {
    for (int i = 0; i < info.Length(); i++) {
      if (i > 0) std::cout << " ";
      
      // Handle different types
      v8::Local<v8::Value> val = info[i];
      if (val->IsUndefined()) {
        std::cout << "undefined";
      } else if (val->IsNull()) {
        std::cout << "null";
      } else if (val->IsObject() && !val->IsFunction()) {
        v8::Local<v8::Context> ctx = info.GetIsolate()->GetCurrentContext();
        v8::Local<v8::Object> obj = val.As<v8::Object>();
        v8::Local<v8::Object> json = ctx->Global()->Get(ctx,
            v8::String::NewFromUtf8(info.GetIsolate(), "JSON").ToLocalChecked()).ToLocalChecked().As<v8::Object>();
        v8::Local<v8::Function> stringify = json->Get(ctx,
            v8::String::NewFromUtf8(info.GetIsolate(), "stringify").ToLocalChecked()).ToLocalChecked().As<v8::Function>();
        v8::Local<v8::Value> result = stringify->Call(ctx, json, 1, &val).ToLocalChecked();
        v8::String::Utf8Value str(info.GetIsolate(), result);
        std::cout << *str;
      } else {
        v8::String::Utf8Value str(info.GetIsolate(), val);
        std::cout << *str;
      }
    }
    std::cout << std::endl;
  };
  
  console->Set(context(),
      v8::String::NewFromUtf8(isolate_, "log").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, log_func)->GetFunction(context()).ToLocalChecked()).Check();
  console->Set(context(),
      v8::String::NewFromUtf8(isolate_, "error").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, log_func)->GetFunction(context()).ToLocalChecked()).Check();
  console->Set(context(),
      v8::String::NewFromUtf8(isolate_, "warn").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, log_func)->GetFunction(context()).ToLocalChecked()).Check();
  
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "console").ToLocalChecked(),
      console).Check();
}

void Environment::SetupCallbacks() {
  // Promise hooks - use available V8 API
  // Note: SetPromiseHookCallback may not be available in all V8 versions
}

void Environment::SetupNativeFunctions() {
  v8::Context::Scope context_scope(context());

  // ---- Native timers --------------------------------------------
  // Delegate to EventLoop so uv_timer handles keep the loop alive and
  // actually fire. Without this the process drains sync code and exits.
  // V8 FunctionCallbacks must be plain function pointers, so we fetch the
  // Environment (and its EventLoop) via isolate->GetData(0).

  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "setTimeout").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        EventLoop* event_loop = env ? env->timer_loop() : nullptr;
        if (info.Length() < 1 || !info[0]->IsFunction() || !event_loop) {
          info.GetReturnValue().Set(v8::Integer::New(isolate, 0));
          return;
        }
        int delay = 0;
        if (info.Length() >= 2 && info[1]->IsNumber()) {
          delay = info[1]->Int32Value(isolate->GetCurrentContext()).FromMaybe(0);
          if (delay < 0) delay = 0;
        }
        v8::Local<v8::Value>* args = nullptr;
        int argc = 0;
        if (info.Length() > 2) {
          argc = info.Length() - 2;
          args = new v8::Local<v8::Value>[argc];
          for (int i = 0; i < argc; i++) {
            args[i] = info[i + 2];
          }
        }
        int id = event_loop->SetTimeout(info[0].As<v8::Function>(), delay, args, argc);
        delete[] args;
        info.GetReturnValue().Set(v8::Integer::New(isolate, id));
      })->GetFunction(context()).ToLocalChecked()).Check();

  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "setInterval").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        EventLoop* event_loop = env ? env->timer_loop() : nullptr;
        if (info.Length() < 1 || !info[0]->IsFunction() || !event_loop) {
          info.GetReturnValue().Set(v8::Integer::New(isolate, 0));
          return;
        }
        int interval = 0;
        if (info.Length() >= 2 && info[1]->IsNumber()) {
          interval = info[1]->Int32Value(isolate->GetCurrentContext()).FromMaybe(0);
          if (interval < 0) interval = 0;
        }
        v8::Local<v8::Value>* args = nullptr;
        int argc = 0;
        if (info.Length() > 2) {
          argc = info.Length() - 2;
          args = new v8::Local<v8::Value>[argc];
          for (int i = 0; i < argc; i++) {
            args[i] = info[i + 2];
          }
        }
        int id = event_loop->SetInterval(info[0].As<v8::Function>(), interval, args, argc);
        delete[] args;
        info.GetReturnValue().Set(v8::Integer::New(isolate, id));
      })->GetFunction(context()).ToLocalChecked()).Check();

  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "clearTimeout").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        EventLoop* event_loop = env ? env->timer_loop() : nullptr;
        if (info.Length() >= 1 && event_loop) {
          int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
          event_loop->ClearTimeout(id);
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "clearInterval").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        EventLoop* event_loop = env ? env->timer_loop() : nullptr;
        if (info.Length() >= 1 && event_loop) {
          int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
          event_loop->ClearInterval(id);
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_writeFileSync(path, data)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_writeFileSync").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 2) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        v8::String::Utf8Value data_str(info.GetIsolate(), info[1]);
        std::ofstream out(*path_str, std::ios::binary);
        if (out.is_open()) {
          out.write(*data_str, data_str.length());
          out.close();
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_readFileSync(path) -> string | undefined
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_readFileSync").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        std::ifstream in(*path_str, std::ios::binary);
        if (in.is_open()) {
          std::stringstream buf;
          buf << in.rdbuf();
          info.GetReturnValue().Set(
              v8::String::NewFromUtf8(info.GetIsolate(), buf.str().c_str()).ToLocalChecked());
        } else {
          info.GetReturnValue().Set(v8::Undefined(info.GetIsolate()));
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_mkdir(path)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_mkdir").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        std::filesystem::create_directories(*path_str);
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_exists(path) -> bool
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_exists").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        info.GetReturnValue().Set(v8::Boolean::New(info.GetIsolate(),
            std::filesystem::exists(*path_str)));
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_readdir(path) -> array of filenames
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_readdir").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        v8::Local<v8::Array> result = v8::Array::New(info.GetIsolate());
        try {
          uint32_t idx = 0;
          for (const auto& entry : std::filesystem::directory_iterator(*path_str)) {
            result->Set(info.GetIsolate()->GetCurrentContext(), idx++,
                v8::String::NewFromUtf8(info.GetIsolate(),
                    entry.path().filename().string().c_str()).ToLocalChecked()).Check();
          }
        } catch (...) {}
        info.GetReturnValue().Set(result);
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_stat(path) -> { size, isDir, isFile, mtimeMs } | undefined
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_stat").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        try {
          auto s = std::filesystem::status(*path_str);
          if (!std::filesystem::exists(s)) {
            info.GetReturnValue().Set(v8::Undefined(info.GetIsolate()));
            return;
          }
          v8::Local<v8::Object> obj = v8::Object::New(info.GetIsolate());
          auto ctx = info.GetIsolate()->GetCurrentContext();
          obj->Set(ctx, v8::String::NewFromUtf8(info.GetIsolate(), "isDir").ToLocalChecked(),
              v8::Boolean::New(info.GetIsolate(), std::filesystem::is_directory(s))).Check();
          obj->Set(ctx, v8::String::NewFromUtf8(info.GetIsolate(), "isFile").ToLocalChecked(),
              v8::Boolean::New(info.GetIsolate(), std::filesystem::is_regular_file(s))).Check();
          if (std::filesystem::is_regular_file(s)) {
            obj->Set(ctx, v8::String::NewFromUtf8(info.GetIsolate(), "size").ToLocalChecked(),
                v8::Number::New(info.GetIsolate(),
                    static_cast<double>(std::filesystem::file_size(*path_str)))).Check();
          }
          info.GetReturnValue().Set(obj);
        } catch (...) {
          info.GetReturnValue().Set(v8::Undefined(info.GetIsolate()));
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_unlink(path)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_unlink").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        std::filesystem::remove(*path_str);
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_fs_rmdir(path)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_fs_rmdir").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) return;
        v8::String::Utf8Value path_str(info.GetIsolate(), info[0]);
        std::filesystem::remove_all(*path_str);
      })->GetFunction(context()).ToLocalChecked()).Check();

  // ---- Native process execution -------------------------------
  // __elyxion_exec(command) -> { status, stdout, stderr } | undefined
  // Synchronously runs a shell command and captures its output.
  // Used by child_process.execSync so the CLI can shell out to curl.
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_exec").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        if (info.Length() < 1 || !info[0]->IsString()) return;
        v8::String::Utf8Value cmd(isolate, info[0]);
        std::string command(*cmd);
        if (command.empty()) return;

        std::string out_data;
        std::string err_data;
        int exit_status = -1;

#ifdef _WIN32
        // Windows: _popen with stderr merged into stdout (2>&1)
        FILE* p = _popen((command + " 2>&1").c_str(), "r");
        if (p) {
          char buf[4096];
          size_t n;
          while ((n = fread(buf, 1, sizeof(buf), p)) > 0) out_data.append(buf, n);
          exit_status = _pclose(p);
        }
#else
        int out_pipe[2];
        int err_pipe[2];
        if (pipe(out_pipe) != 0 || pipe(err_pipe) != 0) return;

        pid_t pid = fork();
        if (pid < 0) {
          close(out_pipe[0]); close(out_pipe[1]);
          close(err_pipe[0]); close(err_pipe[1]);
          return;
        }

        if (pid == 0) {
          // Child: wire stdout/stderr to the pipes and exec the shell
          dup2(out_pipe[1], STDOUT_FILENO);
          dup2(err_pipe[1], STDERR_FILENO);
          close(out_pipe[0]); close(out_pipe[1]);
          close(err_pipe[0]); close(err_pipe[1]);
          execl("/bin/sh", "sh", "-c", command.c_str(), (char*)nullptr);
          _exit(127);
        }

        // Parent: read both pipes until EOF, then reap the child
        close(out_pipe[1]);
        close(err_pipe[1]);
        bool out_open = true, err_open = true;
        while (out_open || err_open) {
          struct pollfd fds[2];
          int nfds = 0;
          if (out_open) { fds[nfds].fd = out_pipe[0]; fds[nfds].events = POLLIN; fds[nfds].revents = 0; nfds++; }
          if (err_open) { fds[nfds].fd = err_pipe[0]; fds[nfds].events = POLLIN; fds[nfds].revents = 0; nfds++; }
          int pr = poll(fds, nfds, -1);
          if (pr < 0) break;
          for (int i = 0; i < nfds; i++) {
            int fd = fds[i].fd;
            char buf[4096];
            ssize_t n = read(fd, buf, sizeof(buf));
            if (n > 0) {
              if (fd == out_pipe[0]) out_data.append(buf, n);
              else err_data.append(buf, n);
            } else if (n == 0) {
              close(fd);
              if (fd == out_pipe[0]) out_open = false;
              else err_open = false;
            }
          }
        }

        int raw_status = 0;
        waitpid(pid, &raw_status, 0);
        if (WIFEXITED(raw_status)) exit_status = WEXITSTATUS(raw_status);
        else if (WIFSIGNALED(raw_status)) exit_status = 128 + WTERMSIG(raw_status);
        else exit_status = -1;
#endif

        auto ctx = isolate->GetCurrentContext();
        auto result = v8::Object::New(isolate);
        result->Set(ctx,
            v8::String::NewFromUtf8(isolate, "status").ToLocalChecked(),
            v8::Integer::New(isolate, exit_status)).Check();
        result->Set(ctx,
            v8::String::NewFromUtf8(isolate, "stdout").ToLocalChecked(),
            v8::String::NewFromUtf8(isolate, out_data.c_str()).ToLocalChecked()).Check();
        result->Set(ctx,
            v8::String::NewFromUtf8(isolate, "stderr").ToLocalChecked(),
            v8::String::NewFromUtf8(isolate, err_data.c_str()).ToLocalChecked()).Check();
        info.GetReturnValue().Set(result);
      })->GetFunction(context()).ToLocalChecked()).Check();

  // ---- Native TCP networking ---------------------------------
  // All TCP V8 callbacks get the Environment via isolate->GetData(0)
  // __elyxion_tcp_listen(port, host, callback) -> listenerId
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_tcp_listen").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 1) return;
        int port = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(0);
        std::string host = "0.0.0.0";
        if (info.Length() >= 2 && info[1]->IsString()) {
          v8::String::Utf8Value h(isolate, info[1]);
          host = *h;
        }

        auto* listener = new TCPListener();
        listener->isolate = isolate;
        listener->env = env;
        if (info.Length() >= 3 && info[2]->IsFunction()) {
          listener->on_connection.Reset(isolate, info[2].As<v8::Function>());
        }

        uv_tcp_init(env->event_loop(), &listener->handle);
        listener->handle.data = listener;

        struct sockaddr_in addr;
        uv_ip4_addr(host.c_str(), port, &addr);
        int r = uv_tcp_bind(&listener->handle, (const struct sockaddr*)&addr, 0);
        if (r != 0) {
          delete listener;
          info.GetReturnValue().Set(v8::Integer::New(isolate, -1));
          return;
        }

        r = uv_listen((uv_stream_t*)&listener->handle, 128, [](uv_stream_t* server, int status) {
          if (status < 0) return;
          auto* lst = static_cast<TCPListener*>(server->data);
          auto* env2 = lst->env;
          auto* iso = lst->isolate;

          auto* conn = new TCPConnection();
          conn->isolate = iso;
          conn->env = env2;
          uv_tcp_init(env2->event_loop(), &conn->handle);
          conn->handle.data = conn;

          int r2 = uv_accept(server, (uv_stream_t*)&conn->handle);
          if (r2 != 0) { delete conn; return; }

          int connId = env2->AllocConnectionId();
          env2->connections()[connId] = conn;

          uv_read_start((uv_stream_t*)&conn->handle,
            [](uv_handle_t*, size_t suggested, uv_buf_t* buf) {
              buf->base = new char[suggested];
              buf->len = suggested;
            },
            [](uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
              auto* c = static_cast<TCPConnection*>(stream->data);
              if (nread < 0) {
                delete[] buf->base;
                if (nread == UV_EOF) {
                  v8::Isolate* iso2 = c->isolate;
                  if (!c->on_end.IsEmpty()) {
                    v8::HandleScope hs(iso2);
                    auto ctx = iso2->GetCurrentContext();
                    v8::Local<v8::Function> cb = c->on_end.Get(iso2);
                    cb->Call(ctx, ctx->Global(), 0, nullptr);
                  }
                }
                return;
              }
              v8::Isolate* iso2 = c->isolate;
              if (!c->on_data.IsEmpty()) {
                v8::HandleScope hs(iso2);
                auto ctx = iso2->GetCurrentContext();                v8::Local<v8::Value> arg = v8::String::NewFromOneByte(iso2, (const uint8_t*)buf->base,
                    v8::NewStringType::kNormal, (int)nread).ToLocalChecked();
                v8::Local<v8::Function> cb = c->on_data.Get(iso2);
                cb->Call(ctx, ctx->Global(), 1, &arg);
              }
              delete[] buf->base;
            });

          if (!lst->on_connection.IsEmpty()) {
            v8::HandleScope hs(iso);
            auto ctx = iso->GetCurrentContext();
            v8::Local<v8::Value> arg = v8::Integer::New(iso, connId);
            v8::Local<v8::Function> cb = lst->on_connection.Get(iso);
            cb->Call(ctx, ctx->Global(), 1, &arg);
          }
        });

        if (r != 0) {
          uv_close((uv_handle_t*)&listener->handle, nullptr);
          delete listener;
          info.GetReturnValue().Set(v8::Integer::New(isolate, -1));
          return;
        }

        int id = env->AllocListenerId();
        env->listeners()[id] = listener;
        info.GetReturnValue().Set(v8::Integer::New(isolate, id));
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_tcp_connect(host, port, onConnect, onData, onEnd, onError)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_tcp_connect").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (!env || info.Length() < 2 || !info[0]->IsString()) {
          isolate->ThrowException(v8::Exception::TypeError(
              v8::String::NewFromUtf8(isolate, "tcp.connect(host, port, callbacks) requires a host and port").ToLocalChecked()));
          return;
        }

        v8::String::Utf8Value host_value(isolate, info[0]);
        int port = info[1]->Int32Value(isolate->GetCurrentContext()).FromMaybe(0);
        if (port < 1 || port > 65535) {
          isolate->ThrowException(v8::Exception::RangeError(
              v8::String::NewFromUtf8(isolate, "tcp.connect port must be between 1 and 65535").ToLocalChecked()));
          return;
        }

        auto* conn = new TCPConnection();
        conn->isolate = isolate;
        conn->env = env;
        uv_tcp_init(env->event_loop(), &conn->handle);
        conn->handle.data = conn;

        if (info.Length() >= 3 && info[2]->IsObject()) {
          auto callbacks = info[2].As<v8::Object>();
          auto ctx = isolate->GetCurrentContext();
          auto get_callback = [&](const char* name, v8::Global<v8::Function>& target) {
            v8::Local<v8::Value> value;
            if (callbacks->Get(ctx, v8::String::NewFromUtf8(isolate, name).ToLocalChecked()).ToLocal(&value) && value->IsFunction()) {
              target.Reset(isolate, value.As<v8::Function>());
            }
          };
          get_callback("connect", conn->on_connect);
          get_callback("data", conn->on_data);
          get_callback("end", conn->on_end);
          get_callback("error", conn->on_error);
        }

        int conn_id = env->AllocConnectionId();
        env->connections()[conn_id] = conn;

        auto* req = new uv_connect_t();
        req->data = conn;
        struct sockaddr_in addr;
        if (uv_ip4_addr(*host_value, port, &addr) != 0) {
          struct addrinfo hints{};
          hints.ai_family = AF_INET;
          hints.ai_socktype = SOCK_STREAM;
          struct addrinfo* result = nullptr;
          int gai = getaddrinfo(*host_value, nullptr, &hints, &result);
          if (gai != 0 || !result) {
            env->connections().erase(conn_id);
            delete req;
            uv_close((uv_handle_t*)&conn->handle, [](uv_handle_t* h) { delete static_cast<TCPConnection*>(h->data); });
            isolate->ThrowException(v8::Exception::Error(
                v8::String::NewFromUtf8(isolate, "could not resolve TCP host").ToLocalChecked()));
            return;
          }
          memcpy(&addr, result->ai_addr, sizeof(addr));
          addr.sin_port = htons(static_cast<uint16_t>(port));
          freeaddrinfo(result);
        }

        int r = uv_tcp_connect(req, &conn->handle, (const struct sockaddr*)&addr,
          [](uv_connect_t* request, int status) {
            auto* c = static_cast<TCPConnection*>(request->data);
            auto* env2 = c->env;
            auto* iso = c->isolate;
            delete request;
            if (status < 0) {
              if (!c->on_error.IsEmpty()) {
                v8::HandleScope hs(iso);
                auto ctx = iso->GetCurrentContext();
                v8::Local<v8::Value> arg = v8::Exception::Error(
                    v8::String::NewFromUtf8(iso, uv_strerror(status)).ToLocalChecked());
                c->on_error.Get(iso)->Call(ctx, ctx->Global(), 1, &arg);
              }
              c->closed = true;
              uv_close((uv_handle_t*)&c->handle, [](uv_handle_t* h) { delete static_cast<TCPConnection*>(h->data); });
              return;
            }

            uv_read_start((uv_stream_t*)&c->handle,
              [](uv_handle_t*, size_t suggested, uv_buf_t* buf) {
                buf->base = new char[suggested];
                buf->len = suggested;
              },
              [](uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
                auto* c2 = static_cast<TCPConnection*>(stream->data);
                if (nread < 0) {
                  delete[] buf->base;
                  if (nread == UV_EOF && !c2->on_end.IsEmpty()) {
                    v8::HandleScope hs(c2->isolate);
                    auto ctx = c2->isolate->GetCurrentContext();
                    c2->on_end.Get(c2->isolate)->Call(ctx, ctx->Global(), 0, nullptr);
                  } else if (nread != UV_EOF && !c2->on_error.IsEmpty()) {
                    v8::HandleScope hs(c2->isolate);
                    auto ctx = c2->isolate->GetCurrentContext();
                    v8::Local<v8::Value> arg = v8::Exception::Error(
                        v8::String::NewFromUtf8(c2->isolate, uv_strerror(static_cast<int>(nread))).ToLocalChecked());
                    c2->on_error.Get(c2->isolate)->Call(ctx, ctx->Global(), 1, &arg);
                  }
                  return;
                }
                if (!c2->on_data.IsEmpty()) {
                  v8::HandleScope hs(c2->isolate);
                  auto ctx = c2->isolate->GetCurrentContext();
                  v8::Local<v8::Value> arg = v8::String::NewFromOneByte(c2->isolate, (const uint8_t*)buf->base,
                      v8::NewStringType::kNormal, (int)nread).ToLocalChecked();
                  c2->on_data.Get(c2->isolate)->Call(ctx, ctx->Global(), 1, &arg);
                }
                delete[] buf->base;
              });

            if (!c->on_connect.IsEmpty()) {
              v8::HandleScope hs(iso);
              auto ctx = iso->GetCurrentContext();
              c->on_connect.Get(iso)->Call(ctx, ctx->Global(), 0, nullptr);
            }
            (void)env2;
          });
        if (r != 0) {
          env->connections().erase(conn_id);
          delete req;
          uv_close((uv_handle_t*)&conn->handle, [](uv_handle_t* h) { delete static_cast<TCPConnection*>(h->data); });
          isolate->ThrowException(v8::Exception::Error(
              v8::String::NewFromUtf8(isolate, "could not start TCP connection").ToLocalChecked()));
          return;
        }
        info.GetReturnValue().Set(v8::Integer::New(isolate, conn_id));
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_tcp_close_listener(listenerId)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_tcp_close_listener").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 1) return;
        int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
        auto& listeners = env->listeners();
        auto it = listeners.find(id);
        if (it != listeners.end()) {
          uv_close((uv_handle_t*)&it->second->handle, [](uv_handle_t* h) {
            delete static_cast<TCPListener*>(h->data);
          });
          listeners.erase(it);
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_socket_on_data(connId, callback)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_socket_on_data").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 2) return;
        int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
        auto it = env->connections().find(id);
        if (it != env->connections().end() && info[1]->IsFunction()) {
          it->second->on_data.Reset(isolate, info[1].As<v8::Function>());
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_socket_on_end(connId, callback)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_socket_on_end").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 2) return;
        int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
        auto it = env->connections().find(id);
        if (it != env->connections().end() && info[1]->IsFunction()) {
          it->second->on_end.Reset(isolate, info[1].As<v8::Function>());
        }
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_socket_write(connId, data)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_socket_write").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 2) return;
        int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
        auto it = env->connections().find(id);
        if (it == env->connections().end() || it->second->closed) {
          info.GetReturnValue().Set(v8::Boolean::New(isolate, false));
          return;
        }
        v8::String::Value sval(isolate, info[1]);
        const uint16_t* chars = *sval;
        std::string bytes;
        for (int i = 0; i < sval.length(); ++i) bytes.push_back((char)(chars[i] & 0xff));
        auto* buf = new uv_buf_t();
        buf->base = new char[bytes.size()];
        buf->len = bytes.size();
        memcpy(buf->base, bytes.data(), bytes.size());
        auto* req = new uv_write_t();
        req->data = buf;
        uv_write(req, (uv_stream_t*)&it->second->handle, buf, 1, [](uv_write_t* wreq, int) {
          auto* b = static_cast<uv_buf_t*>(wreq->data);
          delete[] b->base;
          delete b;
          delete wreq;
        });
        info.GetReturnValue().Set(v8::Boolean::New(isolate, true));
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_socket_close(connId)
  // Uses uv_shutdown to flush pending writes before closing.
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_socket_close").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 1) return;
        int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
        auto it = env->connections().find(id);
        if (it == env->connections().end() || it->second->closed) return;
        it->second->closed = true;
        uv_read_stop((uv_stream_t*)&it->second->handle);
        auto* conn = it->second;
        env->connections().erase(it);

        // Shutdown (send FIN), then close the handle in the callback.
        // This ensures all queued uv_write calls flush before the socket
        // is torn down.
        auto* shutdown_req = new uv_shutdown_t();
        shutdown_req->data = conn;
        uv_shutdown(shutdown_req, (uv_stream_t*)&conn->handle, [](uv_shutdown_t* req, int) {
          auto* c = static_cast<TCPConnection*>(req->data);
          delete req;
          uv_close((uv_handle_t*)&c->handle, [](uv_handle_t* h) {
            delete static_cast<TCPConnection*>(h->data);
          });
        });
      })->GetFunction(context()).ToLocalChecked()).Check();

#ifdef ELYXION_HAS_OPENSSL
  // ---- Native TLS client networking -----------------------------
  // Real TLS needs a bidirectional stream, so instead of cascading onto the
  // libuv TCP path we run OpenSSL on a dedicated worker thread per
  // connection. Plaintext writes from JS are queued to that thread and
  // decrypted bytes are marshalled back to the main thread via uv_async.

  // Worker thread: resolves, connects, performs the TLS handshake, then
  // loops flushing outbound writes and reading ciphertext -> plaintext.
  auto tls_worker = [](TLSClient* c, std::string host, int port) {
#ifdef _WIN32
    WSADATA wsadata;
    WSAStartup(MAKEWORD(2, 2), &wsadata);
#endif
    auto push = [c](const std::string& type, const std::string& data) {
      { std::lock_guard<std::mutex> lk(c->mutex);
        c->inbox.push_back(TLSMessage{type, data}); }
      uv_async_send(&c->async);
    };

    SSL_CTX* ctx = SSL_CTX_new(TLS_client_method());
    SSL* ssl = ctx ? SSL_new(ctx) : nullptr;
#ifdef _WIN32
    SOCKET fd = INVALID_SOCKET;
#else
    int fd = -1;
#endif

    if (!ssl) { push("error", "TLS init failed"); }
    else {
      struct addrinfo hints{};
      hints.ai_family = AF_UNSPEC;
      hints.ai_socktype = SOCK_STREAM;
      struct addrinfo* res = nullptr;
      if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &res) != 0 || !res) {
        push("error", "could not resolve TLS host");
      } else {
#ifdef _WIN32
        fd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
#else
        fd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
#endif
        if (fd < 0) { push("error", "could not create TLS socket"); }
        else {
          if (connect(fd, res->ai_addr, (int)res->ai_addrlen) != 0) {
            push("error", "TLS connect failed");
          } else {
            SSL_set_fd(ssl, (int)fd);
            SSL_set_tlsext_host_name(ssl, host.c_str());
            if (SSL_connect(ssl) != 1) {
              push("error", "TLS handshake failed");
            } else {
              push("connect", "");
              // Read/flush loop.
              std::vector<char> wbuffer;
              char plain[65536];
              bool running = true;
              while (running) {
                std::vector<std::string> writes;
                { std::lock_guard<std::mutex> lk(c->mutex);
                  while (!c->outbox.empty()){ writes.push_back(std::move(c->outbox.front())); c->outbox.pop_front(); } }
                for (auto& w : writes) {
                  if (SSL_write(ssl, w.data(), (int)w.size()) <= 0) { push("end", ""); running = false; break; }
                }
                if (!running) break;
                fd_set rfds; FD_ZERO(&rfds); FD_SET(fd, &rfds);
                struct timeval tv{0, 50000}; // 50 ms
                int r = select((int)fd + 1, &rfds, nullptr, nullptr, &tv);
                if (r < 0) break;
                if (r > 0 && FD_ISSET(fd, &rfds)) {
                  int n = SSL_read(ssl, plain, sizeof(plain));
                  if (n > 0) push("data", std::string(plain, n));
                  else if (n == 0) { push("end", ""); running = false; }
                  else { push("error", "TLS read failed"); running = false; }
                }
                { std::lock_guard<std::mutex> lk(c->mutex); if (c->closing) running = false; }
              }
              SSL_shutdown(ssl);
            }
          }
        }
      }
      if (res) freeaddrinfo(res);
      SSL_free(ssl);
    }
    if (ctx) SSL_CTX_free(ctx);
#ifdef _WIN32
    if (fd != INVALID_SOCKET) closesocket(fd);
#else
    if (fd >= 0) { shutdown(fd, SHUT_RDWR); ::close(fd); }
#endif
    { std::lock_guard<std::mutex> lk(c->mutex); c->worker_done = true; }
    uv_async_send(&c->async);
  };

  // Expose the (non-capturing) worker loop as a plain function pointer so the
  // __elyxion_tls_connect V8 callback can start it without capturing a lambda.
  g_tls_work_loop = tls_worker;

  // Runs on the libuv main thread; drains the worker inbox into V8.
  auto tls_async_cb = [](uv_async_t* handle) {
    auto* c = static_cast<TLSClient*>(handle->data);
    v8::Isolate* iso = c->isolate;
    v8::HandleScope hs(iso);
    auto ctx = iso->GetCurrentContext();
    std::vector<TLSMessage> msgs;
    { std::lock_guard<std::mutex> lk(c->mutex);
      while (!c->inbox.empty()){ msgs.push_back(std::move(c->inbox.front())); c->inbox.pop_front(); } }
    for (auto& m : msgs) {
      if (m.type == "connect" && !c->on_connect.IsEmpty()) {
        c->on_connect.Get(iso)->Call(ctx, ctx->Global(), 0, nullptr);
      } else if (m.type == "data" && !c->on_data.IsEmpty()) {
        v8::Local<v8::Value> arg = v8::String::NewFromOneByte(iso, (const uint8_t*)m.data.data(),
            v8::NewStringType::kNormal, (int)m.data.size()).ToLocalChecked();
        c->on_data.Get(iso)->Call(ctx, ctx->Global(), 1, &arg);
      } else if (m.type == "end" && !c->on_end.IsEmpty()) {
        c->on_end.Get(iso)->Call(ctx, ctx->Global(), 0, nullptr);
      } else if (m.type == "error" && !c->on_error.IsEmpty()) {
        v8::Local<v8::Value> arg = v8::Exception::Error(
            v8::String::NewFromUtf8(iso, m.data.c_str()).ToLocalChecked());
        c->on_error.Get(iso)->Call(ctx, ctx->Global(), 1, &arg);
      }
    }

    // When the worker has fully exited and its queue is drained, release.
    bool done = false;
    { std::lock_guard<std::mutex> lk(c->mutex); done = c->worker_done && c->inbox.empty(); }
    if (done && c->env) {
      c->env->tls_clients().erase(c->id);
      c->on_connect.Reset();
      c->on_data.Reset();
      c->on_end.Reset();
      c->on_error.Reset();
      uv_close((uv_handle_t*)&c->async, [](uv_handle_t* h) {
        TLSClient* cc = static_cast<TLSClient*>(h->data);
        cc->env = nullptr;
        delete cc;
      });
    }
  };

  // Expose the (non-capturing) async drain as a plain function pointer so the
  // __elyxion_tls_connect V8 callback can register it with uv_async_init.
  g_tls_drain = tls_async_cb;

  // __elyxion_tls_connect(host, port, { connect, data, end, error }) -> connId
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_tls_connect").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (!env || info.Length() < 3 || !info[0]->IsString()) {
          isolate->ThrowException(v8::Exception::TypeError(
              v8::String::NewFromUtf8(isolate, "tls.connect(host, port, callbacks) requires a host, port and callbacks").ToLocalChecked()));
          return;
        }
        v8::String::Utf8Value hv(isolate, info[0]);
        std::string host(*hv);
        int port = info[1]->Int32Value(isolate->GetCurrentContext()).FromMaybe(0);
        if (port < 1 || port > 65535) {
          isolate->ThrowException(v8::Exception::RangeError(
              v8::String::NewFromUtf8(isolate, "tls.connect port must be between 1 and 65535").ToLocalChecked()));
          return;
        }

        auto* c = new TLSClient();
        c->isolate = isolate;
        c->env = env;
        if (info[2]->IsObject()) {
          auto callbacks = info[2].As<v8::Object>();
          auto ctx = isolate->GetCurrentContext();
          auto get_cb = [&](const char* name, v8::Global<v8::Function>& target) {
            v8::Local<v8::Value> v;
            if (callbacks->Get(ctx, v8::String::NewFromUtf8(isolate, name).ToLocalChecked()).ToLocal(&v) && v->IsFunction()) {
              target.Reset(isolate, v.As<v8::Function>());
            }
          };
          get_cb("connect", c->on_connect);
          get_cb("data", c->on_data);
          get_cb("end", c->on_end);
          get_cb("error", c->on_error);
        }

        int id = env->AllocTlsId();
        c->id = id;
        env->tls_clients()[id] = c;

        uv_async_init(env->event_loop(), &c->async, g_tls_drain);
        c->async.data = c;

        if (!g_tls_work_loop || !g_tls_drain) {
          env->tls_clients().erase(id);
          delete c;
          isolate->ThrowException(v8::Exception::Error(
              v8::String::NewFromUtf8(isolate, "TLS worker is unavailable (built without OpenSSL?)").ToLocalChecked()));
          return;
        }
        std::thread(g_tls_work_loop, c, host, port).detach();
        info.GetReturnValue().Set(v8::Integer::New(isolate, id));
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_tls_write(connId, data) -> bool
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_tls_write").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 2) return;
        int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
        auto it = env->tls_clients().find(id);
        if (it == env->tls_clients().end() || it->second->worker_done) {
          info.GetReturnValue().Set(v8::Boolean::New(isolate, false));
          return;
        }
        v8::String::Value sval(isolate, info[1]);
        const uint16_t* chars = *sval;
        std::string bytes;
        for (int i = 0; i < sval.length(); ++i) bytes.push_back((char)(chars[i] & 0xff));
        { std::lock_guard<std::mutex> lk(it->second->mutex);
          it->second->outbox.push_back(std::move(bytes)); }
        uv_async_send(&it->second->async);
        info.GetReturnValue().Set(v8::Boolean::New(isolate, true));
      })->GetFunction(context()).ToLocalChecked()).Check();

  // __elyxion_tls_close(connId)
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "__elyxion_tls_close").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 1) return;
        int id = info[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
        auto it = env->tls_clients().find(id);
        if (it == env->tls_clients().end()) return;
        { std::lock_guard<std::mutex> lk(it->second->mutex); it->second->closing = true; }
        uv_async_send(&it->second->async);
        // V8 handles are reset here; the TLSClient is freed when the
        // worker finishes (checked on the next async callback).
      })->GetFunction(context()).ToLocalChecked()).Check();
#endif
}

bool Environment::Bootstrap() {
  v8::Context::Scope context_scope(context());
  
  SetupCallbacks();
  SetupNativeFunctions();
  
  return true;
}

bool Environment::Run() {
  v8::Context::Scope context_scope(context());
  
  running_ = true;
  
  // Run the event loop (uv_timer handles from EventLoop keep it alive)
  int alive;
  if (event_loop_ != nullptr) {
    alive = event_loop_->Run();
  } else {
    alive = uv_run(loop_, UV_RUN_DEFAULT);
  }
  
  running_ = false;
  
  return alive == 0;
}

v8::MaybeLocal<v8::Value> Environment::ExecuteString(
    v8::Local<v8::String> source,
    v8::Local<v8::Value> filename,
    bool print_result) {
  
  v8::Context::Scope context_scope(context());
  v8::TryCatch try_catch(isolate_);
  
  v8::ScriptOrigin origin(isolate_, filename);
  v8::Local<v8::Script> script;
  
  if (!v8::Script::Compile(context(), source, &origin).ToLocal(&script)) {
    return v8::MaybeLocal<v8::Value>();
  }
  
  v8::MaybeLocal<v8::Value> result = script->Run(context());
  
  if (result.IsEmpty()) {
    if (try_catch.HasCaught()) {
      PrintStackTrace(try_catch.Exception());
    }
    return v8::MaybeLocal<v8::Value>();
  }
  
  if (print_result) {
    v8::String::Utf8Value str(isolate_, result.ToLocalChecked());
    std::cout << *str << std::endl;
  }
  
  return result;
}

void Environment::PrintStackTrace(v8::Local<v8::Value> error) {
  v8::Context::Scope context_scope(context());
  
  if (error->IsUndefined() || error->IsNull()) {
    std::cerr << "Error: Unknown error" << std::endl;
    return;
  }
  
  v8::TryCatch try_catch(isolate_);
  v8::Local<v8::Object> error_obj = error->ToObject(context()).ToLocalChecked();
  
  v8::Local<v8::String> stack_key = v8::String::NewFromUtf8(isolate_, "stack").ToLocalChecked();
  
  v8::Local<v8::Value> stack;
  if (error_obj->Get(context(), stack_key).ToLocal(&stack) && stack->IsString()) {
    v8::String::Utf8Value stack_str(isolate_, stack);
    std::cerr << *stack_str << std::endl;
  } else {
    v8::Local<v8::String> name_key = v8::String::NewFromUtf8(isolate_, "name").ToLocalChecked();
    v8::Local<v8::String> message_key = v8::String::NewFromUtf8(isolate_, "message").ToLocalChecked();
    
    v8::Local<v8::Value> name;
    v8::Local<v8::Value> message;
    
    (void)error_obj->Get(context(), name_key).ToLocal(&name);
    (void)error_obj->Get(context(), message_key).ToLocal(&message);
    
    if (!name->IsUndefined()) {
      v8::String::Utf8Value name_str(isolate_, name);
      std::cerr << *name_str << ": ";
    }
    
    if (!message->IsUndefined()) {
      v8::String::Utf8Value msg_str(isolate_, message);
      std::cerr << *msg_str;
    }
    
    std::cerr << std::endl;
  }
}

void Environment::SetupRequire() {
  v8::Context::Scope context_scope(context());
  
  // Register built-in modules with their source paths
  RegisterBuiltin("fs", "modules/fs.js");
  RegisterBuiltin("path", "modules/path.js");
  RegisterBuiltin("http", "modules/http.js");
  RegisterBuiltin("https", "modules/http.js");
  RegisterBuiltin("net", "modules/net.js");
  RegisterBuiltin("os", "modules/os.js");
  RegisterBuiltin("util", "modules/util.js");
  RegisterBuiltin("events", "modules/events.js");
  RegisterBuiltin("stream", "modules/stream.js");
  RegisterBuiltin("buffer", "modules/buffer.js");
  RegisterBuiltin("crypto", "modules/crypto.js");
  RegisterBuiltin("child_process", "modules/child_process.js");
  RegisterBuiltin("url", "modules/url.js");
  RegisterBuiltin("querystring", "modules/url.js");
  RegisterBuiltin("assert", "modules/assert.js");
  RegisterBuiltin("dns", "modules/net.js");
  RegisterBuiltin("tls", "modules/tls.js");
  RegisterBuiltin("readline", "modules/readline.js");
  RegisterBuiltin("tcp", "modules/tcp.js");

  // Expose require to JS
  isolate_->SetData(0, this);
  
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "require").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto* isolate = info.GetIsolate();
        auto* env = static_cast<Environment*>(isolate->GetData(0));
        if (info.Length() < 1) {
          isolate->ThrowException(
              v8::String::NewFromUtf8(isolate, "require() needs an argument").ToLocalChecked());
          return;
        }
        v8::String::Utf8Value module_id(isolate, info[0]);
        v8::Local<v8::Value> exports = env->NativeRequire(*module_id);
        info.GetReturnValue().Set(exports);
      })->GetFunction(context()).ToLocalChecked()).Check();

  // Add module to global for CommonJS compatibility
  v8::Local<v8::Object> module_obj = v8::Object::New(isolate_);
  module_obj->Set(context(),
      v8::String::NewFromUtf8(isolate_, "exports").ToLocalChecked(),
      v8::Object::New(isolate_)).Check();
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "module").ToLocalChecked(),
      module_obj).Check();
}

void Environment::RegisterBuiltin(const std::string& name, const std::string& path) {
  builtin_modules_[name] = path;
}

v8::Local<v8::Value> Environment::NativeRequire(const std::string& id) {
  // Check cache
  auto it = module_cache_.find(id);
  if (it != module_cache_.end()) {
    return it->second.Get(isolate_);
  }

  // Check built-in modules.
  auto builtin = builtin_modules_.find(id);
  if (builtin != builtin_modules_.end()) {
    std::string resolved = resource_root_ + "/" + builtin->second;
    v8::Local<v8::Value> exports;
    if (!LoadJSFile(resolved).ToLocal(&exports)) {
      return v8::Undefined(isolate_);
    }
    if (exports->IsObject()) {
      module_cache_[id].Reset(isolate_, exports.As<v8::Object>());
    }
    return exports;
  }

  // Resolve relative modules from the module that called require().
  if (!id.empty() && (id[0] == '.' || id[0] == '/')) {
    std::string resolved = id;
    if (id[0] == '.') {
      resolved = current_module_dir_ + "/" + id;
    }
    if (resolved.size() < 3 || resolved.substr(resolved.size() - 3) != ".js") {
      resolved += ".js";
    }
    v8::Local<v8::Value> exports;
    if (!LoadJSFile(resolved).ToLocal(&exports)) {
      return v8::Undefined(isolate_);
    }
    if (exports->IsObject()) {
      module_cache_[id].Reset(isolate_, exports.As<v8::Object>());
    }
    return exports;
  }

  // Module not found
  std::string err = "Cannot find module '" + id + "'";
  isolate_->ThrowException(
      v8::String::NewFromUtf8(isolate_, err.c_str()).ToLocalChecked());
  return v8::Undefined(isolate_);
}

v8::MaybeLocal<v8::Value> Environment::LoadJSFile(const std::string& path) {
  std::ifstream file(path);
  if (!file.is_open()) {
    std::string err = "Cannot find module '" + path + "'";
    isolate_->ThrowException(
        v8::String::NewFromUtf8(isolate_, err.c_str()).ToLocalChecked());
    return v8::MaybeLocal<v8::Value>();
  }

  std::stringstream buf;
  buf << file.rdbuf();
  const std::string source = buf.str();

  const std::string previous_module_dir = current_module_dir_;
  const size_t slash = path.find_last_of("/\\");
  current_module_dir_ = slash == std::string::npos ? "." : path.substr(0, slash);

  v8::Context::Scope context_scope(context());
  v8::Local<v8::Object> module_obj = v8::Object::New(isolate_);
  v8::Local<v8::Object> exports_obj = v8::Object::New(isolate_);
  module_obj->Set(context(), v8::String::NewFromUtf8(isolate_, "exports").ToLocalChecked(), exports_obj).Check();

  const std::string wrapped =
      "(function (exports, require, module, __filename, __dirname) { " +
      source + " });";
  v8::Local<v8::String> wrapped_source =
      v8::String::NewFromUtf8(isolate_, wrapped.c_str()).ToLocalChecked();
  v8::Local<v8::String> filename_str =
      v8::String::NewFromUtf8(isolate_, path.c_str()).ToLocalChecked();

  v8::TryCatch try_catch(isolate_);
  v8::Local<v8::Script> script;
  v8::ScriptOrigin origin(isolate_, filename_str);
  if (!v8::Script::Compile(context(), wrapped_source, &origin).ToLocal(&script)) {
    if (try_catch.HasCaught()) PrintStackTrace(try_catch.Exception());
    current_module_dir_ = previous_module_dir;
    return v8::MaybeLocal<v8::Value>();
  }

  v8::Local<v8::Value> wrapper_value;
  if (!script->Run(context()).ToLocal(&wrapper_value) || !wrapper_value->IsFunction()) {
    if (try_catch.HasCaught()) PrintStackTrace(try_catch.Exception());
    current_module_dir_ = previous_module_dir;
    return v8::MaybeLocal<v8::Value>();
  }

  v8::Local<v8::Function> wrapper = wrapper_value.As<v8::Function>();
  v8::Local<v8::Value> require_value = context()->Global()->Get(
      context(), v8::String::NewFromUtf8(isolate_, "require").ToLocalChecked()).ToLocalChecked();
  v8::Local<v8::Value> filename_value =
      v8::String::NewFromUtf8(isolate_, path.c_str()).ToLocalChecked();
  v8::Local<v8::Value> dirname_value =
      v8::String::NewFromUtf8(isolate_, current_module_dir_.c_str()).ToLocalChecked();
  v8::Local<v8::Value> wrapper_args[] = {
      exports_obj, require_value, module_obj, filename_value, dirname_value};

  if (wrapper->Call(context(), context()->Global(), 5, wrapper_args).IsEmpty()) {
    if (try_catch.HasCaught()) PrintStackTrace(try_catch.Exception());
    current_module_dir_ = previous_module_dir;
    return v8::MaybeLocal<v8::Value>();
  }

  v8::Local<v8::Value> result = module_obj->Get(
      context(), v8::String::NewFromUtf8(isolate_, "exports").ToLocalChecked()).ToLocalChecked();
  current_module_dir_ = previous_module_dir;
  return v8::MaybeLocal<v8::Value>(result);
}

}  // namespace elyxion
