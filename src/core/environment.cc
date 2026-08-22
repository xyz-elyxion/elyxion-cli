#include "environment.h"
#include "elyxion.h"
#include <iostream>
#include <fstream>
#include <sstream>

namespace elyxion {

Environment::Environment(v8::Isolate* isolate, uv_loop_t* loop)
    : isolate_(isolate),
      loop_(loop),
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
  extern char** environ;
  for (char** envp = environ; *envp; envp++) {
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

bool Environment::Bootstrap() {
  v8::Context::Scope context_scope(context());
  
  SetupCallbacks();
  
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
  RegisterBuiltin("fs", "lib/modules/fs.js");
  RegisterBuiltin("path", "lib/modules/path.js");
  RegisterBuiltin("http", "lib/modules/http.js");
  RegisterBuiltin("https", "lib/modules/https.js");
  RegisterBuiltin("net", "lib/modules/net.js");
  RegisterBuiltin("os", "lib/modules/os.js");
  RegisterBuiltin("util", "lib/modules/util.js");
  RegisterBuiltin("events", "lib/modules/events.js");
  RegisterBuiltin("stream", "lib/modules/stream.js");
  RegisterBuiltin("buffer", "lib/modules/buffer.js");
  RegisterBuiltin("crypto", "lib/modules/crypto.js");
  RegisterBuiltin("child_process", "lib/modules/child_process.js");
  RegisterBuiltin("url", "lib/modules/url.js");
  RegisterBuiltin("querystring", "lib/modules/querystring.js");
  RegisterBuiltin("assert", "lib/modules/assert.js");
  RegisterBuiltin("dns", "lib/modules/dns.js");
  RegisterBuiltin("tls", "lib/modules/tls.js");

  // Expose require to JS
  v8::Local<v8::ObjectTemplate> require_fn = v8::ObjectTemplate::New(isolate_);
  
  auto* env_ptr = this;
  context()->Global()->Set(context(),
      v8::String::NewFromUtf8(isolate_, "require").ToLocalChecked(),
      v8::FunctionTemplate::New(isolate_, [env_ptr](const v8::FunctionCallbackInfo<v8::Value>& info) {
        if (info.Length() < 1) {
          info.GetIsolate()->ThrowException(
              v8::String::NewFromUtf8(info.GetIsolate(), "require() needs an argument").ToLocalChecked());
          return;
        }
        v8::String::Utf8Value module_id(info.GetIsolate(), info[0]);
        v8::Local<v8::Value> exports = env_ptr->NativeRequire(*module_id);
        info.GetReturnValue().Set(exports);
      })->GetFunction(context()).ToLocalChecked()).Check();

  // Add module to global (Node.js compatibility)
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

  // Check built-in modules
  auto builtin = builtin_modules_.find(id);
  if (builtin != builtin_modules_.end()) {
    v8::Local<v8::Value> exports = LoadJSFile(builtin->second);
    module_cache_[id].Reset(isolate_, exports.As<v8::Object>());
    return exports;
  }

  // Relative path resolution
  if (id[0] == '.' || id[0] == '/') {
    std::string resolved = id;
    if (id.find(".js") == std::string::npos) {
      resolved += ".js";
    }
    v8::Local<v8::Value> exports = LoadJSFile(resolved);
    module_cache_[id].Reset(isolate_, exports.As<v8::Object>());
    return exports;
  }

  // Module not found
  std::string err = "Cannot find module '" + id + "'";
  isolate_->ThrowException(
      v8::String::NewFromUtf8(isolate_, err.c_str()).ToLocalChecked());
  return v8::Undefined(isolate_);
}

v8::Local<v8::Value> Environment::LoadJSFile(const std::string& path) {
  std::ifstream file(path);
  if (!file.is_open()) {
    std::string err = "Cannot find module '" + path + "'";
    isolate_->ThrowException(
        v8::String::NewFromUtf8(isolate_, err.c_str()).ToLocalChecked());
    return v8::Undefined(isolate_);
  }

  std::stringstream buf;
  buf << file.rdbuf();
  std::string source = buf.str();

  v8::TryCatch try_catch(isolate_);
  v8::Local<v8::String> source_str =
      v8::String::NewFromUtf8(isolate_, source.c_str()).ToLocalChecked();
  v8::Local<v8::String> filename_str =
      v8::String::NewFromUtf8(isolate_, path.c_str()).ToLocalChecked();

  v8::ScriptOrigin origin(isolate_, filename_str);
  v8::Local<v8::Script> script;
  
  if (!v8::Script::Compile(context(), source_str, &origin).ToLocal(&script)) {
    if (try_catch.HasCaught()) {
      PrintStackTrace(try_catch.Exception());
    }
    return v8::Undefined(isolate_);
  }

  v8::MaybeLocal<v8::Value> result = script->Run(context());
  if (result.IsEmpty()) {
    if (try_catch.HasCaught()) {
      PrintStackTrace(try_catch.Exception());
    }
    return v8::Undefined(isolate_);
  }

  // Return module.exports
  v8::Local<v8::Object> global = context()->Global();
  v8::Local<v8::Value> module_val;
  if (global->Get(context(), 
      v8::String::NewFromUtf8(isolate_, "module").ToLocalChecked())
      .ToLocal(&module_val) && module_val->IsObject()) {
    v8::Local<v8::Object> module_obj = module_val.As<v8::Object>();
    v8::Local<v8::Value> exports;
    if (module_obj->Get(context(),
        v8::String::NewFromUtf8(isolate_, "exports").ToLocalChecked())
        .ToLocal(&exports)) {
      return exports;
    }
  }

  return v8::Object::New(isolate_);
}

}  // namespace elyxion
