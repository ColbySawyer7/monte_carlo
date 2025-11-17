// State builder module

const fs = require('fs').promises;
const path = require('path');

// Load application version from package.json
async function loadVersion() {
  try {
    const packageJsonContent = await fs.readFile(path.join(__dirname, 'package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson.version || null;
  } catch (err) {
    console.error('Could not load version from package.json:', err);
    return null;
  }
}

// Build the full application state by querying relevant tables
async function buildState(pool) {
  const LIMIT = 350;

  const tableNames = [
    'v_aircraft',
    'v_payload',
    'v_staffing',
    'v_unit',
    'v_unit_payload_readiness',
    'v_unit_mos_readiness',
    'v_missions',
    'v_training',
    'v_strength_equipment',
    'v_strength_staffing',
    'v_strength_training',
    'v_visibility',
    'v_airspace',
    'v_ceiling',
    'v_spectrum',
    'v_connectivity',
    'v_air_superiority',
  ];

  const state = {
    // Application metadata
    app: { version: await loadVersion() },
    // Central store for all datasets
    tables: {
      // keys will be like 'v_staffing', 'v_aircraft', etc.
      // with structure: { fields: [...], rows: [{...}, ...] }
    },
  };

  let conn;
  try {
    conn = await pool.getConnection();
    for (const table of tableNames) {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ?`, [LIMIT]);
      const [fields] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
      state.tables[table] = {
        fields: fields.map(f => f.Field),
        rows: rows,
      };
    }
  } finally {
    if (conn) conn.release();
  }
  return state;
}

module.exports = { buildState };
