// Rational feet keep decimal inputs, unit conversion and interpolation exact.
// Numbers are deliberately not accepted as measured quantities.
function gcd(a, b) {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a;
}

export class Q {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error('Zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
    Object.freeze(this);
  }
  static parse(value) {
    if (value instanceof Q) return value;
    if (typeof value !== 'string' || !/^-?\d{1,18}(\.\d{1,9})?$/.test(value)) {
      throw new Error('Expected a finite decimal string with at most 9 decimal places');
    }
    const [whole, frac = ''] = value.split('.');
    const sign = value.startsWith('-') ? -1n : 1n;
    return new Q(sign * BigInt(whole.replace('-', '') + frac), 10n ** BigInt(frac.length));
  }
  add(b) { b = Q.parse(b); return new Q(this.n * b.d + b.n * this.d, this.d * b.d); }
  sub(b) { b = Q.parse(b); return new Q(this.n * b.d - b.n * this.d, this.d * b.d); }
  mul(b) { b = Q.parse(b); return new Q(this.n * b.n, this.d * b.d); }
  div(b) { b = Q.parse(b); return new Q(this.n * b.d, this.d * b.n); }
  cmp(b) { const delta = this.sub(b).n; return delta < 0n ? -1 : delta > 0n ? 1 : 0; }
  floor(places = 1) {
    const scaled = this.n * 10n ** BigInt(places);
    let i = scaled / this.d;
    if (scaled < 0n && scaled % this.d) i -= 1n;
    const sign = i < 0n ? '-' : '';
    const digits = (i < 0n ? -i : i).toString().padStart(places + 1, '0');
    return sign + (places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits);
  }
  toJSON() { return { numerator: this.n.toString(), denominator: this.d.toString(), unit: 'ft' }; }
}

export function feet(quantity) {
  const value = Q.parse(quantity?.value);
  if (quantity.unit === 'ft') return value; // International foot, exactly 0.3048 m.
  if (quantity.unit === 'm') return value.mul(new Q(1250n, 381n));
  if (quantity.unit === 'us_survey_ft') return value.mul(new Q(500000n, 499999n));
  throw new Error('Unrecognized length unit');
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
