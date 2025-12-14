const express = require('express');
const path = require('path');
const session = require('express-session');
const tributesData = require('./data/tributes');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(session({
  secret: 'hunger-games-secret',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let claimedTributes = {}; // { sessionID: tributeName }
let aiTributes = [];
let combatStarted = false;
let turnOrder = [];
let tributeStats = {};
let currentTurnIndex = 0;
let combatResults = [];

// Serve root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get tribute data
app.get('/tributes', (req, res) => {
  // Include which tributes are taken
  const taken = Object.values(claimedTributes);
  const data = tributesData.map(t => ({
    name: t.name,
    taken: taken.includes(t.name)
  }));
  res.json(data);
});

// Select a tribute
app.post('/select', (req, res) => {
  if (combatStarted) return res.status(400).json({ error: 'Game already started' });

  const selected = req.body.selectedTribute; // one tribute per device
  const sessionID = req.sessionID;

  if (!selected) return res.status(400).json({ error: 'No tribute selected' });

  // Check if already taken
  if (Object.values(claimedTributes).includes(selected)) {
    return res.status(400).json({ error: 'Tribute already taken' });
  }

  claimedTributes[sessionID] = selected;

  // Update AI tributes
  aiTributes = tributesData.map(t => t.name)
    .filter(n => !Object.values(claimedTributes).includes(n));

  res.json({ message: 'Selection saved', playerTributes: Object.values(claimedTributes), aiTributes });
});

// Start the game (host only)
app.post('/start', (req, res) => {
  if (combatStarted) return res.status(400).json({ error: 'Game already started' });

  combatStarted = true;

  const allTributes = [...Object.values(claimedTributes), ...aiTributes];

  // Initialize tribute stats
  tributeStats = {};
  allTributes.forEach(name => {
    const t = tributesData.find(tr => tr.name === name);
    tributeStats[name] = {
      health: t.Health,
      strength: t.Strength,
      speed: t.Speed,
      stamina: t.Stamina,
      alive: true
    };
  });

  // Determine turn order
  turnOrder = [...allTributes].sort((a,b) => tributeStats[b].speed - tributeStats[a].speed);

  combatResults = [];
  currentTurnIndex = 0;

  res.json({ message: 'Combat started', turnOrder });
});

// Handle player action
app.post('/action', (req, res) => {
  if (!combatStarted) return res.status(400).json({ error: 'Combat not started' });

  const { action, target } = req.body;
  const sessionID = req.sessionID;
  const player = claimedTributes[sessionID];

  if (!player) return res.status(400).json({ error: 'You have not selected a tribute' });
  if (!tributeStats[player].alive) return res.status(400).json({ error: 'Your tribute is dead' });

  // Resolve player's action
  resolveAction(player, action, target);

  // Resolve AI turns until next player
  let nextPlayerFound = false;
  while (!nextPlayerFound) {
    currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
    const currentTribute = turnOrder[currentTurnIndex];
    if (!tributeStats[currentTribute].alive) continue;

    if (Object.values(claimedTributes).includes(currentTribute)) {
      nextPlayerFound = true;
      break;
    } else {
      // AI randomly attacks a living target
      const aliveTargets = Object.keys(tributeStats).filter(n => tributeStats[n].alive && n !== currentTribute);
      if (aliveTargets.length === 0) break;
      const targetAI = aliveTargets[Math.floor(Math.random()*aliveTargets.length)];
      const aiAction = Math.random() < 0.7 ? 'attack' : 'defend';
      resolveAction(currentTribute, aiAction, targetAI);
    }
  }

  // Check for winner
  const alive = Object.keys(tributeStats).filter(n => tributeStats[n].alive);
  if (alive.length === 1) {
    combatStarted = false;
    combatResults.push(`${alive[0]} is the winner!`);
  }

  res.json({ results: combatResults });
});

// Resolve action
function resolveAction(performer, action, targetName) {
  if (!tributeStats[performer].alive) return;

  if (action === 'attack') {
    const target = tributeStats[targetName];
    if (!target || !target.alive) return;
    const damage = tributeStats[performer].strength * (0.5 + Math.random()*0.5);
    target.health -= damage;
    if (target.health <= 0) {
      target.alive = false;
      combatResults.push(`${performer} attacked ${targetName} for ${damage.toFixed(1)} damage and killed them!`);
    } else {
      combatResults.push(`${performer} attacked ${targetName} for ${damage.toFixed(1)} damage. ${targetName} has ${target.health.toFixed(1)} HP left.`);
    }
  } else if (action === 'defend') {
    tributeStats[performer].health += tributeStats[performer].stamina * 0.3;
    combatResults.push(`${performer} defends and recovers some health (now ${tributeStats[performer].health.toFixed(1)} HP).`);
  }
}

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));