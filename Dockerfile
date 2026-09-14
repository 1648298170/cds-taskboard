FROM node:22

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:web

ENV NODE_ENV=production \
    CODEX_TASKBOARD_HOST=0.0.0.0 \
    CODEX_TASKBOARD_PORT=47823

EXPOSE 47823
VOLUME ["/app/.data"]

CMD ["npm", "start"]
