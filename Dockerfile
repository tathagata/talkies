FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV TALKIES_WORKSPACE=/workspace PORT=4318
EXPOSE 4318
CMD ["npm","start"]
