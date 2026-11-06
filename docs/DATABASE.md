# RoadLife Database Schema & Migration Guide

## Database Engine
- **PostgreSQL 14+**
- **Pool Client**: `pg` (node-postgres)
- **Migration Runner**: Custom transactional migration tracking engine (`schema_migrations`)

---

## 1. Schema Tables

### `schema_migrations`
Tracks completed migrations for transactional, idempotent execution.
- `id` (SERIAL PRIMARY KEY)
- `migration_name` (VARCHAR UNIQUE NOT NULL)
- `executed_at` (TIMESTAMP WITH TIME ZONE)

### `users`
- `id` (SERIAL PRIMARY KEY)
- `email` (VARCHAR UNIQUE NOT NULL)
- `password` (VARCHAR NOT NULL - bcrypt hash)
- `name` (VARCHAR NOT NULL)
- `first_name` (VARCHAR)
- `last_name` (VARCHAR)
- `phone` (VARCHAR)
- `profile_image` (VARCHAR)
- `transport_mode` (VARCHAR DEFAULT 'DRIVER' - DRIVER, CYCLIST, WALKER)
- `status` (VARCHAR DEFAULT 'ACTIVE' - ACTIVE, SUSPENDED, DELETED)
- `notification_enabled` (BOOLEAN DEFAULT true)
- `location_enabled` (BOOLEAN DEFAULT true)
- `role` (VARCHAR DEFAULT 'user')
- `last_login_at` (TIMESTAMP WITH TIME ZONE)
- `deleted_at` (TIMESTAMP WITH TIME ZONE - Soft Delete)
- `created_at`, `updated_at` (TIMESTAMP)

### `admins`
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR NOT NULL)
- `email` (VARCHAR UNIQUE NOT NULL)
- `password_hash` (VARCHAR NOT NULL - bcrypt hash)
- `role` (VARCHAR DEFAULT 'GLOBAL_ADMIN')
- `status` (VARCHAR DEFAULT 'ACTIVE' - ACTIVE, SUSPENDED)
- `last_login_at` (TIMESTAMP WITH TIME ZONE)
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### `hazard_categories`
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR UNIQUE NOT NULL)
- `slug` (VARCHAR UNIQUE NOT NULL)
- `description` (TEXT)
- `icon_url` (VARCHAR)
- `is_active` (BOOLEAN DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### `hazards`
- `id` (SERIAL PRIMARY KEY)
- `category_id` (INTEGER REFERENCES hazard_categories(id))
- `title` (VARCHAR NOT NULL)
- `description` (TEXT)
- `latitude` (DOUBLE PRECISION NOT NULL)
- `longitude` (DOUBLE PRECISION NOT NULL)
- `severity` (VARCHAR DEFAULT 'MEDIUM' - LOW, MEDIUM, HIGH, CRITICAL)
- `status` (VARCHAR DEFAULT 'ACTIVE' - ACTIVE, INVESTIGATING, RESOLVED)
- `source` (VARCHAR DEFAULT 'USER' - ADMIN, USER, OFFICIAL_DATASET)
- `reported_by` (INTEGER REFERENCES users(id))
- `image_url` (VARCHAR)
- `address` (VARCHAR)
- `expires_at` (TIMESTAMP WITH TIME ZONE)
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### `hazard_reports`
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER REFERENCES users(id))
- `category_id` (INTEGER REFERENCES hazard_categories(id))
- `hazard_id` (INTEGER REFERENCES hazards(id))
- `title` (VARCHAR)
- `description` (TEXT NOT NULL)
- `latitude` (DOUBLE PRECISION NOT NULL)
- `longitude` (DOUBLE PRECISION NOT NULL)
- `address` (VARCHAR)
- `image_url` (VARCHAR)
- `status` (VARCHAR DEFAULT 'PENDING' - PENDING, APPROVED, REJECTED)
- `reviewed_by` (INTEGER REFERENCES admins(id))
- `reviewed_at` (TIMESTAMP WITH TIME ZONE)
- `rejection_reason` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### `journeys`
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER REFERENCES users(id))
- `transport_mode` (VARCHAR DEFAULT 'DRIVER')
- `title` (VARCHAR)
- `origin_name` (VARCHAR)
- `destination_name` (VARCHAR)
- `start_latitude` (DOUBLE PRECISION NOT NULL)
- `start_longitude` (DOUBLE PRECISION NOT NULL)
- `end_latitude` (DOUBLE PRECISION)
- `end_longitude` (DOUBLE PRECISION)
- `waypoints` (JSONB DEFAULT '[]')
- `distance_km` (DOUBLE PRECISION DEFAULT 0)
- `duration_minutes` (INTEGER DEFAULT 0)
- `status` (VARCHAR DEFAULT 'ACTIVE' - ACTIVE, COMPLETED, CANCELLED)
- `started_at`, `ended_at` (TIMESTAMP WITH TIME ZONE)
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### `live_locations`
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER UNIQUE REFERENCES users(id))
- `journey_id` (INTEGER REFERENCES journeys(id))
- `latitude` (DOUBLE PRECISION NOT NULL)
- `longitude` (DOUBLE PRECISION NOT NULL)
- `transport_mode` (VARCHAR DEFAULT 'DRIVER')
- `is_active` (BOOLEAN DEFAULT true)
- `last_updated_at` (TIMESTAMP WITH TIME ZONE)
- `created_at` (TIMESTAMP WITH TIME ZONE)

