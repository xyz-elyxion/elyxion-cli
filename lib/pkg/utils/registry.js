// Elyxion Package Registry Configuration
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// The Elyxion registry — hosted by the site server on Render.
// Override per-user with: elyx config set registry <url>
const DEFAULT_REGISTRY = 'https://xyz-elyxion.onrender.com';
const CONFIG_DIR = path.join(os.homedir(), '.elyx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

class Registry {
  constructor(options = {}) {
    this.registry = options.registry || DEFAULT_REGISTRY;
    this.token = options.token || null;
    this.scope = options.scope || null;
  }

  static getConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch (err) {
      // Config doesn't exist or is invalid
    }
    return {};
  }

  static setConfig(key, value) {
    const config = Registry.getConfig();
    config[key] = value;

    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  static getRegistryUrl() {
    const config = Registry.getConfig();
    const url = config.registry || DEFAULT_REGISTRY;
    // Normalize: strip trailing slash so we can safely append paths
    return url.replace(/\/+$/, '');
  }

  static getToken() {
    const config = Registry.getConfig();
    return config.token || null;
  }

  static setToken(token) {
    Registry.setConfig('token', token);
  }

  static getUsername() {
    const config = Registry.getConfig();
    return config.username || null;
  }

  static setUsername(username) {
    Registry.setConfig('username', username);
  }

  static logout() {
    const config = Registry.getConfig();
    delete config.token;
    delete config.username;
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  // Headers for registry API calls (Bearer token auth)
  static getAuthHeaders() {
    const token = Registry.getToken();
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Elyxion-Package-Manager/1.0.0',
    };

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    return headers;
  }
}

module.exports = { Registry, DEFAULT_REGISTRY };
