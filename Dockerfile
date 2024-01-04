FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY client/ ./
# Optional: pin the verification key into the bundle instead of trusting it on first use.
ARG VITE_RECORD_PUBLIC_KEY=""
ENV VITE_RECORD_PUBLIC_KEY=$VITE_RECORD_PUBLIC_KEY
RUN npm run build

FROM node:22-bookworm-slim AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY server/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 CLIENT_DIR=/app/public
WORKDIR /app
COPY --from=server --chown=root:root /app/server/package.json ./package.json
COPY --from=server --chown=root:root /app/server/node_modules ./node_modules
COPY --from=server --chown=root:root /app/server/dist ./dist
COPY --from=client --chown=root:root /app/client/dist ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/record').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
