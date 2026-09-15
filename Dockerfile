# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY app ./app
COPY public ./public
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY react-router.config.ts tsconfig.json vite.config.ts ./
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/app/.server ./app/.server

# La base est créée sur /data, volume Fly persistant fourni au runtime.
# Aucun fichier .env, SQLite, sauvegarde ou dossier de conception n'entre dans l'image.
CMD ["sh", "./scripts/production/start.sh"]
