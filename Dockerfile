FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json *.mjs ./
COPY public ./public
RUN node --check server.mjs && node --check public/app.js && mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production
ENV PORT=4180
ENV DB_PATH=/app/data/pilot.sqlite
USER node
EXPOSE 4180
CMD ["node", "server.mjs", "--hosted"]
