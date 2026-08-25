// Elyxion CLI - Upgrade / Self-update module
'use strict';

const REPO = 'xyz-elyxion/elyxion-cli';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const INSTALL_URL = `https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh`;
const INSTALL_URL_WIN = `https://raw.githubusercontent.com/${REPO}/main/scripts/install.ps1`;

const CURRENT_VERSION = process.versions?.elyxion || '1.0.0';

function parseSemver(v) {
  const cleaned = v.replace(/^v/, '');
  const parts = cleaned.split('.');
  return {
    major: parseInt(parts[0] || '0', 10),
    minor: parseInt(parts[1] || '0', 10),
    patch: parseInt(parts[2] || '0', 10)
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function fetchLatestVersion() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const https = require('https');
    const { URL } = require('url');

    const parsed = new URL(API_URL);
    const transport = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'elyxion-cli',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk.toString());
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API returned ${res.statusCode}`));
            return;
          }
          const data = JSON.parse(body);
          resolve(data.tag_name || data.name || null);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

function runSystemInstall() {
  const { execSync } = require('child_process');

  if (process.platform === 'win32') {
    try {
      execSync(`powershell -NoProfile -Command "iwr -useb ${INSTALL_URL_WIN} | iex"`, {
        stdio: 'inherit'
      });
      return true;
    } catch (e) {
      return false;
    }
  } else {
    try {
      execSync(`curl -fsSL ${INSTALL_URL} | bash`, {
        stdio: 'inherit'
      });
      return true;
    } catch (e) {
      return false;
    }
  }
}

async function checkForUpdates(silent = true) {
  const current = parseSemver(CURRENT_VERSION);

  try {
    const latestTag = await fetchLatestVersion();
    if (!latestTag) {
      if (!silent) console.log('elyxion: could not determine latest version.');
      return { updateAvailable: false, current: CURRENT_VERSION, latest: null };
    }

    const latest = parseSemver(latestTag);

    if (compareVersions(latest, current) > 0) {
      if (!silent) {
        console.log(`\n  ✨ New version available: ${latestTag}`);
        console.log(`     Current: v${CURRENT_VERSION}`);
        console.log(`     Run \`elyxion --upgrade\` to update.\n`);
      }
      return { updateAvailable: true, current: CURRENT_VERSION, latest: latestTag };
    }

    if (!silent) {
      console.log(`elyxion is up to date (v${CURRENT_VERSION}).`);
    }
    return { updateAvailable: false, current: CURRENT_VERSION, latest: latestTag };
  } catch (err) {
    if (!silent) {
      console.log(`elyxion: could not check for updates (${err.message})`);
    }
    return { updateAvailable: false, current: CURRENT_VERSION, latest: null, error: err.message };
  }
}

async function performUpgrade() {
  console.log('elyxion: checking for updates...\n');

  const { updateAvailable, current, latest } = await checkForUpdates(false);

  if (!updateAvailable) {
    console.log(`elyxion is already at the latest version (v${current}).`);
    return 0;
  }

  console.log(`\n  Upgrading from v${current} → ${latest}`);
  console.log('  This runs the installer to download the latest release.\n');

  const success = runSystemInstall();

  if (!success) {
    console.error('\n  Upgrade failed. You can manually reinstall:');
    if (process.platform === 'win32') {
      console.error(`    iwr -useb ${INSTALL_URL_WIN} | iex`);
    } else {
      console.error(`    curl -fsSL ${INSTALL_URL} | bash`);
    }
    return 1;
  }

  return 0;
}

// Check for updates on startup (silent, periodic)
let lastCheck = 0;
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function maybeCheckForUpdates() {
  const now = Date.now();
  if (now - lastCheck > CHECK_INTERVAL) {
    lastCheck = now;
    checkForUpdates(true).then(({ updateAvailable, latest }) => {
      if (updateAvailable) {
        console.log(`\n✨ Elyxion ${latest} is available! Run \`elyxion --upgrade\` to update.\n`);
      }
    }).catch(() => {});
  }
}

module.exports = {
  checkForUpdates,
  performUpgrade,
  maybeCheckForUpdates,
  CURRENT_VERSION
};