// ================================
// Hunger Games Simulator - server.js
// ================================

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ------------------------
// CONFIG
// ------------------------
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;

// ------------------------
// MIDDLEWARE
// ------------------------
app.use(express.static("public"));

// ------------------------
// GAME DATA
// ------------------------
const parties = {};

// ALL 24 TRIBUTES (FULLY DEFINED)
const TRIBUTES = [
  { name: "Michael", strength: 8.0, speed: 9.7, stamina: 5.6, health: 9.5, intellect: 9.8, dexterity: 8.6 },
  { name: "Jiahs", strength: 9.4, speed: 9.6, stamina: 9.9, health: 9.9, intellect: 9.6, dexterity: 9.7 },
  { name: "Isaac", strength: 9.0, speed: 9.5, stamina: 7.8, health: 9.8, intellect: 9.7, dexterity: 9.6 },
  { name: "Denton", strength: 9.3, speed: 8.8, stamina: 5.3, health: 9.7, intellect: 9.2, dexterity: 9.1 },
  { name: "Doherty", strength: 8.5, speed: 7.7, stamina: 5.8, health: 9.5, intellect: 8.8, dexterity: 9.6 },
  { name: "Kirk", strength: 9.8, speed: 5.3, stamina: 5.5, health: 9.9, intellect: 9.0, dexterity: 7.7 },
  { name: "Gabe", strength: 9.4, speed: 9.7, stamina: 4.7, health: 9.8, intellect: 9.4, dexterity: 9.4 },
  { name: "Preston", strength: 6.1, speed: 5.3, stamina: 6.7, health: 7.8, intellect: 9.7, dexterity: 8.6 },
  { name: "Dallon", strength: 8.5, speed: 5.1, stamina: 3.8, health: 9.4, intellect: 7.5, dexterity: 7.6 },
  { name: "Dae", strength: 5.2, speed: 4.7, stamina: 7.6, health: 5.4, intellect: 5.4, dexterity: 5.6 },
  { name: "Adrik", strength: 9.3, speed: 5.2, stamina: 5.5, health: 9.6, intellect: 7.6, dexterity: 7.1 },
  { name: "Riley", strength: 7.6, speed: 9.4, stamina: 6.3, health: 8.2, intellect: 8.3, dexterity: 9.8 },
  { name: "Joey", strength: 7.7, speed: 4.8, stamina: 5.7, health: 7.6, intellect: 7.4, dexterity: 6.8 },
  { name: "Adrian", strength: 6.4, speed: 8.7, stamina: 5.5, health: 7.5, intellect: 8.7, dexterity: 6.5 },
  { name: "Malory", strength: 3.7, speed: 4.1, stamina: 4.7, health: 5.4, intellect: 7.6, dexterity: 6.2 },
  { name: "Nick", strength: 7.2, speed: 8.8, stamina: 9.0, health: 7.5, intellect: 8.7, dexterity: 8.2 },
  { name: "Aldon", strength: 6.2, speed: 5.3, stamina: 6.5, health: 7.7, intellect: 9.5, dexterity: 7.2 },
  { name: "Black", strength: 7.6, speed: 6.4, stamina: 5.2, health: 8.7, intellect: 8.8, dexterity: 7.8 },
  { name: "Stuart", strength: 6.9, speed: 5.3, stamina: 4.5, health: 7.7, intellect: 5.9, dexterity: 8.2 },
  { name: "Dalton", strength: 5.4, speed: 5.7, stamina: 7.8, health: 7.7, intellect: 5.3, dexterity: 5.7 },
  { name: "Eve", strength: 5.1, speed: 5.0, stamina: 7.0, health: 5.5, intellect: 7.6, dexterity: 7.7 },
  { name: "Caleb", strength: 6.6, speed: 6.8, stamina: 6.8, health: 7.8, intellect: 7.0, dexterity: 7.5 },
  { name: "Kayne", strength: 5.7, speed: 8.7, stamina: 6.7, health: 6.7, intellect: 7.2, dexterity: 6.8 },
  { name: "Daniel", strength: 8.8, speed: 5.1, stamina: 5.7, health: 9.1, intellect: 6.9, dexterity: 6.5 }
];

// ------------------------
// SOCKET LOGIC
// ------------------------
io.on("connection", socket => {

  // SEND ACTIVE PARTIES
  socket.on("getParties", () => {
    socket.emit("partyList", Object.values(parties).map(p => ({
      id: p.id,
      name: p.name,
      players: Object.keys(p.players).length
    })));
  });

  // CREATE PARTY
  socket.on("createParty", ({ name, password }) => {
    const id = Math.random().toString(36).substr(2, 6);

    parties[id] = {
      id,
      name,
      password,
      host: socket.id,
      started: false,
      players: {},
      tributes: TRIBUTES.map(t => ({
        ...t,
        alive: true,
        taken: false,
        controller: null
      }))
    };

    parties[id].players[socket.id] = {
      id: socket.id,
      host: true,
      tribute: null,
      alive: true
    };

    socket.join(id);
    io.emit("partyList", Object.values(parties));
    io.to(id).emit("partyUpdate", parties[id]);
  });

  // JOIN PARTY
  socket.on("joinParty", ({ partyId, password }) => {
    const party = parties[partyId];
    if (!party) return;

    if (party.password !== password) {
      socket.emit("errorMsg", "Wrong password");
      return;
    }

    if (Object.keys(party.players).length >= MAX_PLAYERS) {
      socket.emit("spectator");
      socket.join(partyId);
      return;
    }

    party.players[socket.id] = {
      id: socket.id,
      host: false,
      tribute: null,
      alive: true
    };

    socket.join(partyId);
    io.to(partyId).emit("partyUpdate", party);
  });

  // SELECT TRIBUTE
  socket.on("selectTribute", ({ partyId, tributeName }) => {
    const party = parties[partyId];
    if (!party) return;

    const tribute = party.tributes.find(t => t.name === tributeName);
    if (!tribute || tribute.taken) return;

    tribute.taken = true;
    tribute.controller = socket.id;
    party.players[socket.id].tribute = tributeName;

    io.to(partyId).emit("partyUpdate", party);
  });

  // START GAME (HOST ONLY)
  socket.on("startGame", partyId => {
    const party = parties[partyId];
    if (!party) return;
    if (party.host !== socket.id) return;

    party.started = true;
    io.to(partyId).emit("gameStarted");
  });

  // DISCONNECT = HEART ATTACK
  socket.on("disconnect", () => {
    for (const party of Object.values(parties)) {
      const player = party.players[socket.id];
      if (!player) continue;

      if (player.tribute) {
        const tribute = party.tributes.find(t => t.name === player.tribute);
        if (tribute) tribute.alive = false;
      }

      delete party.players[socket.id];
      io.to(party.id).emit("partyUpdate", party);
    }
  });
});

// ------------------------
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
