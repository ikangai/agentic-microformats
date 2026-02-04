import { describe, test, expect } from 'vitest';
import { observe } from '../src/observe.js';

describe('observe', () => {
  test('throws when MutationObserver is not available', () => {
    const fakeRoot = {} as any;
    expect(() => observe(fakeRoot, () => {})).toThrow('MutationObserver');
  });
});
