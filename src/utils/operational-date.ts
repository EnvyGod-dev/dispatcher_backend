import type { ShiftType } from '$/context/shift/types';
import { createDate, newDateInUb } from './date-formatter';

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dayShiftStartMinutes = 6 * 60 + 30;
const nightShiftStartMinutes = 18 * 60 + 30;

const getMinutesInDay = (date: ReturnType<typeof newDateInUb>) => {
  return date.hour() * 60 + date.minute();
};

export const normalizeOperationalDate = (value: string) => {
  if (DATE_ONLY_PATTERN.test(value)) {
    return value;
  }

  return createDate(value).format('YYYY-MM-DD');
};

export const resolveLegacyOperationalDate = ({
  shiftType,
  now = newDateInUb(),
}: {
  shiftType: ShiftType;
  now?: ReturnType<typeof newDateInUb>;
}) => {
  if (shiftType === 'day') {
    return now.format('YYYY-MM-DD');
  }

  const minutes = getMinutesInDay(now);

  if (minutes < dayShiftStartMinutes) {
    return now.subtract(1, 'day').format('YYYY-MM-DD');
  }

  if (minutes >= nightShiftStartMinutes) {
    return now.format('YYYY-MM-DD');
  }

  return now.format('YYYY-MM-DD');
};
