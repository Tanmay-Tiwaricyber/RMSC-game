const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/*
ROOM FORMAT:

rooms = {
  ABCDE: {
    host: socketId,
    round: 0,
    state: "lobby" | "playing" | "results",
    players: [{ id, name, score }],
    roles: {}
  }
}
*/

const rooms = {};

io.on("connection", socket => {
  console.log("🟢 Connected:", socket.id);

  /* ======================
      CREATE ROOM
  =======================*/
  socket.on("createRoom", name => {
    const code = makeRoomCode();

    rooms[code] = {
      host: socket.id,
      round: 0,
      state: "lobby",
      players: [{ id: socket.id, name, score: 0 }],
      roles: {}
    };

    socket.join(code);

    socket.emit("roomJoined", {
      roomCode: code,
      host: true
    });

    io.to(code).emit("playerList", rooms[code].players);
    io.to(code).emit("waitingStatus", rooms[code].players.length);
  });

  /* ======================
      JOIN ROOM
  =======================*/
  socket.on("joinRoom", ({ name, roomCode }) => {
    const room = rooms[roomCode];

    if (!room)
      return socket.emit("roomError", "Room does not exist.");

    if (room.players.length >= 4)
      return socket.emit("roomError", "Room is already full.");

    if (room.state !== "lobby")
      return socket.emit("roomError", "Game already started.");

    room.players.push({
      id: socket.id,
      name,
      score: 0
    });

    socket.join(roomCode);

    socket.emit("roomJoined", {
      roomCode,
      host: false
    });

    io.to(roomCode).emit("playerList", room.players);
    io.to(roomCode).emit("waitingStatus", room.players.length);
  });

  /* ======================
      HOST START GAME
      (ONLY IF 4 PLAYERS)
  =======================*/
  socket.on("startGame", roomCode => {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.host !== socket.id) return;

    if (room.players.length !== 4) {
      socket.emit(
        "roomError",
        "Game can start only when 4 players have joined."
      );
      return;
    }

    startRound(roomCode);
  });

  /* ======================
      MANTRI GUESS
  =======================*/
  socket.on("mantriGuess", ({ roomCode, targetId }) => {
    resolveGuess(roomCode, targetId);
  });

  /* ======================
      NEXT ROUND
  =======================*/
  socket.on("nextRound", roomCode => {
    const room = rooms[roomCode];
    if (!room || room.state !== "results") return;

    startRound(roomCode);
  });

  /* ======================
      DISCONNECT HANDLING
  =======================*/
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);

    for (const code in rooms) {
      const room = rooms[code];

      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socket.id);

      if (before !== room.players.length) {
        // host leaves → promote new host
        if (room.host === socket.id && room.players.length) {
          room.host = room.players[0].id;
        }

        room.state = "lobby"; // reset to lobby if someone leaves

        io.to(code).emit("playerList", room.players);
        io.to(code).emit("waitingStatus", room.players.length);
      }

      if (!room.players.length) {
        delete rooms[code];
      }
    }
  });
});

/* ======================
      GAME CORE
======================*/

function startRound(code) {
  const room = rooms[code];
  if (!room) return;

  room.round++;
  room.state = "playing";
  room.roles = {};

  const rolePool = shuffle([
    "RAJA",
    "MANTRI",
    "CHOR",
    "SIPAHI"
  ]);

  room.players.forEach((p, i) => {
    room.roles[p.id] = rolePool[i];
    io.to(p.id).emit("yourRole", rolePool[i]);
  });

  const raja = room.players.find(
    p => room.roles[p.id] === "RAJA"
  ).name;

  const mantri = room.players.find(
    p => room.roles[p.id] === "MANTRI"
  ).name;

  io.to(code).emit("publicReveal", {
    round: room.round,
    raja,
    mantri
  });
}

function resolveGuess(code, targetId) {
  const room = rooms[code];
  if (!room || room.state !== "playing") return;

  const roles = room.roles;
  const chorId = Object.keys(roles).find(
    id => roles[id] === "CHOR"
  );

  room.players.forEach(p => {
    const r = roles[p.id];

    if (r === "RAJA") p.score += 30;
    if (r === "SIPAHI") p.score += 50;

    if (r === "MANTRI" && targetId === chorId)
      p.score += 100;

    if (r === "CHOR" && targetId !== chorId)
      p.score += 100;
  });

  room.state = "results";

  io.to(code).emit("roundResult", {
    roles,
    players: room.players
  });
}

/* ======================
      HELPERS
======================*/

function makeRoomCode() {
  return Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase();
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

server.listen(3000, () => {
  console.log("🔥 Server running → http://localhost:3000");
});
