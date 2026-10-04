# Stratum ERP Database Tables

This document summarizes the current database tables found in `src/libs/database/schema.ts` and describes their business purpose.

## Core organization and access

### `organizations`

- Purpose: tenant / company master
- Key columns: `id`, `name`, `code`, `contact_email`, `contact_phone`, `deactivated_at`

### `users`

- Purpose: system users across all roles
- Key columns: `id`, `organization_id`, `role`, `status`, `first_name`, `last_name`, `position`, `username`, `email`, `is_active`
- Notes: supports operational roles like `driver`, `dispatcher`, `markscheider`, `mechanic`, `hr`, `ita`

### `account`

- Purpose: authentication credentials / identity provider linkage
- Key columns: `id`, `user_id`, `provider_id`, `account_id`, `password`, token expiry columns

### `session`

- Purpose: active login sessions
- Key columns: `id`, `user_id`, `token`, `expires_at`, `ip_address`, `user_agent`

## Vehicle master data

### `vehicle_organizations`

- Purpose: owning company / contractor / fleet grouping for vehicles
- Key columns: `id`, `organization_id`, `name`

### `mining_sections`

- Purpose: operational mining area / section master
- Key columns: `id`, `organization_id`, `name`

### `vehicles`

- Purpose: equipment master registry
- Key columns: `id`, `organization_id`, `vehicle_organization_id`, `mining_section_id`, `name`, `code`, `vehicle_number`, `type`, `status`
- Operational columns: `serial_number`, `engine_number`, `mine_number`, `commissioning_date`, `decommissioning_date`, `stopped_moto_hours`
- Telematics columns: `has_gps`, `gps_id`, `gps_group_id`, `gps_name`, `has_buzzer`, `has_fuel_sensor`
- Performance columns: `soil_coefficient`, `coal_coefficient`, `fuel_consumption_per_hour`

### `vehicle_pictures`

- Purpose: photo registry for equipment condition / identity
- Key columns: `id`, `vehicle_id`, `url`, `position`

## Operations

### `shifts`

- Purpose: driver shift execution records
- Key columns: `id`, `driver_id`, `vehicle_id`, `organization_id`, `shift_type`, `status`
- Time columns: `shift_start`, `shift_end`
- Meter columns: `mileage_start`, `mileage_end`, `moto_start`, `moto_end`
- Production columns: `soil_product`, `coal_product`

### `inspections`

- Purpose: inspection checklist master by vehicle type
- Key columns: `id`, `organization_id`, `vehicle_type`, `inspection_type`, `name`

### `shift_inspections`

- Purpose: actual inspection result rows recorded during shift activity
- Key columns: `id`, `shift_id`, `vehicle_id`, `driver_id`, `inspection_id`, `status`
- Supporting columns: `notes`, `photo_url`

### `work_logs`

- Purpose: individual trip / cycle / work execution records under a shift
- Key columns: `id`, `shift_id`, `plan_id`, `stockpile_id`, `status`
- Time columns: `start_time`, `end_time`
- Supporting columns: `notes`

## Mining master and planning

### `mining_blocks`

- Purpose: loading / dumping block master
- Key columns: `id`, `organization_id`, `name`, `type`, `layer_number`, `is_active`
- Geo columns: `latitude`, `longitude`

### `stockpiles`

- Purpose: dump / stockpile master for coal or soil
- Key columns: `id`, `organization_id`, `type`, `layer_number`, `created_by`, `deactivated_at`

### `routes`

- Purpose: haul route master
- Key columns: `id`, `organization_id`, `route_code`, `description`

### `daily_plans`

- Purpose: dispatch plan for a specific date, shift, route, and vehicle
- Key columns: `id`, `organization_id`, `shift_type`, `route_id`, `pick_up_block_id`, `vehicle_id`, `created_by`, `date`
- Planning columns: `stockpile_ids`, `transport_amount`
- Note: `stockpile_ids` is stored as a UUID array instead of a junction table

### `monthly_plans`

- Purpose: monthly production target planning
- Key columns: `id`, `organization_id`, `year`, `month`, `coal_amount`, `soil_amount`
- Constraint: unique per `organization_id + year + month`

## Reporting

### `markshader_daily_reports`

- Purpose: survey / markscheider daily reconciliation report
- Key columns: `id`, `organization_id`, `recorded_by`
- Measurement columns: `actual_production`, `dis_volume`, `loading_site_measurement`, `dispatcher_markshader_discrepancy`
- Supporting columns: `notes`

## Suggested future tables for full ERP

These are not in the current schema yet, but they are natural additions for a full mining ERP:

- `maintenance_work_orders`
- `breakdown_events`
- `service_schedules`
- `spare_parts`
- `warehouse_stocks`
- `fuel_transactions`
- `contractors`
- `purchase_requests`
- `purchase_orders`
- `employee_attendance`
- `training_records`
- `safety_incidents`
- `cost_centers`
- `production_reconciliations`

## Table grouping at a glance

- Access / tenant: `organizations`, `users`, `account`, `session`
- Fleet master: `vehicles`, `vehicle_pictures`, `vehicle_organizations`, `mining_sections`
- Operations: `shifts`, `inspections`, `shift_inspections`, `work_logs`
- Planning / mining: `mining_blocks`, `stockpiles`, `routes`, `daily_plans`, `monthly_plans`
- Reporting: `markshader_daily_reports`
