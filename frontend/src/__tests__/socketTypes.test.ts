import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, CATEGORY_ICONS, variableCatalog, outputCatalog } from '../types';

describe('CATEGORY_COLORS', () => {
  it('has entries for all advertised categories', () => {
    const expected = [
      'Recon',
      'Enumeration',
      'Vulnerability',
      'Fuzzing',
      'Crawling',
      'Network',
      'OSINT',
    ];
    for (const cat of expected) {
      expect(CATEGORY_COLORS[cat]).toBeDefined();
      expect(CATEGORY_COLORS[cat]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('has a matching icon for every color', () => {
    for (const key of Object.keys(CATEGORY_COLORS)) {
      expect(CATEGORY_ICONS[key]).toBeDefined();
      expect(typeof CATEGORY_ICONS[key]).toBe('string');
      expect(CATEGORY_ICONS[key].length).toBeGreaterThan(0);
    }
  });
});

describe('variableCatalog', () => {
  it('includes the three default variable types', () => {
    const types = variableCatalog.map((v) => v.type);
    expect(types).toContain('domain');
    expect(types).toContain('targets');
    expect(types).toContain('wordlist');
  });
});

describe('outputCatalog', () => {
  it('has a single any-typed artifacts entry', () => {
    expect(outputCatalog).toHaveLength(1);
    expect(outputCatalog[0].type).toBe('any');
  });
});
