# Builds the app into a small production image in three stages.

# 1. Install the dependencies exactly as listed in package-lock.json
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the Next.js app. "standalone" output (next.config.mjs) puts the
#    server and only the packages it really uses in .next/standalone.
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. The image that runs: the standalone server plus the static files
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# The database setup script and schema, so it can run inside the container:
#   docker compose exec app node scripts/setup-db.mjs
# The script also needs bcryptjs, which the standalone server doesn't include.
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/db ./db
COPY --from=deps /app/node_modules/bcryptjs ./node_modules/bcryptjs

EXPOSE 3000
CMD ["node", "server.js"]
