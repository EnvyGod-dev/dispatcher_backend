# Stratum Frontend Scope

This document is based on the implemented frontend pages in `dispatcher-front/src/app` and related sidebar forms/components. It shows what the user can currently see and manage in the UI.

## Page inventory

### `vehicles`

- Tabs:
  - `Техник`
  - `Уулын хэсэг`
  - `Туслан гүйцэтгэгч компани`
- Main purpose: fleet registry and supporting master data

### `employees`

- Main purpose: user / employee registry

### `daily-plan`

- Main purpose: dispatcher shift planning

### `shift-report`

- Tabs:
  - `Ээлжийн тайлан`
  - `Сарын нэгтгэл`
- Main purpose: shift performance review and edit

### `inspections`

- Main purpose: inspection master checklist management

### `inspection-report`

- Main purpose: inspection analytics by vehicle and shift

### `routes`

- Main purpose: haul route master management

### `stockpiles`

- Main purpose: stockpile master management

### `mining-block`

- Main purpose: blast / loading block master management

### `monthly-plan`

- Main purpose: monthly coal and soil planning

### `markshader-report`

- Main purpose: daily markscheider reconciliation

## Forms and captured fields

### Vehicle form

- Source: `dispatcher-front/src/components/ui/vehicle/Sidebar.tsx`
- Fields observed:
  - `vehicleOrganizationId`
  - `miningSectionId`
  - `name`
  - `code` (auto-generated)
  - `vehicleNumber`
  - `serialNumber`
  - `engineNumber`
  - `mineNumber`
  - `type`
  - `status`
  - `commissioningDate`
  - `decommissioningDate`
  - `soilCoefficient`
  - `coalCoefficient`
  - `stoppedMotoHours`
  - `fuelConsumptionPerHour`
  - `hasGps`, `gpsId`, `gpsGroupId`, `gpsName`
  - `hasBuzzer`
  - `hasFuelSensor`
  - `notes`
  - `vehiclePictures[]`

### Employee form

- Source: `dispatcher-front/src/components/employee/EmployeeSidebar.tsx`
- Modes:
  - single create / edit
  - bulk upload from Excel
- Fields observed:
  - `firstName`
  - `lastName`
  - `email`
  - `phone`
  - `password`
  - `newPassword` during edit
  - `role`
  - `position`
  - `status`
  - `imageUrl`
  - organization context from logged-in user

### Daily plan form

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/daily-plan/Sidebar.tsx`
- Fields observed:
  - `date`
  - `routeId`
  - `vehicleId`
  - `shiftType`
  - `pickUpBlockId`
  - `stockpileIds[]`
  - `transportAmount`

### Shift edit form

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/shift-report/components/ShiftEditForm.tsx`
- Editable fields observed:
  - `shiftType`
  - `vehicleId`
  - `status`
  - `mileageStart`
  - `mileageEnd`
  - `motoStart`
  - `motoEnd`
  - `notes`

### Inspection form

- Source: `dispatcher-front/src/components/inspection/InspectionSidebar.tsx`
- Modes:
  - single create / edit
  - bulk upload from file
- Fields observed:
  - `vehicleType`
  - `name`
  - `type`

### Route form

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/routes/Sidebar.tsx`
- Fields observed:
  - `routeCode`
  - `description`

### Stockpile form

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/stockpiles/Sidebar.tsx`
- Fields observed:
  - `type`
  - `layerNumber`

### Mining block form

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/mining-block/Sidebar.tsx`
- Fields observed:
  - `name`
  - `layerNumber`
  - `latitude`
  - `longitude`
  - `description`
  - `isActive`

### Monthly plan form

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/monthly-plan/Sidebar.tsx`
- Fields observed:
  - `month`
  - `soilAmount`
  - `coalAmount`
  - `year` is auto-filled during create

