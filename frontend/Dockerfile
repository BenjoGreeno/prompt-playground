# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Install deps
COPY frontend/package.json ./package.json
RUN yarn install

# Copy source and build
COPY frontend/ /app/
ENV NODE_OPTIONS=--openssl-legacy-provider
RUN yarn build

# Runtime stage
FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]