# Frontend production image: Vite build -> Nginx static serve.
# API and WebSocket traffic is proxied to the backend (see nginx.conf.template,
# override upstream with -e API_UPSTREAM=http://host:port).

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run lint && npm run build

FROM nginx:1.27-alpine

# Upstream consumed by the entrypoint envsubst on templates/default.conf.template.
ENV API_UPSTREAM=http://api:8000

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
