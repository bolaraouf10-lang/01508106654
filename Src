const MAX_PLAYERS = 4;
const ROOM_TTL = 2 * 60 * 1000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function cleanRoom(room) {
  if (!room) return null;

  const now = Date.now();
  const players = room.players || {};

  for (const [peerId, player] of Object.entries(players)) {
    if (now - (player.lastSeen || 0) > ROOM_TTL) {
      delete players[peerId];
    }
  }

  if (room.hostPeerId && !players[room.hostPeerId]) {
    return null;
  }

  room.players = players;
  return room;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (path === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "Street Racing Room Server"
      });
    }

    const allowedPaths = [
      "/create",
      "/room",
      "/join",
      "/leave",
      "/heartbeat"
    ];

    if (!allowedPaths.includes(path)) {
      return json({ error: "Not found" }, 404);
    }

    const code = (url.searchParams.get("code") || "").trim();

    if (!/^\d{3}$/.test(code)) {
      return json(
        { error: "Room code must be exactly 3 digits" },
        400
      );
    }

    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);

    const target = new URL(request.url);
    target.pathname = path;
    target.search = `?code=${encodeURIComponent(code)}`;

    return stub.fetch(new Request(target.toString(), request));
  }
};

export class RoomServer {
  constructor(state) {
    this.state = state;
  }

  async getRoom() {
    let room = await this.state.storage.get("room");

    room = cleanRoom(room);

    if (!room) {
      await this.state.storage.delete("room");
      return null;
    }

    await this.state.storage.put("room", room);
    return room;
  }

  async saveRoom(room) {
    await this.state.storage.put("room", room);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const code = (url.searchParams.get("code") || "").trim();

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (!/^\d{3}$/.test(code)) {
      return json(
        { error: "Room code must be exactly 3 digits" },
        400
      );
    }

    let room = await this.getRoom();

    if (path === "/create" && request.method === "POST") {
      let data;

      try {
        data = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const peerId =
        typeof data.peerId === "string"
          ? data.peerId.trim()
          : "";

      if (!peerId) {
        return json({ error: "peerId is required" }, 400);
      }

      if (room) {
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
            lastSeen: Date.now()
          }
        }
      };

      await this.saveRoom(room);

      return json({
        ok: true,
        code: room.code,
        hostPeerId: room.hostPeerId,
        players: Object.values(room.players)
      });
    }

    if (path === "/room" && request.method === "GET") {
      if (!room) {
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
      let data;

      try {
        data = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const peerId =
        typeof data.peerId === "string"
          ? data.peerId.trim()
          : "";

      if (!peerId) {
        return json({ error: "peerId is required" }, 400);
      }

      if (!room || !room.hostPeerId) {
        return json(
          { error: "Room not found" },
          404
        );
      }

      if (room.players[peerId]) {
        room.players[peerId].lastSeen = Date.now();
        await this.saveRoom(room);

        return json({
          ok: true,
          code: room.code,
          hostPeerId: room.hostPeerId,
          players: Object.values(room.players)
        });
      }

      const count = Object.keys(room.players).length;

      if (count >= MAX_PLAYERS) {
        return json(
          {
            error: "Room is full",
            maxPlayers: MAX_PLAYERS
          },
          409
        );
      }

      room.players[peerId] = {
        peerId,
        lastSeen: Date.now()
      };

      await this.saveRoom(room);

      return json({
        ok: true,
        code: room.code,
        hostPeerId: room.hostPeerId,
        players: Object.values(room.players)
      });
    }

    if (path === "/heartbeat" && request.method === "POST") {
      let data;

      try {
        data = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const peerId =
        typeof data.peerId === "string"
          ? data.peerId.trim()
          : "";

      if (!peerId) {
        return json({ error: "peerId is required" }, 400);
      }

      if (!room || !room.players[peerId]) {
        return json(
          { error: "Player not found" },
          404
        );
      }

      room.players[peerId].lastSeen = Date.now();
      await this.saveRoom(room);

      return json({ ok: true });
    }

    if (path === "/leave" && request.method === "POST") {
      let data;

      try {
        data = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const peerId =
        typeof data.peerId === "string"
          ? data.peerId.trim()
          : "";

      if (!peerId) {
        return json({ error: "peerId is required" }, 400);
      }

      if (!room) {
        return json({ ok: true });
      }

      if (peerId === room.hostPeerId) {
        await this.state.storage.delete("room");

        return json({
          ok: true,
          roomClosed: true
        });
      }

      if (room.players[peerId]) {
        delete room.players[peerId];
        await this.saveRoom(room);
      }

      return json({
        ok: true,
        players: Object.values(room.players)
      });
    }

    return json({ error: "Not found" }, 404);
  }
}
