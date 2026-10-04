import { users } from '$/libs/database/schema';
import { and, ilike, or, sql, type SQL } from 'drizzle-orm';

export const buildDriverNameFilter = (
  driverName?: string,
): SQL<unknown> | undefined => {
  const normalizedDriverName = driverName?.trim().replace(/\s+/g, ' ');

  if (!normalizedDriverName) {
    return undefined;
  }

  const tokenMatch = normalizedDriverName.includes(' ')
    ? and(
        ...normalizedDriverName
          .split(' ')
          .filter(Boolean)
          .map((token) =>
            or(
              ilike(users.firstName, `%${token}%`),
              ilike(users.lastName, `%${token}%`),
            ),
          ),
      )
    : undefined;

  return or(
    ilike(users.firstName, `%${normalizedDriverName}%`),
    ilike(users.lastName, `%${normalizedDriverName}%`),
    sql`CONCAT_WS(' ', ${users.firstName}, ${users.lastName}) ILIKE ${`%${normalizedDriverName}%`}`,
    sql`CONCAT_WS(' ', ${users.lastName}, ${users.firstName}) ILIKE ${`%${normalizedDriverName}%`}`,
    tokenMatch,
  );
};
