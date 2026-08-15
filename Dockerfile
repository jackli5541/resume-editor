FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --omit=dev --registry=${NPM_REGISTRY}
COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    EXPORT_DIR=/app/var/exports \
    TEMPLATE_STORAGE_DIR=/app/var/templates

EXPOSE 4173
CMD ["sh", "-c", "npm run db:migrate && node server.mjs"]
