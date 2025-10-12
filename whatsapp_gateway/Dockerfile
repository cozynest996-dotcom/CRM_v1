FROM node:18-alpine

# Install Chromium and all necessary dependencies for puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    # Additional dependencies for Chromium stability
    udev \
    xvfb \
    # For Alpine Linux specifically
    && rm -rf /var/cache/apk/*

# Create a non-root user for running Chromium
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

COPY . .

# Set proper ownership and create user_sessions directory
RUN chown -R nextjs:nodejs /app && \
    mkdir -p /app/user_sessions && \
    chown -R nextjs:nodejs /app/user_sessions

# Puppeteer executable path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

EXPOSE 3002

# Switch to non-root user
USER nextjs

CMD ["node", "index.js"]
