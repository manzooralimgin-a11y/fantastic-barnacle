FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_PUBLIC_API_BASE_URL=https://gestronomy-api.onrender.com/api
ARG VITE_RESTAURANT_ID=1

ENV VITE_PUBLIC_API_BASE_URL=$VITE_PUBLIC_API_BASE_URL
ENV VITE_RESTAURANT_ID=$VITE_RESTAURANT_ID

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing support
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
