ALTER TABLE users
ADD COLUMN IF NOT EXISTS department VARCHAR(255),
ADD COLUMN IF NOT EXISTS register_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS driver_license_expiry_date DATE,
ADD COLUMN IF NOT EXISTS ett_driver_license_expiry_date DATE,
ADD COLUMN IF NOT EXISTS entry_permit_expiry_date DATE;