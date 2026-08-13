import { describe, test, expect } from 'vitest';
import { classifyResponse, classifyNetworkError } from '../src/errors.js';

describe('classifyResponse — HTTP status → typed error', () => {
  test('4xx that are the caller\'s fault are not retryable', () => {
    expect(classifyResponse(400)).toMatchObject({ kind: 'validation', retryable: false });
    expect(classifyResponse(422)).toMatchObject({ kind: 'validation', retryable: false });
    expect(classifyResponse(401)).toMatchObject({ kind: 'auth', retryable: false });
    expect(classifyResponse(403)).toMatchObject({ kind: 'forbidden', retryable: false });
    expect(classifyResponse(404)).toMatchObject({ kind: 'not-found', retryable: false });
    expect(classifyResponse(418)).toMatchObject({ kind: 'client', retryable: false });
  });

  test('5xx and 408 are transient / retryable', () => {
    expect(classifyResponse(500)).toMatchObject({ kind: 'server', retryable: true });
    expect(classifyResponse(503)).toMatchObject({ kind: 'server', retryable: true });
    expect(classifyResponse(408)).toMatchObject({ kind: 'server', retryable: true });
  });

  test('409 conflict is retryable but requires fresh state', () => {
    expect(classifyResponse(409)).toMatchObject({ kind: 'conflict', retryable: true, requiresFreshState: true });
  });

  test('429 reads Retry-After (seconds and HTTP-date)', () => {
    expect(classifyResponse(429, {}, { 'retry-after': '45' })).toMatchObject({ kind: 'rate-limit', retryAfter: 45 });
    expect(classifyResponse(429, {})).toMatchObject({ kind: 'rate-limit', retryable: true });
  });

  test('extracts a human message from common body shapes', () => {
    expect(classifyResponse(400, { message: 'Quantity must be 1–10' }).message).toBe('Quantity must be 1–10');
    expect(classifyResponse(400, { error: 'bad input' }).message).toBe('bad input');
    expect(classifyResponse(500, 'Internal error text').message).toBe('Internal error text');
    expect(classifyResponse(404).message).toBe('HTTP 404'); // fallback
  });
});

describe('classifyNetworkError', () => {
  test('always retryable network kind', () => {
    expect(classifyNetworkError(new Error('ECONNRESET'))).toMatchObject({ kind: 'network', retryable: true });
  });
});
