STREET RACING - ROOM SERVER v2

This Worker provides:
- 3-digit room codes (000-999)
- Maximum 4 players per room
- Create room
- Join room
- Leave room
- Heartbeat to keep a player active
- Automatic cleanup of inactive players after 2 minutes
- Cloudflare Durable Object + SQLite storage

Cloudflare setup:
1. Create a Worker project.
2. Put src/index.js in the project.
3. Put wrangler.jsonc in the project root.
4. Deploy with Wrangler.
5. Your Worker URL will look like:
   https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev

API:
POST /create
body: {"code":"123","peerId":"actual-peer-id"}

GET /room?code=123

POST /join
body: {"code":"123","peerId":"actual-peer-id"}

POST /leave
body: {"code":"123","peerId":"actual-peer-id"}

POST /heartbeat
body: {"code":"123","peerId":"actual-peer-id"}

IMPORTANT:
The game HTML must call /join before allowing a player into a room, and /leave when the player exits. It should send /heartbeat about every 30-60 seconds while connected.

This package uses Cloudflare's current declarative "exports" Durable Object configuration with SQLite storage, rather than the older "migrations" configuration.
