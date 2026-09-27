# Jottr, self-hosted: the app and its sync server in one image.
#
#   docker build -t jottr .
#   docker run -p 8080:8080 -v jottr-data:/data -e JOTTR_PASSWORD=… jottr
#
# See self-host/README.md for the settings, HTTPS, and backups.

FROM node:24-alpine AS app
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The public address, for robots.txt, the sitemap and link previews.
ARG SITE_URL=http://localhost:8080
ENV NEXT_PUBLIC_JOTTR_BACKEND=self-hosted \
    JOTTR_STATIC_EXPORT=1 \
    SITE_URL=$SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS server-deps
WORKDIR /src
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /jottr/server
COPY --from=server-deps /src/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY --from=app /src/out /jottr/out
ENV NODE_ENV=production \
    PORT=8080 \
    JOTTR_DATA_DIR=/data \
    JOTTR_STATIC_DIR=/jottr/out
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO /dev/null http://localhost:8080/manifest.webmanifest || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
