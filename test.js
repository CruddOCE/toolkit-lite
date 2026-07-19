const assert = require('assert');
const { capitalize, slugify, truncate } = require('./index');

assert.strictEqual(capitalize('hello'), 'Hello');
assert.strictEqual(capitalize(''), '');
console.log('capitalize: ok');

assert.strictEqual(slugify('Hello World!'), 'hello-world');
assert.strictEqual(slugify('  Trim Me  '), 'trim-me');
console.log('slugify: ok');

console.log('All tests passed.');
