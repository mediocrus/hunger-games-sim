const express = require("express");
const http = require("http");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from public
app.use(express.static("public"));

// ------------------------
// GAME STATE
// ------------------------
const parties = {}; // all active parties

// 24 tributes with stats: Name, Height, Weight, Strength, Speed, Stamina, Health, Intellect, Dexterity
const TRIBUTES = [
  { name:"Michael", height:"6’2", weight:180, strength:8.0, speed:9.7, stamina:5.6, health:9.5, intellect:9.8, dexterity:8.6 },
  { name:"Jiahs", height:"5’10", weight:185, strength:9.4, speed:9.6, stamina:9.9, health:9.9, intellect:9.6, dexterity:9.7 },
  { name:"Isaac", height:"5’10", weight:165, strength:9.0, speed:9.5, stamina:7.8, health:9.8, intellect:9.7, dexterity:9.6 },
  { name:"Denton", height:"6’1", weight:180, strength:9.3, speed:8.8, stamina:5.3, health:9.7, intellect:9.2, dexterity:9.1 },
  { name:"Doherty", height:"5’11", weight:180, strength:8.5, speed:7.7, stamina:5.8, health:9.5, intellect:8.8, dexterity:9.6 },
  { name:"Kirk", height:"6’4", weight:320, strength:9.8, speed:5.3, stamina:5.5, health:9.9, intellect:9.0, dexterity:7.7 },
  { name:"Gabe", height:"5’8", weight:180, strength:9.4, speed:9.7, stamina:4.7, health:9.8, intellect:9.4, dexterity:9.4 },
  { name:"Preston", height:"5’7", weight:130, strength:6.1, speed:5.3, stamina:6.7, health:7.8, intellect:9.7, dexterity:8.6 },
  { name:"Dallon", height:"6’0", weight:200, strength:8.5, speed:5.1, stamina:3.8, health:9.4, intellect:7.5, dexterity:7.6 },
  { name:"Dae", height:"5’6", weight:120, strength:5.2, speed:4.7, stamina:7.6, health:5.4, intellect:5.4, dexterity:5.6 },
  { name:"Adrik", height:"6’2", weight:230, strength:9.3, speed:5.2, stamina:5.5, health:9.6, intellect:7.6, dexterity:7.1 },
  { name:"Riley", height:"6’0", weight:165, strength:7.6, speed:9.4, stamina:6.3, health:8.2, intellect:8.3, dexterity:9.8 },
  { name:"Joey", height:"5’6", weight:150, strength:7.7, speed:4.8, stamina:5.7, health:7.6, intellect:7.4, dexterity:6.8 },
  { name:"Adrian", height:"5’7", weight:135, strength:6.4, speed:8.7, stamina:5.5, health:7.5, intellect:8.7, dexterity:6.5 },
  { name:"Malory", height:"5’2", weight:115, strength:3.7, speed:4.1, stamina:4.7, health:5.4, intellect:7.6, dexterity:6.2 },
  { name:"Nick", height:"6’0", weight:165, strength:7.2, speed:8.8, stamina:9.0, health:7.5, intellect:8.7, dexterity:8.2 },
  { name:"Aldon", height:"6’1", weight:170, strength:6.2, speed:5.3, stamina:6.5, health:7.7, intellect:9.5, dexterity:7.2 },
  { name:"Black", height:"5’7", weight:160, strength:7.6, speed:6.4, stamina:5.2, health:8.7, intellect:8.8, dexterity:7.8 },
  { name:"Stuart", height:"5’10", weight:180, strength:6.9, speed:5.3, stamina:4.5, health:7.7, intellect:5.9, dexterity:8.2 },
  { name:"Dalton", height:"5’8", weight:155, strength:5.4, speed:5.7, stamina:7.8, health:7.7, intellect:5.3, dexterity:5.7 },
  { name:"Eve", height:"5’6", weight:130, strength:5.1, speed:5.0, stamina:7.0, health:5.5, intellect:7.6, dexterity:7.7 },
  { name:"Caleb", height:"6’0", weight:170, strength:6.6, speed:6.8, stamina:6.8, health:7.8, intellect:7.0, dexterity:7.5 },
  { name:"Kayne", height:"5’5", weight:160, strength:5.7, speed:8.7, stamina:6.7, health:6.7, intellect:7.2, dexterity:6.8 },
  { name:"Daniel", height:"6’2", weight:250, strength:8.8, speed:5.1, stamina:5.7, health:9.1, intellect:6.9, dexterity:6.5 }
];

