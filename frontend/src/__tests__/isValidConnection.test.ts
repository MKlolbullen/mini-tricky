import { describe, expect, it } from 'vitest';
import type { Connection } from '@xyflow/react';
import { isValidConnection } from '../components/builder/Canvas';

// Helper to build a Connection with all the required fields.
function conn(partial: Partial<Connection>): Connection {
  return {
    source: 'a',
    target: 'b',
    sourceHandle: 'out:domain',
    targetHandle: 'in:domain',
    ...partial,
  } as Connection;
}

describe('isValidConnection', () => {
  it('accepts matching types (out:domain → in:domain)', () => {
    expect(isValidConnection(conn({}))).toBe(true);
  });

  it('accepts out:<type> → in:any wildcard', () => {
    expect(
      isValidConnection(
        conn({ sourceHandle: 'out:findings', targetHandle: 'in:any' })
      )
    ).toBe(true);
  });

  it('rejects mismatched types (out:domain → in:findings)', () => {
    expect(
      isValidConnection(
        conn({ sourceHandle: 'out:domain', targetHandle: 'in:findings' })
      )
    ).toBe(false);
  });

  it('rejects self-loops', () => {
    expect(isValidConnection(conn({ source: 'a', target: 'a' }))).toBe(false);
  });

  it('rejects output-to-output (source handle must be out:)', () => {
    expect(
      isValidConnection(
        conn({ sourceHandle: 'in:domain', targetHandle: 'in:domain' })
      )
    ).toBe(false);
  });

  it('rejects input-to-input (target handle must be in:)', () => {
    expect(
      isValidConnection(
        conn({ sourceHandle: 'out:domain', targetHandle: 'out:domain' })
      )
    ).toBe(false);
  });

  it('rejects null/missing source', () => {
    expect(
      isValidConnection(conn({ source: null as unknown as string }))
    ).toBe(false);
  });

  it('rejects null/missing target handle', () => {
    expect(
      isValidConnection(conn({ targetHandle: null as unknown as string }))
    ).toBe(false);
  });
});
