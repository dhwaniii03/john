# RoadLife Backend Development & Setup Guide

## Quick Start

### 1. Prerequisites
- Node.js v18+ or v20+
- PostgreSQL 14+
- npm

### 2. Environment Setup
Copy `.env.example` to `.env` and configure your credentials:
```env
PORT=3030
HOST=localhost
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
DB_NAME=roadlife

JWT_SECRET=roadlife_jwt_super_secret_key_change_in_production
JWT_EXPIRES_IN=7d
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Migrations
```bash
# Run migrations (idempotent, safe to rerun)
npm run migrate

# Run initial seeds (default admin, categories, settings, content)
npm run seed
```

### 5. Running the Backend
```bash
# Development mode with hot-reloading
npm run dev

# Build TypeScript to dist/
npm run build

# Production start
npm run start
```

### 6. Running Automated Tests
```bash
npm test
```

---

## Default Seed Credentials
- **Global Admin**: `admin@roadlife.com` / `Admin@1234`
- **Default Port**: `3030`
- **Health Check**: `http://localhost:3030/health`
- **Database Status**: `http://localhost:3030/health/db`
- **Postman Collection**: `RoadLife_Postman_Collection.json`
