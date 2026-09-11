# Char Guty game server (apps/server). Built from the repo root so the workspace
# packages it imports (game-core, shared) are built alongside it.
FROM node:22-slim
WORKDIR /app

RUN npm install -g pnpm@10.34.3

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@char-guty/server..." run build

ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 2567
CMD ["node", "dist/index.js"]
