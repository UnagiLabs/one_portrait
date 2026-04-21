FROM node:20-slim

WORKDIR /app

COPY generator/server.mjs ./server.mjs

ENV PORT=8080

EXPOSE 8080

CMD ["node", "./server.mjs"]
