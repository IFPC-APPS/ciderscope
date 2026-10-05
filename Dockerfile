# Image de production de CiderScope.
#
# Trois étapes pour que l'image finale ne contienne ni les sources, ni les
# dépendances de développement — elles pèsent plusieurs centaines de méga-octets
# et n'ont rien à faire sur un serveur.
#
# Le mode « standalone » de Next produirait une image plus petite encore, mais
# il demande de modifier next.config.ts. On s'en tient donc à « next start »,
# avec les seules dépendances de production.

# ── 1. Dépendances complètes, pour construire ────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── 2. Construction ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3. Dépendances de production seules ──────────────────────────────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── 4. Image finale ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next lit HOSTNAME pour choisir son adresse d'écoute, et Docker y met
# l'identifiant du conteneur : sans cette ligne, le serveur n'écouterait que
# sur l'IP du conteneur et toute sonde interrogeant localhost le croirait mort.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Ne pas tourner en root : une faille d'exécution ne doit pas donner la machine.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json

USER nextjs
EXPOSE 3000
CMD ["npm", "start"]
