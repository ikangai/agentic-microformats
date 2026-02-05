FROM node:22-alpine

WORKDIR /repo

# Copy example HTML files (used by integration tests)
COPY examples/ examples/

# Set up the package
WORKDIR /repo/packages/agentic-microformats

COPY packages/agentic-microformats/package.json packages/agentic-microformats/package-lock.json ./
RUN npm ci

COPY packages/agentic-microformats/tsconfig.json ./
COPY packages/agentic-microformats/src/ src/
COPY packages/agentic-microformats/test/ test/

# Build
RUN npx tsc

# Default: run tests
CMD ["npx", "vitest", "run"]
