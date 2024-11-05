FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY vite.config.ts ./
COPY tsconfig.app.json ./
COPY index.html ./

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]