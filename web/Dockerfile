# Multi-stage lightweight Dockerfile for GCP Cloud Run
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Cloud Run expects the app to listen on the PORT environment variable (default 8080)
ENV PORT=8080
ENV NODE_ENV=production
ENV RP_ID=sp.exarnp1e.com
ENV RP_NAME="Scoped Passkey Bank"
ENV ORIGIN=https://sp.exarnp1e.com

EXPOSE 8080

CMD ["node", "src/server.js"]
