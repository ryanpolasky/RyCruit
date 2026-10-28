FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck && pnpm build
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends docker.io && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
ENV NODE_ENV=production RUNNER=docker DATA_DIR=/data PORT=3001
EXPOSE 3001
CMD ["node", "server/index.js"]
