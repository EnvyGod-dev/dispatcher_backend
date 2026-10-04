# Stratum

## Database relations

### Companies

- Companies can have many users (1:N)
- Companies can have many vehicles (1:N)
- Companies can have many locations (1:N)
- Companies can have many inspection templates (1:N)
<!-- - Companies can have many materials - сэлбэг 1:N -->

### Users

- users belong to one company (N:1)
- users can work multiple shifts (1:N)
- users can perform multiple vehicle inspections (1:N)
- users can have multiple GPS tracking records (1:N)

### Vehicles

- vehicles belong to one company (N:1)
- vehicles can be used in multiple shifts (1:N)
- vehicles can have multiple GPS tracking records (1:N)
- vehicles can have multiple inspections (1:N)

### Locations

- locations belong to one company (N:1)
- locations can be used as pickup points in multiple work records (1:N)
- locations can be used as dropoff points in multiple work records (1:N)

### Shifts

- shifts belong to one user type of driver (N:1)
- shifts use one vehicle (N:1)
- shifts have one vehicle inspection (1:1)
- shifts can contain multiple work records (1:N)

### Work records

- work records belong to one shift (N:1)
- work records have one pickup location (N:1)
- work records have one dropoff location (N:1)

### Inspection template (Configurable checklists)

- inspection templates belong to one company (N:1)
- inspection templates have multiple inspection items (1:N)
- inspection templates can be used for multiple vehicle inspections (1:N)

### Inspection item (Checklist items)

- inspection items belong to one inspection template (N:1)
- inspection items can generate multiple inspection results (1:N)

### Vehicle inspection (Daily inspections)

- vehicle inspections belong to one shift (N:1)
- vehicle inspections are for one vehicle (N:1)
- vehicle inspections are performed by one user type of driver (N:1)
- vehicle inspections use one inspection template (N:1)
- vehicle inspections have multiple inspection results (1:N)

### Inspection result (Individual item results)

- inspection results belong to one vehicle inspection (N:1)
- inspection results are for one inspection item (N:1)

### General relations

- COMPANY (1) ←→ (N) USER
- COMPANY (1) ←→ (N) VEHICLE
- COMPANY (1) ←→ (N) LOCATION
- COMPANY (1) ←→ (N) MATERIAL_TYPE

- USER (1) ←→ (N) SHIFT (where role='DRIVER')
- USER (1) ←→ (N) VEHICLE_INSPECTION (where role='DRIVER')
<!-- - USER (1) ←→ (N) GPS_TRACKING (where role='DRIVER')  -->

- VEHICLE (1) ←→ (N) SHIFT

- SHIFT (1) ←→ (1) VEHICLE_INSPECTION
- SHIFT (1) ←→ (N) WORK_RECORD

- INSPECTION_TEMPLATE (1) ←→ (N) INSPECTION_ITEM
- VEHICLE_INSPECTION (1) ←→ (N) INSPECTION_RESULT

- LOCATION ←→ WORK_RECORD (pickup/dropoff)

# HonosJS + Supabase Auth

## Built With

- Node.js
- PNPM
- TypeScript
- Supabase
- Drizzle
- Zod
- Vitest
- Biome
- Sentry

## Getting Started

## Installation

Run:
`pnpm install`

After install all packages, copy the `.env.example` file and rename it to `.env`. Fill in the necessary environment variables.

## Supabase

Create a project in Supabase and put your envs into `.env`:

- DATABASE_URL
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE

## Sentry

Create a project in Sentry and put your envs into `.env`:

- SENTRY_DSN

## Database Setup

Run the migration script to set up the database. This can be done by running the migrate script in src/libs/database/migrate.ts.

### start

The server will start and listen on the port specified in your .env file.

## Testing

To run the tests, use the test script in the package.json file:

## Contributing

Provide instructions on how to contribute to your project.
