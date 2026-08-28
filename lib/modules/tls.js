// Elyxion TLS module — wraps native OpenSSL-backed TLS clients
'use strict';

const { EventEmitter } = require('events');

// Native functions installed by the C++ runtime (when built with OpenSSL):
//   __elyxion_tls_connect(host, port, { connect, data, end, error }) -> connId
//   __elyxion_tls_write(connId, string) -> bool
//   __elyxion_tls_close(connId)

class TLSSocket extends EventEmitter {
  constructor(connId) {
    super();
    this._id = connId;
    this._closed = false;
  }

  write(data) {
    if (this._closed) return false;
    if (typeof globalThis.__elyxion_tls_write === 'function') {
      return globalThis.__elyxion_tls_write(this._id, String(data));
    }
    return false;
  }

  end(data) {
    if (data !== undefined) this.write(data);
    this.close();
  }

  destroy() {
    this.close();
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    if (typeof globalThis.__elyxion_tls_close === 'function') {
      globalThis.__elyxion_tls_close(this._id);
    }
    this.emit('close');
  }

  get closed() { return this._closed; }
  get destroyed() { return this._closed; }
  get connecting() { return false; }
  get readable() { return !this._closed; }
  get writable() { return !this._closed; }
}

function createConnection(options, callback) {
  var host = typeof options === 'string' ? options : (options && options.host) || '127.0.0.1';
  var port = typeof options === 'object' ? options.port : arguments[1];

  var socket = new TLSSocket(-1);
  var callbacks = {
    connect: callback,
    data: function (data) { socket.emit('data', data); },
    end: function () { socket._closed = true; socket.emit('end'); socket.emit('close'); },
    error: function (err) { socket.emit('error', err); }
  };

  if (typeof globalThis.__elyxion_tls_connect !== 'function') {
    process.nextTick(function () {
      socket.emit('error', new Error('TLS client support is unavailable in this Elyxion runtime'));
    });
    return socket;
  }

  var id = globalThis.__elyxion_tls_connect(host, port, callbacks);
  socket._id = id;
  return socket;
}

module.exports = {
  TLSSocket,
  connect: createConnection,
  createConnection: createConnection
};