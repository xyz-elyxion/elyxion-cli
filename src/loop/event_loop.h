#ifndef ELYXION_EVENT_LOOP_H_
#define ELYXION_EVENT_LOOP_H_

#include <uv.h>
#include <v8.h>
#include <functional>
#include <queue>
#include <map>

namespace elyxion {

class EventLoop {
 public:
  EventLoop(v8::Isolate* isolate, uv_loop_t* loop);
  ~EventLoop();

  // Disable copy
  EventLoop(const EventLoop&) = delete;
  EventLoop& operator=(const EventLoop&) = delete;

  // Timer management
  int SetTimeout(v8::Local<v8::Function> callback, int delay_ms, 
                 v8::Local<v8::Value> args[], int argc);
  int SetInterval(v8::Local<v8::Function> callback, int interval_ms,
                  v8::Local<v8::Value> args[], int argc);
  void ClearTimeout(int id);
  void ClearInterval(int id);

  // Immediate execution
  void SetImmediate(v8::Local<v8::Function> callback,
                    v8::Local<v8::Value> args[], int argc);

  // Next tick queue
  void EnqueueMicrotask(v8::Local<v8::Function> callback,
                        v8::Local<v8::Value> args[], int argc);

  // Process events
  int Run();
  void Stop();

  // Statistics
  bool HasPendingWork() const;
  int ActiveHandles() const;
  int ActiveRequests() const;

 private:
  // Internal timer structure
  struct Timer {
    int id;
    uv_timer_t handle;
    v8::Global<v8::Function> callback;
    v8::Global<v8::Value>* args;
    int argc;
    bool repeat;
    EventLoop* loop;
  };

  // Internal immediate structure
  struct Immediate {
    v8::Global<v8::Function> callback;
    v8::Global<v8::Value>* args;
    int argc;
    EventLoop* loop;
  };

  // Timer callbacks
  static void TimerCallback(uv_timer_t* handle);
  static void ImmediateCallback(uv_prepare_t* handle);

  // Microtask processing
  void ProcessMicrotasks();

  // Data
  v8::Isolate* isolate_;
  uv_loop_t* loop_;
  uv_prepare_t immediate_handle_;
  
  // Timer management
  std::map<int, Timer*> timers_;
  int next_timer_id_;
  
  // Immediate queue
  std::queue<Immediate*> immediate_queue_;
  
  // Microtask queue
  std::queue<std::pair<v8::Global<v8::Function>, std::vector<v8::Global<v8::Value>>>> microtask_queue_;
  
  // State
  bool running_;
};

}  // namespace elyxion

#endif  // ELYXION_EVENT_LOOP_H_
