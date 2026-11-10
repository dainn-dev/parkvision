# ParkVision driver web app: Vite build -> Nginx static serve.
# Build from the repository root:
#   docker build -f deploy/mobile.Dockerfile -t parkvision-mobile:local .
#
# The app defaults to a same-origin /api/v1 base URL, so Nginx proxies /api and
# /ws to the backend exactly like the admin dashboard image.

FROM node:20-alpine AS build
WORKDIR /app

COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci

COPY mobile/ ./
RUN npm run lint && npm run build

FROM nginx:1.27-alpine

ENV API_UPSTREAM=http://api:8000
ENV S3_PUBLIC_ORIGIN=http://localhost:9000

COPY deploy/mobile.nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
