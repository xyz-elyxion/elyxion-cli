// Elyxion events module
'use strict';

// ============================================
// EventEmitter class
// ============================================

class EventEmitter {
  constructor() {
    this._events = {};
    this._eventsCount = 0;
    this._maxListeners = EventEmitter.defaultMaxListeners;
    this._warned = false;
  }
  
  // Static properties
  static defaultMaxListeners = 10;
  static emitterReferenced = false;
  static usingDomains = false;
  
  // Instance methods
  addListener(type, listener) {
    return this.on(type, listener);
  }
  
  on(type, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    
    if (!this._events) this._events = {};
    
    if (!this._events[type]) {
      this._events[type] = [];
      this._eventsCount++;
    }
    
    this._events[type].push(listener);
    
    // Emit 'newListener' event
    if (this._events.newListener) {
      this.emit('newListener', type, typeof listener === 'function' ? 
                listener : listener.listener);
    }
    
    // Check for max listeners warning
    if (this._maxListeners !== 0 && this._events[type].length > this._maxListeners && !this._warned) {
      this._warned = true;
      console.warn(`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ${this._events[type].length} ${type} listeners added. Use emitter.setMaxListeners() to increase limit`);
    }
    
    return this;
  }
  
  once(type, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    
    const wrapper = (...args) => {
      this.removeListener(type, wrapper);
      return listener.apply(this, args);
    };
    wrapper._original = listener;
    
    return this.on(type, wrapper);
  }
  
  prependListener(type, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    
    if (!this._events) this._events = {};
    
    if (!this._events[type]) {
      this._events[type] = [];
      this._eventsCount++;
    }
    
    this._events[type].unshift(listener);
    
    // Emit 'newListener' event
    if (this._events.newListener) {
      this.emit('newListener', type, typeof listener === 'function' ? 
                listener : listener.listener);
    }
    
    return this;
  }
  
  prependOnceListener(type, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    
    const wrapper = (...args) => {
      this.removeListener(type, wrapper);
      return listener.apply(this, args);
    };
    wrapper._original = listener;
    
    return this.prependListener(type, wrapper);
  }
  
  removeListener(type, listener) {
    if (!this._events || !this._events[type]) {
      return this;
    }
    
    const list = this._events[type];
    const index = list.indexOf(listener);
    
    if (index !== -1) {
      list.splice(index, 1);
      
      if (list.length === 0) {
        delete this._events[type];
        this._eventsCount--;
        
        // Emit 'removeListener' event
        if (this._events.removeListener) {
          this.emit('removeListener', type, listener);
        }
      }
    }
    
    return this;
  }
  
  off(type, listener) {
    return this.removeListener(type, listener);
  }
  
  removeAllListeners(type) {
    if (!this._events) return this;
    
    if (type) {
      if (this._events[type]) {
        const listeners = this._events[type].slice();
        delete this._events[type];
        this._eventsCount--;
        
        // Emit 'removeListener' events
        if (this._events.removeListener) {
          for (const listener of listeners) {
            this.emit('removeListener', type, listener);
          }
        }
      }
    } else {
      this._events = {};
      this._eventsCount = 0;
    }
    
    return this;
  }
  
  emit(type, ...args) {
    if (!this._events || !this._events[type]) {
      return false;
    }
    
    const list = this._events[type].slice();
    
    for (const listener of list) {
      try {
        listener.apply(this, args);
      } catch (error) {
        console.error('EventEmitter error:', error);
      }
    }
    
    return true;
  }
  
  // Listener methods
  listenerCount(type) {
    if (!this._events || !this._events[type]) {
      return 0;
    }
    return this._events[type].length;
  }
  
  listeners(type) {
    if (!this._events || !this._events[type]) {
      return [];
    }
    return this._events[type].slice();
  }
  
  rawListeners(type) {
    if (!this._events || !this._events[type]) {
      return [];
    }
    
    // Return copies with _original preserved for once listeners
    return this._events[type].map(listener => {
      const wrapper = (...args) => listener.apply(this, args);
      wrapper._original = listener._original || listener;
      return wrapper;
    });
  }
  
  eventNames() {
    return Object.keys(this._events || {}).filter(type => this._events[type]);
  }
  
  // Max listeners
  getMaxListeners() {
    return this._maxListeners;
  }
  
  setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || isNaN(n)) {
      throw new RangeError('The value of "n" is out of range. It must be a non-negative number.');
    }
    this._maxListeners = n;
    return this;
  }
  
  // Static methods
  static listenerCount(emitter, type) {
    return emitter.listenerCount(type);
  }
  
  static getEventListeners(emitter, type) {
    return emitter.listeners(type);
  }
  
  static once(emitter, event) {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        emitter.removeListener(event, onResolve);
        reject(err);
      };
      
      const onResolve = (...args) => {
        emitter.removeListener(event, onError);
        resolve(args.length === 1 ? args[0] : args);
      };
      
      emitter.on(event, onResolve);
      emitter.on('error', onError);
    });
  }
  
  static on(emitter, event, options = {}) {
    const generator = (function* () {
      let done = false;
      
      const onError = (err) => {
        if (!done) {
          done = true;
          throw err;
        }
      };
      
      emitter.on('error', onError);
      
      while (!done) {
        const args = yield new Promise(resolve => {
          emitter.once(event, (...args) => {
            if (!done) {
              resolve(args);
            }
          });
        });
        
        try {
          yield* args;
        } catch (err) {
          emitter.removeListener('error', onError);
          throw err;
        }
      }
      
      emitter.removeListener('error', onError);
    })();
    
    return generator;
  }
  
  // Reference
  static reference(emitter) {
    EventEmitter.emitterReferenced = true;
  }
  
  static unrefAll() {
    EventEmitter.emitterReferenced = false;
  }
}

// ============================================
// DomainEmitter (simplified)
// ============================================

class DomainEmitter extends EventEmitter {
  constructor() {
    super();
    this.domain = null;
  }
  
  emit(type, ...args) {
    if (this.domain && this.domain !== process.domain) {
      return this.domain.run(() => super.emit(type, ...args));
    }
    return super.emit(type, ...args);
  }
}

// ============================================
// Module exports
// ============================================

module.exports = {
  EventEmitter,
  DomainEmitter
};

// Also export EventEmitter directly for convenience
module.exports.EventEmitter = EventEmitter;
module.exports.DomainEmitter = DomainEmitter;
