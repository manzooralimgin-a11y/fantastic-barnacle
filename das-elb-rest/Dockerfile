FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Accept runtime config defaults at build time for the static guest client
ARG VITE_API_URL
ARG VITE_RESTAURANT_ID
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_RESTAURANT_ID=${VITE_RESTAURANT_ID}

RUN npm run build

FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

# Copy the statically built Vite files (default: dist)
COPY --from=builder /app/dist ./

# Add basic Nginx config for port 3000
RUN echo 'server { \
    listen 3000; \
    location / { \
    root /usr/share/nginx/html; \
    index index.html; \
    try_files $uri $uri/ /index.html; \
    } \
    }' > /etc/nginx/conf.d/default.conf

EXPOSE 3000
ENV PORT=3000

CMD ["nginx", "-g", "daemon off;"]
