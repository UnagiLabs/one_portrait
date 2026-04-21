FROM node:20-slim

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY generator/package.json ./generator/package.json
COPY shared/package.json ./shared/package.json

RUN corepack pnpm install --filter generator... --frozen-lockfile

COPY generator ./generator
COPY shared ./shared

WORKDIR /app/generator

EXPOSE 8080

ENV PORT=8080

CMD ["node", "--import", "tsx", "./src/server.ts"]
