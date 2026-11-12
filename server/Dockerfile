FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodeapp \
  && useradd --system --uid 1001 --gid 1001 --no-create-home --shell /usr/sbin/nologin nodeapp
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
RUN mkdir -p /app/var/masters /app/var/tmp && chown -R nodeapp:nodeapp /app/var
USER nodeapp
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
