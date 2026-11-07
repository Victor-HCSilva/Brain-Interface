FROM node:22-alpine

RUN apk add --no-cache python3

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG BACKEND_URL=http://api:7655
ENV BACKEND_URL=${BACKEND_URL} \
    HOSTNAME=0.0.0.0 \
    NODE_ENV=production \
    PORT=3000

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
