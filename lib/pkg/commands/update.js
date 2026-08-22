// Elyxion Package Manager - Update Command
'use strict';

const { Installer } = require('../utils/installer');

async function update(args) {
  const installer = new Installer();
  
  // Filter out flags
  const packages = args.filter(arg => !arg.startsWith('-'));

  try {
    await installer.update(packages);
    console.log('\n\x1b[32m✓\x1b[0m Update complete\n');
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { update };
