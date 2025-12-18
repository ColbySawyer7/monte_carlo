#
### Backend (API Server)

The backend is built with **Node.js/Express** and serves both the API and production frontend build.

1. **Configure environment variables:**
	- Copy `.env.template` to `.env` (or edit `.env` directly)
	- Set the MySQL credentials and ports in `.env`:
	  ```bash
		# MySQL database configuration
		DB_HOST=your_host
		DB_USER=your_username
		DB_PASSWORD=your_password
		DB_NAME=your_database
		DB_PORT=3306
		# Ports configuration
		BACKEND_API_PORT=3009
		VITE_FRONTEND_PORT=3010
		VITE_FRONTEND_PREVIEW_PORT=3011
		VITE_BACKEND_API_PORT="${BACKEND_API_PORT}"
		```

2. **Install dependencies:**
	```bash
	cd backend
	npm install
	```

3. **Start the backend server:**
	- **Development (with auto-reload):**
		```bash
		npm run dev
		```
	- **Production:**
		```bash
		npm run prod
		```
	
	The API is served under the `/sorsim` prefix: `http://localhost:3009/sorsim`
	
	If a production frontend build exists (`frontend/dist/`), the backend will serve it at `/sorsim`. Otherwise, it displays a fallback page indicating the frontend needs to be built.

4. **Version management:**
	- Bump backend version: `npm run version-patch` (or `version-minor`, `version-major`)
	- This updates `package.json` and is exposed via `/sorsim/api/app/state`

#
### Frontend

The frontend is built with **Vue 3**, **Vite**, and **TypeScript**.

#### Engine Requirements

The frontend requires **Node.js 20.19.0+ or 22.12.0+** due to Vite and Vue plugin dependencies.

**Install nvm (Node Version Manager):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

After installation, restart your terminal or run:
```bash
source ~/.bashrc
```

**Install and use the correct Node.js version:**

```bash
# Install Node.js 22 (or 20.19.0+)
nvm install 22

# Use Node.js 22
nvm use 22

# Set as default (optional)
nvm alias default 22
```

Verify your Node.js version:
```bash
nvm ls  # Should show v22.x.x or v20.19.0+ as default
```

```bash
node --version  # Should show v22.x.x or v20.19.0+
```

#### Development Workflow

1. **Install dependencies:**
	```bash
	cd frontend
	npm install
	```

2. **Start the development server:**
	```bash
	npm run dev
	```
	
	The dev server runs at `http://localhost:3010` (or the port configured in `.env` as `VITE_FRONTEND_PORT`).
	
	API calls are made directly to the backend at `http://localhost:3009/sorsim/api` (or whatever host/port you're accessing from). Make sure the backend is running.

3. **Build for production:**
	```bash
	npm run build
	```
	
	This creates a production build in `frontend/dist/`. The backend will automatically serve this build when it exists.

4. **Version management:**
	- **Patch release** (0.1.8 → 0.1.9): `npm run build-patch`
	- **Minor release** (0.1.8 → 0.2.0): `npm run build-minor`
	- **Major release** (0.1.8 → 1.0.0): `npm run build-major`
	
	These commands bump the version in `package.json` and build automatically. The version is displayed in the app header.

#### Configuration

- **API Endpoints**: Defined in `src/constants.ts`
	- In dev mode: Calls `http://localhost:3009/sorsim/api` (or your backend host)
	- In production: Uses same host as frontend with `/sorsim/api` path
- **Base Path**: Production builds use `/sorsim/` as the base path (configured in `vite.config.ts`)

#
### How the frontend gets data (dynamic, schema-driven)

Generic, schema-driven endpoints:

- Docs endpoint:
	- `GET /sorsim/docs` — Lists all registered API routes (method and path)

- App endpoints:
	- `GET /sorsim/api/app/health` — Returns the status of the server, db, and version
	- `GET /sorsim/api/app/state` — Fetches the entire application state in a single request

- Dev endpoints:
	- `GET  /sorsim/api/dev/schema` — Returns the current database tables and columns derived from `INFORMATION_SCHEMA`
	- `POST /sorsim/api/dev/schema/refresh` — Force refreshes the schema cache
	- `GET  /sorsim/api/dev/tables` — Returns the current database tables 
	- `GET  /sorsim/api/dev/table/:table` — Fetches rows from any table with query params:
		- `fields`: comma-separated columns
		- `where`: JSON object of equality filters, e.g. `{ "unit": 1 }`
		- `order`: `col` or `col:desc`
		- `limit`, `offset`: pagination

Because the schema is read from the database (`/sorsim/api/dev/schema`) and the data is pulled via generic endpoints, changes to the DB (made via the DDL) are reflected without code changes in the frontend. If we add/remove columns or tables, the generic endpoints and schema metadata continue to function; UI can be extended to leverage new fields.

We can force the server to re-read schema after DDL changes:

```bash
curl -X POST http://localhost:3009/sorsim/api/dev/schema/refresh
```

#
### Docker & CI/CD

#### Development with Docker Compose

Docker Compose provides a complete development environment with both frontend and backend containers.

**Start the environment:**

```bash
docker compose up -d
```

This starts two services:
- **Backend**: Express server at `http://localhost:3009/sorsim`
	- Serves the API at `/sorsim/api/*`
	- Serves the production frontend build (if it exists) at `/sorsim`
	- Live code sync via volume mount to `./backend`
	- Uses nodemon for auto-restart on code changes
- **Frontend**: Vite dev server at `http://localhost:3010`
	- Hot module replacement for rapid development
	- Live code sync via volume mount to `./frontend`

**Important notes:**
- The backend container mounts `./frontend/dist` to serve production builds
- Run `npm run build` in the frontend directory (on host) to create/update the production build
- The backend will automatically detect and serve the updated build (no restart needed for static file changes)
- For backend code changes, nodemon automatically restarts the server

**Stop the environment:**

```bash
docker compose down
```

**View logs:**

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

#### Production Deployment via CI/CD

The CI/CD pipeline (`.gitlab-ci.yml`) automates deployment using a two-stage process:

**Build Stage (online runner):**
- Runs on a runner with internet access (tag: `online`)
- Installs frontend dependencies via `npm install`
- Builds the production frontend with `npm run build`
- Packages `frontend/dist/` as a tar.gz artifact for deployment

**Deploy Stage (lxc1 runner):**
- Runs on the production host (tag: `lxc1`)
- Extracts the frontend dist artifact
- Deploys using `docker compose`:
  - Stops existing containers with `docker compose down`
  - Starts services with `docker compose up -d`
- The backend container automatically serves the pre-built frontend from the mounted `./frontend/dist` volume

**Key features:**
- Separates internet-dependent build from offline deployment
- Uses Docker Compose for consistent container orchestration
- Deploys to the `alp_build_default` network for proxy access
- No port exposure required on the host (accessed via ALP proxy infrastructure)

**Triggering deployment:**
Push to the `master` branch to automatically trigger the pipeline.
