const MAX_PLAYERS = 4;
const INACTIVE_MS = 2 * 60 * 1000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";

    if (url.pathname === "/room" && request.method === "GET") {
      if (!/^\d{3}$/.test(code)) {
        return json({ error: "Invalid room code" }, 400);
      }

      const id = env.ROOMS.idFromName(code);

      return env.ROOMS.get(id).fetch(
        "https://room/room?code=" + code
      );
    }

    if (
      ["/create", "/join", "/leave", "/heartbeat"].includes(url.pathname) &&
      request.method === "POST"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const roomCode = String(body.code || "");
      const peerId = String(body.peerId || "");

      if (!/^\d{3}$/.test(roomCode) || !peerId) {
        return json(
          { error: "Invalid code or peerId" },
          400
        );
      }

      const id = env.ROOMS.idFromName(roomCode);

      return env.ROOMS.get(id).fetch(
        "https://room" + url.pathname,
        {
          method: "POST",
          body: JSON.stringify({
            code: roomCode,
            peerId
          })
        }
      );
    }

    return json({ error: "Not found" }, 404);
  }
};

export class RoomServer {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    let room = await this.state.storage.get("room");

    if (!room) {
      room = {
        code: "",
        hostPeerId: "",
        players: {}
      };
    }

    const now = Date.now();

    for (const [peerId, player] of Object.entries(
      room.players || {}
    )) {
      if (
        now - (player.lastSeen || 0) >
        INACTIVE_MS
      ) {
        delete room.players[peerId];
      }
    }

    if (path === "/create" && request.method === "POST") {
      const { code, peerId } = await request.json();

      if (
        room.hostPeerId &&
        room.hostPeerId !== peerId
      ) {
        return json(
          { error: "Room already exists" },
          409
        );
      }

      room = {
        code,
        hostPeerId: peerId,
        players: {
          [peerId]: {
            peerId,
            lastSeen: now
          }
        }
      };

      await this.state.storage.put("room", room);

      return json({
        ok: true,
        code,
        hostPeerId: peerId,
        players: Object.keys(room.players)
      });
    }

    if (path === "/room" && request.method === "GET") {
      if (!room.hostPeerId) {
        return json(
          { error: "Room not found" },
          404
        );
      }

      return json({
        code: room.code,
        hostPeerId: room.hostPeerId,
        players: Object.values(room.players || {})
      });
    }

    if (path === "/join" && request.method === "POST") {
      const { peerId } = await request.json();

      if (!room.hostPeerId) {
        return json(
          { error: "Room not found" },
          404
        );
      }

      if (room.players[peerId]) {
        room
