import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),

  name: varchar("name", { length: 255 }).notNull(),

  subdomain: varchar("subdomain", { length: 63 }),

  logoUrl: varchar("logo_url", { length: 1024 }),

  code: varchar("code", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 255 }),

  deactivatedAt: timestamp("deactivated_at", {
    withTimezone: true,
    mode: "string",
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string",
  })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
});

export const enumUserRole = pgEnum("enum_user_role", [
  "superadmin",
  "admin",
  "driver",
  "dispatcher",
  "manager",
  "markscheider",
  "hr",
  "ita",
  "mechanic",
  "assistant_operator",
  "fuel_operator",
]);

export const enumUserStatus = pgEnum("enum_user_status", [
  "available",
  "resting",
  "sick_leave",
  "on_leave",
  "inactive",
]);

export const enumDriverShiftGroup = pgEnum("enum_driver_shift_group", ["A", "B", "C", "D"]);

export const enumDailyPlanStatus = pgEnum("enum_daily_plan_status", ["active", "completed"]);

export const enumDevicePlatform = pgEnum("enum_device_platform", ["ios", "android"]);

export const users = pgTable("users", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  firstName: varchar("first_name", { length: 255 }),
  name: varchar("name", { length: 255 }),
  displayUsername: text("display_username"),
  username: text("username").unique(),
  lastName: varchar("last_name", { length: 255 }),
  imageUrl: varchar("image_url", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  role: enumUserRole("role").default("driver").notNull(),

  position: varchar("position", { length: 255 }),
  department: varchar("department", { length: 255 }),
  registerNumber: varchar("register_number", { length: 50 }),
  driverLicenseExpiryDate: date("driver_license_expiry_date", { mode: "string" }),
  ettDriverLicenseExpiryDate: date("ett_driver_license_expiry_date", { mode: "string" }),
  entryPermitExpiryDate: date("entry_permit_expiry_date", { mode: "string" }),

  phoneNumber: bigint("phone_number", { mode: "number" }),
  email: varchar("email", { length: 255 }),
  organizationId: uuid("organization_id").references(() => organizations.id),
  driverShiftGroup: enumDriverShiftGroup("driver_shift_group"),
  emailVerified: boolean("email_verified").default(false).notNull(),
  status: enumUserStatus("status").default("available"),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at", { mode: "string", withTimezone: true }),
});

export const account = pgTable("account", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: varchar("password", { length: 255 }).default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const session = pgTable("session", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: enumDevicePlatform("platform").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    userIdx: index("idx_device_tokens_user").on(table.userId),
    tokenIdx: uniqueIndex("idx_device_tokens_token").on(table.token),
  }),
);

export const enumVehicleType = pgEnum("enum_vehicle_type", [
  "truck",
  "excavator",
  "loader",
  "dozer",
  "dump",
  "light_vehicle",
  "special_purpose",
  "grader",
]);

export const enumVehicleStatus = pgEnum("enum_vehicle_status", ["active", "maintenance", "retired"]);

export const vehicles = pgTable("vehicles", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),

  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 255 }),
  vehicleNumber: varchar("vehicle_number", { length: 25 }),
  serialNumber: varchar("serial_number", { length: 255 }),
  engineNumber: varchar("engine_number", { length: 255 }),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  vehicleOrganizationId: uuid("vehicle_organization_id").references(() => vehicleOrganizations.id),
  miningSectionId: uuid("mining_section_id").references(() => miningSections.id),
  mineNumber: varchar("mine_number", { length: 255 }),
  type: enumVehicleType("type"),

  commissioningDate: timestamp("commissioning_date", {
    withTimezone: true,
    mode: "string",
  }),
  insuranceExpiryDate: timestamp("insurance_expiry_date", {
    withTimezone: true,
    mode: "string",
  }),
  decommissioningDate: timestamp("decommissioning_date", {
    withTimezone: true,
    mode: "string",
  }),
  stoppedMotoHours: numeric("stopped_moto_hours"),

  hasGps: boolean("has_gps").default(false),
  gpsId: varchar("gps_id", { length: 255 }),
  gpsGroupId: varchar("gps_group_id", { length: 255 }),
  gpsName: varchar("gps_name", { length: 255 }),

  hasBuzzer: boolean("has_buzzer").default(false),
  hasFuelSensor: boolean("has_fuel_sensor").default(false),

  status: enumVehicleStatus("status").default("active").notNull(),
  notes: text("notes"),
  lastInspection: timestamp("last_inspection", {
    withTimezone: true,
  }),

  soilCoefficient: numeric("soil_coefficient"),
  coalCoefficient: numeric("coal_coefficient"),

  fuelConsumptionPerHour: numeric("fuel_consumption_per_hour"),

  model: varchar("model", { length: 100 }),
  fuelTankCapacity: numeric("fuel_tank_capacity", { precision: 10, scale: 2 }),
  isFuelDispenser: boolean("is_fuel_dispenser").default(false).notNull(),
  dispenserCapacity: numeric("dispenser_capacity", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
});

