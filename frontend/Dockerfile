FROM node:18-alpine AS dependency_installer

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

FROM node:18-alpine AS builder

WORKDIR /app

COPY --from=dependency_installer /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN yarn build
RUN ls -l /app/.next
RUN du -sh /app/.next || true

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["yarn", "start"]
