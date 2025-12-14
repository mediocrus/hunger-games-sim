const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const allTributes = require('./data/tributes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const maxPlayers = 8;

// Data structures
let parties = {};
/*
Structure:
parties = {
  partyPassword: {
    hostId: 'socketId',
    players: { socketId: tributeName },
    activeTributes: [],
    turnOrder: [],
    currentTurnIndex: 0,
    combatMessages: [],
    gameStarted: false
  }
}
*/

// Utility functions
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getTributeByName(array, name) {
    return array.find(t => t.name === name);
}

function computeDamage(attacker, defender) {
    let atk = Number(attacker.strength) || 1;
    let dex = Number(attacker.dexterity) || 1;
    let defStam = Number(defender.stamina) || 1;

    let baseDamage = (atk * dex) / 10 - (defStam / 2);
    if (defender.defending) {
        baseDamage *= 0.5;
        defender.defending = false;
    }
    return Math.max(1, Math.round(baseDamage));
}

function tributeAction(party, tribute, action, targetName) {
    let target = getTributeByName(party.activeTributes, targetName);
    if (!target) return;

    if (action === 'attack') {
        let damage = computeDamage(tribute, target);
        target.health -= damage;
        party.combatMessages.push(`${tribute.name} attacks ${target.name} for ${damage} damage.`);
        if (target.health <= 0) {
            party.combatMessages.push(`${target.name} has died!`);
            party.activeTributes = party.activeTributes.filter(t => t.health > 0);
        }
    } else if (action === 'defend') {
        tribute.defending = true;
        party.combatMessages.push(`${tribute.name} is defending this turn.`);
    }
}

function AIAction(party, tribute) {
    let targets = party.activeTributes.filter(t => t.name !== tribute.name);
    if (targets.length === 0) return;
    let target = targets[Math.floor(Math.random() * targets.length)];
    tributeAction(party, tribute, 'attack', target.name);
}

function nextTurn(partyPassword) {
    let party = parties[partyPassword];
    if (!party || !party.gameStarted) return;

    if (party.activeTributes.length <= 1) {
        io.to(party.hostId).emit('gameOver', party.activeTributes[0] ? party.activeTributes[0].name : 'No one');
        party.gameStarted = false;
        return;
    }

    if (party.currentTurnIndex >= party.turnOrder.length) {
        shuffle(party.turnOrder);
        party.currentTurnIndex = 0;
    }

    let currentTributeName = party.turnOrder[party.currentTurnIndex];
    let tribute = getTributeByName(party.activeTributes, currentTributeName);
    if (!tribute) {
        party.currentTurnIndex++;
        nextTurn(partyPassword);
        return;
    }

    if (tribute.isAI) {
        AIAction(party, tribute);
        io.to(party.hostId).emit('combatUpdate', party.combatMessages);
        party.combatMessages = [];
        party.currentTurnIndex++;
        setTimeout(() => nextTurn(partyPassword), 1000);
    } else {
        io.to(tribute.socketId).emit('yourTurn', {
            tributeName: tribute.name,
            targets: party.activeTributes.filter(t => t.name !== tribute.name).map(t => t.name)
        });
    }
}

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Create party
    socket.on('createParty', (password) => {
        if (parties[password]) return socket.emit('partyError', 'Party already exists.');
        parties[password] = {
            hostId: socket.id,
            players: {},
            activeTributes: [],
            turnOrder: [],
            currentTurnIndex: 0,
            combatMessages: [],
            gameStarted: false
        };
        socket.emit('partyCreated', password);
    });

    // Join party
    socket.on('joinParty', ({ password, tributeName }) => {
        let party = parties[password];
        if (!party) return socket.emit('partyError', 'Party does not exist.');
        if (party.gameStarted) return socket.emit('partyError', 'Game already started.');
        if (Object.keys(party.players).length >= maxPlayers) return socket.emit('partyError', 'Party is full.');
        if (Object.values(party.players).includes(tributeName)) return socket.emit('partyError', 'Tribute already taken.');

        party.players[socket.id] = tributeName;
        socket.emit('joinedParty', { password, tributeName, host: socket.id === party.hostId });
        io.to(party.hostId).emit('updatePlayers', Object.values(party.players));

        // Send current available tributes to all party members
        const takenTributes = Object.values(party.players);
        io.to(password).emit('updateAvailableTributes', allTributes.map(t => ({
            name: t.name,
            taken: takenTributes.includes(t.name)
        })));
    });

    // Start game
    socket.on('startGame', (password) => {
        let party = parties[password];
        if (!party || socket.id !== party.hostId || party.gameStarted) return;
        if (Object.keys(party.players).length === 0) return socket.emit('partyError', 'No players joined.');

        // Build active tributes including AI
        party.activeTributes = allTributes.map(t => {
            let isAI = !Object.values(party.players).includes(t.name);
            return {
                ...t,
                isAI,
                socketId: isAI ? null : Object.keys(party.players).find(id => party.players[id] === t.name),
                defending: false,
                health: t.health // ensure correct starting health
            };
        });

        party.turnOrder = party.activeTributes.map(t => t.name);
        shuffle(party.turnOrder);
        party.currentTurnIndex = 0;
        party.gameStarted = true;

        io.to(password).emit('gameStarted', { players: Object.values(party.players) });
        setTimeout(() => nextTurn(password), 1000);
    });

    // Player action
    socket.on('playerAction', ({ password, action, targetName }) => {
        let party = parties[password];
        if (!party || !party.gameStarted) return;
        let tribute = getTributeByName(party.activeTributes, party.players[socket.id]);
        if (!tribute) return;

        tributeAction(party, tribute, action, targetName);
        io.to(party.hostId).emit('combatUpdate', party.combatMessages);
        party.combatMessages = [];
        party.currentTurnIndex++;
        setTimeout(() => nextTurn(password), 500);
    });

    // Reset party
    socket.on('resetParty', (password) => {
        let party = parties[password];
        if (!party) return;
        party.activeTributes = [];
        party.turnOrder = [];
        party.currentTurnIndex = 0;
        party.combatMessages = [];
        party.gameStarted = false;
        io.to(password).emit('partyReset');
    });

    socket.on('disconnect', () => {
        for (let password in parties) {
            let party = parties[password];
            if (party.players[socket.id]) {
                delete party.players[socket.id];
                io.to(party.hostId).emit('updatePlayers', Object.values(party.players));
                if (party.hostId === socket.id) {
                    let remainingIds = Object.keys(party.players);
                    party.hostId = remainingIds[0] || null;
                    if (party.hostId) io.to(party.hostId).emit('hostUpdate', true);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
