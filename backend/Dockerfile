# --- Development stage ---
FROM node:20-alpine AS development

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]

# --- Production build stage ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 4000

# Run as non-root user for security (#676)
USER node

CMD ["node", "dist/index.js"]
