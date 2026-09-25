import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const GRAY = '\x1b[90m';

interface LogFilter {
  methods?: Set<string>;
  pathFilter?: string;
  errorsOnly?: boolean;
  statusFilter?: number | string;
  verbose?: boolean;
  hyperVerbose?: boolean;
  showAll?: boolean; // includes health checks
}

function printHelp(): void {
  console.log(`
Usage: bun run log:interface [options] [method]

Options:
  --help, -h             Show this help message
  --method=<METHOD>      Filter by HTTP method (GET, POST, PUT, DELETE, etc.)
  -m <METHOD>            Filter by HTTP method
  --path=<SUBSTRING>     Filter by endpoint path (e.g. --path=/schedules)
  --endpoint=<SUBSTRING> Alias for --path
  --errors-only, -e      Only show HTTP errors (status >= 400)
  --status=<CODE>        Filter by exact status or family (e.g. --status=404, --status=5xx)
  --verbose, -v          Include error stack traces
  --hyper-verbose, -vv   Include request headers in output
  --all, -a              Include health check endpoints (/health/live, /health/ready)

Examples:
  bun run log:interface
  bun run log:interface --errors-only
  bun run log:interface POST --path=/schedules
  bun run log:interface --status=5xx -v
  bun run start:dev | bun run log:interface --errors-only
`);
}

function parseCliArgs(args: string[]): LogFilter {
  const filter: LogFilter = {};
  const methods = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i].toLowerCase();

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--method=')) {
      const m = arg.split('=')[1].toUpperCase();
      methods.add(m);
    } else if (arg === '-m' && args[i + 1]) {
      methods.add(args[++i].toUpperCase());
    } else if (arg === 'get' || arg === 'post' || arg === 'put' || arg === 'patch' || arg === 'delete' || arg === 'options' || arg === 'head') {
      methods.add(arg.toUpperCase());
    } else if (arg === 'type' && args[i + 1]) {
      const nextArg = args[++i].toUpperCase();
      methods.add(nextArg);
    } else if (arg.startsWith('--path=') || arg.startsWith('--endpoint=')) {
      filter.pathFilter = arg.split('=')[1];
    } else if (arg === '--errors-only' || arg === '--error' || arg === '-e') {
      filter.errorsOnly = true;
    } else if (arg.startsWith('--status=')) {
      filter.statusFilter = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      filter.verbose = true;
    } else if (arg === '--hyper-verbose' || arg === '-vv') {
      filter.verbose = true;
      filter.hyperVerbose = true;
    } else if (arg === '--all' || arg === '-a') {
      filter.showAll = true;
    }
  }

  if (methods.size > 0) {
    filter.methods = methods;
  }

  return filter;
}

function formatJsonBlock(obj: unknown, indent = 2): string {
  if (obj === undefined || obj === null) {
    return `${GRAY}{}${RESET}`;
  }
  try {
    const jsonStr = JSON.stringify(obj, null, indent);
    return jsonStr
      .split('\n')
      .map((line) => `${DIM}${line}${RESET}`)
      .join('\n');
  } catch {
    return String(obj);
  }
}

