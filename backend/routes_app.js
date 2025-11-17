// Local files
const { buildState } = require('./state.js');

module.exports = function registerAppRoutes(app, utils) {
  const { pool, pkg } = utils;

  // Combined API and DB health check
  app.get('/api/app/health', async (req, res) => {
    const result = {
      api: 'ok',
      db: 'unknown',
      timestamp: new Date().toISOString(),
      version: pkg.version || '0.0.0',
    };
    try {
      const connection = await pool.getConnection();
      await connection.query('SELECT 1');
      connection.release();
      result.db = 'ok';
    } catch (error) {
      result.db = 'error';
      result.db_error = error.message;
    }
    res.json(result);
  });

  // State endpoint that builds and returns the application state
  app.get('/api/app/state', async (req, res) => {
    try {
      const state = await buildState(pool);
      res.json(state);
    } catch (error) {
      console.error('State endpoint failed:', error);
      res.status(500).json({ error: 'Query failed', details: error.message });
    }
  });

};
