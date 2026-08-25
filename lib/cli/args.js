// Elyxion CLI - Argument Parser
'use strict';

class ArgParser {
  constructor(options = {}) {
    this.options = options;
    this.parsed = {
      args: [],
      flags: {},
      positional: []
    };
  }

  parse(argv = process.argv.slice(2)) {
    let i = 0;
    while (i < argv.length) {
      const arg = argv[i];

      // Long option (--flag or --key=value)
      if (arg.startsWith('--')) {
        if (arg === '--') {
          this.parsed.positional.push(...argv.slice(i + 1));
          break;
        }

        const eqIndex = arg.indexOf('=');
        if (eqIndex !== -1) {
          const key = arg.slice(2, eqIndex);
          const value = arg.slice(eqIndex + 1);
          this.parsed.flags[key] = value;
        } else {
          const key = arg.slice(2);
          const nextArg = argv[i + 1];
          if (nextArg && !nextArg.startsWith('-')) {
            this.parsed.flags[key] = nextArg;
            i++;
          } else {
            this.parsed.flags[key] = true;
          }
        }
      }
      // Short option (-f or -abc)
      else if (arg.startsWith('-') && arg.length > 1) {
        const chars = arg.slice(1);
        if (chars.length === 1) {
          const nextArg = argv[i + 1];
          if (nextArg && !nextArg.startsWith('-')) {
            this.parsed.flags[chars] = nextArg;
            i++;
          } else {
            this.parsed.flags[chars] = true;
          }
        } else {
          // Multiple short flags (-abc)
          for (let j = 0; j < chars.length; j++) {
            this.parsed.flags[chars[j]] = j === chars.length - 1 ? true : true;
          }
        }
      }
      // Positional argument
      else {
        this.parsed.positional.push(arg);
      }

      i++;
    }

    return this.parsed;
  }

  get flag() {
    return this.parsed.flags;
  }

  get positionals() {
    return this.parsed.positional;
  }

  hasFlag(name) {
    return this.parsed.flags.hasOwnProperty(name);
  }

  getFlag(name, defaultValue) {
    return this.parsed.flags[name] !== undefined
      ? this.parsed.flags[name]
      : defaultValue;
  }
}

function printHelp() {
  console.log(`
Elyxion v${process.versions?.elyxion || '1.0.0'}

Usage: elyxion [options] [script.js | -e "code" | -]

Options:
  -e, --eval <code>     Evaluate code
  -p, --print <code>    Evaluate and print result
  -i, --interactive     Start REPL
  -v, --version         Print version
  -h, --help            Print help
  -r, --require <mod>   Require module
  --no-warnings         Suppress warnings
  --trace-warnings      Show stack traces for warnings
  --upgrade, --update   Check for updates and upgrade Elyxion
  --check-updates       Check if a newer version is available (no install)

Examples:
  elyxion script.js
  elyxion -e "console.log('hello')"
  elyxion --repl
  echo "console.log('hi')" | elyxion
`);
}

module.exports = { ArgParser, printHelp };
