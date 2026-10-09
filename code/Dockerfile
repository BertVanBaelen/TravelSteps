# TravelSteps container image.
# Works both with docker compose and as a Home Assistant local add-on
# (the Supervisor passes BUILD_FROM, which is ignored on purpose).
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build
# Toolchain only needed when no prebuilt native binary is available (better-sqlite3).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
