import { describe, it, expect } from 'vitest';
// @ts-expect-error script is written in mjs format for standalone node execution
import { runConcurrencyTests } from '../../scripts/concurrency-test.mjs';

describe('Multi-Client Concurrency Test Suite', () => {
  it('passes all 3 concurrency stress scenarios (last-unit race, 1000 cashier sales, idempotency key)', async () => {
    await expect(runConcurrencyTests()).resolves.not.toThrow();
  });
});
