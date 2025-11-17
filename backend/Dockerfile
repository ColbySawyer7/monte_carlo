# Single-stage build: Copy pre-built native addons (.node files)

FROM node:20.19.4-alpine

WORKDIR /sorsim/backend

# Copy package files
COPY backend/package.json backend/package-lock.json* ./

# Install all dependencies
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy backend source
COPY backend/ .

# Copy pre-built native addons (.node files) - these should already exist in backend/wasm/pkg/
# The .dockerignore has been updated to allow these files through

# Start the development server using the specified script
CMD ["npm", "run", "dev"]
