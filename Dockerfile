# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json  ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM lipanski/docker-static-website:latest

COPY --from=builder /app/dist /home/static

CMD ["/busybox-httpd", "-f", "-v", "-p", "3000"]