### `notifications`
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER REFERENCES users(id))
- `type` (VARCHAR DEFAULT 'SYSTEM' - HAZARD_ALERT, CYCLIST_ALERT, WALKER_ALERT, REPORT_STATUS, SYSTEM)
- `title` (VARCHAR NOT NULL)
- `message` (TEXT NOT NULL)
- `data` (JSONB DEFAULT '{}')
- `read_at` (TIMESTAMP WITH TIME ZONE)
- `created_at` (TIMESTAMP WITH TIME ZONE)

### `dataset_imports`
- `id` (SERIAL PRIMARY KEY)
- `admin_id` (INTEGER REFERENCES admins(id))
- `filename` (VARCHAR NOT NULL)
- `file_size` (INTEGER DEFAULT 0)
- `total_rows` (INTEGER DEFAULT 0)
- `imported_rows` (INTEGER DEFAULT 0)
- `failed_rows` (INTEGER DEFAULT 0)
- `status` (VARCHAR DEFAULT 'PENDING' - PENDING, VALIDATED, IMPORTED, FAILED)
- `error_summary` (JSONB DEFAULT '[]')
- `raw_preview` (JSONB DEFAULT '[]')
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### `content_pages`
- `id` (SERIAL PRIMARY KEY)
- `slug` (VARCHAR UNIQUE NOT NULL)
- `title` (VARCHAR NOT NULL)
- `content` (TEXT NOT NULL)
- `is_published` (BOOLEAN DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### `settings`
- `id` (SERIAL PRIMARY KEY)
- `key` (VARCHAR UNIQUE NOT NULL)
- `value` (JSONB NOT NULL)
- `description` (TEXT)
- `updated_by` (INTEGER REFERENCES admins(id))
- `updated_at` (TIMESTAMP WITH TIME ZONE)

### `activity_logs`
- `id` (SERIAL PRIMARY KEY)
- `actor_type` (VARCHAR DEFAULT 'ADMIN' - ADMIN, USER, SYSTEM)
- `actor_id` (INTEGER)
- `action` (VARCHAR NOT NULL)
- `entity_type` (VARCHAR NOT NULL)
- `entity_id` (INTEGER)
- `metadata` (JSONB DEFAULT '{}')
- `created_at` (TIMESTAMP WITH TIME ZONE)

---

## 2. Migration Commands
```bash
# Run pending migrations
npm run migrate

# Rollback last migration record
npm run migrate:rollback

# Seed database with initial admin, categories, content, and settings
npm run seed
```
