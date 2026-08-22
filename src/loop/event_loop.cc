#include "event_loop.h"
#include <algorithm>
#include <iostream>

namespace elyxion {

EventLoop::EventLoop(v8::Isolate* isolate, uv_loop_t* loop)
    : isolate_(isolate),
      loop_(loop),
      next_timer_id_(1),
      running_(false) {
  
  uv_prepare_init(loop_, &immediate_handle_);
  immediate_handle_.data = this;
}

EventLoop::~EventLoop() {
  // Cleanup all timers
  for (auto& pair : timers_) {
    Timer* timer = pair.second;
    uv_timer_stop(&timer->handle);
    uv_close(reinterpret_cast<uv_handle_t*>(&timer->handle), [](uv_handle_t* handle) {
      Timer* timer = reinterpret_cast<Timer*>(handle->data);
      delete timer;
    });
  }
  timers_.clear();
  
  // Cleanup immediate handle
  uv_prepare_stop(&immediate_handle_);
  uv_close(reinterpret_cast<uv_handle_t*>(&immediate_handle_), nullptr);
}

int EventLoop::SetTimeout(v8::Local<v8::Function> callback, int delay_ms,
                           v8::Local<v8::Value> args[], int argc) {
  Timer* timer = new Timer();
  timer->id = next_timer_id_++;
  timer->callback.Reset(isolate_, callback);
  timer->args = new v8::Global<v8::Value>[argc];
  for (int i = 0; i < argc; i++) {
    timer->args[i].Reset(isolate_, args[i]);
  }
  timer->argc = argc;
  timer->repeat = false;
  timer->loop = this;
  
  uv_timer_init(loop_, &timer->handle);
  timer->handle.data = timer;
  
  uv_timer_start(&timer->handle, TimerCallback, delay_ms, 0);
  
  timers_[timer->id] = timer;
  
  return timer->id;
}

int EventLoop::SetInterval(v8::Local<v8::Function> callback, int interval_ms,
                            v8::Local<v8::Value> args[], int argc) {
  Timer* timer = new Timer();
  timer->id = next_timer_id_++;
  timer->callback.Reset(isolate_, callback);
  timer->args = new v8::Global<v8::Value>[argc];
  for (int i = 0; i < argc; i++) {
    timer->args[i].Reset(isolate_, args[i]);
  }
  timer->argc = argc;
  timer->repeat = true;
  timer->loop = this;
  
  uv_timer_init(loop_, &timer->handle);
  timer->handle.data = timer;
  
  uv_timer_start(&timer->handle, TimerCallback, interval_ms, interval_ms);
  
  timers_[timer->id] = timer;
  
  return timer->id;
}

void EventLoop::ClearTimeout(int id) {
  auto it = timers_.find(id);
  if (it != timers_.end()) {
    Timer* timer = it->second;
    uv_timer_stop(&timer->handle);
    
    // Schedule cleanup
    uv_close(reinterpret_cast<uv_handle_t*>(&timer->handle), [](uv_handle_t* handle) {
      Timer* timer = reinterpret_cast<Timer*>(handle->data);
      delete[] timer->args;
      delete timer;
    });
    
    timers_.erase(it);
  }
}

void EventLoop::ClearInterval(int id) {
  ClearTimeout(id);
}

void EventLoop::SetImmediate(v8::Local<v8::Function> callback,
                              v8::Local<v8::Value> args[], int argc) {
  Immediate* immediate = new Immediate();
  immediate->callback.Reset(isolate_, callback);
  immediate->args = new v8::Global<v8::Value>[argc];
  for (int i = 0; i < argc; i++) {
    immediate->args[i].Reset(isolate_, args[i]);
  }
  immediate->argc = argc;
  immediate->loop = this;
  
  immediate_queue_.push(immediate);
  
  // Start the prepare handle if not already active
  if (!uv_is_active(reinterpret_cast<uv_handle_t*>(&immediate_handle_))) {
    uv_prepare_start(&immediate_handle_, ImmediateCallback);
  }
}

void EventLoop::EnqueueMicrotask(v8::Local<v8::Function> callback,
                                  v8::Local<v8::Value> args[], int argc) {
  std::pair<v8::Global<v8::Function>, std::vector<v8::Global<v8::Value>>> task;
  task.first.Reset(isolate_, callback);
  task.second.reserve(argc);
  for (int i = 0; i < argc; i++) {
    v8::Global<v8::Value> arg;
    arg.Reset(isolate_, args[i]);
    task.second.push_back(std::move(arg));
  }
  microtask_queue_.push(std::move(task));
}

void EventLoop::TimerCallback(uv_timer_t* handle) {
  Timer* timer = reinterpret_cast<Timer*>(handle->data);
  EventLoop* loop = timer->loop;
  
  v8::HandleScope scope(loop->isolate_);
  v8::Local<v8::Context> context = loop->isolate_->GetCurrentContext();
  
  // Convert stored args to local handles
  std::vector<v8::Local<v8::Value>> args(timer->argc);
  for (int i = 0; i < timer->argc; i++) {
    args[i] = v8::Local<v8::Value>::New(loop->isolate_, timer->args[i]);
  }
  
  // Call the callback
  v8::TryCatch try_catch(loop->isolate_);
  v8::MaybeLocal<v8::Value> result = timer->callback.Get(loop->isolate_)->Call(
      context, context->Global(), timer->argc, args.data());
  
  if (result.IsEmpty() && try_catch.HasCaught()) {
    // Error in timer callback
    v8::String::Utf8Value error(loop->isolate_, try_catch.Exception());
    std::cerr << "Timer error: " << *error << std::endl;
  }
  
  // Remove if not repeating
  if (!timer->repeat) {
    loop->ClearTimeout(timer->id);
  }
}

void EventLoop::ImmediateCallback(uv_prepare_t* handle) {
  EventLoop* loop = reinterpret_cast<EventLoop*>(handle->data);
  loop->ProcessMicrotasks();
  
  // Process immediate queue
  while (!loop->immediate_queue_.empty()) {
    Immediate* immediate = loop->immediate_queue_.front();
    loop->immediate_queue_.pop();
    
    v8::HandleScope scope(loop->isolate_);
    v8::Local<v8::Context> context = loop->isolate_->GetCurrentContext();
    
    // Convert stored args to local handles
    std::vector<v8::Local<v8::Value>> args(immediate->argc);
    for (int i = 0; i < immediate->argc; i++) {
      args[i] = v8::Local<v8::Value>::New(loop->isolate_, immediate->args[i]);
    }
    
    // Call the callback
    v8::TryCatch try_catch(loop->isolate_);
    v8::MaybeLocal<v8::Value> result = immediate->callback.Get(loop->isolate_)->Call(
        context, context->Global(), immediate->argc, args.data());
    
    if (result.IsEmpty() && try_catch.HasCaught()) {
      v8::String::Utf8Value error(loop->isolate_, try_catch.Exception());
      std::cerr << "Immediate error: " << *error << std::endl;
    }
    
    // Cleanup
    delete[] immediate->args;
    delete immediate;
  }
  
  // Stop the prepare handle if no more work
  if (loop->immediate_queue_.empty()) {
    uv_prepare_stop(handle);
  }
}

void EventLoop::ProcessMicrotasks() {
  while (!microtask_queue_.empty()) {
    auto task = std::move(microtask_queue_.front());
    microtask_queue_.pop();
    
    v8::HandleScope scope(isolate_);
    v8::Local<v8::Context> context = isolate_->GetCurrentContext();
    
    // Convert stored args to local handles
    std::vector<v8::Local<v8::Value>> args(task.second.size());
    for (size_t i = 0; i < task.second.size(); i++) {
      args[i] = v8::Local<v8::Value>::New(isolate_, task.second[i]);
    }
    
    // Call the callback
    v8::TryCatch try_catch(isolate_);
    v8::MaybeLocal<v8::Value> result = task.first.Get(isolate_)->Call(
        context, context->Global(), args.size(), args.data());
    
    if (result.IsEmpty() && try_catch.HasCaught()) {
      v8::String::Utf8Value error(isolate_, try_catch.Exception());
      std::cerr << "Microtask error: " << *error << std::endl;
    }
  }
}

int EventLoop::Run() {
  running_ = true;
  int alive = uv_run(loop_, UV_RUN_DEFAULT);
  running_ = false;
  return alive;
}

void EventLoop::Stop() {
  uv_stop(loop_);
  running_ = false;
}

bool EventLoop::HasPendingWork() const {
  return uv_loop_alive(loop_) != 0 || 
         !immediate_queue_.empty() || 
         !microtask_queue_.empty();
}

int EventLoop::ActiveHandles() const {
  return uv_loop_alive(loop_) ? loop_->active_handles : 0;
}

int EventLoop::ActiveRequests() const {
  return uv_loop_alive(loop_) ? loop_->active_reqs.count : 0;
}

}  // namespace elyxion
