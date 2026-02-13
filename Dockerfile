FROM node:22-bullseye

# Set environment variables
ENV HOME=/home/openclaw
ENV USER=openclaw
ENV NODE_ENV=production

# Install essential build tools
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create user and setup directories
RUN useradd -m openclaw
WORKDIR /app
RUN mkdir -p /home/openclaw/.openclaw/workspace/skills \
    && mkdir -p /app/data \
    && chown -R openclaw:openclaw /home/openclaw /app

# Install OpenClaw globally (system-wide)
# Using --ignore-scripts to skip the brittle node-llama-cpp build
RUN npm install -g openclaw@latest --ignore-scripts

# Fix potential permission issues in home dir (npm cache, etc.)
RUN chown -R openclaw:openclaw /home/openclaw

# Switch to the non-root user
USER openclaw

# Install project-specific dependencies
COPY --chown=openclaw:openclaw package.json .
RUN npm install

# Copy project source code
COPY --chown=openclaw:openclaw . .

# Copy configuration and skills to the canonical OpenClaw locations
COPY --chown=openclaw:openclaw openclaw.json /home/openclaw/.openclaw/openclaw.json
COPY --chown=openclaw:openclaw src/skills/curator /home/openclaw/.openclaw/workspace/skills/curator

# Make startup script executable
RUN chmod +x /app/start.sh

# OpenClaw Gateway port
EXPOSE 3000

# Start both Gateway and Autonomous Agent
ENTRYPOINT ["/app/start.sh"]
