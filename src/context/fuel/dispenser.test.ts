import { describe, expect, it } from 'vitest';
import { isDispenserVehicle } from './lookups';

const v = (mineNumber: string | null, code: string | null = null, isFuelDispenser: boolean | null = false) => ({
  mineNumber,
  code,
  isFuelDispenser,
});

describe('isDispenserVehicle', () => {
  it('only ST860 and ST861 (any spacing/case) or vehicles flagged as dispensers', () => {
    expect(isDispenserVehicle(v('ST860'))).toBe(true);
    expect(isDispenserVehicle(v('st 861'))).toBe(true);
    expect(isDispenserVehicle(v('ST-860'))).toBe(true);
    expect(isDispenserVehicle(v(null, 'ST861'))).toBe(true);
    expect(isDispenserVehicle(v('ST862'))).toBe(false);
    expect(isDispenserVehicle(v('STR-01'))).toBe(false);
    expect(isDispenserVehicle(v('T-001'))).toBe(false);
    expect(isDispenserVehicle(v('T-001', null, true))).toBe(true);
  });
});
