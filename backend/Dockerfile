FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app/backend

COPY backend/package.json ./package.json
COPY backend/bun.lock ./bun.lock
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production

COPY --from=dependencies --chown=bun:bun /app/backend/node_modules ./node_modules
COPY --chown=bun:bun backend/package.json ./package.json
COPY --chown=bun:bun backend/index.api.ts backend/index.worker.ts backend/migrate.ts ./
COPY --chown=bun:bun backend/migrations ./migrations
COPY --chown=bun:bun backend/src ./src

USER bun

# API | Worker
EXPOSE 3000 3001

ENTRYPOINT ["bun", "run"]
CMD ["index.api.ts"]
