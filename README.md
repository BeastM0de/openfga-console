# FGA Console

React + TypeScript admin console for the local OpenFGA demo. It uses Vite, Tailwind CSS, Lucide icons, TanStack Query, the official `@openfga/sdk`, React Flow, Recharts, CodeMirror, and OpenFGA's syntax transformer.

## Run

Requires Node.js 20.19+ and npm 10+.

From this directory:

```bash
npm ci
npm run dev
```

Vite listens on `127.0.0.1:5173` and automatically chooses the next port if that port is occupied. The OpenFGA API should be reachable at `http://localhost:8080`; use **Connection settings** in the top bar to change its URL or credentials. For the repository's Compose stack, the built-in Playground is at `http://localhost:3000/playground`.

For a production bundle:

```bash
npm run typecheck
npm run build
npm run preview
```

## Security model

The console calls OpenFGA directly from the browser with the official SDK. URL, store ID, and model ID are persisted locally; API tokens and client secrets remain in memory and disappear on reload. OAuth client credentials entered in a SPA are still visible to the browser user and must not be treated as confidential. Use a protected backend-for-frontend or API proxy for production secrets, validate the admin's identity/role there, and configure OpenFGA CORS to allow only the trusted console origin.

The console can create stores, deploy new immutable model versions, write/delete tuples, and evaluate authorization checks. Restrict access to trusted administrators; it is not an end-user application.