const REGION_TEMPLATES = [
  "Cornucopia","Open Plains","Dense Forest","Fog Valley","Swamp Marsh",
  "Rocky Hills","Crystal Lake","Sunset Cliffs","Hidden Grove","Windy Pass",
  "Thunder Canyon","Quiet Meadow","Abandoned Village","Dark Cavern","Sacred Temple"
];

// ------------------------
// HELPERS
// ------------------------
function genId() { return Math.random().toString(36).substr(2, 9); }
function pickRandom(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx,1)[0]);
  }
  return result;
}

function generateMap() {
  const selected = pickRandom(REGION_TEMPLATES, 15);
  const regions = {};
  selected.forEach((name,i)=> { regions[i]={id:i,name,adjacent:[]}; });
  Object.keys(regions).forEach(id => {
    regions[id].adjacent = Object.keys(regions).filter(x => x!==id).map(Number);
  });
  return { regions };
}

// ------------------------
// SOCKET.IO HANDLING
// ------------------------
io.on("connection", socket => {

  // SEND LIVE PARTY LIST
  socket.emit("liveParties", Object.values(parties).filter(p=>!p.ended).map(p=>({id:p.id,name:p.name})));

  // CREATE PARTY
  socket.on("createParty", async ({ partyName, password }) => {
    const partyId = genId();
    const passwordHash = await bcrypt.hash(password, 10);
    const map = generateMap();
    const tributes = {};
    TRIBUTES.forEach(t => {
      tributes[t.name] = { ...t, alive:true, isAI:true, location:"0", discoveredRegions:new Set(["0"]), inventory:[], alliance:null };
    });

    parties[partyId] = {
      id: partyId, name: partyName, passwordHash,
      hostSocketId: socket.id, phase:"morning", day:1, phaseIndex:0,
      players:{}, tributes, map, lootChance:0.10,
      summary:{deaths:[],alliances:[],lootDrops:[]}, started:false, ended:false
    };

    parties[partyId].players[socket.id] = { socketId:socket.id, tributeName:null, isHost:true, hasActedThisPhase:false, isSpectator:false };
    socket.join(partyId);

    // notify all clients of live parties
    io.emit("liveParties", Object.values(parties).filter(p=>!p.ended).map(p=>({id:p.id,name:p.name})));

    socket.emit("partyCreated",{ partyId, partyName });
    io.to(partyId).emit("updateParty", parties[partyId]);
  });

  // JOIN PARTY
  socket.on("joinParty", async ({ partyId, password }) => {
    const party = parties[partyId];
    if (!party) { socket.emit("errorMsg","Party does not exist"); return; }
    const match = await bcrypt.compare(password, party.passwordHash);
    if (!match) { socket.emit("errorMsg","Incorrect password"); return; }

    let isSpectator = Object.values(party.players).filter(p=>!p.isSpectator).length >= 8;
    party.players[socket.id] = { socketId:socket.id, tributeName:null, isHost:false, hasActedThisPhase:false, isSpectator };
    socket.join(partyId);

    socket.emit("spectatorStatus", isSpectator);
    io.to(partyId).emit("updateParty", party);
  });

  // SELECT TRIBUTE
  socket.on("selectTribute", ({ partyId, tributeName }) => {
    const party = parties[partyId];
    if (!party) return;
    const player = party.players[socket.id];
    if (!player || player.isSpectator) return;
    const taken = Object.values(party.players).some(p=>p.tributeName===tributeName);
    if (taken) { socket.emit("errorMsg","Tribute already taken"); return; }
    player.tributeName = tributeName;
    party.tributes[tributeName].isAI = false;
    io.to(partyId).emit("updateParty", party);
  });

  // START GAME (HOST)
  socket.on("startGame", ({ partyId }) => {
    const party = parties[partyId];
    if (!party || party.hostSocketId !== socket.id) return;
    party.started = true;
    io.to(partyId).emit("gameStarted", party);
  });

  // PLAYER ACTION
  socket.on("playerAction", ({ partyId, action, target, destination }) => {
    const party = parties[partyId];
    if (!party) return;
    const player = party.players[socket.id];
    if (!player) return;
    const tribute = party.tributes[player.tributeName];
    if (!tribute || !tribute.alive) return;

    if (action==="move" && destination!==undefined) {
      tribute.location = destination;
      tribute.discoveredRegions.add(destination);
    }

    if (action==="attack" && target) {
      const targetTribute = party.tributes[target];
      if (!targetTribute || !targetTribute.alive) return;
      let damage = Math.max(0, tribute.strength + tribute.dexterity/2 - targetTribute.stamina/2);
      if (isNaN(damage)) damage=1;
      targetTribute.health -= damage;
      if (targetTribute.health<=0) {
        targetTribute.alive=false;
        party.summary.deaths.push(`${targetTribute.name} was killed by ${tribute.name}`);
      }
    }

    player.hasActedThisPhase = true;

    if (Object.values(party.players).every(p => p.hasActedThisPhase || p.isSpectator || !party.tributes[p.tributeName]?.alive)) {
      if (party.phase==="night") { endOfDaySummary(partyId); } else { startNextPhase(partyId); }
    }

    io.to(partyId).emit("updateParty", party);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    for (const partyId in parties) {
      const party = parties[partyId];
      if (!party.players[socket.id]) continue;
      const tributeName = party.players[socket.id].tributeName;
      if (tributeName && party.tributes[tributeName]) {
        party.tributes[tributeName].alive = false;
        party.summary.deaths.push(`${tributeName} died of a heart attack (disconnect)`);
      }
      delete party.players[socket.id];
      io.to(partyId).emit("updateParty", party);
      io.emit("liveParties", Object.values(parties).filter(p=>!p.ended).map(p=>({id:p.id,name:p.name})));
    }
  });

  // SPECTATOR CHAT
  socket.on("spectatorChat", ({ partyId, message }) => {
    const party = parties[partyId];
    if (!party) return;
    const player = party.players[socket.id];
    if (!player || !player.isSpectator) return;
    io.to(partyId).emit("spectatorMessage", { name:player.tributeName||"Spectator", message });
  });

});

