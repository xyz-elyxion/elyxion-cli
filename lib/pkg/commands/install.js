// Elyxion Package Manager - Install Command
'use strict';

const { Installer } = require('../utils/installer');

async function install(args) {
  const installer = new Installer();
  
  // Parse packages from args
  const packages = {};
  
  for (const arg of args) {
    // Handle package@version format
    if (arg.includes('@')) {
      const [name, version] = arg.split('@');
      packages[name] = version || 'latest';
    } else {
      packages[arg] = 'latest';
    }
  }

  // Check for flags
  const isDev = args.includes('--save-dev');
  const isGlobal = args.includes('--global') || args.includes('-g');

  try {
    await installer.install(packages);
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { install };
