FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-package-lock; fi

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

COPY --from=builder /app/dist ./
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-das-elb-rest-config.sh /docker-entrypoint.d/40-das-elb-rest-config.sh
RUN chmod +x /docker-entrypoint.d/40-das-elb-rest-config.sh

EXPOSE 3000
ENV PORT=3000

CMD ["nginx", "-g", "daemon off;"]
