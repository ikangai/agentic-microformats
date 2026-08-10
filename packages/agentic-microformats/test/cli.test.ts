import { describe, test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(__dirname, '..', 'bin', 'cli.js');
const REPO = join(__dirname, '..', '..', '..');

function run(args: string[]): { stdout: string; code: number } {
  try {
    return { stdout: execFileSync('node', [CLI, ...args], { encoding: 'utf-8' }), code: 0 };
  } catch (e: any) {
    return { stdout: String(e.stdout ?? ''), code: e.status ?? -1 };
  }
}

describe('CLI', () => {
  test('validates a clean annotated page with exit 0', () => {
    const { stdout, code } = run([join(REPO, 'examples/ecommerce/product-page.html')]);
    expect(code).toBe(0);
    expect(stdout).toContain('1 resource');
    expect(stdout).toContain('Valid');
  });

  test('--json emits a machine-readable report', () => {
    const { stdout, code } = run([join(REPO, 'examples/ecommerce/product-page.html'), '--json']);
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.resources).toBe(1);
    expect(report.errors).toEqual([]);
  });

  test('--graph prints the canonical graph', () => {
    const { stdout } = run([join(REPO, 'examples/ecommerce/product-page.html'), '--graph']);
    expect(JSON.parse(stdout).agentGraph).toBe('0.3');
  });

  test('exits 2 with usage when no target given', () => {
    const { code } = run([]);
    expect(code).toBe(2);
  });
});
