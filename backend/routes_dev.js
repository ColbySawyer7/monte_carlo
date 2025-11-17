// Local files
const { makeSchemaUtils } = require('./schema');

module.exports = function registerDevRoutes(app, utils) {
  const { pool } = utils;
  const { getSchema, schemaCache } = makeSchemaUtils(pool);

  // Get current schema (tables, columns)
  app.get('/api/dev/schema', async (req, res) => {
    try {
      const schema = await getSchema(false);
      res.json({
        updatedAt: new Date(schemaCache.ts).toISOString(),
        tables: Object.fromEntries(Object.entries(schema).map(([t, def]) => [t, def.columnList]))
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load schema', details: error.message });
    }
  });

  // Force refresh schema cache
  app.post('/api/dev/schema/refresh', async (req, res) => {
    try {
      await getSchema(true);
      res.json({ refreshedAt: new Date(schemaCache.ts).toISOString() });
    } catch (error) {
      res.status(500).json({ error: 'Failed to refresh schema', details: error.message });
    }
  });

  // List tables
  app.get('/api/dev/tables', async (req, res) => {
    try {
      const schema = await getSchema(false);
      res.json({ tables: Object.keys(schema) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list tables', details: error.message });
    }
  });

  // Generic table query with validation against schema
  // Query params: fields (a,b,c), where (JSON string), order (col or col:desc), limit, offset
  app.get('/api/dev/table/:table', async (req, res) => {
    const table = req.params.table;
    const { fields, where, order, limit, offset } = req.query;
    try {
      const schema = await getSchema(false);
      if (!schema[table]) {
        return res.status(400).json({ error: `Unknown table: ${table}` });
      }
      const allCols = schema[table].columnList;
      const selectedCols = fields
        ? String(fields)
          .split(',')
          .map(c => c.trim())
          .filter(c => allCols.includes(c))
        : allCols;
      if (!selectedCols.length) {
        return res.status(400).json({ error: 'No valid columns requested' });
      }

      // WHERE handling (equality only)
      let whereObj = {};
      if (where) {
        try {
          whereObj = JSON.parse(where);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid where JSON' });
        }
      }

      const whereClauses = [];
      const params = [];
      for (const [col, val] of Object.entries(whereObj)) {
        if (!allCols.includes(col)) continue; // ignore unknown fields
        whereClauses.push('`' + col + '` = ?');
        params.push(val);
      }

      // ORDER BY
      let orderBy = '';
      if (order) {
        const [col, dirRaw] = String(order).split(':');
        const dir = (dirRaw || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        if (allCols.includes(col)) {
          orderBy = ` ORDER BY \`${col}\` ${dir}`;
        }
      }

      // LIMIT/OFFSET
      const lim = Math.min(Math.max(parseInt(limit || '50'), 1), 1000);
      const off = Math.max(parseInt(offset || '0'), 0);

      const sql = `SELECT ${selectedCols.map(c => '\`' + c + '\`').join(', ')} FROM \`${table}\`${whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : ''
        }${orderBy} LIMIT ? OFFSET ?`;
      params.push(lim, off);

      const conn = await pool.getConnection();
      const [rows] = await conn.query(sql, params);
      conn.release();
      res.json({
        table,
        fields: selectedCols,
        count: rows.length,
        rows
      });
    } catch (error) {
      console.error('Generic table query failed:', error);
      res.status(500).json({ error: 'Query failed', details: error.message });
    }
  });

};
