# chat-tun

This repository is a small Socket.IO-based anonymous pairing chat.

Important deployment note
- Vercel's serverless platform does not support long-lived WebSocket servers (Socket.IO) reliably. You should host the socket server on a platform that supports persistent Node processes (Render, Railway, Fly, DigitalOcean App Platform, Heroku, or a VPS).

Quick start (local)
1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
# or
node server.js
```

3. Open two browser tabs to http://localhost:3000 and test pairing, skip, disconnect, and reconnect behavior.

Connecting static client hosted elsewhere (e.g., Vercel)
- If you must serve the static client from a platform that cannot host the socket server (like Vercel), deploy the Node app on Render/Railway and point the client to it.
- The client supports an explicit socket server URL via the `socket` query parameter.
  Example: `https://your-static-host/?socket=https://your-socket-server.com`

Deploy to Render (recommended)
1. Create a new Web Service on Render.
2. Connect your repo and set the build command to `npm install` and start command to `node server.js` (or use the provided Dockerfile).
3. Ensure the service is publicly reachable over HTTPS. Use that URL in the client via `?socket=`.

Files added/changed
- `server.js` (updated pairing robustness and /health endpoint)
- `index.html` (client: load socket.io from CDN and support external socket URL)
- `package.json` (main set to server.js)
- `Dockerfile` (simple container image)

If you'd like I can:
- Add a `render.yaml` or GitHub Action to auto-deploy to Render or Railway.
- Create a separate small static-only deployment flow (e.g., publish client to Vercel and the server to Render) and update the client to use a built-in runtime-config file.

Which host would you like me to scaffold for? (Render, Railway, Fly, DigitalOcean, Heroku, or Docker image)
