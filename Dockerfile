FROM node:22-bullseye-slim

WORKDIR /app

# Install build tools for native deps
RUN apt-get update && apt-get install -y python3 make g++ curl git && rm -rf /var/lib/apt/lists/*

# Install OpenClaw globally (--ignore-scripts skips node-llama-cpp build)
RUN npm install -g openclaw@latest --ignore-scripts

# Install project dependencies
COPY package.json .
RUN npm install --production

# Copy source + config
COPY src/ src/
COPY openclaw.json .
COPY entrypoint.sh .
RUN mkdir -p /app/data \
    && mkdir -p /root/.openclaw/skills \
    && mkdir -p /root/.openclaw/workspace \
    && chmod +x /app/entrypoint.sh

# Copy curator skill into OpenClaw's skill directory
COPY src/skills/curator/SKILL.md /root/.openclaw/skills/curator/SKILL.md
# Copy config to OpenClaw's expected location
COPY openclaw.json /root/.openclaw/openclaw.json
# Copy workspace bootstrap files (agent identity + behavior)
COPY AGENTS.md /root/.openclaw/workspace/AGENTS.md
COPY SOUL.md /root/.openclaw/workspace/SOUL.md

EXPOSE 3000 3001

ENTRYPOINT ["/app/entrypoint.sh"]
