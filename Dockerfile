FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev --no-fund --no-audit; fi
COPY server ./server
COPY public ./public
COPY shared ./shared
COPY test ./test
COPY docs/openapi.json ./docs/openapi.json
COPY scripts ./scripts
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
