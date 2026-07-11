FROM oven/bun:1 AS builder

WORKDIR /app

COPY backend/package.json backend/bun.lock ./
COPY backend/prisma ./prisma

RUN bun install --frozen-lockfile


FROM oven/bun:1-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 flux && \
    useradd --system --uid 1001 --gid flux flux

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma/generated ./prisma/generated

COPY backend/ .

RUN pip3 install --no-cache-dir -r pdf_parsing_backend/requirements.txt 2>/dev/null || true

RUN chown -R flux:flux /app

USER flux

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || '3001') + '/ping').then(r => { if(!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENV NODE_ENV=production

CMD ["bun", "index.ts"]
