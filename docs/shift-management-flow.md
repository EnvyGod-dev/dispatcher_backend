# Shift Management Flow

## Purpose

This document defines the intended operational flow for shift management in Stratum based on the clarified business rule:

- dispatcher creates daily plans only
- driver starts and ends the main shift
- driver starts and ends worklogs during the shift
- dispatcher may create or update worklogs only as a fallback when the driver cannot register them

It also clarifies the vehicle roles:

- shift vehicle = truck
- daily plan vehicle = excavator
- worklog = one haul record that connects a truck shift to an excavator daily plan

## Core domain model

### Shift

- represents one driver session on one truck
- created when a driver starts work
- closed when the driver ends the shift
- owns shift-level odometer and moto-hour values

### Daily plan

- created by dispatcher before or during operations
- represents planned loading work for one excavator, route, pickup block, stockpile set, date, and shift type
- does not start a shift and does not replace a shift

### Worklog

- represents one completed or in-progress haul/trip inside a shift
- belongs to one truck shift
- references one excavator daily plan
- references one stockpile from that daily plan

## Vehicle meaning

### Shift vehicle

- vehicle attached to the shift must be a `truck`
- this is the actual hauling vehicle used by the driver
- one active shift per truck at a time

### Daily plan vehicle

- vehicle attached to the daily plan must be an `excavator`
- this is the loading machine serving the route/block/stockpile plan
- many truck shifts may work against the same excavator plan

### Worklog vehicle semantics

- worklog does not need its own direct vehicle record if the model remains normalized
- worklog inherits:
  - truck from `shift`
  - excavator from `dailyPlan`
- API and UI should expose these as separate concepts:
  - `shiftTruck`
  - `planExcavator`

## Roles and responsibilities

### Dispatcher

- creates daily plans
- updates daily plans if operations change
- monitors shifts and worklogs
- may create or update worklogs when the driver cannot register them
- should not be the primary actor for shift start/end

### Driver

- starts shift
- selects truck and shift type
- records opening mileage and moto-hour
- starts and ends worklogs during the shift
- ends shift with closing mileage and moto-hour

## End-to-end flow

## 1. Dispatcher creates daily plan

Dispatcher prepares the loading plan before execution.

Required input:

- date
- shift type: `day` or `night`
- excavator
- route
- pickup block
- one or more stockpiles
- optional target transport amount

Validation:

- selected plan vehicle must be an `excavator`
- all selected entities must belong to the same organization
- stockpiles must be valid for dispatch use
- date and shift type are required

Output:

- one active daily plan record that can later be selected by truck drivers during worklog registration

## 2. Driver starts shift

Driver begins work on a truck.

Required input:

- truck
- shift type
- mileage start
- moto start

Validation:

- selected shift vehicle must be a `truck`
- driver must not already have an active shift
- truck must not already have an active shift
- organization access must match

System result:

- create `shift`
- set status to `started`
- set `shiftStart`
- truck becomes occupied by that active shift

## 3. Driver selects daily plan and starts worklog

Once shift is active, driver starts hauling against a dispatcher-created daily plan.

Required input:

- active shift
- daily plan
- stockpile from that daily plan
- optional notes

Validation:

- shift must be active
- no other `in_progress` worklog should exist for the same shift if only one active trip is allowed
- selected daily plan must belong to the same organization
- selected daily plan must match the same shift type as the shift
- selected daily plan vehicle must be an `excavator`
- selected stockpile must belong to the selected daily plan

Important business meaning:

- the truck belongs to the shift
- the excavator belongs to the daily plan
- they are different vehicle roles and usually different vehicle types

System result:

- create `worklog`
- set status to `in_progress`
- set start time

## 4. Driver finishes worklog

Driver finishes one haul/trip.

Required input:

- worklog id
- result status: `completed` or `cancelled`
- end time
- optional notes
- optional transported amount if that remains part of the business workflow

Validation:

- worklog must belong to driver's active shift
- worklog must currently be `in_progress`
- end time must be after start time

System result:

- update worklog status
- set end time
- update shift summary counters if needed

## 5. Driver repeats worklogs during shift

This continues until the shift is finished.

Rules:

- one shift can contain many worklogs
- one shift may reference multiple daily plans if operations require the truck to work on multiple excavator plans within the same shift
- every worklog still belongs to exactly one daily plan and one stockpile

Recommended restriction:

- only allow daily plans for the same `date + shiftType + organization`

## 6. Dispatcher fallback flow for worklogs

