# --- Development stage ---
FROM node:20-alpine AS development

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm install && npm run dev -- --host"]

# --- Production build stage ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Bake VITE_ variables at build time so the static bundle uses relative API URLs
# (empty VITE_API_URL → all /api requests are proxied by nginx in the same container)
ARG VITE_API_URL=""
ARG VITE_SESSION_TIMEOUT_MS=1800000
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SESSION_TIMEOUT_MS=${VITE_SESSION_TIMEOUT_MS}

RUN npm run build

# --- Production stage ---
FROM nginx:stable-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
