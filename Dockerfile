FROM mcr.microsoft.com/playwright:v1.62.1-noble

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      fonts-noto-cjk \
      libreoffice-writer \
      poppler-utils \
      python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    EXPORT_DIR=/app/var/exports \
    TEMPLATE_STORAGE_DIR=/app/var/templates \
    PYTHON_BIN=python3 \
    SOFFICE_BIN=soffice \
    PDFTOPPM_BIN=pdftoppm \
    EXPORT_CHROMIUM_NO_SANDBOX=true

EXPOSE 4173
CMD ["sh", "-c", "npm run db:migrate && node server.mjs"]
