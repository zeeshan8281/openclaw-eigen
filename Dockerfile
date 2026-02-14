FROM node:22-bullseye-slim

WORKDIR /app

# Install build tools for native deps
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached layer)
COPY package.json .
RUN npm install --production

# Copy source
COPY src/ src/
COPY entrypoint.sh .
RUN mkdir -p /app/data && chmod +x /app/entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/app/entrypoint.sh"]
