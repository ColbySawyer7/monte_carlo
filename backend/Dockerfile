FROM node:20.19.4-alpine

WORKDIR /sorsim/backend

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy backend source
COPY . .

# Start the development server using the specified script
CMD ["npm", "run", "dev"]
