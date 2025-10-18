FROM node:18-bullseye-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Install Chromium and required libs for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Ensure Puppeteer looks for the right executable
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy only package files first for better caching
COPY package*.json ./

# Install node modules for the gateway
RUN npm ci --only=production

# Copy gateway code
COPY . ./

WORKDIR /app

EXPOSE 3002

CMD ["node", "index.js"]
