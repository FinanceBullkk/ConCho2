'use strict';

const { execFileSync } = require('node:child_process');

const forbiddenSpreadsheet = /\.(?:xlsx|xls|xlsm)$/i;
const dataDirectory = /(?:^|\/)Data(?:\/|$)/i;

function findOffenders(paths) {
  return [...new Set(paths
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => dataDirectory.test(path) || forbiddenSpreadsheet.test(path)))]
    .sort();
}

function gitLines(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).split(/\r?\n/).filter(Boolean);
}

function objectPath(line) {
  const separator = line.indexOf(' ');
  return separator === -1 ? '' : line.slice(separator + 1).replaceAll('\\', '/');
}

function main() {
  const currentPaths = gitLines(['ls-files']);
  const historyPaths = gitLines(['rev-list', '--objects', '--all']).map(objectPath).filter(Boolean);
  const offenders = findOffenders([...currentPaths, ...historyPaths]);

  if (offenders.length > 0) {
    console.error('BLOCKED: repository history contains prohibited HR/L&D source-data paths:');
    for (const path of offenders) console.error(`  - ${path}`);
    console.error('Use generated synthetic fixtures; never commit employee source workbooks.');
    process.exitCode = 1;
    return;
  }

  console.log('OK: no tracked or history-reachable Data/ paths or Excel source files.');
}

if (require.main === module) main();

module.exports = { findOffenders, objectPath };
