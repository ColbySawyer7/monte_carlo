// Local files
const { runSimulation } = require('./sim/des/engine');
const { runMonteCarlo } = require('./sim/monte/engine');
// Rust native addons (.node files) - lightning fast native binaries
const nativeBindings = require('./wasm/bindings');
const runSimulationNative = nativeBindings.runSimulation;
const runMonteCarloNative = nativeBindings.runMonteCarlo;

module.exports = function registerSimRoutes(app, utils) {
  const { path, fs } = utils;

  // Directory where scenario JSON files are stored
  function scenariosDir() {
    return path.join(__dirname, 'sim', 'des', 'scenarios');
  }

  // Sanitize scenario name to prevent path traversal and invalid characters
  function sanitizeName(name) {
    const base = String(name || '').replace(/[^A-Za-z0-9._-]/g, '');
    if (!base) throw new Error('Invalid scenario name');
    return base;
  }

  // Ensure .json extension is present
  function ensureJsonExt(name) {
    const n = String(name || '');
    return n.toLowerCase().endsWith('.json') ? n : `${n}.json`;
  }

  // Get a list of all scenario files with friendly names
  app.get('/api/sim/scenarios', async (req, res) => {
    try {
      const dir = scenariosDir();
      const files = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.json'));
      // Read each file to extract a friendly name if present
      const scenarios = await Promise.all(files.map(async (file) => {
        const id = file.replace(/\.json$/i, '');
        try {
          const content = await fs.promises.readFile(path.join(dir, file), 'utf8');
          const obj = JSON.parse(content);
          const name = (obj && typeof obj.name === 'string' && obj.name.trim()) ? obj.name.trim() : id;
          return { id, file, name };
        } catch (_) {
          // If any error, fall back to id as name
          return { id, file, name: id };
        }
      }));
      res.json({ ok: true, scenarios });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get the content of a specific scenario by name
  app.get('/api/sim/scenario', async (req, res) => {
    try {
      const raw = req.query.name;
      const name = sanitizeName(raw);
      const file = path.join(scenariosDir(), ensureJsonExt(name));
      const content = await fs.promises.readFile(file, 'utf8');
      const parsed = JSON.parse(content);
      res.json({ ok: true, id: name.replace(/\.json$/i, ''), file: path.basename(file), content: parsed });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Run a DES simulation with provided scenario and state
  app.post('/api/sim/run', async (req, res) => {
    try {
      let scenario = null;
      const body = req.body || {};
      if (!body.state || typeof body.state !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing required state snapshot in request body.' });
      }
      const overrides = (body.overrides && typeof body.overrides === 'object') ? body.overrides : null;
      if (body.scenario && typeof body.scenario === 'object') {
        scenario = body.scenario;
      } else {
        const scenarioPath = body.scenarioPath || path.join(__dirname, 'sim', 'des', 'scenario.example.json');
        const content = await fs.promises.readFile(scenarioPath, 'utf8');
        scenario = JSON.parse(content);
      }
      const state = body.state;
      const results = await runSimulation(scenario, { state, overrides });
      // Rust version
      // const results = await runSimulationNative(scenario, { state, overrides });
      res.json({ ok: true, results });
    } catch (error) {
      console.error('DES simulation run failed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Run a Monte Carlo simulation with provided scenario and state
  app.post('/api/sim/monte/run', async (req, res) => {
    try {
      let scenario = null;
      const body = req.body || {};
      if (!body.state || typeof body.state !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing required state snapshot in request body.' });
      }
      const overrides = (body.overrides && typeof body.overrides === 'object') ? body.overrides : null;
      const iterations = (typeof body.iterations === 'number' && body.iterations > 0) ? body.iterations : 1000;
      const keepIterations = (typeof body.keepIterations === 'boolean') ? body.keepIterations : false;
      
      if (body.scenario && typeof body.scenario === 'object') {
        scenario = body.scenario;
      } else {
        const scenarioPath = body.scenarioPath || path.join(__dirname, 'sim', 'des', 'scenario.example.json');
        const content = await fs.promises.readFile(scenarioPath, 'utf8');
        scenario = JSON.parse(content);
      }
      const state = body.state;
      const results = await runMonteCarlo(scenario, { 
        state, 
        overrides, 
        iterations, 
        keepIterations 
      });
      // Rust version
      // const results = await runMonteCarloNative(scenario, { state, overrides, iterations, keepIterations });
      res.json({ ok: true, results });
    } catch (error) {
      console.error('Monte Carlo simulation run failed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
};
