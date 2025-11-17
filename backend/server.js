// Local files
const pkg = require('./package.json');
const registerDevRoutes = require('./routes_dev');
const registerAppRoutes = require('./routes_app');
const registerSimRoutes = require('./routes_sim');

// External dependencies
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Create Express app
const app = express();
const port = 3009;

// Load environment variables from .env file
dotenv.config({ path: '../.env' });

// Database connection configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
};

// Create a MySQL connection pool
const pool = mysql.createPool(dbConfig);

// Create a router for the /sorsim/ prefix
const sorsimRouter = express.Router();

// Mount modularized routes on the sorsim router and pass necessary utils
registerDevRoutes(sorsimRouter, { pool });
registerAppRoutes(sorsimRouter, { pool, pkg });
registerSimRoutes(sorsimRouter, { path, fs });

// Enable CORS for frontend requests
app.use(cors());
app.use(express.json());

// Serve static files at /sorsim/ prefix if dist/ exists (production build)
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  console.log('Serving frontend from ../frontend/dist/');
  app.use('/sorsim', express.static(distPath));
} else {
  // Serve fallback HTML when dist is not available
  console.log('../frontend/dist/ not found - serving fallback.html');
  app.get('/sorsim', (req, res) => {
    res.sendFile(path.join(__dirname, 'fallback.html'));
  });
}

// Mount the API router
app.use('/sorsim', sorsimRouter);

//////////////////////////////
// Endpoints and App Listen //
//////////////////////////////

// Endpoint to redirect root path to /sorsim
app.get('/', (req, res) => {
  res.redirect('/sorsim');
});

// Endpoint to serve favicon at root path (what browsers automatically request)
app.get('/favicon.ico', async (req, res) => {
  try {
    const iconPath = path.join(__dirname, 'assets', 'img', 'mq9.svg');
    const svg = await fs.promises.readFile(iconPath);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    res.send(svg);
  } catch (e) {
    // If the SVG isn't available, return empty 204 to silence errors
    res.status(204).end();
  }
});

// Endpoint to list all registered routes
app.get('/sorsim/docs', (req, res) => {
  try {
    const routes = [];

    // Helper function to extract routes recursively
    function extractRoutes(stack, basePath = '') {
      if (!Array.isArray(stack)) return;

      stack.forEach(layer => {
        if (layer && layer.route && layer.route.path) {
          // Direct route
          const methods = Object.keys(layer.route.methods || {})
            .filter(k => layer.route.methods[k])
            .map(m => m.toUpperCase())
            .sort();
          const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
          paths.forEach(p => routes.push({ path: basePath + p, methods }));
        } else if (layer && layer.name === 'router' && layer.handle && layer.handle.stack) {
          // Router middleware - extract the base path from the regexp
          let routerBasePath = basePath;
          if (layer.regexp && layer.regexp.source) {
            const match = layer.regexp.source.match(/^\^\\?(\/[^\\?]+)/);
            if (match) {
              routerBasePath = basePath + match[1];
            }
          }
          extractRoutes(layer.handle.stack, routerBasePath);
        }
      });
    }

    if (app && app._router && Array.isArray(app._router.stack)) {
      extractRoutes(app._router.stack);
    }

    routes.sort((a, b) => a.path.localeCompare(b.path) || a.methods.join(',').localeCompare(b.methods.join(',')));
    res.json({
      count: routes.length,
      routes,
      generatedAt: new Date().toISOString(),
      version: pkg.version || '0.0.0'
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list routes', details: e.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
