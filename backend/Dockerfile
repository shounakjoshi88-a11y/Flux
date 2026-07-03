FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
# Copy prisma schema BEFORE bun install so postinstall (prisma generate) succeeds
COPY prisma ./prisma

# Now bun install can run ALL scripts including prisma generate and sharp's native build
RUN bun install --frozen-lockfile


FROM oven/bun:1-slim

WORKDIR /app

RUN groupadd --system --gid 1001 flux && \
    useradd --system --uid 1001 --gid flux flux


COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma/generated ./prisma/generated
COPY . .

RUN chown -R flux:flux /app

USER flux

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || '3001') + '/ping').then(r => { if(!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENV NODE_ENV=production

CMD ["bun", "index.ts"]
