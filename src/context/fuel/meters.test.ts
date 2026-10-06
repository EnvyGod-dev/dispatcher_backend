import { describe, expect, it } from 'vitest';
import { issueSchema, meterCreateSchema, refuelingSchema } from '$/routes/internal/fuel/schemas';
import { meterDelta, normalizeReading } from './meters';

const r = (raw: string | number, digits?: number) => normalizeReading(raw, digits)!;

describe('normalizeReading', () => {
  it('keeps leading zeros and pads to the meter digits', () => {
    expect(r('0001234').text).toBe('0001234');
    expect(r('1234', 7).text).toBe('0001234');
    expect(r(1234, 7).text).toBe('0001234');
    expect(r('12345.00').text).toBe('12345');
    expect(r('0001234', 7).value).toBe(1234n);
  });

  it('allows extra leading zeros but rejects readings longer than the meter', () => {
    expect(r('00001234', 7).text).toBe('0001234');
    expect(() => r('12345678', 7)).toThrow('7 оронтой');
  });

  it('rejects non-digits and treats empty as no reading', () => {
    expect(() => r('12a4')).toThrow();
    expect(() => r(-1)).toThrow();
    expect(() => r(1.5)).toThrow();
    expect(normalizeReading('', 7)).toBeNull();
    expect(normalizeReading(null, 7)).toBeNull();
  });

  it('has no fixed digit limit without a meter', () => {
    expect(r('123456789012345678901234').value).toBe(123456789012345678901234n);
  });
});

describe('meterDelta', () => {
  it('end minus start', () => {
    expect(meterDelta(r('0001000'), r('0001250'), 7)).toBe(250);
  });

  it('handles a meter that rolled over to zero', () => {
    expect(meterDelta(r('9999900'), r('0000150'), 7)).toBe(250);
    expect(meterDelta(r('99990'), r('00010'), 5)).toBe(20);
  });

  it('rejects an end lower than the start that is not a rollover', () => {
    expect(() => meterDelta(r('0000400'), r('0000390'), 7)).toThrow('бага');
    expect(() => meterDelta(r('400'), r('390'))).toThrow('бага');
  });
});

describe('schemas', () => {
  const base = {
    sourceType: 'dispenser' as const,
    dispenserVehicleId: '00000000-0000-4000-8000-000000000001',
    receiverVehicleId: '00000000-0000-4000-8000-000000000002',
    refueledAt: '2026-10-06T10:00:00.000Z',
  };

  it('refueling accepts zero-padded string readings and legacy numbers', () => {
    expect(refuelingSchema.safeParse({ ...base, meterStart: '0001234', meterEnd: '0001300' }).success).toBe(true);
    expect(refuelingSchema.safeParse({ ...base, meterStart: 1234, meterEnd: 1300 }).success).toBe(true);
    expect(refuelingSchema.safeParse({ ...base, meterStart: '12a', meterEnd: '13' }).success).toBe(false);
    expect(refuelingSchema.safeParse({ ...base, meterStart: '', meterEnd: '' }).success).toBe(false);
  });

  it('issue needs a quantity or both readings', () => {
    const issue = {
      tankId: '00000000-0000-4000-8000-000000000003',
      dispenserVehicleId: base.dispenserVehicleId,
      issuedAt: base.refueledAt,
    };
    expect(issueSchema.safeParse({ ...issue, quantity: 500 }).success).toBe(true);
    expect(issueSchema.safeParse({ ...issue, meterStart: '000120', meterEnd: '001120' }).success).toBe(true);
    expect(issueSchema.safeParse({ ...issue, meterStart: '000120' }).success).toBe(false);
  });

  it('meter digits are chosen at registration', () => {
    const meter = { holderType: 'tank', holderId: base.dispenserVehicleId, reading: '0000120' };
    expect(meterCreateSchema.safeParse({ ...meter, digits: 7 }).success).toBe(true);
    expect(meterCreateSchema.safeParse({ ...meter, digits: 0 }).success).toBe(false);
  });
});
