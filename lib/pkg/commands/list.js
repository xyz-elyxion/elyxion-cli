// Elyxion Package Manager - List Command
'use strict';

const { Installer } = require('../utils/installer');

function list(args) {
  const installer = new Installer();
  
  try {
    installer.list();
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { list };
