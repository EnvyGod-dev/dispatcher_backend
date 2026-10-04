CREATE TYPE "public"."enum_fuel_act_source" AS ENUM('generated', 'uploaded');
CREATE TYPE "public"."enum_fuel_alert_metric" AS ENUM('liters_per_trip', 'liters_per_m3');
CREATE TYPE "public"."enum_fuel_alert_status" AS ENUM('open', 'closed');
CREATE TYPE "public"."enum_fuel_edit_request_status" AS ENUM('pending', 'approved', 'rejected');
CREATE TYPE "public"."enum_fuel_edit_request_type" AS ENUM('update', 'cancel');
CREATE TYPE "public"."enum_fuel_email_status" AS ENUM('pending', 'sent', 'failed');
CREATE TYPE "public"."enum_fuel_holder_type" AS ENUM('tank', 'dispenser', 'equipment');
CREATE TYPE "public"."enum_fuel_ledger_entry_type" AS ENUM('opening', 'receipt', 'issue', 'refuel', 'adjustment');
CREATE TYPE "public"."enum_fuel_measure_method" AS ENUM('meter', 'gauge', 'sensor', 'manual', 'calculated');
CREATE TYPE "public"."enum_fuel_production_source" AS ENUM('stratum', 'import', 'manual');
CREATE TYPE "public"."enum_fuel_recipient_purpose" AS ENUM('act', 'alert');
CREATE TYPE "public"."enum_fuel_refuel_source" AS ENUM('tank', 'dispenser');
CREATE TYPE "public"."enum_fuel_type" AS ENUM('diesel', 'gasoline');
ALTER TYPE "public"."enum_user_role" ADD VALUE 'fuel_operator';
ALTER TYPE "public"."enum_user_role" ADD VALUE 'manager';
CREATE TABLE IF NOT EXISTS "fuel_alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"vehicle_model" varchar(100) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"metric" "enum_fuel_alert_metric" NOT NULL,
	"actual_value" numeric(12, 4) NOT NULL,
	"average_value" numeric(12, 4) NOT NULL,
	"baseline_source" varchar(20) NOT NULL,
	"deviation_percent" numeric(8, 2) NOT NULL,
	"threshold_percent" numeric(5, 2) NOT NULL,
	"total_refueled" numeric(12, 2) NOT NULL,
	"trip_count" integer DEFAULT 0 NOT NULL,
	"volume_m3" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "enum_fuel_alert_status" DEFAULT 'open' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"notified_at" timestamp with time zone,
	"notification_error" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(30) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_balance_measurements" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"holder_type" "enum_fuel_holder_type" NOT NULL,
	"tank_id" uuid,
	"vehicle_id" uuid,
	"measured_at" timestamp with time zone NOT NULL,
	"operational_date" date NOT NULL,
	"calculated_quantity" numeric(12, 2) NOT NULL,
	"measured_quantity" numeric(12, 2) NOT NULL,
	"difference" numeric(12, 2) NOT NULL,
	"method" "enum_fuel_measure_method" NOT NULL,
	"apply_adjustment" boolean DEFAULT false NOT NULL,
	"notes" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_issues" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"dispenser_vehicle_id" uuid NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"operational_date" date NOT NULL,
	"issued_by" uuid NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"holder_type" "enum_fuel_holder_type" NOT NULL,
	"tank_id" uuid,
	"vehicle_id" uuid,
	"entry_type" "enum_fuel_ledger_entry_type" NOT NULL,
	"delta" numeric(12, 2) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"operational_date" date NOT NULL,
	"receipt_id" uuid,
	"issue_id" uuid,
	"refueling_id" uuid,
	"opening_balance_id" uuid,
	"measurement_id" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_norms" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_model" varchar(100) NOT NULL,
	"target_liters_per_trip" numeric(10, 3),
	"target_liters_per_m3" numeric(10, 4),
	"threshold_percent" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_notification_recipients" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purpose" "enum_fuel_recipient_purpose" NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"is_cc" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_opening_balances" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"holder_type" "enum_fuel_holder_type" NOT NULL,
	"tank_id" uuid,
	"vehicle_id" uuid,
	"balance_at" timestamp with time zone NOT NULL,
	"operational_date" date NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"method" "enum_fuel_measure_method" NOT NULL,
	"notes" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_production_stats" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"operational_date" date NOT NULL,
	"shift_type" "enum_shift_type" NOT NULL,
	"trip_count" integer DEFAULT 0 NOT NULL,
	"volume_m3" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tonnage" numeric(12, 2),
	"source" "enum_fuel_production_source" NOT NULL,
	"notes" text,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_receipt_edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"type" "enum_fuel_edit_request_type" NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" "enum_fuel_edit_request_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_receipt_email_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"to_emails" text[] NOT NULL,
	"cc_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "enum_fuel_email_status" NOT NULL,
	"error_message" text,
	"triggered_by" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_receipts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"fuel_type" "enum_fuel_type" NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"operational_date" date NOT NULL,
	"document_number" varchar(100),
	"transport_vehicle_number" varchar(50),
	"received_by" uuid NOT NULL,
	"attachment_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"act_number" varchar(50) NOT NULL,
	"act_source" "enum_fuel_act_source" DEFAULT 'generated' NOT NULL,
	"act_file_url" varchar(1024),
	"email_status" "enum_fuel_email_status" DEFAULT 'pending' NOT NULL,
	"email_sent_at" timestamp with time zone,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_refuelings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid,
	"source_type" "enum_fuel_refuel_source" DEFAULT 'dispenser' NOT NULL,
	"dispenser_vehicle_id" uuid,
	"tank_id" uuid,
	"receiver_vehicle_id" uuid NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"refueled_at" timestamp with time zone NOT NULL,
	"operational_date" date NOT NULL,
	"shift_type" "enum_shift_type",
	"meter_start" numeric(14, 2),
	"meter_end" numeric(14, 2),
	"operator_id" uuid NOT NULL,
	"receiver_operator_id" uuid,
	"mining_block_id" uuid,
	"location_note" varchar(255),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"photo_url" varchar(1024),
	"notes" text,
	"synced_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"default_threshold_percent" numeric(5, 2) DEFAULT '15' NOT NULL,
	"alert_window_days" integer DEFAULT 1 NOT NULL,
	"alert_email_enabled" boolean DEFAULT true NOT NULL,
	"telegram_chat_id" varchar(64),
	"act_number_prefix" varchar(20) DEFAULT 'АКТ' NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "fuel_settings_organization_id_unique" UNIQUE("organization_id")
);

