import type { users } from '$/libs/database/schema';

export type User = typeof users.$inferSelect;

export type UserRole =
  | 'superadmin'
  | 'admin'
  | 'driver'
  | 'assistant_operator'
  | 'dispatcher'
  | 'markscheider'
  | 'hr'
  | 'ita'
  | 'mechanic'
  | 'manager'
  | 'fuel_operator';

export type DriverShiftGroup = 'A' | 'B' | 'C' | 'D';