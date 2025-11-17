import pkg from '../package.json'

const env = import.meta.env;

// The mode and version of the frontend application
export const MODE = env.DEV ? 'dev' : 'prod'
export const VERSION = pkg.version

// The backend API base URL
// In production: backend serves the frontend, so use relative path (same origin)
// In dev: browser needs to call backend at host IP/hostname with mapped port
const BACKEND_API = env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:${env.VITE_BACKEND_API_PORT || "3009"}/sorsim/api`
  : '/sorsim/api'

///////////////////////////////
//// Backend API Endpoints ////
///////////////////////////////

// App
export const API_APP_STATE = `${BACKEND_API}/app/state`

// Sim
export const API_SIM_SCENARIOS = `${BACKEND_API}/sim/scenarios`
export const API_SIM_SCENARIO = `${BACKEND_API}/sim/scenario`
export const API_SIM_RUN = `${BACKEND_API}/sim/run`
