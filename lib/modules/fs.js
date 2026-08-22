// Elyxion fs module
'use strict';

const { EventEmitter } = require('events');
const path = require('path');

// ============================================
// Stats class
// ============================================

class Stats {
  constructor(dev, ino, mode, nlink, uid, gid, rdev, size, blocks, 
              atimeMs, mtimeMs, ctimeMs, birthtimeMs) {
    this.dev = dev;
    this.ino = ino;
    this.mode = mode;
    this.nlink = nlink;
    this.uid = uid;
    this.gid = gid;
    this.rdev = rdev;
    this.size = size;
    this.blocks = blocks;
    this.atimeMs = atimeMs;
    this.mtimeMs = mtimeMs;
    this.ctimeMs = ctimeMs;
    this.birthtimeMs = birthtimeMs;
  }
  
  isFile() { return (this.mode & 0o170000) === 0o100000; }
  isDirectory() { return (this.mode & 0o170000) === 0o040000; }
  isSymbolicLink() { return (this.mode & 0o170000) === 0o120000; }
  isBlockDevice() { return (this.mode & 0o170000) === 0o060000; }
  isCharacterDevice() { return (this.mode & 0o170000) === 0o020000; }
  isFIFO() { return (this.mode & 0o170000) === 0o010000; }
  isSocket() { return (this.mode & 0o170000) === 0o140000; }
}

// ============================================
// FileHandle class
// ============================================

class FileHandle extends EventEmitter {
  constructor(fd) {
    super();
    this.fd = fd;
    this._readable = false;
    this._writable = false;
  }
  
  async read(buffer, offset, length, position) {
    return new Promise((resolve, reject) => {
      // Will use native fs.read
      reject(new Error('Not implemented'));
    });
  }
  
  async write(buffer, offset, length, position) {
    return new Promise((resolve, reject) => {
      // Will use native fs.write
      reject(new Error('Not implemented'));
    });
  }
  
  async close() {
    return new Promise((resolve, reject) => {
      // Will use native fs.close
      reject(new Error('Not implemented'));
    });
  }
  
  async stat() {
    return new Promise((resolve, reject) => {
      // Will use native fs.fstat
      reject(new Error('Not implemented'));
    });
  }
  
  async truncate(len = 0) {
    return new Promise((resolve, reject) => {
      // Will use native fs.ftruncate
      reject(new Error('Not implemented'));
    });
  }
  
  async chmod(mode) {
    return new Promise((resolve, reject) => {
      // Will use native fs.fchmod
      reject(new Error('Not implemented'));
    });
  }
  
  async chown(uid, gid) {
    return new Promise((resolve, reject) => {
      // Will use native fs.fchown
      reject(new Error('Not implemented'));
    });
  }
  
  async readSync(buffer, offset, length, position) {
    return new Promise((resolve, reject) => {
      // Will use native fs.readSync
      reject(new Error('Not implemented'));
    });
  }
  
  async writeSync(buffer, offset, length, position) {
    return new Promise((resolve, reject) => {
      // Will use native fs.writeSync
      reject(new Error('Not implemented'));
    });
  }
}

// ============================================
// ReadStream class
// ============================================

class ReadStream extends EventEmitter {
  constructor(path, options = {}) {
    super();
    this.path = path;
    this.fd = options.fd || null;
    this.flags = options.flags || 'r';
    this.mode = options.mode || 0o666;
    this.start = options.start || 0;
    this.end = options.end || Infinity;
    this.highWaterMark = options.highWaterMark || 64 * 1024;
    this.encoding = options.encoding || 'utf-8';
    this.autoClose = options.autoClose !== false;
    this.destroyed = false;
    this.pos = this.start;
  }
  
  open() {
    // Will use native fs.open
  }
  
  read(n) {
    // Will use native fs.read
  }
  
  close() {
    // Will use native fs.close
  }
  
  _destroy(err, callback) {
    this.destroyed = true;
    if (this.fd !== null) {
      this.close();
    }
    callback(err);
  }
}

// ============================================
// WriteStream class
// ============================================

