# toolkit-lite

A tiny collection of string utility functions.

## Functions

- `capitalize(str)` — uppercases the first letter of a string.
- `slugify(str)` — converts a string into a URL-friendly slug.
- `truncate(str, maxLength)` — shortens a string to `maxLength` characters, appending `...` if it was cut off.

## Usage

```js
const { capitalize, slugify, truncate } = require('./index');

capitalize('hello');       // 'Hello'
slugify('Hello World!');   // 'hello-world'
truncate('Hello World!', 5); // 'Hello...'
```

## Tests

```
node test.js
```
