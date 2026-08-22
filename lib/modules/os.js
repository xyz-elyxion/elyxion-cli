// Elyxion os module
'use strict';

const constants = {
  UV_UDP_REUSEADDR: 4,
  
  // Priority constants
  PRIORITY_LOW: 19,
  PRIORITY_BELOW_NORMAL: 10,
  PRIORITY_NORMAL: 0,
  PRIORITY_ABOVE_NORMAL: -10,
  PRIORITY_HIGH: -20,
  PRIORITY_HIGHEST: -30,
  
  // Scheduling constants
  SCHED_OTHER: 0,
  SCHED_FIFO: 1,
  SCHED_RR: 2
};

// Platform detection
const platform = process.platform || 'linux';
const arch = process.arch || 'x64';
const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

// ============================================
// Basic system info
// ============================================

function hostname() {
  return process.env.HOSTNAME || 'elyxion-host';
}

function type() {
  if (isWindows) return 'Windows_NT';
  if (isMac) return 'Darwin';
  if (isLinux) return 'Linux';
  return 'Unknown';
}

function release() {
  return process.env.RELEASE || '1.0.0-elyxion';
}

function version() {
  return process.env.VERSION || '#1 SMP';
}

function machine() {
  return arch;
}

function arch() {
  return process.arch || 'x64';
}

function platform() {
  return process.platform || 'linux';
}

function endianness() {
  const buffer = new ArrayBuffer(2);
  new Int16Array(buffer)[0] = 256;
  const uint8array = new Uint8Array(buffer);
  return uint8array[0] === 1 ? 'LE' : 'BE';
}

// ============================================
// Memory
// ============================================

function totalmem() {
  // Will be backed by native code
  return 8 * 1024 * 1024 * 1024; // Default 8GB
}

function freemem() {
  // Will be backed by native code
  return 4 * 1024 * 1024 * 1024; // Default 4GB
}

function totalmemBytes() {
  return totalmem();
}

function freememBytes() {
  return freemem();
}

// ============================================
// CPU
// ============================================

function cpus() {
  // Will be backed by native code
  const numCPUs = 4;
  const cpus = [];
  
  for (let i = 0; i < numCPUs; i++) {
    cpus.push({
      model: `Elyxion CPU ${i}`,
      speed: 2400,
      times: {
        user: Math.floor(Math.random() * 100000),
        nice: 0,
        sys: Math.floor(Math.random() * 50000),
        idle: Math.floor(Math.random() * 200000),
        irq: Math.floor(Math.random() * 10000)
      }
    });
  }
  
  return cpus;
}

function loadavg() {
  // Will be backed by native code
  return [0.0, 0.0, 0.0];
}

function uptime() {
  // Will be backed by native code
  return process.uptime ? process.uptime() : 0;
}

// ============================================
// Network interfaces
// ============================================

function networkInterfaces() {
  // Will be backed by native code
  return {
    lo: [
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8',
        scopeid: 0
      },
      {
        address: '::1',
        netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        family: 'IPv6',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '::1/128',
        scopeid: 0
      }
    ]
  };
}

// ============================================
// User info
// ============================================

function userInfo(options = {}) {
  // Will be backed by native code
  return {
    uid: process.getuid ? process.getuid() : 0,
    gid: process.getgid ? process.getgid() : 0,
    username: process.env.USER || process.env.USERNAME || 'elyxion',
    homedir: process.env.HOME || process.env.USERPROFILE || '/root',
    shell: process.env.SHELL || '/bin/bash'
  };
}

// ============================================
// System paths
// ============================================

function tmpdir() {
  return process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp';
}

function homedir() {
  return process.env.HOME || process.env.USERPROFILE || '/root';
}

function devNull() {
  return isWindows ? '\\\\.\\NUL' : '/dev/null';
}

// ============================================
// Process management
// ============================================

function getPriority(pid, priority) {
  // Will be backed by native code
  return constants.PRIORITY_NORMAL;
}

function setPriority(pid, priority) {
  // Will be backed by native code
  return true;
}

// ============================================
// OS-specific constants
// ============================================

const EOL = isWindows ? '\r\n' : '\n';

// ============================================
// os module
// ============================================

module.exports = {
  // Basic info
  hostname,
  type,
  release,
  version,
  machine,
  arch,
  platform,
  endianness,
  
  // Memory
  totalmem,
  freemem,
  totalmemBytes,
  freememBytes,
  
  // CPU
  cpus,
  loadavg,
  uptime,
  
  // Network
  networkInterfaces,
  
  // User info
  userInfo,
  
  // Paths
  tmpdir,
  homedir,
  devNull,
  
  // Process management
  getPriority,
  setPriority,
  
  // Constants
  constants,
  
  // Line ending
  EOL
};
