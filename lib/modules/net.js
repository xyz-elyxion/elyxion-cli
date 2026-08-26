// Elyxion net module
//
// `net` is the standard-compatible surface for TCP networking. The real
// socket work lives in the native runtime (__elyxion_tcp_* bindings) and is
// wrapped by the `tcp` module. This module re-exports that implementation so
// that require('net').createServer(...).listen(port) binds a real socket
// instead of simulating one.
'use strict';

const tcp = require('tcp');

// ---- IP address utilities ----------------------------------------

function isIP(input) {
  if (!input) return 0;

  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;

  if (ipv4Regex.test(input)) {
    const parts = input.split('.');
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (num < 0 || num > 255) return 0;
    }
    return 4;
  }

  if (ipv6Regex.test(input)) {
    const parts = input.split(':');
    if (parts.length === 8) return 6;
    if (input.includes('::')) return 6;
  }

  return 0;
}

function isIPv4(input) {
  return isIP(input) === 4;
}

function isIPv6(input) {
  return isIP(input) === 6;
}

// ---- net module --------------------------------------------------

module.exports = {
  // Real native-backed classes
  Socket: tcp.Socket,
  Server: tcp.Server,

  // Connection utilities
  isIP,
  isIPv4,
  isIPv6,

  // Create server helper (binds a real socket)
  createServer(options, callback) {
    return tcp.createServer(options, callback);
  },

  // Connect helper (outbound connections are not yet supported)
  createConnection(options, callback) {
    return tcp.createConnection(options, callback);
  },

  // Legacy API
  connect: function (options, callback) {
    return tcp.createConnection(options, callback);
  }
};
