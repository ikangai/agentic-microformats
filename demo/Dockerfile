FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY server.js ./
COPY views/ views/
COPY public/ public/
COPY data/ data/

EXPOSE 3000

CMD ["node", "server.js"]
