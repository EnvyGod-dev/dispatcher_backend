import {
  todayUB,
  addDays,
} from './common';

import {
  retryFailedFuelActEmails,
} from './act-email';

import {
  syncFuelProductionFromStratum,
} from './production';

import {
  evaluateFuelAlerts,
} from './alerts';

export const runFuelDailyJob = async (organizationId: string, date?: string) => {
  const yesterday = date ?? addDays(todayUB(), -1);
  const production = await syncFuelProductionFromStratum(organizationId, addDays(yesterday, -2), yesterday);
  const alerts = await evaluateFuelAlerts(organizationId, { periodEnd: yesterday });
  const emails = await retryFailedFuelActEmails(organizationId);

  return { production, alerts, emails };
};