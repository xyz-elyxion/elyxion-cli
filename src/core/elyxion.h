#ifndef ELYXION_H_
#define ELYXION_H_

#include <string>
#include <memory>
#include <functional>
#include <uv.h>
#include <v8.h>

// Version info
#define ELYXION_VERSION_MAJOR 1
#define ELYXION_VERSION_MINOR 0
#define ELYXION_VERSION_PATCH 0
#define ELYXION_VERSION_STRING "1.0.0"

namespace elyxion {

// Forward declarations
class Environment;
class IsolateData;
class BindingData;

// Platform initialization
void InitPlatform();
void TearDownPlatform();

// Main entry point
int Start(int argc, char* argv[]);
int StartWithIsolate(v8::Isolate::CreateParams* params, int argc, char* argv[]);

// Promise support
v8::MaybeLocal<v8::Promise> PromiseResolve(v8::Local<v8::Context> context,
                                            v8::Local<v8::Value> value);

}  // namespace elyxion

#endif  // ELYXION_H_
