// Elyxion Package Manager - Uninstall Command
'use strict';

const { Installer } = require('../utils/installer');

async function uninstall(args) {
  const installer = new Installer();
  
  // Filter out flags
  const packages = args.filter(arg => !arg.startsWith('-'));

  if (packages.length === 0) {
    console.error('\x1b[31mError:\x1b[0m No packages specified');
    console.log('\nUsage: elyx uninstall <package> [package...]');
    process.exit(1);
  }

  try {
    await installer.uninstall(packages);
    console.log('\n\x1b[32m✓\x1b[0m Packages uninstalled\n');
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { uninstall };
