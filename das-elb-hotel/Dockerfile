FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Accept API URL at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

# Copy the statically exported Next.js files
COPY --from=builder /app/out ./

# Add basic Nginx config for port 3000
RUN echo 'server { \
    listen 3000; \
    location / { \
    root /usr/share/nginx/html; \
    index index.html; \
    try_files $uri $uri.html $uri/ /index.html; \
    } \
    }' > /etc/nginx/conf.d/default.conf

EXPOSE 3000
ENV PORT=3000

CMD ["nginx", "-g", "daemon off;"]
