// Elyxion TCP module — wraps native libuv TCP primitives
'use strict';

const { EventEmitter } = require('events');

// Native functions are installed on globalThis by the C++ runtime:
//   __elyxion_tcp_listen(port, host, callback) -> listenerId
//   __elyxion_tcp_close_listener(listenerId)
//   __elyxion_socket_on_data(connId, callback)
//   __elyxion_socket_on_end(connId, callback)
//   __elyxion_socket_write(connId, string) -> bool
//   __elyxion_socket_close(connId)

// ---- Socket class ------------------------------------------------

class Socket extends EventEmitter {
  constructor(connId) {
    super();
    this._id = connId;
    this._closed = false;

    // Wire up native callbacks to JS events
    if (typeof globalThis.__elyxion_socket_on_data === 'function') {
      globalThis.__elyxion_socket_on_data(connId, (data) => {
        this.emit('data', data);
      });
      globalThis.__elyxion_socket_on_end(connId, () => {
        this._closed = true;
        this.emit('end');
        this.emit('close');
      });
    }
  }

  write(data) {
    if (this._closed) return false;
    if (typeof globalThis.__elyxion_socket_write === 'function') {
      return globalThis.__elyxion_socket_write(this._id, String(data));
    }
    return false;
  }

  end(data) {
    if (data !== undefined) this.write(data);
    this.close();
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    if (typeof globalThis.__elyxion_socket_close === 'function') {
      globalThis.__elyxion_socket_close(this._id);
    }
    this.emit('close');
  }

  get id() { return this._id; }
}

// ---- Server class ------------------------------------------------

class Server extends EventEmitter {
  constructor() {
    super();
    this._id = -1;
    this._listening = false;
  }

  listen(port, host, callback) {
    if (typeof host === 'function') { callback = host; host = '0.0.0.0'; }
    host = host || '0.0.0.0';

    if (typeof globalThis.__elyxion_tcp_listen !== 'function') {
      const err = new Error('TCP not available — rebuild Elyxion with native networking support');
      if (callback) callback(err);
      this.emit('error', err);
      return this;
    }

    this._id = globalThis.__elyxion_tcp_listen(port, host, (connId) => {
      const socket = new Socket(connId);
      this.emit('connection', socket);
    });

    if (this._id < 0) {
      const err = new Error('EADDRINUSE: address already in use :' + port);
      if (callback) callback(err);
      this.emit('error', err);
      return this;
    }

    this._listening = true;
    process.nextTick(() => {
      this.emit('listening');
      if (callback) callback();
    });

    return this;
  }

  close(callback) {
    if (this._id >= 0) {
      if (typeof globalThis.__elyxion_tcp_close_listener === 'function') {
        globalThis.__elyxion_tcp_close_listener(this._id);
      }
      this._id = -1;
    }
    this._listening = false;
    process.nextTick(() => {
      this.emit('close');
      if (callback) callback();
    });
    return this;
  }

  address() {
    return { port: 0, family: 'IPv4', address: '0.0.0.0' };
  }
}

// ---- Exports ----------------------------------------------------

module.exports = {
  Server,
  Socket,
  createServer: function (options, connectionListener) {
    if (typeof options === 'function') {
      connectionListener = options;
      options = {};
    }
    const server = new Server();
    if (connectionListener) server.on('connection', connectionListener);
    return server;
  },
  createConnection: function (options, callback) {
    // Outbound connections not yet implemented
    throw new Error('TCP client connections are not yet supported. Use HTTP server only.');
  }
};