CREATE TABLE IF NOT EXISTS "fuel_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_phone" varchar(50),
	"contact_email" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "fuel_tanks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(255),
	"capacity" numeric(12, 2),
	"fuel_type" "enum_fuel_type" DEFAULT 'diesel' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "vehicles" ADD COLUMN "model" varchar(100);
ALTER TABLE "vehicles" ADD COLUMN "fuel_tank_capacity" numeric(10, 2);
ALTER TABLE "vehicles" ADD COLUMN "is_fuel_dispenser" boolean DEFAULT false NOT NULL;
ALTER TABLE "vehicles" ADD COLUMN "dispenser_capacity" numeric(10, 2);
DO $$ BEGIN
 ALTER TABLE "fuel_alerts" ADD CONSTRAINT "fuel_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_alerts" ADD CONSTRAINT "fuel_alerts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_alerts" ADD CONSTRAINT "fuel_alerts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_audit_logs" ADD CONSTRAINT "fuel_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_audit_logs" ADD CONSTRAINT "fuel_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_balance_measurements" ADD CONSTRAINT "fuel_balance_measurements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_balance_measurements" ADD CONSTRAINT "fuel_balance_measurements_tank_id_fuel_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."fuel_tanks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_balance_measurements" ADD CONSTRAINT "fuel_balance_measurements_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_balance_measurements" ADD CONSTRAINT "fuel_balance_measurements_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_tank_id_fuel_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."fuel_tanks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_dispenser_vehicle_id_vehicles_id_fk" FOREIGN KEY ("dispenser_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_tank_id_fuel_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."fuel_tanks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_receipt_id_fuel_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."fuel_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_issue_id_fuel_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."fuel_issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_refueling_id_fuel_refuelings_id_fk" FOREIGN KEY ("refueling_id") REFERENCES "public"."fuel_refuelings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_opening_balance_id_fuel_opening_balances_id_fk" FOREIGN KEY ("opening_balance_id") REFERENCES "public"."fuel_opening_balances"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_ledger_entries" ADD CONSTRAINT "fuel_ledger_entries_measurement_id_fuel_balance_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."fuel_balance_measurements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_norms" ADD CONSTRAINT "fuel_norms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_notification_recipients" ADD CONSTRAINT "fuel_notification_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_opening_balances" ADD CONSTRAINT "fuel_opening_balances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_opening_balances" ADD CONSTRAINT "fuel_opening_balances_tank_id_fuel_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."fuel_tanks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_opening_balances" ADD CONSTRAINT "fuel_opening_balances_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_opening_balances" ADD CONSTRAINT "fuel_opening_balances_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_production_stats" ADD CONSTRAINT "fuel_production_stats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_production_stats" ADD CONSTRAINT "fuel_production_stats_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_production_stats" ADD CONSTRAINT "fuel_production_stats_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipt_edit_requests" ADD CONSTRAINT "fuel_receipt_edit_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipt_edit_requests" ADD CONSTRAINT "fuel_receipt_edit_requests_receipt_id_fuel_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."fuel_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipt_edit_requests" ADD CONSTRAINT "fuel_receipt_edit_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipt_edit_requests" ADD CONSTRAINT "fuel_receipt_edit_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipt_email_logs" ADD CONSTRAINT "fuel_receipt_email_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipt_email_logs" ADD CONSTRAINT "fuel_receipt_email_logs_receipt_id_fuel_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."fuel_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipt_email_logs" ADD CONSTRAINT "fuel_receipt_email_logs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_tank_id_fuel_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."fuel_tanks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_supplier_id_fuel_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."fuel_suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_dispenser_vehicle_id_vehicles_id_fk" FOREIGN KEY ("dispenser_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_tank_id_fuel_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."fuel_tanks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_receiver_vehicle_id_vehicles_id_fk" FOREIGN KEY ("receiver_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_receiver_operator_id_users_id_fk" FOREIGN KEY ("receiver_operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_mining_block_id_mining_blocks_id_fk" FOREIGN KEY ("mining_block_id") REFERENCES "public"."mining_blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_settings" ADD CONSTRAINT "fuel_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_suppliers" ADD CONSTRAINT "fuel_suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "fuel_tanks" ADD CONSTRAINT "fuel_tanks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_alert_vehicle_period_metric" ON "fuel_alerts" USING btree ("organization_id","vehicle_id","period_start","period_end","metric");
CREATE INDEX IF NOT EXISTS "idx_fuel_alerts_org_status" ON "fuel_alerts" USING btree ("organization_id","status");
CREATE INDEX IF NOT EXISTS "idx_fuel_audit_entity" ON "fuel_audit_logs" USING btree ("organization_id","entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_measurements_org_date" ON "fuel_balance_measurements" USING btree ("organization_id","operational_date");
CREATE INDEX IF NOT EXISTS "idx_fuel_issues_org_date" ON "fuel_issues" USING btree ("organization_id","operational_date");
CREATE INDEX IF NOT EXISTS "idx_fuel_issues_tank" ON "fuel_issues" USING btree ("tank_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_issues_dispenser" ON "fuel_issues" USING btree ("dispenser_vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_ledger_tank_time" ON "fuel_ledger_entries" USING btree ("organization_id","tank_id","occurred_at");
CREATE INDEX IF NOT EXISTS "idx_fuel_ledger_vehicle_time" ON "fuel_ledger_entries" USING btree ("organization_id","holder_type","vehicle_id","occurred_at");
CREATE INDEX IF NOT EXISTS "idx_fuel_ledger_org_date" ON "fuel_ledger_entries" USING btree ("organization_id","operational_date");
CREATE INDEX IF NOT EXISTS "idx_fuel_ledger_receipt" ON "fuel_ledger_entries" USING btree ("receipt_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_ledger_issue" ON "fuel_ledger_entries" USING btree ("issue_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_ledger_refueling" ON "fuel_ledger_entries" USING btree ("refueling_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_norm_org_model" ON "fuel_norms" USING btree ("organization_id","vehicle_model");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_recipient_org_purpose_email" ON "fuel_notification_recipients" USING btree ("organization_id","purpose","email");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_opening_tank" ON "fuel_opening_balances" USING btree ("organization_id","holder_type","tank_id") WHERE tank_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_opening_vehicle" ON "fuel_opening_balances" USING btree ("organization_id","holder_type","vehicle_id") WHERE vehicle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_production_vehicle_date_shift" ON "fuel_production_stats" USING btree ("organization_id","vehicle_id","operational_date","shift_type");
CREATE INDEX IF NOT EXISTS "idx_fuel_production_org_date" ON "fuel_production_stats" USING btree ("organization_id","operational_date");
CREATE INDEX IF NOT EXISTS "idx_fuel_edit_requests_org_status" ON "fuel_receipt_edit_requests" USING btree ("organization_id","status");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_edit_request_pending" ON "fuel_receipt_edit_requests" USING btree ("receipt_id") WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS "idx_fuel_email_logs_receipt" ON "fuel_receipt_email_logs" USING btree ("receipt_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_receipts_org_date" ON "fuel_receipts" USING btree ("organization_id","operational_date");
CREATE INDEX IF NOT EXISTS "idx_fuel_receipts_tank" ON "fuel_receipts" USING btree ("tank_id");
CREATE INDEX IF NOT EXISTS "idx_fuel_receipts_supplier" ON "fuel_receipts" USING btree ("supplier_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_receipts_org_act" ON "fuel_receipts" USING btree ("organization_id","act_number");
CREATE INDEX IF NOT EXISTS "idx_fuel_refuelings_org_date" ON "fuel_refuelings" USING btree ("organization_id","operational_date");
CREATE INDEX IF NOT EXISTS "idx_fuel_refuelings_receiver" ON "fuel_refuelings" USING btree ("receiver_vehicle_id","operational_date");
CREATE INDEX IF NOT EXISTS "idx_fuel_refuelings_dispenser" ON "fuel_refuelings" USING btree ("dispenser_vehicle_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_refuelings_org_client" ON "fuel_refuelings" USING btree ("organization_id","client_id") WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_supplier_org_name" ON "fuel_suppliers" USING btree ("organization_id","name");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fuel_tank_org_name" ON "fuel_tanks" USING btree ("organization_id","name");