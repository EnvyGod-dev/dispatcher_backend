import { shifts, vehicles } from '$/libs/database/schema';

export type ShiftType = 'day' | 'night';
export type DriverShiftGroup = 'A' | 'B' | 'C' | 'D';

export type ShiftStatus = 'started' | 'completed' | 'cancelled';
export type Shift = typeof shifts.$inferSelect;

export const SORTABLE_COLUMNS_ZOD = [
  'operationalDate',
  'createdAt',
  'shiftStart',
  'shiftEnd',
  'status',
  'shiftType',
  'vehicle',
  'mileageStart',
  'mileageEnd',
  'soilProduct',
  'coalProduct',
  'shiftStatus',
] as const;

export const SORTABLE_COLUMNS = {
  operationalDate: shifts.operationalDate,
  createdAt: shifts.createdAt,
  shiftStart: shifts.shiftStart,
  shiftEnd: shifts.shiftEnd,
  status: shifts.status,
  shiftType: shifts.shiftType,
  mileageStart: shifts.mileageStart,
  mileageEnd: shifts.mileageEnd,
  vehicle: 'vehicle',
  coalWorkLogCount: 'coalWorkLogCount',
  soilWorkLogCount: 'soilWorkLogCount',
  shiftStatus: shifts.status,
} as const;

export type SortableColumn = keyof typeof SORTABLE_COLUMNS;
