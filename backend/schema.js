// Schema builder module

// Load schema from INFORMATION_SCHEMA and cache it for a TTL (default 5 minutes)
function makeSchemaUtils(pool, { ttlMs = 300000 } = {}) {
  let schemaCache = { ts: 0, schema: null };

  // Loads the schema from the database
  async function loadSchema(connection) {
    const sql = `
      SELECT 
        c.TABLE_NAME as table_name,
        c.COLUMN_NAME as column_name,
        c.DATA_TYPE as data_type,
        c.IS_NULLABLE as is_nullable,
        c.COLUMN_KEY as column_key,
        c.EXTRA as extra
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_SCHEMA = DATABASE()
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
    `;
    const [rows] = await connection.query(sql);
    const schema = {};
    for (const r of rows) {
      if (!schema[r.table_name]) {
        schema[r.table_name] = { columns: {}, columnList: [], primaryKeys: [] };
      }
      schema[r.table_name].columns[r.column_name] = {
        name: r.column_name,
        dataType: r.data_type,
        nullable: r.is_nullable === 'YES',
        key: r.column_key,
        extra: r.extra
      };
      schema[r.table_name].columnList.push(r.column_name);
      if (r.column_key === 'PRI') schema[r.table_name].primaryKeys.push(r.column_name);
    }
    return schema;
  }

  // Get the schema, using cache if valid
  async function getSchema(force = false) {
    const now = Date.now();
    if (!force && schemaCache.schema && now - schemaCache.ts < ttlMs) {
      return schemaCache.schema;
    }
    const conn = await pool.getConnection();
    try {
      const schema = await loadSchema(conn);
      schemaCache.ts = now;
      schemaCache.schema = schema;
      return schema;
    } finally {
      conn.release();
    }
  }

  return { getSchema, schemaCache };
}

module.exports = { makeSchemaUtils };
