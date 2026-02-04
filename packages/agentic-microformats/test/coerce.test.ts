import { describe, test, expect } from 'vitest';
import { coerceValue } from '../src/coerce.js';

describe('coerceValue', () => {
  test('string returns raw value', () => {
    expect(coerceValue('hello', 'string')).toBe('hello');
  });

  test('number parses float', () => {
    expect(coerceValue('14.99', 'number')).toBe(14.99);
  });

  test('number returns raw string for invalid input', () => {
    expect(coerceValue('not-a-number', 'number')).toBe('not-a-number');
  });

  test('integer parses int', () => {
    expect(coerceValue('42', 'integer')).toBe(42);
  });

  test('integer returns raw string for float input', () => {
    expect(coerceValue('42.7', 'integer')).toBe('42.7');
  });

  test('boolean parses true', () => {
    expect(coerceValue('true', 'boolean')).toBe(true);
  });

  test('boolean parses false', () => {
    expect(coerceValue('false', 'boolean')).toBe(false);
  });

  test('boolean returns raw string for invalid input', () => {
    expect(coerceValue('yes', 'boolean')).toBe('yes');
  });

  test('currency parses number', () => {
    expect(coerceValue('14.99', 'currency')).toBe(14.99);
  });

  test('currency strips common symbols', () => {
    expect(coerceValue('€14.99', 'currency')).toBe(14.99);
  });

  test('currency handles comma decimal separator', () => {
    expect(coerceValue('14,99', 'currency')).toBe(14.99);
  });

  test('date returns ISO string unchanged', () => {
    expect(coerceValue('2025-03-31', 'date')).toBe('2025-03-31');
  });

  test('datetime returns ISO string unchanged', () => {
    expect(coerceValue('2025-01-15T14:30:00Z', 'datetime')).toBe('2025-01-15T14:30:00Z');
  });

  test('url returns string unchanged', () => {
    expect(coerceValue('https://example.com', 'url')).toBe('https://example.com');
  });

  test('email returns string unchanged', () => {
    expect(coerceValue('user@example.com', 'email')).toBe('user@example.com');
  });

  test('enum returns string unchanged', () => {
    expect(coerceValue('pending', 'enum')).toBe('pending');
  });

  test('json parses valid JSON', () => {
    expect(coerceValue('{"key":"value"}', 'json')).toEqual({ key: 'value' });
  });

  test('json returns raw string for invalid JSON', () => {
    expect(coerceValue('not json', 'json')).toBe('not json');
  });
});
