# Stratum ERP Feature Map

## Product positioning

Stratum v0.1 is already broader than only vehicle and shift management when the frontend is considered. The current product exposes operational master-data pages, planning pages, inspection setup, reporting screens, and workforce management, even though the operational core is still fleet and shift execution.

## Current v0.1 feature set

### 1. Vehicle management

- Vehicle master records
- Vehicle type and lifecycle status tracking
- Vehicle ownership / contractor grouping
- Vehicle mining section assignment
- Vehicle technical identifiers (plate, serial, engine)
- Vehicle telematics flags (GPS, buzzer, fuel sensor)
- Vehicle image registry by angle
- Vehicle availability for shift assignment

### 2. Shift management

- Shift start / end workflow
- Day and night shift support
- Driver to vehicle assignment
- Opening / closing mileage tracking
- Opening / closing moto hour tracking
- Shift status tracking
- Active shift validation to prevent overlap
- Shift history and shift update flows

### 3. Dispatch and execution support already present in the platform

- Daily plan creation by route, block, stockpile, vehicle, and shift type
- Work log / trip tracking against a shift and plan
- Shift inspection checklist management
- Vehicle-type-based inspection templates
- Mining block, route, stockpile, and mining section masters
- Monthly production planning
- Markscheider daily reporting
- Dashboard / KPI / report endpoints

### 4. Frontend modules already visible in the product

- Vehicles module with tabs for vehicles, mining sections, and contractor / vehicle organizations
- Employees module with create, edit, delete, bulk import, role, and status management
- Daily plan module with shift/date planning and stockpile allocation
- Shift report module with shift detail editing and monthly aggregation
- Inspection master module with single and bulk checklist creation
- Inspection report module with vehicle-level and shift-level inspection analytics
- Routes module for haul route master data
- Stockpiles module for dump / stockpile master data
- Mining block module with GPS coordinates and activity status
- Monthly plan module for monthly coal and soil targets
- Markscheider report module for production reconciliation entries

## Actual UI scope by page

### Fleet and master data pages

- `vehicles`: equipment list, filters, configurable columns, add/edit/view workflow
- `vehicles` tab `mining-sections`: mining section master management
- `vehicles` tab `vehicle-organizations`: contractor / owning company registry
- `routes`: route code and description management
- `stockpiles`: stockpile type and layer number management
- `mining-block`: block name, layer, GPS, and active status management

### Operational pages

- `daily-plan`: dispatcher planning by date, shift, route, loading block, stockpiles, and excavator
- `shift-report`: shift performance list with expandable work logs and shift editing
- `inspection-report`: vehicle summary view and per-shift inspection details

### Administration and support pages

- `employees`: workforce registry with role and status controls
- `inspections`: inspection master checklist configuration
- `monthly-plan`: monthly production target setup
- `markshader-report`: daily survey reconciliation capture

## Important scope clarification

If you describe the product only as "vehicle and shift management," that understates the shipped UI.

A more accurate statement is:

"Stratum v0.1 is a mining operations ERP foundation centered on vehicle and shift workflows, with working frontend modules for workforce administration, dispatch planning, inspections, route/block/stockpile master data, monthly planning, and markscheider reporting."

## Recommended feature roadmap for full mining ERP

### Phase 1: Operational control

- Dispatch board with live fleet status
- Planned vs actual trip monitoring
- Fuel issue and consumption tracking
- Downtime and breakdown logging
- Maintenance request intake
- Operator attendance and availability

### Phase 2: Mining production management

- Pit / bench / block production tracking
- Ore / waste movement accounting
- Quality and grade linkage per block / stockpile
- Drill and blast planning
- Excavator-loader-truck productivity analysis
- Shift target vs actual reconciliation

### Phase 3: Asset and maintenance management

- Preventive maintenance schedules
- Work orders and job cards
- Spare parts inventory
- Tyre and component lifecycle tracking
- Workshop labor tracking
- Failure code analytics

### Phase 4: Commercial and inventory control

- Contract management for contractors and rentals
- Procurement and purchase requests
- Goods receipt and warehouse inventory
- Fuel depot stock control
- Supplier performance and spend analysis
- Billing for contractor production and equipment usage

### Phase 5: People, safety, and compliance

- HR master data and roster planning
- Training and competency management
- Permit-to-work and safety observations
- Incident management
- Compliance document expiry tracking
- Access control by department and site

### Phase 6: Finance and executive reporting

- Cost center allocation
- Production cost per BCM / ton
- Budget vs actual reporting
- Payroll inputs from shifts and equipment usage
- Executive dashboards
- Data warehouse / BI integration

## Functional modules for the target ERP

- Master data: organizations, users, roles, vehicles, mining areas, routes, stockpiles
- Operations: shifts, work logs, dispatching, inspections
- Planning: daily plans, monthly plans, production targets
- Technical: maintenance, breakdowns, spare parts, component history
- Geology / survey: block data, markscheider reports, reconciliation
- Commercial: contractors, procurement, inventory, billing
- Corporate: HR, finance, document control, analytics

## v0.1 scope statement

If you want to communicate the current version clearly to stakeholders, the simplest statement is:

"Stratum v0.1 covers fleet, shift, planning, inspection, and operational master-data workflows as the first release of a broader mining ERP platform."
