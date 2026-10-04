import { relations } from 'drizzle-orm';
import {
  organizations,
  users,
  vehicles,
  vehicleOrganizations,
  vehiclePictures,
  miningSections,
  shifts,
  workLogs,
  miningBlocks,
  inspections,
  shiftInspections,
  dailyPlans,
  stockpiles,
  routes,
} from './schema';

// ============= Organization Relations =============
export const organizationRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  vehicles: many(vehicles),
  vehicleOrganizations: many(vehicleOrganizations),
  miningSections: many(miningSections),
  miningBlocks: many(miningBlocks),
  inspections: many(inspections),
  shifts: many(shifts),
}));

// ============= User Relations =============
export const userRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  shifts: many(shifts),
  shiftInspections: many(shiftInspections),
}));

// ============= Vehicle Relations =============
export const vehicleRelations = relations(vehicles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [vehicles.organizationId],
    references: [organizations.id],
  }),
  vehicleOrganization: one(vehicleOrganizations, {
    fields: [vehicles.vehicleOrganizationId],
    references: [vehicleOrganizations.id],
  }),
  miningSection: one(miningSections, {
    fields: [vehicles.miningSectionId],
    references: [miningSections.id],
  }),
  vehiclePictures: many(vehiclePictures),
  inspections: many(inspections),
  shiftInspections: many(shiftInspections),
  shifts: many(shifts),
}));

// ============= Vehicle Organization Relations =============
export const vehicleOrganizationRelations = relations(
  vehicleOrganizations,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [vehicleOrganizations.organizationId],
      references: [organizations.id],
    }),
    vehicles: many(vehicles),
  })
);

// ============= Mining Section Relations =============
export const miningSectionRelations = relations(
  miningSections,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [miningSections.organizationId],
      references: [organizations.id],
    }),
    vehicles: many(vehicles),
  })
);

// ============= Vehicle Picture Relations =============
export const vehiclePictureRelations = relations(
  vehiclePictures,
  ({ one }) => ({
    vehicle: one(vehicles, {
      fields: [vehiclePictures.vehicleId],
      references: [vehicles.id],
    }),
  })
);

// ============= Location Relations =============
export const miningBlockRelations = relations(
  miningBlocks,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [miningBlocks.organizationId],
      references: [organizations.id],
    }),
    pickUpWorkLogs: many(workLogs, { relationName: 'pickUpLocation' }),
    dropOffWorkLogs: many(workLogs, { relationName: 'dropOffLocation' }),
  })
);

// ============= Shift Relations =============
export const shiftRelations = relations(shifts, ({ one, many }) => ({
  driver: one(users, {
    fields: [shifts.driverId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [shifts.vehicleId],
    references: [vehicles.id],
  }),
  organization: one(organizations, {
    fields: [shifts.organizationId],
    references: [organizations.id],
  }),
  shiftInspections: many(shiftInspections),
  workLogs: many(workLogs),
}));

// ============= Inspection Template Relations =============
export const inspectionRelations = relations(inspections, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [inspections.organizationId],
    references: [organizations.id],
  }),
  shiftInspections: many(shiftInspections),
}));

// ============= Vehicle Inspection Relations =============
export const shiftInspectionRelations = relations(
  shiftInspections,
  ({ one, many }) => ({
    shift: one(shifts, {
      fields: [shiftInspections.shiftId],
      references: [shifts.id],
    }),
    vehicle: one(vehicles, {
      fields: [shiftInspections.vehicleId],
      references: [vehicles.id],
    }),
    driver: one(users, {
      fields: [shiftInspections.driverId],
      references: [users.id],
    }),
    inspection: one(inspections, {
      fields: [shiftInspections.inspectionId],
      references: [inspections.id],
    }),
  })
);

// ============= Work Log Relations =============
export const workLogRelations = relations(workLogs, ({ one, many }) => ({
  shift: one(shifts, {
    fields: [workLogs.shiftId],
    references: [shifts.id],
  }),
  dailyPlan: one(dailyPlans, {
    fields: [workLogs.planId],
    references: [dailyPlans.id],
  }),
  stockpile: one(stockpiles, {
    fields: [workLogs.stockpileId],
    references: [stockpiles.id],
  }),
}));

// ============= Daily plan Relations =============
export const dailyPlanRelations = relations(dailyPlans, ({ one, many }) => ({
  miningBlock: one(miningBlocks, {
    fields: [dailyPlans.pickUpBlockId],
    references: [miningBlocks.id],
  }),
  route: one(routes, {
    fields: [dailyPlans.routeId],
    references: [routes.id],
  }),
  workLogs: many(workLogs),
  vehicle: one(vehicles, {
    fields: [dailyPlans.vehicleId],
    references: [vehicles.id],
  }),
  stockpiles: many(stockpiles),
}));

export const stockpileRelations = relations(stockpiles, ({ one, many }) => ({
  workLogs: many(workLogs),
  dailyPlans: many(dailyPlans),
}));
