const assert = require('assert');
const { capitalize, slugify, truncate } = require('./index');

assert.strictEqual(capitalize('hello'), 'Hello');
assert.strictEqual(capitalize(''), '');
console.log('capitalize: ok');

assert.strictEqual(slugify('Hello World!'), 'hello-world');
assert.strictEqual(slugify('  Trim Me  '), 'trim-me');
console.log('slugify: ok');

assert.strictEqual(truncate('Hello World!', 5), 'Hello...');
assert.strictEqual(truncate('Hi', 5), 'Hi');
console.log('truncate: ok');

console.log('All tests passed.');
