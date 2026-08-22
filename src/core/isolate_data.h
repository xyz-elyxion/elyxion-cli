#ifndef ELYXION_ISOLATE_DATA_H_
#define ELYXION_ISOLATE_DATA_H_

#include <string>
#include <memory>
#include <uv.h>
#include <v8.h>

namespace elyxion {

// Per-isolate data
struct IsolateData {
  // Platform data
  v8::Platform* platform = nullptr;
  
  // Event loop
  uv_loop_t* event_loop = nullptr;
  
  // Flags
  bool is_default_isolate = false;
  
  // Statistics
  int64_t total_array_buffer_size = 0;
  int64_t total_heap_size = 0;
  
  // Async hooks
  bool async_hooks_enabled = false;
  
  // Cleanup callback
  std::function<void()> cleanup_cb;
};

}  // namespace elyxion

#endif  // ELYXION_ISOLATE_DATA_H_
