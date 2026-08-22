#include "environment.h"
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
  context_.Reset(context);

  // Setup globals
  v8::Context::Scope context_scope(context);
  
  SetupProcessObject();
  SetupGlobalObject();
  
  // Bootstrap the runtime
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
        char cwd[PATH_MAX];
        if (uv_cwd(cwd, sizeof(cwd)) == 0) {
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
  
  process_.Reset(process);
  
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
  
  // Add require function (will be implemented in JS)
  v8::Local<v8::FunctionTemplate> require_template = v8::FunctionTemplate::New(isolate_,
      [](const v8::FunctionCallbackInfo<v8::Value>& info) {
        // Placeholder for require
        v8::Isolate* isolate = info.GetIsolate();
        v8::Local<v8::Context> context = isolate->GetCurrentContext();
        
        if (info.Length() < 1) {
          isolate->ThrowException(v8::Exception::TypeError(
              v8::String::NewFromUtf8(isolate, "require() requires a module name").ToLocalChecked()));
          return;
        }
        
        v8::String::Utf8Value module_name(isolate, info[0]);
        // Module resolution will be implemented
        info.GetReturnValue().Set(v8::Object::New(isolate));
      });
  
  require_template->SetClassName(
      v8::String::NewFromUtf8(isolate_, "elyxionRequire").ToLocalChecked());
}

void Environment::SetupCallbacks() {
  // Setup promise hooks
  isolate_->SetPromiseHookCallback(PromiseHook);
  isolate_->SetHostPromiseRejectCallback(HostPromiseRejectCallback);
}

bool Environment::Bootstrap() {
  v8::Context::Scope context_scope(context());
  v8::EscapableHandleScope handle_scope(isolate_);
  
  SetupCallbacks();
  
  return handle_scope.EscapeMaybe(v8::True(isolate_)).IsNothing() || true;
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
  
  v8::ScriptOrigin origin(filename);
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
  
  v8::Local<v8::String> name_key = v8::String::NewFromUtf8(isolate_, "name").ToLocalChecked();
  v8::Local<v8::String> message_key = v8::String::NewFromUtf8(isolate_, "message").ToLocalChecked();
  v8::Local<v8::String> stack_key = v8::String::NewFromUtf8(isolate_, "stack").ToLocalChecked();
  
  v8::Local<v8::Value> stack;
  if (error_obj->Get(context(), stack_key).ToLocal(&stack) && stack->IsString()) {
    v8::String::Utf8Value stack_str(isolate_, stack);
    std::cerr << *stack_str << std::endl;
  } else {
    v8::Local<v8::Value> name;
    v8::Local<v8::Value> message;
    
    error_obj->Get(context(), name_key).ToLocal(&name);
    error_obj->Get(context(), message_key).ToLocal(&message);
    
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

void Environment::PromiseHook(v8::PromiseHookType type,
                               v8::Local<v8::Promise> promise,
                               v8::Local<v8::Value> parent) {
  // Promise tracking will be implemented
}

void Environment::HostPromiseRejectCallback(v8::PromiseRejectMessage message) {
  // Unhandled rejection tracking will be implemented
}

}  // namespace elyxion
