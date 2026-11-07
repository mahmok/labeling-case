FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json ./backend/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=dependencies --chown=bun:bun /app/backend/node_modules ./backend/node_modules
COPY --chown=bun:bun package.json ./package.json
COPY --chown=bun:bun backend/package.json ./backend/package.json
COPY --chown=bun:bun backend/index.api.ts backend/index.worker.ts backend/migrate.ts ./backend/
COPY --chown=bun:bun backend/migrations ./backend/migrations
COPY --chown=bun:bun backend/src ./backend/src

USER bun

# API | Worker
EXPOSE 3000 3001

ENTRYPOINT ["bun", "run"]
CMD ["backend:api:start"]
