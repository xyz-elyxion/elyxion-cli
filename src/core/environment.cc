#include "environment.h"
#include "elyxion.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <cstdlib>
#include <filesystem>

#ifndef _WIN32
extern char** environ;
#endif

namespace elyxion {

Environment::Environment(v8::Isolate* isolate, uv_loop_t* loop, const std::string& resource_root)
    : isolate_(isolate),
      loop_(loop),
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

  global_template->Set(
      v8::String::NewFromUtf8(isolate_, "setTimeout").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        // Timer implementation will be added
        info.GetReturnValue().Set(v8::Integer::New(info.GetIsolate(), 0));
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
  
  // Run the event loop
  int alive = uv_run(loop_, UV_RUN_DEFAULT);
  
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
  RegisterBuiltin("tls", "modules/net.js");
  RegisterBuiltin("readline", "modules/readline.js");

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
