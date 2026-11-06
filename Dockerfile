# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/database ./src/database

# Ensure uploads directory structure exists
RUN mkdir -p uploads/hazards uploads/profiles uploads/general

EXPOSE 3030

# Automatically run pending migrations and launch server
CMD ["sh", "-c", "npm run migrate && npm run start"]

