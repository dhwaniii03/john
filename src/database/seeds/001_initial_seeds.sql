-- 001_initial_seeds.sql
-- Initial seed data for RoadLife

-- 1. Seed Global Admin in admins table
-- Password is 'Admin@1234'
INSERT INTO admins (name, email, password_hash, role, status)
VALUES (
  'System Admin',
  'admin@roadlife.com',
  '$2b$10$Vjyl63IUdyM3CRRBoDw3HeVm05kDtl7.28hmU4BOP7kleMV44fhp6',
  'GLOBAL_ADMIN',
  'ACTIVE'
)
ON CONFLICT (email) DO UPDATE 
SET name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    status = EXCLUDED.status;

-- Also ensure user entry for admin exists in users table
INSERT INTO users (name, first_name, last_name, email, password, role, transport_mode, status)
VALUES (
  'System Admin',
  'System',
  'Admin',
  'admin@roadlife.com',
  '$2b$10$Vjyl63IUdyM3CRRBoDw3HeVm05kDtl7.28hmU4BOP7kleMV44fhp6',
  'admin',
  'DRIVER',
  'ACTIVE'
)
ON CONFLICT (email) DO UPDATE 
SET role = 'admin',
    password = EXCLUDED.password,
    status = 'ACTIVE';

-- 2. Seed Hazard Categories
INSERT INTO hazard_categories (name, slug, description, default_severity, default_expiry_days, is_active)
VALUES
  ('Pothole', 'pothole', 'Road surface crater or dangerous depression', 'HIGH', 7, true),
  ('Fallen Tree', 'fallen-tree', 'Tree or large branches blocking the road', 'HIGH', 7, true),
  ('Flooding', 'flooding', 'Standing water, street flooding, or drainage overflow', 'MEDIUM', 7, true),
  ('Debris', 'debris', 'Obstacles, fallen cargo, branches, or hazardous debris on roadway', 'LOW', 7, true),
  ('Animal Crossing', 'animal-crossing', 'Stray, injured, or crossing animals and wildlife on road', 'HIGH', 7, true),
  ('Construction', 'construction', 'Road works, construction zones, or lane closures', 'LOW', 7, true),
  ('Poor Visibility', 'poor-visibility', 'Poor visibility conditions, heavy rain, fog, or snow', 'HIGH', 7, true),
  ('Other', 'other', 'Other general road hazards and obstructions', 'LOW', 7, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    default_severity = EXCLUDED.default_severity,
    default_expiry_days = EXCLUDED.default_expiry_days,
    is_active = EXCLUDED.is_active;

-- 3. Seed Default Content Pages
INSERT INTO content_pages (slug, title, content, is_published)
VALUES
  ('faq', 'Frequently Asked Questions', '### What is RoadLife?\nRoadLife is a real-time community road safety and hazard reporting platform for drivers, cyclists, and walkers.\n\n### How do I report a hazard?\nUse the Report Hazard button in the mobile app, specify the location, attach a photo, and submit for verification.\n\n### How does proximity alert work?\nDrivers receive audio/visual alerts when approaching verified hazards or vulnerable road users (cyclists and walkers) in their path.', true),
  ('terms', 'Terms and Conditions', '### RoadLife Terms of Service\nBy using RoadLife, you agree to follow local traffic laws, maintain road vigilance, and use the platform responsibly.\n\n1. Do not operate the app while actively driving.\n2. Accurate hazard reporting ensures safety for all community members.\n3. Misuse or fraudulent reporting may lead to account suspension.', true),
  ('privacy', 'Privacy Policy', '### RoadLife Privacy Policy\nYour privacy and safety are our top priorities.\n\n- Location data is processed only during active journeys or when location sharing is explicitly enabled.\n- High-frequency live location coordinates are expired and cleaned up regularly.\n- We do not sell your personal data to third parties.', true),
  ('help', 'Help & Support', '### Need Help?\nContact RoadLife Support at support@roadlife.com or explore our FAQs for guidance on using the app, reporting road conditions, and managing your account settings.', true),
  ('about', 'About RoadLife', '### About RoadLife\nRoadLife is dedicated to saving lives on the road by uniting drivers, cyclists, and pedestrians through intelligent, real-time crowdsourced safety awareness and proactive alerts.', true)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    content = EXCLUDED.content,
    is_published = EXCLUDED.is_published;

-- 4. Seed Default Settings
INSERT INTO settings (key, value, description)
VALUES
  ('map_config', '{"defaultRadiusKm": 5, "maxRadiusKm": 50, "defaultZoom": 14, "clusterRadius": 50}', 'Default map radius and display configurations'),
  ('notification_settings', '{"hazardAlerts": true, "cyclistAlerts": true, "walkerAlerts": true, "cooldownSeconds": 300}', 'Notification alert dispatch parameters and cooldown timing'),
  ('hazard_expiry_rules', '{"defaultExpiryHours": 72, "criticalExpiryHours": 168, "lowExpiryHours": 24}', 'Automatic hazard expiration thresholds in hours'),
  ('system_preferences', '{"platformName": "RoadLife", "supportEmail": "support@roadlife.com", "maintenanceMode": false}', 'System-wide preferences and support contact information')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;