export const miningSections = pgTable("mining_sections", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
});

export const vehicleOrganizations = pgTable("vehicle_organizations", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
});

export const enumVehiclePictureAngle = pgEnum("enum_vehicle_picture_angle", [
  "front",
  "rear",
  "left",
  "right",
  "left_front",
  "right_front",
  "left_rear",
  "right_rear",
]);

export const vehiclePictures = pgTable("vehicle_pictures", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 1024 }).notNull(),
  position: enumVehiclePictureAngle("position"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const enumShiftType = pgEnum("enum_shift_type", ["day", "night"]);
export const enumShiftStatus = pgEnum("enum_shift_status", ["started", "completed", "cancelled"]);

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    driverShiftGroup: enumDriverShiftGroup("driver_shift_group"),
    shiftType: enumShiftType("shift_type").notNull().default("day"),
    operationalDate: date("operational_date", { mode: "string" }),
    shiftStart: timestamp("shift_start", {
      withTimezone: true,
      mode: "string",
    }).default(sql`CURRENT_TIMESTAMP`),
    shiftEnd: timestamp("shift_end", { withTimezone: true, mode: "string" }),
    motoStart: numeric("moto_start"),
    motoEnd: numeric("moto_end"),
    mileageStart: numeric("mileage_start").notNull(),
    mileageEnd: numeric("mileage_end"),
    status: enumShiftStatus("shift_status").notNull().default("started"),
    notes: text("notes"),
    soilProduct: numeric("soil_product"),
    coalProduct: numeric("coal_product"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgCreatedIdx: index("idx_shifts_org_created").on(table.organizationId, table.createdAt),
    orgStatusCreatedIdx: index("idx_shifts_org_status_created").on(table.organizationId, table.status, table.createdAt),
    orgOperationalDateIdx: index("idx_shifts_org_operational_date").on(table.organizationId, table.operationalDate),
    driverIdx: index("idx_shifts_driver").on(table.driverId),
    vehicleIdx: index("idx_shifts_vehicle").on(table.vehicleId),
  }),
);

export const enumLocationType = pgEnum("enum_location_type", ["pick_up", "drop_off", "both"]);

export const enumStockPileType = pgEnum("enum_stockpile_type", [
  "coal",
  "soil",
  "engineering",
  "common",
  "internal",
  "unproductive",
  "blast",
  "humus",
]);

export const stockpiles = pgTable("stockpiles", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  type: enumStockPileType("type").notNull(),

  layerNumber: varchar("layer_number", { length: 255 }),

  createdBy: uuid("created_by").references(() => users.id),

  deactivatedAt: timestamp("deactivated_at", {
    withTimezone: true,
    mode: "string",
  }),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
});

export const miningBlocks = pgTable("mining_blocks", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),

  name: varchar("name", { length: 255 }).notNull(),
  type: enumLocationType("type").notNull(),
  layerNumber: varchar("layer_number", { length: 20 }),

  latitude: text("latitude"),
  longitude: text("longitude"),

  isActive: boolean("is_active").default(true),
  description: text("description"),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
});