### Markscheider report form

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/markshader-report/Sidebar.tsx`
- Fields observed:
  - `loadingSiteMeasurement`
  - `actualProduction`
  - `disVolume`
  - `dispatcherMarkshaderDiscrepancy` (derived)
  - `notes`

## Main table columns by page

### Vehicles table

- Source: `dispatcher-front/src/components/vehicles/index.tsx`
- Available columns observed:
  - `commissioningDate`
  - `name`
  - `code`
  - `fuelConsumptionPerHour`
  - `type`
  - `organization`
  - `miningSection`
  - `coalCoefficient`
  - `soilCoefficient`
  - `gps`
  - `status`
  - `decommissioningDate`
  - `stoppedMotoHours`
  - `serialNumber`
  - `engineNumber`

### Employees table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/employees/page.tsx`
- Columns observed:
  - avatar / `imageUrl`
  - employee name + position
  - `email`
  - `role`
  - `status`
  - `phoneNumber`

### Daily plan table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/daily-plan/page.tsx`
- Columns observed:
  - `date`
  - `shiftType`
  - `vehicleCode`
  - `routeCode`
  - `miningBlockName`
  - `miningBlockLayerNumber`
  - `stockpiles`
  - `transportAmount`

### Shift report table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/shift-report/hooks/useShiftReportColumns.tsx`
- Columns observed:
  - `createdAt`
  - driver
  - vehicle
  - `shiftType`
  - `trips`
  - `coalWorkLogCount`
  - `soilWorkLogCount`
  - `shiftStatus`
  - `shiftTime`
  - `coalProduct`
  - `soilProduct`
  - inspection issue indicator
  - `totalProduct`
  - `mileageStart`
  - `mileageEnd`
  - `mileage`
  - `motoHours`
  - `motoStart`
  - `motoEnd`
  - `shiftStart`
  - `shiftEnd`

### Inspections table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/inspections/page.tsx`
- Columns observed:
  - `type`
  - `name`
  - `vehicleType`
  - `createdAt`

### Inspection report summary table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/inspection-report/page.tsx`
- Columns observed:
  - `vehicleCode`
  - `vehicleType`
  - `vehicleStatus`
  - `totalInspections`
  - `normalCount`
  - `issueCount`
  - `needsInspectionCount`
  - `shiftsWithoutInspection`
  - `lastInspectionDate`

### Inspection report detail table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/inspection-report/[id]/page.tsx`
- Columns observed:
  - `name`
  - `status`
  - `notes`
  - `createdAt`
  - `photo`

### Routes table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/routes/page.tsx`
- Columns observed:
  - `routeCode`
  - `description`
  - `createdAt`

### Stockpiles table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/stockpiles/page.tsx`
- Columns observed:
  - `createdAt`
  - `type`
  - `layerNumber`

### Mining blocks table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/mining-block/page.tsx`
- Columns observed:
  - `name`
  - `layerNumber`
  - GPS coordinates link
  - `isActive`

### Monthly plans table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/monthly-plan/page.tsx`
- Columns observed:
  - `year`
  - `month`
  - `soilAmount`
  - `coalAmount`

### Markscheider reports table

- Source: `dispatcher-front/src/app/(admin)/(others-pages)/markshader-report/page.tsx`
- Columns observed:
  - report date
  - `loadingSiteMeasurement`
  - `actualProduction`
  - `disVolume`
  - `dispatcherMarkshaderDiscrepancy`

## Page-to-table mapping

- `vehicles` -> `vehicles`, `vehicle_pictures`, `vehicle_organizations`, `mining_sections`
- `employees` -> `users`, `account`, `session`
- `daily-plan` -> `daily_plans`, `routes`, `mining_blocks`, `stockpiles`, `vehicles`
- `shift-report` -> `shifts`, `work_logs`, `shift_inspections`, `vehicles`, `users`
- `inspections` -> `inspections`
- `inspection-report` -> `shift_inspections`, `inspections`, `shifts`, `vehicles`, `users`
- `routes` -> `routes`
- `stockpiles` -> `stockpiles`
- `mining-block` -> `mining_blocks`
- `monthly-plan` -> `monthly_plans`
- `markshader-report` -> `markshader_daily_reports`

## Scope conclusion

From the frontend alone, the product already behaves like an early mining operations ERP rather than a two-screen MVP. The visible modules cover:

- fleet master data
- workforce registry
- operational planning
- shift reporting
- inspection setup and analysis
- mine master data
- monthly planning
- markscheider reconciliation
