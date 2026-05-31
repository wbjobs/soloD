FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY alarm-server.js ./

EXPOSE 3000

CMD ["node", "alarm-server.js"]
