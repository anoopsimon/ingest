FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 pkg-config libsqlite3-dev ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