export const enumInspectionItemType = pgEnum("enum_inspection_item_type", ["checkbox", "photo", "text"]);

export const enumShiftInspectionStatus = pgEnum("enum_vehicle_inspection_status", [
  "normal",
  "issue",
  "needs_inspection",
]);

export const shiftInspections = pgTable(
  "shift_inspections",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    shiftId: uuid("shift_id").references(() => shifts.id),
    vehicleId: uuid("vehicle_id")
      .default(sql`uuid_generate_v4()`)
      .notNull()
      .references(() => vehicles.id),
    driverId: uuid("driver_id")
      .default(sql`uuid_generate_v4()`)
      .notNull()
      .references(() => users.id),
    inspectionId: uuid("inspection_id")
      .default(sql`uuid_generate_v4()`)
      .notNull()
      .references(() => inspections.id),
    status: enumShiftInspectionStatus("status").notNull().default("normal"),
    notes: text("notes"),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    shiftStatusIdx: index("idx_shift_inspections_shift_status").on(table.shiftId, table.status),
    vehicleIdx: index("idx_shift_inspections_vehicle").on(table.vehicleId),
  }),
);

export const inspections = pgTable("inspections", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  vehicleType: enumVehicleType("vehicle_type").notNull(),
  type: varchar("inspection_type", { length: 255 }),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
});

export const enumWorkLogStatus = pgEnum("enum_work_log_status", ["in_progress", "completed", "cancelled"]);

export const workLogs = pgTable(
  "work_logs",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id),
    planId: uuid("plan_id").references(() => dailyPlans.id),
    stockpileId: uuid("stockpile_id").references(() => stockpiles.id),
    startTime: timestamp("start_time", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    endTime: timestamp("end_time", {
      withTimezone: true,
      mode: "string",
    }).default(sql`CURRENT_TIMESTAMP`),
    notes: text("notes"),
    status: enumWorkLogStatus("status").notNull().default("in_progress"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    shiftIdx: index("idx_work_logs_shift").on(table.shiftId),
    stockpileIdx: index("idx_work_logs_stockpile").on(table.stockpileId),
    planIdx: index("idx_work_logs_plan").on(table.planId),
  }),
);

export const routes = pgTable("routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),

  routeCode: varchar("route_code", { length: 255 }),
  description: varchar("description", { length: 255 }),

  createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" })
    .defaultNow()
    .$onUpdate(() => new Date().toISOString()),
});

export const dailyPlans = pgTable("daily_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  shiftType: enumShiftType("shift_type").notNull().default("day"),
  status: enumDailyPlanStatus("status").notNull().default("active"),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),

  routeId: uuid("route_id")
    .notNull()
    .references(() => routes.id),

  pickUpBlockId: uuid("pick_up_block_id")
    .notNull()
    .references(() => miningBlocks.id),

  stockpileIds: uuid("stockpile_ids").array().notNull(),

  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  transportAmount: numeric("transport_amount"),

  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),

  date: date("date", { mode: "string" }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  }).defaultNow(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .$onUpdate(() => new Date().toISOString()),
});

