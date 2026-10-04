# Stratum API Documentation

This document provides a summary of the available APIs in the Stratum.

## Public API

| Method | Endpoint  | Description | Return Type                    |
| ------ | --------- | ----------- | ------------------------------ |
| GET    | /api/ping | Ping        | `{ "response": "aitai miaw" }` |

## Authentication API

| Method | Endpoint                 | Description      | Return Type                                               |
| ------ | ------------------------ | ---------------- | --------------------------------------------------------- |
| POST   | /api/sign-in             | Sign in          | `User` object or `{"error": "Invalid email or password"}` |
| POST   | /api/sign-out            | Sign out         | `boolean`                                                 |
| GET    | /api/iam/test            | Test endpoint    | `User`                                                    |
| POST   | /api/iam/change-password | Change password  | `{"ok": true}` or `HTTPException`                         |
| GET    | /api/iam                 | Get current user | `User`                                                    |

## Internal API

| Method | Endpoint                                 | Description                                 | Return Type                         |
| ------ | ---------------------------------------- | ------------------------------------------- | ----------------------------------- |
| GET    | /api/internal/daily-plans                | Get daily plans of the day                  | `DailyPlan[]`                       |
| POST   | /api/internal/daily-plan                 | Create daily plan                           | `DailyPlan`                         |
| PUT    | /api/internal/daily-plan                 | Update daily plan                           | `DailyPlan`                         |
| DELETE | /api/internal/daily-plan                 | Delete daily plan                           | `{"success": true}`                 |
| GET    | /api/internal/inspections                | Get inspections                             | `Inspection[]`                      |
| POST   | /api/internal/inspection                 | Create inspection                           | `Inspection`                        |
| POST   | /api/internal/inspections/bulk           | Create inspections in bulk                  | `Inspection[]`                      |
| PUT    | /api/internal/inspection                 | Update inspection                           | `Inspection`                        |
| DELETE | /api/internal/inspection                 | Delete inspection                           | `boolean`                           |
| GET    | /api/internal/shift-inspections/summary  | Get shift inspections summary               | `VehicleInspectionSummary[]`        |
| GET    | /api/internal/shift-inspections          | Get shift inspections                       | `VehicleInspection[]`               |
| POST   | /api/internal/inspection/upload-image    | Upload inspection image if there's an issue | `{"url": string}`                   |
| POST   | /api/internal/shift-inspection           | Create shift inspection                     | `ShiftInspection`                   |
| POST   | /api/internal/shift-inspections/bulk     | Create shift inspections in bulk            | `ShiftInspection[]`                 |
| PUT    | /api/internal/shift-inspection/:id/photo | Update shift inspection photo               | `ShiftInspection`                   |
| GET    | /api/internal/mining-block               | Get mining block                            | `MiningBlock`                       |
| GET    | /api/internal/mining-blocks              | Get mining blocks                           | `MiningBlock[]`                     |
| POST   | /api/internal/mining-block               | Create mining block                         | `MiningBlock`                       |
| PUT    | /api/internal/mining-block               | Update mining block                         | `MiningBlock`                       |
| DELETE | /api/internal/mining-block               | Delete mining block                         | `true`                              |
| GET    | /api/internal/route                      | Get route                                   | `Route`                             |
| GET    | /api/internal/routes                     | Get routes                                  | `Route[]`                           |
| POST   | /api/internal/route                      | Create route                                | `Route`                             |
| PUT    | /api/internal/route                      | Update route                                | `Route`                             |
| DELETE | /api/internal/route                      | Delete route                                | `{"success": true}`                 |
| GET    | /api/internal/shifts                     | Get shifts                                  | `Shift[]`                           |
| GET    | /api/internal/shift-history              | Get shift history                           | `Shift[]`                           |
| POST   | /api/internal/shift/start                | Start shift                                 | `Shift`                             |
| POST   | /api/internal/shift/end                  | End shift                                   | `Shift`                             |
| PUT    | /api/internal/shift                      | Update shift                                | `Shift`                             |
| DELETE | /api/internal/shift                      | Delete shift                                | `{"success": true, "shift": Shift}` |
| GET    | /api/internal/driver/shifts              | Get driver shifts                           | `Shift[]`                           |
| GET    | /api/internal/shift-vehicles             | Get shift vehicles                          | `Vehicle[]`                         |
| GET    | /api/internal/vehicles                   | Get vehicles                                | `Vehicle[]`                         |
| GET    | /api/internal/vehicle                    | Get vehicle                                 | `Vehicle`                           |
| POST   | /api/internal/work-log/start             | Start work log                              | `WorkLog`                           |
| POST   | /api/internal/work-log/end               | End work log                                | `WorkLog`                           |
| POST   | /api/internal/work-log/bulk              | Bulk create work logs                       | `WorkLog[]`                         |
| PUT    | /api/internal/work-log                   | Update work log                             | `WorkLog`                           |
| DELETE | /api/internal/work-log/:id               | Delete work log                             | `WorkLog`                           |
| GET    | /api/internal/top-excavator              | Get top excavator data                      | `TopExcaData[]`                     |
| GET    | /api/internal/shifts-insights            | Get shift KPI data                          | `ShiftKpiData`                      |
| GET    | /api/internal/shifts-report              | Get shift report data                       | `ShiftReportData[]`                 |
| GET    | /api/internal/monthly-aggregation        | Get monthly aggregation report              | `MonthlyAggregationReport`          |

## Admin API

| Method | Endpoint                        | Description          | Return Type         |
| ------ | ------------------------------- | -------------------- | ------------------- |
| POST   | /api/admin/vehicle/upload-image | Upload vehicle image | `{"url": string}`   |
| POST   | /api/admin/vehicle              | Create vehicle       | `{"data": Vehicle}` |
| PUT    | /api/admin/vehicle              | Update vehicle       | `{"data": Vehicle}` |
| DELETE | /api/admin/vehicle              | Delete vehicle       | `{"success": true}` |
