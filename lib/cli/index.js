// Elyxion CLI - Main Entry Point
'use strict';

const fs = require('fs');
const path = require('path');
const { ArgParser, printHelp } = require('./args');
const { REPL } = require('./repl');
const { performUpgrade, checkForUpdates, maybeCheckForUpdates } = require('./upgrade');

const VERSION = '1.2.0';

class CLI {
  constructor() {
    this.parser = new ArgParser();
    this.exitCode = 0;
  }

  async run(argv = process.argv.slice(2)) {
    const args = this.parser.parse(argv);

    // Handle flags
    if (args.flags.v || args.flags.version) {
      this.printVersion();
      return;
    }

    if (args.flags.h || args.flags.help) {
      printHelp();
      return;
    }

    // Handle upgrade / update
    if (args.flags.upgrade || args.flags.update) {
      performUpgrade().then((code) => process.exit(code));
      return;
    }

    if (args.flags['check-updates']) {
      checkForUpdates(false).then(() => process.exit(0));
      return;
    }

    if (args.flags.i || args.flags.interactive || args.flags.repl) {
      this.startREPL();
      return;
    }

    // Handle eval
    if (args.flags.e || args.flags.eval) {
      const code = args.flags.e || args.flags.eval;
      this.executeCode(code, '[eval]');
      return;
    }

    // Handle print
    if (args.flags.p || args.flags.print) {
      const code = args.flags.p || args.flags.print;
      this.executeAndPrint(code, '[eval]');
      return;
    }

    // Handle file
    if (args.positional && args.positional.length > 0) {
      const filename = args.positional[0];
      this.executeFile(filename, args.positional.slice(1));
      return;
    }

    // Handle stdin (piped input)
    if (!process.stdin.isTTY) {
      this.executeStdin();
      return;
    }

    // Default: show help
    printHelp();
  }

  printVersion() {
    console.log(`elyxion v${VERSION}`);
  }

  executeCode(code, filename) {
    try {
      require('vm').runInThisContext(code, { filename });
    } catch (err) {
      this.handleError(err);
      process.exit(1);
    }
  }

  executeAndPrint(code, filename) {
    try {
      const result = require('vm').runInThisContext(code, { filename });
      if (result !== undefined) {
        console.log(result);
      }
    } catch (err) {
      this.handleError(err);
      process.exit(1);
    }
  }

  executeFile(filepath, args) {
    const fullPath = path.resolve(filepath);

    if (!fs.existsSync(fullPath)) {
      console.error(`elyxion: cannot open file '${filepath}'`);
      process.exit(1);
    }

    try {
      // Set process.argv for the script
      process.argv = [process.argv[0], filepath, ...args];

      const code = fs.readFileSync(fullPath, 'utf-8');
      require('vm').runInThisContext(code, {
        filename: filepath,
        displayErrors: true
      });
    } catch (err) {
      this.handleError(err);
      process.exit(1);
    }
  }

  executeStdin() {
    const chunks = [];

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const code = chunks.join('');
      this.executeCode(code, '<stdin>');
    });
    process.stdin.on('error', (err) => {
      console.error('Error reading stdin:', err.message);
      process.exit(1);
    });
  }

  startREPL() {
    const repl = new REPL();
    repl.start();
  }

  handleError(err) {
    if (err instanceof SyntaxError) {
      console.error(`\x1b[31mSyntaxError: ${err.message}\x1b[0m`);
    } else {
      console.error(`\x1b[31m${err.stack || err.message}\x1b[0m`);
    }
  }
}

// Run the CLI
if (require.main === module) {
  // Periodic check for updates (silent, every 24h)
  maybeCheckForUpdates();

  const cli = new CLI();
  cli.run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { CLI };
