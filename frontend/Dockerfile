# ==============================================================================
# Simple Legal AI - Frontend Multi-Stage Dockerfile
# Stage 1: Build React 19 + TypeScript + Vite production bundle
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install npm dependencies deterministically
RUN npm ci

# Copy application source code and configuration files
COPY . .

# Compile TypeScript and bundle production assets with Vite
RUN npm run build

# ==============================================================================
# Stage 2: Production HTTP Server using Nginx Alpine
# ==============================================================================

FROM nginx:alpine AS runner

# Remove default static files
RUN rm -rf /usr/share/nginx/html/*

# Copy production build artifacts from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with SPA routing and API reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Health check to ensure Nginx is responding
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/ || exit 1

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