class WriteStream extends EventEmitter {
  constructor(path, options = {}) {
    super();
    this.path = path;
    this.fd = options.fd || null;
    this.flags = options.flags || 'w';
    this.mode = options.mode || 0o666;
    this.start = options.start || 0;
    this.highWaterMark = options.highWaterMark || 16 * 1024;
    this.encoding = options.encoding || 'utf-8';
    this.autoClose = options.autoClose !== false;
    this.destroyed = false;
    this.pos = this.start;
    this.bytesWritten = 0;
  }
  
  open() {
    // Will use native fs.open
  }
  
  write(chunk, encoding, callback) {
    // Will use native fs.write
  }
  
  close() {
    // Will use native fs.close
  }
  
  _destroy(err, callback) {
    this.destroyed = true;
    if (this.fd !== null) {
      this.close();
    }
    callback(err);
  }
}

// ============================================
// fs module
// ============================================

const fs = {
  // Stats class
  Stats,
  
  // FileHandle class
  FileHandle,
  
  // ReadStream class
  ReadStream,
  
  // WriteStream class
  WriteStream,
  
  // Constants
  constants: {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    S_IFMT: 0o170000,
    S_IFREG: 0o100000,
    S_IFIFO: 0o010000,
    S_IFCHR: 0o020000,
    S_IFDIR: 0o040000,
    S_IFBLK: 0o060000,
    S_IFLNK: 0o120000,
    S_IFSOCK: 0o140000,
    O_CREAT: 0o100,
    O_EXCL: 0o200,
    O_NOCTTY: 0o400,
    O_TRUNC: 0o1000,
    O_APPEND: 0o2000,
    O_DIRECTORY: 0o200000,
    O_NOATIME: 0o1000000,
    O_NOFOLLOW: 0o400000,
    O_DIRECT: 0o40000,
    O_NONBLOCK: 0o4000
  },
  
  // Access
  access(path, mode, callback) {
    if (typeof mode === 'function') {
      callback = mode;
      mode = fs.constants.F_OK || 0;
    }
    // Will use native fs.access
    callback(null);
  },
  
  accessSync(path, mode) {
    // Will use native fs.accessSync
  },
  
  // Append file
  appendFile(path, data, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.appendFile
    callback(null);
  },
  
  appendFileSync(path, data, options) {
    // Will use native fs.appendFileSync
  },
  
  // Chmod
  chmod(path, mode, callback) {
    // Will use native fs.chmod
    callback(null);
  },
  
  chmodSync(path, mode) {
    // Will use native fs.chmodSync
  },
  
  // Chown
  chown(path, uid, gid, callback) {
    // Will use native fs.chown
    callback(null);
  },
  
  chownSync(path, uid, gid) {
    // Will use native fs.chownSync
  },
  
  // Close
  close(fd, callback) {
    // Will use native fs.close
    callback(null);
  },
  
  closeSync(fd) {
    // Will use native fs.closeSync
  },
  
  // Copy file
  copyFile(src, dest, flags, callback) {
    if (typeof flags === 'function') {
      callback = flags;
      flags = 0;
    }
    // Will use native fs.copyFile
    callback(null);
  },
  
  copyFileSync(src, dest, flags) {
    // Will use native fs.copyFileSync
  },
  
  // Create read stream
  createReadStream(path, options) {
    return new ReadStream(path, options);
  },
  
  // Create write stream
  createWriteStream(path, options) {
    return new WriteStream(path, options);
  },
  
  // Exists
  exists(path, callback) {
    fs.access(path, (err) => {
      callback(!err);
    });
  },
  
  existsSync(path) {
    try {
      fs.accessSync(path);
      return true;
    } catch (e) {
      return false;
    }
  },
  
  // Fchmod
  fchmod(fd, mode, callback) {
    // Will use native fs.fchmod
    callback(null);
  },
  
  fchmodSync(fd, mode) {
    // Will use native fs.fchmodSync
  },
  
  // Fchown
  fchown(fd, uid, gid, callback) {
    // Will use native fs.fchown
    callback(null);
  },
  
  fchownSync(fd, uid, gid) {
    // Will use native fs.fchownSync
  },
  
  // Fdatasync
  fdatasync(fd, callback) {
    // Will use native fs.fdatasync
    callback(null);
  },
  
  fdatasyncSync(fd) {
    // Will use native fs.fdatasyncSync
  },
  
  // Fstat
  fstat(fd, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.fstat
    callback(null, new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
  },
  
  fstatSync(fd, options) {
    // Will use native fs.fstatSync
    return new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  },
  
  // Fsync
  fsync(fd, callback) {
    // Will use native fs.fsync
    callback(null);
  },
  
  fsyncSync(fd) {
    // Will use native fs.fsyncSync
  },
  
  // Ftruncate
  ftruncate(fd, len, callback) {
    if (typeof len === 'function') {
      callback = len;
      len = 0;
    }
    // Will use native fs.ftruncate
    callback(null);
  },
  
  ftruncateSync(fd, len) {
    // Will use native fs.ftruncateSync
  },
  
  // Futimes
  futimes(fd, atime, mtime, callback) {
    // Will use native fs.futimes
    callback(null);
  },
  
  futimesSync(fd, atime, mtime) {
    // Will use native fs.futimesSync
  },
  
  // Lchmod
  lchmod(path, mode, callback) {
    // Will use native fs.lchmod
    callback(null);
  },
  
  lchmodSync(path, mode) {
    // Will use native fs.lchmodSync
  },
  
  // Lchown
  lchown(path, uid, gid, callback) {
    // Will use native fs.lchown
    callback(null);
  },
  
  lchownSync(path, uid, gid) {
    // Will use native fs.lchownSync
  },
  
  // Link
  link(existingPath, newPath, callback) {
    // Will use native fs.link
    callback(null);
  },
  
  linkSync(existingPath, newPath) {
    // Will use native fs.linkSync
  },
  
  // Lstat
  lstat(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.lstat
    callback(null, new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
  },
  
  lstatSync(path, options) {
    // Will use native fs.lstatSync
    return new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  },
  
  // Mkdir
  mkdir(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.mkdir
    callback(null);
  },
  
  mkdirSync(path, options) {
    // Will use native fs.mkdirSync
  },
  
  // Mkdtemp
  mkdtemp(prefix, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.mkdtemp
    callback(null, '/tmp/elyxion-XXXXXX');
  },
  
  mkdtempSync(prefix, options) {
    // Will use native fs.mkdtempSync
    return '/tmp/elyxion-XXXXXX';
  },
  
  // Open
  open(path, flags, mode, callback) {
    if (typeof mode === 'function') {
      callback = mode;
      mode = 0o666;
    }
    // Will use native fs.open
    callback(null, 0);
  },
  
  openSync(path, flags, mode) {
    // Will use native fs.openSync
    return 0;
  },
  
  // Read
  read(fd, buffer, offset, length, position, callback) {
    // Will use native fs.read
    callback(null, 0, Buffer.alloc(0));
  },
  
  readSync(fd, buffer, offset, length, position) {
    // Will use native fs.readSync
    return 0;
  },
  
  // Readdir
  readdir(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.readdir
    callback(null, []);
  },
  
  readdirSync(path, options) {
    // Will use native fs.readdirSync
    return [];
  },
  
  // ReadFile
  readFile(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.readFile
    callback(null, Buffer.alloc(0));
  },
  
  readFileSync(path, options) {
    // Will use native fs.readFileSync
    return Buffer.alloc(0);
  },
  
  // Readlink
  readlink(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.readlink
    callback(null, '');
  },
  
  readlinkSync(path, options) {
    // Will use native fs.readlinkSync
    return '';
  },
  
  // Realpath
  realpath(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.realpath
    callback(null, path);
  },
  
  realpathSync(path, options) {
    // Will use native fs.realpathSync
    return path;
  },
  
  // Rename
  rename(oldPath, newPath, callback) {
    // Will use native fs.rename
    callback(null);
  },
  
  renameSync(oldPath, newPath) {
    // Will use native fs.renameSync
  },
  
  // Rmdir
  rmdir(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.rmdir
    callback(null);
  },
  
  rmdirSync(path, options) {
    // Will use native fs.rmdirSync
  },
  
  // Stat
  stat(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.stat
    callback(null, new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
  },
  
  statSync(path, options) {
    // Will use native fs.statSync
    return new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  },
  
  // Symlink
  symlink(target, path, type, callback) {
    if (typeof type === 'function') {
      callback = type;
      type = 'file';
    }
    // Will use native fs.symlink
    callback(null);
  },
  
  symlinkSync(target, path, type) {
    // Will use native fs.symlinkSync
  },
  
  // Truncate
  truncate(path, len, callback) {
    if (typeof len === 'function') {
      callback = len;
      len = 0;
    }
    // Will use native fs.truncate
    callback(null);
  },
  
  truncateSync(path, len) {
    // Will use native fs.truncateSync
  },
  
  // Unlink
  unlink(path, callback) {
    // Will use native fs.unlink
    callback(null);
  },
  
  unlinkSync(path) {
    // Will use native fs.unlinkSync
  },
  
  // UnwatchFile
  unwatchFile(filename, listener) {
    // Will use native fs.unwatchFile
  },
  
  // Utimes
  utimes(path, atime, mtime, callback) {
    // Will use native fs.utimes
    callback(null);
  },
  
  utimesSync(path, atime, mtime) {
    // Will use native fs.utimesSync
  },
  
  // Watch
  watch(filename, options, listener) {
    if (typeof options === 'function') {
      listener = options;
      options = {};
    }
    // Will use native fs.watch
    const watcher = new EventEmitter();
    watcher.close = () => {};
    return watcher;
  },
  
  // WatchFile
  watchFile(filename, options, listener) {
    if (typeof options === 'function') {
      listener = options;
      options = {};
    }
    // Will use native fs.watchFile
  },
  
  // Write
  write(fd, buffer, offset, length, position, callback) {
    // Will use native fs.write
    callback(null, 0, null);
  },
  
  writeSync(fd, buffer, offset, length, position) {
    // Will use native fs.writeSync
    return 0;
  },
  
  // WriteFile
  writeFile(path, data, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Will use native fs.writeFile
    callback(null);
  },
  
  writeFileSync(path, data, options) {
    // Will use native fs.writeFileSync
  },
  
  // Promises API
  promises: {
    access: (path, mode) => new Promise((resolve) => resolve()),
    appendFile: (path, data, options) => new Promise((resolve) => resolve()),
    chmod: (path, mode) => new Promise((resolve) => resolve()),
    chown: (path, uid, gid) => new Promise((resolve) => resolve()),
    copyFile: (src, dest, flags) => new Promise((resolve) => resolve()),
    lchmod: (path, mode) => new Promise((resolve) => resolve()),
    lchown: (path, uid, gid) => new Promise((resolve) => resolve()),
    link: (existingPath, newPath) => new Promise((resolve) => resolve()),
    lstat: (path, options) => new Promise((resolve) => resolve(new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))),
    mkdir: (path, options) => new Promise((resolve) => resolve()),
    mkdtemp: (prefix, options) => new Promise((resolve) => resolve('/tmp/elyxion-XXXXXX')),
    open: (path, flags, mode) => new Promise((resolve) => resolve(new FileHandle(0))),
    readdir: (path, options) => new Promise((resolve) => resolve([])),
    readFile: (path, options) => new Promise((resolve) => resolve(Buffer.alloc(0))),
    readlink: (path, options) => new Promise((resolve) => resolve('')),
    realpath: (path, options) => new Promise((resolve) => resolve(path)),
    rename: (oldPath, newPath) => new Promise((resolve) => resolve()),
    rmdir: (path, options) => new Promise((resolve) => resolve()),
    stat: (path, options) => new Promise((resolve) => resolve(new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))),
    symlink: (target, path, type) => new Promise((resolve) => resolve()),
    truncate: (path, len) => new Promise((resolve) => resolve()),
    unlink: (path) => new Promise((resolve) => resolve()),
    utimes: (path, atime, mtime) => new Promise((resolve) => resolve()),
    writeFile: (path, data, options) => new Promise((resolve) => resolve())
  }
};

module.exports = fs;