// ------------------------
// PHASE ENGINE & AI
// ------------------------
function startNextPhase(partyId) {
  const party = parties[partyId];
  if (!party || party.ended) return;
  Object.values(party.players).forEach(p=>p.hasActedThisPhase=false);

  const phases=["morning","afternoon","night"];
  party.phaseIndex=(party.phaseIndex+1)%3;
  party.phase=phases[party.phaseIndex];
  if (party.phase==="morning" && party.phaseIndex===0) party.day+=1;

  let chance = Math.min(0.5, 0.10 + (party.day-1)*0.05 + party.phaseIndex*0.025);
  if (Math.random()<chance) {
    const regionIds=Object.keys(party.map.regions);
    const dropRegionId = regionIds[Math.floor(Math.random()*regionIds.length)];
    party.summary.lootDrops.push({ region:party.map.regions[dropRegionId].name, phase:party.phase });
  }

  io.to(partyId).emit("newPhase",{phase:party.phase, day:party.day, party});
  processAIMoves(partyId);
}

function processAIMoves(partyId) {
  const party = parties[partyId];
  if (!party) return;
  const aiTributes = Object.values(party.tributes).filter(t=>t.isAI && t.alive);

  aiTributes.forEach(ai=>{
    const regionIds=Object.keys(party.map.regions);
    const current=parseInt(ai.location);
    const possibleMoves = party.map.regions[current].adjacent;
    ai.location = possibleMoves[Math.floor(Math.random()*possibleMoves.length)];

    const targetsHere = Object.values(party.tributes).filter(t=>t.location===ai.location && t.alive && t.name!==ai.name);
    if (targetsHere.length>0) {
      const target = targetsHere.reduce((a,b)=>a.health<b.health?a:b);
      const damage = Math.max(0, ai.strength + ai.dexterity/2 - target.stamina/2);
      target.health -= damage;
      if (target.health<=0) {
        target.alive=false;
        party.summary.deaths.push(`${target.name} was killed by ${ai.name}`);
      }
    }
  });

  io.to(partyId).emit("updateParty", party);
}

function endOfDaySummary(partyId) {
  const party = parties[partyId];
  if (!party) return;

  const summary = {
    day: party.day,
    lootDrops: party.summary.lootDrops,
    deaths: party.summary.deaths,
    alliances: party.summary.alliances
  };

  io.to(partyId).emit("endOfDaySummary", summary);
  party.summary.lootDrops = [];
  party.summary.deaths = [];
  party.summary.alliances = [];

  startNextPhase(partyId);
}

// ------------------------
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