function processLogLine(line: string, filter: LogFilter): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    // Non-JSON standard server output (e.g. Nest startup message)
    if (!filter.errorsOnly) {
      console.log(line);
    }
    return;
  }

  let log: any;
  try {
    log = JSON.parse(trimmed);
  } catch {
    if (!filter.errorsOnly) console.log(line);
    return;
  }

  // Detect event type
  const event = log.event || log.msg;
  const isRequest = event === 'http.request' || log.msg === 'HTTP REQUEST';
  const isResponse = event === 'http.response' || log.msg === 'HTTP RESPONSE';
  const isError = event === 'http.error' || log.msg === 'HTTP ERROR';
  const isAborted = event === 'http.aborted' || log.msg === 'HTTP ABORTED';

  if (!isRequest && !isResponse && !isError && !isAborted) {
    // General Pino log (e.g. Nest service log)
    if (!filter.errorsOnly) {
      const timeStr = log.time ? new Date(log.time).toLocaleTimeString() : new Date().toLocaleTimeString();
      const level = (log.level === 50 ? `${RED}ERROR${RESET}` : log.level === 40 ? `${YELLOW}WARN${RESET}` : `${CYAN}INFO${RESET}`);
      console.log(`${GRAY}${timeStr}${RESET} ${level} ${DIM}[${log.context || 'App'}]${RESET} ${log.msg || ''}`);
    }
    return;
  }

  const method = (log.method || '').toUpperCase();
  const path = log.path || log.url || '';
  const isHealth = path === '/health/live' || path === '/health/ready' || path.startsWith('/health');

  // Filter: showAll flag for health checks
  if (isHealth && !filter.showAll) {
    return;
  }

  // Filter: methods
  if (filter.methods && method && !filter.methods.has(method)) {
    return;
  }

  // Filter: path
  if (filter.pathFilter && !path.toLowerCase().includes(filter.pathFilter.toLowerCase())) {
    return;
  }

  // Filter: errors only
  if (filter.errorsOnly && !isError && (log.statusCode ? log.statusCode < 400 : true)) {
    return;
  }

  // Filter: status
  if (filter.statusFilter) {
    const statusStr = String(log.statusCode || '');
    if (String(filter.statusFilter).endsWith('xx')) {
      const prefix = String(filter.statusFilter)[0];
      if (!statusStr.startsWith(prefix)) return;
    } else if (statusStr !== String(filter.statusFilter)) {
      return;
    }
  }

  const timeStr = log.time
    ? new Date(log.time).toLocaleTimeString()
    : log.timestamp
      ? new Date(log.timestamp).toLocaleTimeString()
      : new Date().toLocaleTimeString();

  const reqId = log.requestId || log.reqId || log.correlationId || '-';

  if (isRequest) {
    console.log(`\n${GRAY}${timeStr}${RESET} ${CYAN}${BOLD}HTTP REQUEST${RESET}`);
    console.log(`  ${BOLD}requestId:${RESET}   ${CYAN}${reqId}${RESET}`);
    console.log(`  ${BOLD}method:${RESET}      ${BOLD}${method}${RESET}`);
    console.log(`  ${BOLD}endpoint:${RESET}    ${path}`);

    const client = log.client || {};
    const clientDesc = [
      client.type || '',
      client.platform ? `(${client.platform}${client.deviceModel ? ` - ${client.deviceModel}` : ''})` : '',
      client.appVersion ? `v${client.appVersion}` : '',
    ].filter(Boolean).join(' ');

    if (clientDesc) {
      console.log(`  ${BOLD}client:${RESET}      ${clientDesc}`);
    }
    if (client.ip) {
      console.log(`  ${BOLD}ip:${RESET}          ${client.ip} ${DIM}(${client.ipType || 'direct'})${RESET}`);
    }

    if (log.auth && log.auth.authenticated) {
      console.log(`  ${BOLD}auth:${RESET}        ${GREEN}Authenticated${RESET} (userId: ${log.auth.userId}, role: ${log.auth.role || '-'})`);
    }

    if (log.params && Object.keys(log.params).length > 0) {
      console.log(`\n  ${BOLD}params:${RESET}`);
      console.log(formatJsonBlock(log.params, 4));
    }

    if (log.query && Object.keys(log.query).length > 0) {
      console.log(`\n  ${BOLD}query:${RESET}`);
      console.log(formatJsonBlock(log.query, 4));
    }

    if (log.body !== undefined && log.body !== null && Object.keys(log.body).length > 0) {
      console.log(`\n  ${BOLD}body:${RESET}`);
      console.log(formatJsonBlock(log.body, 4));
    }

    if (filter.hyperVerbose && log.headers) {
      console.log(`\n  ${BOLD}headers:${RESET}`);
      console.log(formatJsonBlock(log.headers, 4));
    }
  } else if (isResponse) {
    const status = log.statusCode || 200;
    const duration = log.durationMs !== undefined ? `${log.durationMs}ms` : '-';
    const statusColor = status >= 300 ? YELLOW : GREEN;

    console.log(`\n${GRAY}${timeStr}${RESET} ${statusColor}${BOLD}HTTP RESPONSE${RESET}`);
    console.log(`  ${BOLD}requestId:${RESET}   ${CYAN}${reqId}${RESET}`);
    console.log(`  ${BOLD}method:${RESET}      ${method}`);
    console.log(`  ${BOLD}endpoint:${RESET}    ${path}`);
    console.log(`  ${BOLD}status:${RESET}      ${statusColor}${BOLD}${status}${RESET}`);
    console.log(`  ${BOLD}duration:${RESET}    ${duration}`);

    if (log.response !== undefined && log.response !== null) {
      console.log(`\n  ${BOLD}response:${RESET}`);
      console.log(formatJsonBlock(log.response, 4));
    }
  } else if (isError) {
    const status = log.statusCode || 500;
    const duration = log.durationMs !== undefined ? `${log.durationMs}ms` : '-';

    console.log(`\n${RED}${BOLD}==================== HTTP ERROR ====================${RESET}`);
    console.log(`${GRAY}${timeStr}${RESET} ${RED}${BOLD}HTTP ERROR [${status}]${RESET}`);
    console.log(`  ${BOLD}requestId:${RESET}   ${CYAN}${reqId}${RESET}`);
    console.log(`  ${BOLD}method:${RESET}      ${method}`);
    console.log(`  ${BOLD}endpoint:${RESET}    ${path}`);
    console.log(`  ${BOLD}status:${RESET}      ${RED}${BOLD}${status}${RESET}`);
    console.log(`  ${BOLD}duration:${RESET}    ${duration}`);

    if (log.error) {
      console.log(`  ${BOLD}error:${RESET}       ${RED}${log.error.name || 'Error'}: ${log.error.message || ''}${RESET}`);
      if (log.error.response) {
        console.log(`\n  ${BOLD}response payload:${RESET}`);
        console.log(formatJsonBlock(log.error.response, 4));
      }
      if (filter.verbose && log.error.stack) {
        console.log(`\n  ${BOLD}stack trace:${RESET}`);
        console.log(`${DIM}${log.error.stack}${RESET}`);
      }
    }
    console.log(`${RED}${BOLD}====================================================${RESET}`);
  } else if (isAborted) {
    console.log(`\n${YELLOW}${BOLD}HTTP ABORTED / CANCELLED${RESET} (requestId: ${reqId}, duration: ${log.durationMs}ms)`);
  }
}

