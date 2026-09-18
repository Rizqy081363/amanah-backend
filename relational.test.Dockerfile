FROM oven/bun:1.2.19-alpine

RUN apk add --no-cache bash

WORKDIR /usr/src/app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

COPY ./wait-for-it.sh /opt/wait-for-it.sh
RUN chmod +x /opt/wait-for-it.sh
COPY ./startup.relational.test.sh /opt/startup.relational.test.sh
RUN chmod +x /opt/startup.relational.test.sh
RUN sed -i 's/\r//g' /opt/wait-for-it.sh /opt/startup.relational.test.sh

RUN echo "" > .env

CMD ["/opt/startup.relational.test.sh"]