Dispatcher does not normally operate the shift, but may intervene when the driver cannot register worklogs.

Allowed actions:

- create missing worklog for an existing shift
- update incorrect plan, stockpile, time, notes, or status
- cancel incorrect worklog

Restrictions:

- dispatcher should not change the vehicle role semantics
- dispatcher-created worklog must still use:
  - truck from shift
  - excavator from daily plan
- dispatcher should not create a shift on behalf of the driver unless business rules later expand to allow it

Audit recommendation:

- mark whether a worklog was created by driver or dispatcher
- store `createdBy` and `updatedBy` on worklogs for traceability

## 7. Driver ends shift

At the end of operations, driver closes the truck shift.

Required input:

- shift id
- mileage end
- moto end
- optional notes

Validation:

- shift must belong to driver
- shift must still be active
- no worklog under the shift may remain `in_progress`
- end values must be valid compared to start values

System result:

- set shift status to `completed`
- set `shiftEnd`
- calculate production summaries
- release truck from active use

## Exceptional flows

### Shift cancellation

- used when shift was opened incorrectly or abandoned
- should require elevated permission or explicit reason
- all in-progress worklogs must be resolved first or automatically cancelled with audit trail

### Worklog correction by dispatcher

- used when driver forgot to register trip or entered wrong plan/stockpile/time
- correction should be allowed only for authorized roles
- all corrections should be auditable

### Daily plan change during active shift

- dispatcher may create or update another excavator plan
- driver can then use that new plan for the next worklog
- existing completed worklogs should remain attached to the original plan they used

## Recommended API semantics

## Daily plan APIs

- `POST /daily-plan`
  - dispatcher creates excavator plan
- `PUT /daily-plan`
  - dispatcher updates excavator plan

## Shift APIs

- `POST /shift/start`
  - driver starts truck shift
- `POST /shift/end`
  - driver ends truck shift
- `GET /shifts`
  - driver gets current active shift

## Worklog APIs

- `POST /work-log/start`
  - driver starts trip against daily plan
- `POST /work-log/end` or equivalent update
  - driver completes or cancels trip
- `POST /work-log`
  - dispatcher fallback create
- `PUT /work-log`
  - dispatcher fallback update

## Required validation rules for implementation

The system should enforce these rules consistently across all worklog create/update paths.

### Shift rules

- shift vehicle type must be `truck`
- only one active shift per truck
- only one active shift per driver

### Daily plan rules

- daily plan vehicle type must be `excavator`
- stockpile must belong to plan
- plan must match organization

### Worklog rules

- worklog shift must be active unless dispatcher is entering historical correction flow
- worklog must use one selected daily plan
- worklog must use one selected stockpile from that plan
- daily plan vehicle must not be treated as the same role as shift vehicle
- the system must not enforce `dailyPlan.vehicleId === shift.vehicleId`
- if shift type compatibility is required, `dailyPlan.shiftType` must match `shift.shiftType`

## Suggested UI flow

### Dispatcher UI

- create daily plan page
  - date
  - shift type
  - excavator
  - route
  - block
  - stockpiles
- shift report page
  - monitor active/completed shifts
  - monitor worklogs
  - fallback create/update worklog only

### Driver UI

- shift start page
  - choose truck
  - choose shift type
  - opening mileage and moto
- active shift page
  - show truck info
  - show available daily plans
  - start worklog
  - end worklog
  - show worklog history
- shift end page/modal
  - closing mileage and moto
  - notes

## Reporting expectations

Reports should distinguish between truck and excavator instead of using one ambiguous vehicle field.

Recommended reporting fields:

- shift id
- driver
- shift truck
- worklog id
- plan excavator
- route
- pickup block
- stockpile
- start time
- end time
- worklog status
- shift status

## Future improvements

- add `createdBy` and `updatedBy` to worklogs
- add explicit `source` field such as `driver` or `dispatcher`
- add historical correction mode for dispatcher with reason field
- rename API response fields to remove ambiguous `vehicle` naming
- expose `shiftTruck` and `planExcavator` separately in frontend and backend DTOs

## Final summary

The correct business lifecycle is:

1. dispatcher creates excavator daily plan
2. driver starts truck shift
3. driver starts and completes worklogs against dispatcher-created daily plans
4. dispatcher only intervenes for missing or incorrect worklogs
5. driver ends shift after all worklogs are resolved

This keeps planning, execution, and correction responsibilities clearly separated while preserving the correct truck-versus-excavator relationship in the domain model.
