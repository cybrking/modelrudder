import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWaitingMinutes } from '../src/codekangaroo-pilot-demo.ts';

test('formats a short waiting time', () => {
  assert.equal(formatWaitingMinutes(30), '30m');
});
