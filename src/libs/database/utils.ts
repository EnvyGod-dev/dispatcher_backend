export const firstOrNull = <T>(input: T[]): T | null => {
  return input[0] || null;
};

export const first = <T>(input: T[]): T => {
  return input[0];
};

export type PaginationType = {
  limit: number;
  offset: number;
};
