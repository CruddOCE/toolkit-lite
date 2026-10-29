// Hand-rolled test runner (house convention: no Jest, no Mocha).
// Each test file exports an array of { name, fn } and may be async.
// Failures print the assertion and exit non-zero so `npm test` fails.

const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

async function main() {
  let passed = 0;
  let failed = 0;
  for (const file of files) {
    const tests = require(path.join(testDir, file));
    for (const t of tests) {
      try {
        await t.fn();
        passed += 1;
        console.log(`ok   ${file}: ${t.name}`);
      } catch (err) {
        failed += 1;
        console.log(`FAIL ${file}: ${t.name}`);
        console.log(`     ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n     ') : err}`);
      }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