export const markshaderDailyReports = pgTable(
  "markshader_daily_reports",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),

    reportDate: date("report_date", { mode: "string" }).notNull(),
    shiftType: enumShiftType("shift_type").notNull().default("day"),

    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    operatorId: uuid("operator_id").references(() => users.id),
    masterId: uuid("master_id").references(() => users.id),

    blockNumbers: text("block_numbers").array(),

    markProduction: numeric("mark_production"),

    disSoil: numeric("dis_soil"),
    disCoal: numeric("dis_coal"),
    disReisSoil: integer("dis_reis_soil").default(0),
    disReisCoal: integer("dis_reis_coal").default(0),
    disTotalProduction: numeric("dis_total_production"),
    disCoefficient: numeric("dis_coefficient"),

    markDisDiscrepancy: numeric("mark_dis_discrepancy"),

    notes: text("notes"),
    recordedBy: uuid("recorded_by").notNull().references(() => users.id),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`).notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgDateIdx: index("idx_markshader_org_date").on(table.organizationId, table.reportDate),
    vehicleIdx: index("idx_markshader_vehicle").on(table.vehicleId),
    uniqDateVehicleShift: uniqueIndex("uniq_markshader_date_vehicle_shift").on(
      table.organizationId,
      table.reportDate,
      table.vehicleId,
      table.shiftType
    ),
  })
);

export const shiftReportComments = pgTable(
  "shift_report_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    date: date("date").notNull(),
    shiftType: enumShiftType("shift_type").notNull(),
    comment: text("comment").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqOrgDateShift: uniqueIndex("uniq_shift_report_comment").on(table.organizationId, table.date, table.shiftType),
  }),
);

export const monthlyPlans = pgTable(
  "monthly_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),

    coalAmount: numeric("coal_amount"),
    soilAmount: numeric("soil_amount"),

    year: integer("year").notNull(),
    month: integer("month").notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqOrgYearMonth: uniqueIndex("uniq_org_year_month").on(table.organizationId, table.year, table.month),
  }),
);

/**
 * Ээлжийн (А/Б/В/Г) хуваарь: вебээс гараар оруулна. Тухайн хугацаанд өдөр/шөнө ажиллах ээлж.
 * Хуваарь оруулаагүй өдөрт utils/crew-rotation-ийн үндсэн дүрэм хэрэглэгдэнэ.
 */
export const crewSchedulePeriods = pgTable(
  "crew_schedule_periods",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    dayCrew: enumDriverShiftGroup("day_crew").notNull(),
    nightCrew: enumDriverShiftGroup("night_crew").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgDatesIdx: index("idx_crew_schedule_org_dates").on(table.organizationId, table.startDate, table.endDate),
  }),
);

export const organizationSettings = pgTable(
  "organization_settings",
  {
    id: uuid("id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),

    shiftDurationHours: numeric("shift_duration_hours", {
      precision: 4,
      scale: 1,
    })
      .notNull()
      .default("10.0"),

    shiftMode: text("shift_mode").notNull().default("double"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgIdx: uniqueIndex("idx_org_settings_org").on(table.organizationId),
  })
);

export const idleReasonTypes = pgTable(
  "idle_reason_types",
  {
    id: uuid("id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    vehicleTypes: text("vehicle_types").array().notNull().default([]),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgIdx: index("idx_idle_reason_types_org").on(table.organizationId),
    nameOrgUq: uniqueIndex("idle_reason_types_name_org_uq").on(
      table.organizationId,
      table.name
    ),
  })
);

export const repairReasonTypes = pgTable(
  "repair_reason_types",
  {
    id: uuid("id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    vehicleTypes: text("vehicle_types").array().notNull().default([]),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgIdx: index("idx_repair_reason_types_org").on(table.organizationId),
    nameOrgUq: uniqueIndex("repair_reason_types_name_org_uq").on(
      table.organizationId,
      table.name
    ),
  })
);

export const equipmentShiftLogs = pgTable(
  "equipment_shift_logs",
  {
    id: uuid("id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    operatorId: uuid("operator_id").references(() => users.id),
    shiftId: uuid("shift_id").references(() => shifts.id),

    operationalDate: text("operational_date").notNull(),
    shiftType: text("shift_type").notNull(),

    totalHours: numeric("total_hours", { precision: 5, scale: 1 }).notNull().default("10.0"),
    workedHours: numeric("worked_hours", { precision: 5, scale: 1 }),
    repairHours: numeric("repair_hours", { precision: 5, scale: 1 }).default("0"),
    idleHours: numeric("idle_hours", { precision: 5, scale: 1 }).default("0"),

    fuelReceived: numeric("fuel_received", { precision: 8, scale: 2 }),

    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => users.id),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgIdx: index("idx_esl_org").on(table.organizationId),
    vehicleIdx: index("idx_esl_vehicle").on(table.vehicleId),
    dateIdx: index("idx_esl_date").on(table.operationalDate),
    shiftIdx: index("idx_esl_shift").on(table.shiftId),
    uniqueLog: uniqueIndex("equipment_shift_logs_uq").on(
      table.organizationId,
      table.vehicleId,
      table.operationalDate,
      table.shiftType
    ),
  })
);

export const equipmentIdleEntries = pgTable(
  "equipment_idle_entries",
  {
    id: uuid("id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),

    shiftLogId: uuid("shift_log_id")
      .notNull()
      .references(() => equipmentShiftLogs.id, { onDelete: "cascade" }),

    idleReasonId: uuid("idle_reason_id")
      .references(() => idleReasonTypes.id),

    hours: numeric("hours", { precision: 5, scale: 1 }).notNull(),

    notes: text("notes"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    shiftLogIdx: index("idx_eie_shift_log").on(table.shiftLogId),
    reasonIdx: index("idx_eie_reason").on(table.idleReasonId),
  })
);

export const equipmentRepairEntries = pgTable(
  "equipment_repair_entries",
  {
    id: uuid("id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),

    shiftLogId: uuid("shift_log_id")
      .notNull()
      .references(() => equipmentShiftLogs.id, {
        onDelete: "cascade",
      }),

    repairReasonId: uuid("repair_reason_id")
      .references(() => repairReasonTypes.id),

    mechanicId: uuid("mechanic_id")
      .references(() => users.id, {
        onDelete: "set null",
      }),

    hours: numeric("hours", {
      precision: 5,
      scale: 1,
    }).notNull(),

    notes: text("notes"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    shiftLogIdx: index("idx_ere_shift_log")
      .on(table.shiftLogId),

    reasonIdx: index("idx_ere_reason")
      .on(table.repairReasonId),

    mechanicIdx: index("idx_ere_mechanic")
      .on(table.mechanicId),
  })
);

export const enumFuelType = pgEnum("enum_fuel_type", ["diesel", "gasoline"]);

export const enumFuelHolderType = pgEnum("enum_fuel_holder_type", ["tank", "dispenser", "equipment"]);

export const enumFuelLedgerEntryType = pgEnum("enum_fuel_ledger_entry_type", [
  "opening",
  "receipt",
  "issue",
  "refuel",
  "adjustment",
]);

export const enumFuelMeasureMethod = pgEnum("enum_fuel_measure_method", [
  "meter",
  "gauge",
  "sensor",
  "manual",
  "calculated",
]);

export const enumFuelActSource = pgEnum("enum_fuel_act_source", ["generated", "uploaded"]);

export const enumFuelEmailStatus = pgEnum("enum_fuel_email_status", ["pending", "sent", "failed"]);

export const enumFuelEditRequestType = pgEnum("enum_fuel_edit_request_type", ["update", "cancel"]);

export const enumFuelEditRequestStatus = pgEnum("enum_fuel_edit_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const enumFuelRefuelSource = pgEnum("enum_fuel_refuel_source", ["tank", "dispenser"]);

export const enumFuelProductionSource = pgEnum("enum_fuel_production_source", ["stratum", "import", "manual"]);

export const enumFuelAlertMetric = pgEnum("enum_fuel_alert_metric", ["liters_per_trip", "liters_per_m3"]);

export const enumFuelAlertStatus = pgEnum("enum_fuel_alert_status", ["open", "closed"]);

export const enumFuelRecipientPurpose = pgEnum("enum_fuel_recipient_purpose", ["act", "alert"]);

export const fuelSettings = pgTable("fuel_settings", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  defaultThresholdPercent: numeric("default_threshold_percent", { precision: 5, scale: 2 }).notNull().default("15"),
  alertWindowDays: integer("alert_window_days").notNull().default(1),
  alertEmailEnabled: boolean("alert_email_enabled").notNull().default(true),
  actNumberPrefix: varchar("act_number_prefix", { length: 20 }).notNull().default("АКТ"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date().toISOString()),
});

export const fuelNotificationRecipients = pgTable(
  "fuel_notification_recipients",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purpose: enumFuelRecipientPurpose("purpose").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    isCc: boolean("is_cc").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqOrgPurposeEmail: uniqueIndex("uniq_fuel_recipient_org_purpose_email").on(
      table.organizationId,
      table.purpose,
      table.email,
    ),
  }),
);

export const fuelSuppliers = pgTable(
  "fuel_suppliers",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 50 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqOrgName: uniqueIndex("uniq_fuel_supplier_org_name").on(table.organizationId, table.name),
  }),
);

export const fuelTanks = pgTable(
  "fuel_tanks",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    location: varchar("location", { length: 255 }),
    capacity: numeric("capacity", { precision: 12, scale: 2 }),
    fuelType: enumFuelType("fuel_type").notNull().default("diesel"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqOrgName: uniqueIndex("uniq_fuel_tank_org_name").on(table.organizationId, table.name),
  }),
);

export const fuelReceipts = pgTable(
  "fuel_receipts",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tankId: uuid("tank_id")
      .notNull()
      .references(() => fuelTanks.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => fuelSuppliers.id),
    fuelType: enumFuelType("fuel_type").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
    operationalDate: date("operational_date", { mode: "string" }).notNull(),
    documentNumber: varchar("document_number", { length: 100 }),
    transportVehicleNumber: varchar("transport_vehicle_number", { length: 50 }),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => users.id),
    attachmentUrls: text("attachment_urls").array().notNull().default(sql`'{}'::text[]`),
    actNumber: varchar("act_number", { length: 50 }).notNull(),
    actSource: enumFuelActSource("act_source").notNull().default("generated"),
    actFileUrl: varchar("act_file_url", { length: 1024 }),
    emailStatus: enumFuelEmailStatus("email_status").notNull().default("pending"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true, mode: "string" }),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgDateIdx: index("idx_fuel_receipts_org_date").on(table.organizationId, table.operationalDate),
    tankIdx: index("idx_fuel_receipts_tank").on(table.tankId),
    supplierIdx: index("idx_fuel_receipts_supplier").on(table.supplierId),
    uniqOrgAct: uniqueIndex("uniq_fuel_receipts_org_act").on(table.organizationId, table.actNumber),
  }),
);

export const fuelReceiptEmailLogs = pgTable(
  "fuel_receipt_email_logs",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => fuelReceipts.id, { onDelete: "cascade" }),
    toEmails: text("to_emails").array().notNull(),
    ccEmails: text("cc_emails").array().notNull().default(sql`'{}'::text[]`),
    status: enumFuelEmailStatus("status").notNull(),
    errorMessage: text("error_message"),
    triggeredBy: uuid("triggered_by").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    receiptIdx: index("idx_fuel_email_logs_receipt").on(table.receiptId),
  }),
);

export const fuelReceiptEditRequests = pgTable(
  "fuel_receipt_edit_requests",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => fuelReceipts.id, { onDelete: "cascade" }),
    type: enumFuelEditRequestType("type").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>().notNull().default({}),
    reason: text("reason").notNull(),
    status: enumFuelEditRequestStatus("status").notNull().default("pending"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgStatusIdx: index("idx_fuel_edit_requests_org_status").on(table.organizationId, table.status),
    uniqPendingPerReceipt: uniqueIndex("uniq_fuel_edit_request_pending")
      .on(table.receiptId)
      .where(sql`status = 'pending'`),
  }),
);

export const fuelIssues = pgTable(
  "fuel_issues",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tankId: uuid("tank_id")
      .notNull()
      .references(() => fuelTanks.id),
    dispenserVehicleId: uuid("dispenser_vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "string" }).notNull(),
    operationalDate: date("operational_date", { mode: "string" }).notNull(),
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgDateIdx: index("idx_fuel_issues_org_date").on(table.organizationId, table.operationalDate),
    tankIdx: index("idx_fuel_issues_tank").on(table.tankId),
    dispenserIdx: index("idx_fuel_issues_dispenser").on(table.dispenserVehicleId),
  }),
);

export const fuelRefuelings = pgTable(
  "fuel_refuelings",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    sourceType: enumFuelRefuelSource("source_type").notNull().default("dispenser"),
    dispenserVehicleId: uuid("dispenser_vehicle_id").references(() => vehicles.id),
    tankId: uuid("tank_id").references(() => fuelTanks.id),
    receiverVehicleId: uuid("receiver_vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    refueledAt: timestamp("refueled_at", { withTimezone: true, mode: "string" }).notNull(),
    operationalDate: date("operational_date", { mode: "string" }).notNull(),
    shiftType: enumShiftType("shift_type"),
    meterStart: numeric("meter_start", { precision: 14, scale: 2 }),
    meterEnd: numeric("meter_end", { precision: 14, scale: 2 }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => users.id),
    receiverOperatorId: uuid("receiver_operator_id").references(() => users.id),
    miningBlockId: uuid("mining_block_id").references(() => miningBlocks.id),
    locationNote: varchar("location_note", { length: 255 }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    photoUrl: varchar("photo_url", { length: 1024 }),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    orgDateIdx: index("idx_fuel_refuelings_org_date").on(table.organizationId, table.operationalDate),
    receiverIdx: index("idx_fuel_refuelings_receiver").on(table.receiverVehicleId, table.operationalDate),
    dispenserIdx: index("idx_fuel_refuelings_dispenser").on(table.dispenserVehicleId),
    uniqOrgClient: uniqueIndex("uniq_fuel_refuelings_org_client")
      .on(table.organizationId, table.clientId)
      .where(sql`client_id IS NOT NULL`),
  }),
);

export const fuelOpeningBalances = pgTable(
  "fuel_opening_balances",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    holderType: enumFuelHolderType("holder_type").notNull(),
    tankId: uuid("tank_id").references(() => fuelTanks.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    balanceAt: timestamp("balance_at", { withTimezone: true, mode: "string" }).notNull(),
    operationalDate: date("operational_date", { mode: "string" }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    method: enumFuelMeasureMethod("method").notNull(),
    notes: text("notes"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqTank: uniqueIndex("uniq_fuel_opening_tank")
      .on(table.organizationId, table.holderType, table.tankId)
      .where(sql`tank_id IS NOT NULL`),
    uniqVehicle: uniqueIndex("uniq_fuel_opening_vehicle")
      .on(table.organizationId, table.holderType, table.vehicleId)
      .where(sql`vehicle_id IS NOT NULL`),
  }),
);

export const fuelBalanceMeasurements = pgTable(
  "fuel_balance_measurements",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    holderType: enumFuelHolderType("holder_type").notNull(),
    tankId: uuid("tank_id").references(() => fuelTanks.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    measuredAt: timestamp("measured_at", { withTimezone: true, mode: "string" }).notNull(),
    operationalDate: date("operational_date", { mode: "string" }).notNull(),
    calculatedQuantity: numeric("calculated_quantity", { precision: 12, scale: 2 }).notNull(),
    measuredQuantity: numeric("measured_quantity", { precision: 12, scale: 2 }).notNull(),
    difference: numeric("difference", { precision: 12, scale: 2 }).notNull(),
    method: enumFuelMeasureMethod("method").notNull(),
    applyAdjustment: boolean("apply_adjustment").notNull().default(false),
    notes: text("notes"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    orgDateIdx: index("idx_fuel_measurements_org_date").on(table.organizationId, table.operationalDate),
  }),
);

export const fuelLedgerEntries = pgTable(
  "fuel_ledger_entries",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    holderType: enumFuelHolderType("holder_type").notNull(),
    tankId: uuid("tank_id").references(() => fuelTanks.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    entryType: enumFuelLedgerEntryType("entry_type").notNull(),
    delta: numeric("delta", { precision: 12, scale: 2 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    operationalDate: date("operational_date", { mode: "string" }).notNull(),
    receiptId: uuid("receipt_id").references(() => fuelReceipts.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => fuelIssues.id, { onDelete: "cascade" }),
    refuelingId: uuid("refueling_id").references(() => fuelRefuelings.id, { onDelete: "cascade" }),
    openingBalanceId: uuid("opening_balance_id").references(() => fuelOpeningBalances.id, { onDelete: "cascade" }),
    measurementId: uuid("measurement_id").references(() => fuelBalanceMeasurements.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    tankTimeIdx: index("idx_fuel_ledger_tank_time").on(table.organizationId, table.tankId, table.occurredAt),
    vehicleTimeIdx: index("idx_fuel_ledger_vehicle_time").on(
      table.organizationId,
      table.holderType,
      table.vehicleId,
      table.occurredAt,
    ),
    orgDateIdx: index("idx_fuel_ledger_org_date").on(table.organizationId, table.operationalDate),
    receiptIdx: index("idx_fuel_ledger_receipt").on(table.receiptId),
    issueIdx: index("idx_fuel_ledger_issue").on(table.issueId),
    refuelingIdx: index("idx_fuel_ledger_refueling").on(table.refuelingId),
  }),
);

export const fuelProductionStats = pgTable(
  "fuel_production_stats",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    operationalDate: date("operational_date", { mode: "string" }).notNull(),
    shiftType: enumShiftType("shift_type").notNull(),
    tripCount: integer("trip_count").notNull().default(0),
    volumeM3: numeric("volume_m3", { precision: 12, scale: 2 }).notNull().default("0"),
    tonnage: numeric("tonnage", { precision: 12, scale: 2 }),
    source: enumFuelProductionSource("source").notNull(),
    notes: text("notes"),
    importedBy: uuid("imported_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqVehicleDateShift: uniqueIndex("uniq_fuel_production_vehicle_date_shift").on(
      table.organizationId,
      table.vehicleId,
      table.operationalDate,
      table.shiftType,
    ),
    orgDateIdx: index("idx_fuel_production_org_date").on(table.organizationId, table.operationalDate),
  }),
);

export const fuelNorms = pgTable(
  "fuel_norms",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
    targetLitersPerTrip: numeric("target_liters_per_trip", { precision: 10, scale: 3 }),
    targetLitersPerM3: numeric("target_liters_per_m3", { precision: 10, scale: 4 }),
    thresholdPercent: numeric("threshold_percent", { precision: 5, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqOrgModel: uniqueIndex("uniq_fuel_norm_org_model").on(table.organizationId, table.vehicleModel),
  }),
);

export const fuelAlerts = pgTable(
  "fuel_alerts",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    metric: enumFuelAlertMetric("metric").notNull(),
    actualValue: numeric("actual_value", { precision: 12, scale: 4 }).notNull(),
    averageValue: numeric("average_value", { precision: 12, scale: 4 }).notNull(),
    baselineSource: varchar("baseline_source", { length: 20 }).notNull(),
    deviationPercent: numeric("deviation_percent", { precision: 8, scale: 2 }).notNull(),
    thresholdPercent: numeric("threshold_percent", { precision: 5, scale: 2 }).notNull(),
    totalRefueled: numeric("total_refueled", { precision: 12, scale: 2 }).notNull(),
    tripCount: integer("trip_count").notNull().default(0),
    volumeM3: numeric("volume_m3", { precision: 12, scale: 2 }).notNull().default("0"),
    status: enumFuelAlertStatus("status").notNull().default("open"),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    closeReason: text("close_reason"),
    notifiedAt: timestamp("notified_at", { withTimezone: true, mode: "string" }),
    notificationError: text("notification_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqAlert: uniqueIndex("uniq_fuel_alert_vehicle_period_metric").on(
      table.organizationId,
      table.vehicleId,
      table.periodStart,
      table.periodEnd,
      table.metric,
    ),
    orgStatusIdx: index("idx_fuel_alerts_org_status").on(table.organizationId, table.status),
  }),
);

export const fuelAuditLogs = pgTable(
  "fuel_audit_logs",
  {
    id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 30 }).notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    userId: uuid("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    entityIdx: index("idx_fuel_audit_entity").on(table.organizationId, table.entityType, table.entityId),
  }),
);