function start(): void {
  const cliArgs = process.argv.slice(2);
  const filter = parseCliArgs(cliArgs);

  console.log(`${BOLD}${CYAN}Amanah Healthcare - Observability Interface${RESET}`);
  if (filter.methods) {
    console.log(`${DIM}Filtering methods:${RESET} ${Array.from(filter.methods).join(', ')}`);
  }
  if (filter.pathFilter) {
    console.log(`${DIM}Filtering endpoint:${RESET} ${filter.pathFilter}`);
  }
  if (filter.errorsOnly) {
    console.log(`${YELLOW}Errors only mode enabled${RESET}`);
  }
  if (filter.verbose) {
    console.log(`${DIM}Verbose mode enabled${RESET}`);
  }
  if (filter.showAll) {
    console.log(`${DIM}Showing all traffic (including health checks)${RESET}`);
  }
  console.log(`${DIM}------------------------------------------------------------${RESET}\n`);

  if (!process.stdin.isTTY) {
    // Mode 1: Pipe mode (reading from standard input)
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });
    rl.on('line', (line) => processLogLine(line, filter));
  } else {
    // Mode 2: Live development spawn
    // Spawns nest start --watch with LOG_PRETTY=false to receive raw structured JSON streams
    const bunBinary = process.execPath;
    const child = spawn(
      bunBinary,
      ['run', 'start:dev'],
      {
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          LOG_PRETTY: 'false', // ensure structured JSON is piped directly into this interface
        },
        stdio: ['inherit', 'pipe', 'pipe'],
      },
    );

    const rlOut = readline.createInterface({
      input: child.stdout,
      terminal: false,
    });
    rlOut.on('line', (line) => processLogLine(line, filter));

    const rlErr = readline.createInterface({
      input: child.stderr,
      terminal: false,
    });
    rlErr.on('line', (line) => console.error(`${RED}${line}${RESET}`));

    child.on('error', (err) => {
      console.error(`${RED}Failed to start application process:${RESET} ${err.message}`);
      process.exit(1);
    });

    child.on('close', (code) => {
      console.log(`\n${DIM}Application process exited with code ${code}${RESET}`);
      process.exit(code ?? 0);
    });

    process.on('SIGINT', () => {
      child.kill('SIGINT');
      process.exit(0);
    });
  }
}

start();
