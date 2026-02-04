import type { TypeHint } from './types.js';

export function coerceValue(raw: string, typehint: TypeHint): unknown {
  switch (typehint) {
    case 'number': {
      const n = parseFloat(raw);
      return Number.isNaN(n) ? raw : n;
    }
    case 'integer': {
      const n = Number(raw);
      return Number.isInteger(n) ? n : raw;
    }
    case 'boolean': {
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return raw;
    }
    case 'currency': {
      const cleaned = raw.replace(/[^0-9.,\-]/g, '');
      const normalized = cleaned.includes(',') && (!cleaned.includes('.') || cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.'))
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
      const n = parseFloat(normalized);
      return Number.isNaN(n) ? raw : n;
    }
    case 'json': {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    case 'date':
    case 'datetime':
    case 'url':
    case 'email':
    case 'enum':
    case 'string':
    default:
      return raw;
  }
}
