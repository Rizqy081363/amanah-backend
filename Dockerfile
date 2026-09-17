FROM oven/bun:1.2.19-alpine AS builder

RUN apk add --no-cache bash python3 make g++

WORKDIR /usr/src/app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.2.19-alpine AS runner

RUN apk add --no-cache bash
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/bun.lock ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src/database ./src/database
COPY --from=builder /usr/src/app/src/mail ./src/mail
COPY --from=builder /usr/src/app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /usr/src/app/wait-for-it.sh /opt/wait-for-it.sh
COPY --from=builder /usr/src/app/startup.relational.dev.sh /opt/startup.relational.dev.sh
RUN chmod +x /opt/wait-for-it.sh /opt/startup.relational.dev.sh
RUN sed -i 's/\r//g' /opt/wait-for-it.sh /opt/startup.relational.dev.sh

CMD ["/opt/startup.relational.dev.sh"]
