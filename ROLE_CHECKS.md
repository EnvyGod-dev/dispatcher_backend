// ============================================
// UNIFIED API PATHS WITH RBAC MIDDLEWARE
// ============================================

// ============================================
// 1. AUTHENTICATION (Public)
// ============================================
POST /api/auth/login // All users
POST /api/auth/logout // All authenticated users
POST /api/auth/refresh // All authenticated users
GET /api/auth/me // All authenticated users

// ============================================
// 2. DASHBOARD (Role-based filtering)
// ============================================
GET /api/dashboard // All authenticated (filtered by role)
GET /api/dashboard/active-shifts // admin, dispatcher
GET /api/dashboard/ongoing-tasks // admin, dispatcher
GET /api/dashboard/vehicle-alerts // admin, dispatcher, mechanic

// ============================================
// 3. ORGANIZATIONS (Super Admin only)
// ============================================
POST /api/organizations // superadmin
GET /api/organizations // superadmin
GET /api/organizations/:id // superadmin
PATCH /api/organizations/:id // superadmin
DELETE /api/organizations/:id // superadmin (soft delete)

// ============================================
// 4. USERS (Role-based CRUD)
// ============================================
POST /api/users // superadmin (create admin), admin (create driver/dispatcher)
GET /api/users // superadmin, admin, dispatcher
GET /api/users/:id // superadmin, admin, dispatcher, self
PATCH /api/users/:id // superadmin, admin (own org), self (limited fields)
DELETE /api/users/:id // superadmin, admin (own org)
PATCH /api/users/:id/status // admin (change driver status)

// ============================================
// 5. VEHICLES
// ============================================
POST /api/vehicles // admin
GET /api/vehicles // admin, dispatcher, driver (available only), mechanic
GET /api/vehicles/:id // admin, dispatcher, driver, mechanic
PATCH /api/vehicles/:id // admin
DELETE /api/vehicles/:id // admin
POST /api/vehicles/:id/pictures // admin
DELETE /api/vehicles/:id/pictures/:pictureId // admin
GET /api/vehicles/:id/maintenance-history // admin, mechanic
POST /api/vehicles/:id/maintenance // mechanic

// ============================================
// 6. MINING BLOCKS (Locations)
// ============================================
POST /api/mining-blocks // admin
GET /api/mining-blocks // admin, dispatcher, driver, operator, marksheilder
GET /api/mining-blocks/:id // admin, dispatcher, driver, operator, marksheilder
PATCH /api/mining-blocks/:id // admin
DELETE /api/mining-blocks/:id // admin

// ============================================
// 7. ROUTES
// ============================================
POST /api/routes // admin, marksheilder
GET /api/routes // admin, dispatcher, marksheilder
GET /api/routes/:id // admin, dispatcher, marksheilder
PATCH /api/routes/:id // admin, marksheilder
DELETE /api/routes/:id // admin

// ============================================
// 8. DAILY PLANS
// ============================================
POST /api/daily-plans // admin, dispatcher, marksheilder
GET /api/daily-plans // admin, dispatcher, driver (assigned), operator (assigned), marksheilder
GET /api/daily-plans/:id // admin, dispatcher, driver (assigned), operator (assigned), marksheilder
PATCH /api/daily-plans/:id // admin, dispatcher, marksheilder
DELETE /api/daily-plans/:id // admin
PATCH /api/daily-plans/:id/assign // dispatcher

// ============================================
// 9. INSPECTIONS (Templates)
// ============================================
POST /api/inspections // admin, dispatcher
GET /api/inspections // admin, dispatcher, driver
GET /api/inspections/:id // admin, dispatcher, driver
PATCH /api/inspections/:id // admin, dispatcher
DELETE /api/inspections/:id // admin

// ============================================
// 10. SHIFTS
// ============================================
POST /api/shifts // driver (start shift)
GET /api/shifts // admin, dispatcher (all), driver (own only)
GET /api/shifts/:id // admin, dispatcher, driver (own only)
PATCH /api/shifts/:id // admin (authorized), driver (own, limited fields)
DELETE /api/shifts/:id // admin (authorized)
PATCH /api/shifts/:id/end // driver (own only)
GET /api/shifts/current // driver (own current shift)
GET /api/shifts/active // admin, dispatcher

// ============================================
// 11. SHIFT INSPECTIONS
// ============================================
POST /api/shift-inspections // driver
GET /api/shift-inspections // admin, dispatcher, mechanic (issues only)
GET /api/shift-inspections/:id // admin, dispatcher, driver (own), mechanic
POST /api/shift-inspections/upload-photo // driver
PATCH /api/shift-inspections/:id/resolve // mechanic

// ============================================
// 12. WORK LOGS
// ============================================
POST /api/work-logs // driver, operator
GET /api/work-logs // admin, dispatcher (all), driver (own), operator (own)
GET /api/work-logs/:id // admin, dispatcher, driver (own), operator (own)
PATCH /api/work-logs/:id // admin (authorized), driver (own), operator (own)
DELETE /api/work-logs/:id // admin (authorized)
GET /api/work-logs/current // driver, operator (own current)
POST /api/work-logs/:id/gps-verification // driver, operator
GET /api/work-logs/:id/gps-discrepancy // admin, dispatcher, operator

// ============================================
// 13. MINING SECTIONS
// ============================================
POST /api/mining-sections // admin
GET /api/mining-sections // admin, dispatcher, marksheilder
PATCH /api/mining-sections/:id // admin
DELETE /api/mining-sections/:id // admin

// ============================================
// 14. VEHICLE ORGANIZATIONS
// ============================================
POST /api/vehicle-organizations // admin
GET /api/vehicle-organizations // admin
PATCH /api/vehicle-organizations/:id // admin
DELETE /api/vehicle-organizations/:id // admin

// ============================================
// 15. REPORTS
// ============================================
GET /api/reports/driver-tonnage // admin, dispatcher
GET /api/reports/vehicle-utilization // admin, dispatcher
GET /api/reports/shift-summary // admin, dispatcher
GET /api/reports/material-transport // admin, dispatcher, marksheilder
GET /api/reports/mining-blocks // admin, marksheilder
GET /api/reports/material-analysis // marksheilder
POST /api/reports/export // admin, dispatcher, marksheilder

// ============================================
// 16. FILE UPLOADS
// ============================================
POST /api/upload/image // All authenticated
POST /api/upload/document // All authenticated

// ============================================
// 17. SYNC (Mobile offline support)
// ============================================
POST /api/sync/shift-inspections // driver
POST /api/sync/work-logs // driver, operator
GET /api/sync/status // driver, operator

// ============================================
// 18. SYSTEM (ITA)
// ============================================
GET /api/system/config // ita, superadmin
PATCH /api/system/config // ita, superadmin
GET /api/system/logs // ita, superadmin
GET /api/system/audit // ita, superadmin

// ============================================
// 19. HEALTH
// ============================================
GET /api/health // Public
