FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY . .

# Generate Prisma client
RUN bunx prisma generate

EXPOSE 3001

CMD ["bun", "index.ts"]
