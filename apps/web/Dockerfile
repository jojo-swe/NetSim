FROM node:20-alpine

WORKDIR /app

COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY . .

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["npm", "run", "dev"]
