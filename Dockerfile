# syntax=docker/dockerfile:1

# One long-lived Node process runs Next.js, Socket.IO and the pg-boss job runner
# (server.ts), so this is a normal Node image, not Next's standalone output.

FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
# Prisma's config reads DATABASE_URL at load time; nothing connects during the build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npx next build
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts /app/server.ts /app/next.config.ts /app/tsconfig.json ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server.ts"]
