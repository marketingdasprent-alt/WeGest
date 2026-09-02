# Use Apify's Playwright Chrome image with Node 20
FROM apify/actor-node-playwright-chrome:20

# Copy source files
COPY . ./

# Install dependencies, skip browser download (they're in the base image)
RUN npm install --production --omit=dev
