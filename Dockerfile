FROM node:22-bookworm-slim AS web-build

WORKDIR /build
COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --registry=${NPM_REGISTRY}
COPY frontend ./frontend
RUN npm run build:web

FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --omit=dev --registry=${NPM_REGISTRY}
COPY . .
COPY --from=web-build /build/public/assets/vue ./public/assets/vue

# 非 root 运行：Linux 宿主使用 bind-mount 时需先 chown 到 10001（见 compose.yaml 注释）。
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --create-home app \
    && mkdir -p /app/var/exports /app/var/previews /app/var/templates \
    && chown -R app:app /app/var

ENV NODE_ENV=production \
    HOME=/home/app \
    HOST=0.0.0.0 \
    PORT=4173 \
    EXPORT_DIR=/app/var/exports \
    PREVIEW_DIR=/app/var/previews \
    TEMPLATE_STORAGE_DIR=/app/var/templates

USER app
EXPOSE 4173
CMD ["sh", "-c", "npm run db:migrate && node server.mjs"]
