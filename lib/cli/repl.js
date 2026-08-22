// Elyxion CLI - REPL (Read-Eval-Print Loop)
'use strict';

const readline = require('readline');
const util = require('util');

const REPL_HISTORY_SIZE = 1000;
const PROMPT = '\x1b[36melyxion>\x1b[0m ';

class REPL {
  constructor(options = {}) {
    this.context = options.context || {};
    this.history = [];
    this.historyIndex = -1;
    this.output = options.output || process.stdout;
    this.input = options.input || process.stdin;
    this.rl = null;
    this.running = false;
  }

  start() {
    this.rl = readline.createInterface({
      input: this.input,
      output: this.output,
      terminal: true
    });

    this.running = true;
    this.output.write('\x1b[1mElyxion REPL v' + (process.versions?.elyxion || '1.0.0') + '\x1b[0m\n');
    this.output.write('Type ".help" for options\n\n');

    this.rl.on('line', (line) => this.handleLine(line));
    this.rl.on('close', () => this.stop());

    this.rl.setPrompt(PROMPT);
    this.rl.prompt();
  }

  handleLine(line) {
    const trimmed = line.trim();

    // Handle empty input
    if (!trimmed) {
      this.rl.prompt();
      return;
    }

    // Handle REPL commands
    if (trimmed.startsWith('.')) {
      this.handleCommand(trimmed);
      this.rl.prompt();
      return;
    }

    // Add to history
    this.addToHistory(trimmed);

    // Evaluate
    try {
      const result = eval(trimmed);
      if (result !== undefined) {
        this.output.write(util.inspect(result, { colors: true, depth: 3 }) + '\n');
      }
    } catch (err) {
      this.output.write('\x1b[31m' + err.stack + '\x1b[0m\n');
    }

    this.rl.prompt();
  }

  handleCommand(input) {
    const [cmd, ...args] = input.split(/\s+/);

    switch (cmd) {
      case '.help':
        this.printHelp();
        break;
      case '.exit':
      case '.quit':
        this.stop();
        break;
      case '.clear':
        this.context = {};
        this.output.write('Context cleared\n');
        break;
      case '.history':
        this.printHistory();
        break;
      case '.save':
        this.saveHistory(args[0]);
        break;
      case '.load':
        this.loadFile(args[0]);
        break;
      case '.editor':
        this.startEditor();
        break;
      default:
        this.output.write(`Unknown command: ${cmd}\n`);
    }
  }

  printHelp() {
    this.output.write(`
REPL Commands:
  .help              Show this help
  .exit, .quit       Exit REPL
  .clear             Clear context
  .history           Show command history
  .save [file]       Save history to file
  .load <file>       Load and execute file
  .editor            Enter editor mode (Ctrl+D to execute)
`);
  }

  addToHistory(line) {
    this.history.unshift(line);
    if (this.history.length > REPL_HISTORY_SIZE) {
      this.history.pop();
    }
    this.historyIndex = -1;
  }

  printHistory() {
    this.history.forEach((cmd, i) => {
      this.output.write(`  ${i + 1}  ${cmd}\n`);
    });
  }

  saveHistory(filepath) {
    const fs = require('fs');
    try {
      fs.writeFileSync(filepath, this.history.reverse().join('\n'));
      this.output.write(`History saved to ${filepath}\n`);
    } catch (err) {
      this.output.write(`Error saving history: ${err.message}\n`);
    }
  }

  loadFile(filepath) {
    const fs = require('fs');
    try {
      const code = fs.readFileSync(filepath, 'utf-8');
      eval(code);
      this.output.write(`Executed ${filepath}\n`);
    } catch (err) {
      this.output.write(`Error loading file: ${err.message}\n`);
    }
  }

  startEditor() {
    this.output.write('Editor mode (Ctrl+D to execute, Ctrl+C to cancel):\n');
    const lines = [];
    
    const editorRl = readline.createInterface({
      input: this.input,
      output: this.output
    });

    editorRl.on('line', (line) => {
      lines.push(line);
    });

    editorRl.on('close', () => {
      const code = lines.join('\n');
      this.handleLine(code);
    });
  }

  stop() {
    this.running = false;
    if (this.rl) {
      this.rl.close();
    }
  }
}

module.exports = { REPL };
