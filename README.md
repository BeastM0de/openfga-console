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

The build is written to `dist/`; Vite clears that directory before each build. Asset URLs are relative, so the bundle can be hosted at the root or beneath a URL prefix.

## Published site and build artifacts

Pushes to `main` or `master` build the SPA and deploy it to GitHub Pages. To enable deployment for this repository, open **Settings → Pages** and select **GitHub Actions** as the build and deployment source. After the first successful workflow run, the console is available at:

<https://beastm0de.github.io/openfga-console/>

Each workflow run also publishes the `openfga-console-static-site` artifact, containing the contents of `dist/` (retained for 30 days). Download it from the run's **Artifacts** section to host the files on another static web server or CDN.

To publish a versioned downloadable archive, push a version tag, for example:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds the app and attaches `openfga-console-v1.0.0.tar.gz` to the corresponding GitHub Release. Consumers can fetch a release archive with GitHub CLI:

```bash
gh release download v1.0.0 \
  --repo BeastM0de/openfga-console \
  --pattern 'openfga-console-v1.0.0.tar.gz'
tar -xzf openfga-console-v1.0.0.tar.gz -C ./public/fga-console
```

The live app can also be embedded in an internal portal with an iframe:

```html
<iframe
  src="https://beastm0de.github.io/openfga-console/"
  title="OpenFGA Console"
  width="100%"
  height="800"
></iframe>
```

The console connects to the OpenFGA API directly from each user's browser. Configure API CORS for the deployed origin, and follow the [security model](#security-model); do not put confidential credentials in the SPA.

## Security model

The console calls OpenFGA directly from the browser with the official SDK. URL, store ID, and model ID are persisted locally; API tokens and client secrets remain in memory and disappear on reload. OAuth client credentials entered in a SPA are still visible to the browser user and must not be treated as confidential. Use a protected backend-for-frontend or API proxy for production secrets, validate the admin's identity/role there, and configure OpenFGA CORS to allow only the trusted console origin.

The console can create stores, deploy new immutable model versions, write/delete tuples, and evaluate authorization checks. Restrict access to trusted administrators; it is not an end-user application.
