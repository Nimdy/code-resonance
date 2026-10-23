import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTitle, pluralize } from '../src/lib/format.js';

test('formatTitle collapses whitespace', () => {
  assert.equal(formatTitle('  write   tests '), 'write tests');
});

test('pluralize', () => {
  assert.equal(pluralize(1, 'task'), '1 task');
  assert.equal(pluralize(2, 'task'), '2 tasks');
});
