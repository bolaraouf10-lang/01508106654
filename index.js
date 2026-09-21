export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (url.pathname === "/create" && request.method === "POST") {
        const body = await request.json();
        const code = String(body.code || "");
        const peerId = String(body.peerId || "");

        if (!/^\d{3}$/.test(code)) {
          return json({ ok: false, error: "INVALID_CODE" }, 400);
        }
        if (!peerId) {
          return json({ ok: false, error: "MISSING_PEER_ID" }, 400);
        }

        const room = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(room);
        return stub.fetch("https://room/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ peerId })
        });
      }

      if (url.pathname === "/room" && request.method === "GET") {
        const code = url.searchParams.get("code") || "";
        if (!/^\d{3}$/.test(code)) {
          return json({ ok: false, error: "INVALID_CODE" }, 400);
        }

        const room = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(room);
        return stub.fetch("https://room/info");
      }

      if (url.pathname === "/join" && request.method === "POST") {
        const body = await request.json();
        const code = String(body.code || "");
        const peerId = String(body.peerId || "");

        if (!/^\d{3}$/.test(code) || !peerId) {
          return json({ ok: false, error: "INVALID_REQUEST" }, 400);
        }

        const room = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(room);
        return stub.fetch("https://room/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ peerId })
        });
      }

      if (url.pathname === "/leave" && request.method === "POST") {
        const body = await request.json();
        const code = String(body.code || "");
        const peerId = String(body.peerId || "");

        if (!/^\d{3}$/.test(code) || !peerId) {
          return json({ ok: false, error: "INVALID_REQUEST" }, 400);
        }

        const room = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(room);
        return stub.fetch("https://room/leave", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ peerId })
        });
      }

      if (url.pathname === "/heartbeat" && request.method === "POST") {
        const body = await request.json();
        const code = String(body.code || "");
        const peerId = String(body.peerId || "");

        if (!/^\d{3}$/.test(code) || !peerId) {
          return json({ ok: false, error: "INVALID_REQUEST" }, 400);
        }

        const room = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(room);
        return stub.fetch("https://room/heartbeat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ peerId })
        });
      }

      return json({ ok: false, error: "NOT_FOUND" }, 404);
    } catch (err) {
      return json({ ok: false, error: "SERVER_ERROR", message: String(err?.message || err) }, 500);
    }
  }
};

export class RoomServer {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = ctx.storage;
    this.ctx.blockConcurrencyWhile(async () => {
      const existing = await this.state.get("room");
      if (!existing) {
        await this.state.put("room", {
          hostPeerId: null,
          players: {},
          createdAt: Date.now()
        });
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = (await this.state.get("room")) || {
      hostPeerId: null,
      players: {},
      createdAt: Date.now()
    };

    const now = Date.now();
    const maxAge = 10 * 60 * 1000;

    // Remove players that have not sent a heartbeat for 2 minutes.
    for (const [peerId, player] of Object.entries(room.players)) {
      if (now - Number(player.lastSeen || 0) > 2 * 60 * 1000) {
        delete room.players[peerId];
      }
    }

    if (url.pathname === "/create" && request.method === "POST") {
      const { peerId } = await request.json();

      if (room.hostPeerId && room.players[room.hostPeerId]) {
        return json({ ok: false, error: "ROOM_EXISTS" }, 409);
      }

      room.hostPeerId = peerId;
      room.players = {
        [peerId]: { role: "host", lastSeen: now }
      };
      room.createdAt = now;

      await this.state.put("room", room);
      return json({
        ok: true,
        roomCode: this.ctx.id.toString().slice(-3),
        hostPeerId: peerId,
        players: 1,
        maxPlayers: 4
      });
    }

    if (url.pathname === "/info" && request.method === "GET") {
      if (!room.hostPeerId || !room.players[room.hostPeerId]) {
        return json({ ok: false, error: "ROOM_NOT_FOUND" }, 404);
      }

      await this.state.put("room", room);
      return json({
        ok: true,
        hostPeerId: room.hostPeerId,
        players: Object.keys(room.players).length,
        maxPlayers: 4
      });
    }

    if (url.pathname === "/join" && request.method === "POST") {
      const { peerId } = await request.json();

      if (!room.hostPeerId || !room.players[room.hostPeerId]) {
        return json({ ok: false, error: "ROOM_NOT_FOUND" }, 404);
      }

      const count = Object.keys(room.players).length;
      if (count >= 4) {
        return json({ ok: false, error: "ROOM_FULL", players: count, maxPlayers: 4 }, 409);
      }

      if (!room.players[peerId]) {
        room.players[peerId] = { role: "player", lastSeen: now };
      } else {
        room.players[peerId].lastSeen = now;
      }

      await this.state.put("room", room);

      return json({
        ok: true,
        hostPeerId: room.hostPeerId,
        players: Object.keys(room.players).length,
        maxPlayers: 4
      });
    }

    if (url.pathname === "/leave" && request.method === "POST") {
      const { peerId } = await request.json();

      if (room.players[peerId]) {
        const wasHost = room.hostPeerId === peerId;
        delete room.players[peerId];

        if (wasHost) {
          room.hostPeerId = null;
          room.players = {};
        }
      }

      await this.state.put("room", room);
      return json({ ok: true });
    }

    if (url.pathname === "/heartbeat" && request.method === "POST") {
      const { peerId } = await request.json();

      if (!room.players[peerId]) {
        return json({ ok: false, error: "NOT_IN_ROOM" }, 404);
      }

      room.players[peerId].lastSeen = now;
      await this.state.put("room", room);

      return json({
        ok: true,
        players: Object.keys(room.players).length,
        maxPlayers: 4
      });
    }

    await this.state.put("room", room);
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
