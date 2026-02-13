FROM --platform=linux/amd64 node:18-bullseye-slim

WORKDIR /app
COPY smoke.js .

CMD ["node", "smoke.js"]
