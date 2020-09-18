"use strict";

const express = require('express');
const https = require('https');
const fs = require('fs');
const options = {
  key: fs.readFileSync('/etc/ssl/xrchz/key.pem'),
  cert: fs.readFileSync('/etc/ssl/xrchz/cert.pem')
};
var app = express();
var server = https.createServer(options, app)
var io = require('socket.io')(server);

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/client/index.html');
});
app.use(express.static(__dirname + '/client'));

server.listen(2009, "0.0.0.0");
console.log('server started on https://xrchz.net:2009');

var games = {};

function randomLetter() {
  return String.fromCharCode(65 + Math.random() * 26);
}

function randomUnusedGameName() {
  if (Object.keys(games).length == 26 * 26) return 'Overflow';
  let name;
  do { name = randomLetter() + randomLetter(); } while (name in games);
  return name;
}

function updatePlayers(gameName) {
  const game = games[gameName];
  const func = game.missingPlayers ?
    (player => game.missingPlayers.has(player.name) ? player.name + ' (d/c)' : player.name) :
    (player => player.name);
  const playerNames = game.players.map(func);
  io.in(gameName).emit('updatePlayers', 'Players: ' + playerNames.join(', '));
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

const Jack = 11;
const Queen = 12;
const King = 13;
const Ace = 14;
const Joker = 15;

function makeDeck() {
  const deck = [];
  for (let r = 2; r <= Ace; r++) {
    for (let i = 0; i < 4; i++) {
      deck.push(r);
    }
  }
  deck.push(Joker);
  deck.push(Joker);
  return deck;
}

function makeEmptyHand() {
  const hand = [];
  for (let r = 2; r <= Joker; r++) {
    hand[r] = 0;
  }
  return hand;
}

io.on('connection', socket => {
  console.log("* * * A new connection has been made.");
  console.log("* ID of new socket object: " + socket.id);

  socket.on('joinGame', data => {
    let game;
    let gameName = data.gameName;
    if (!gameName) {
      gameName = randomUnusedGameName();
    }
    if (!(gameName in games)) {
      game = { players: [] };
      games[gameName] = game;
    }
    else {
      game = games[gameName];
    }
    if (game.started) {
      if (game.missingPlayers.has(data.playerName)) {
        if (Object.keys(socket.rooms).length == 1) {
          socket.playerName = data.playerName;
          socket.gameName = gameName;
          socket.join(gameName);
          game.missingPlayers.delete(data.playerName);
          updatePlayers(gameName);
          for (const item of game.log) {
            socket.emit('appendLog', item);
          }
          socket.emit('rejoinGame');
        }
        else {
          socket.emit('errorMsg', 'Error: somehow this connection is already used in another game');
        }
      }
      else {
        socket.emit('errorMsg', 'Game ' + gameName + ' has already started');
      }
    }
    else {
      if (!data.playerName) {
        socket.playerName = 'Player'+Math.floor(Math.random()*20);
        console.log("* Generated random name: " + socket.playerName + " (" + socket.id +")");
      }
      else {
        socket.playerName = data.playerName;
      }
      if (game.players.every(player => player.name != socket.playerName)) {
        socket.join(gameName);
        socket.gameName = gameName;
        game.players.push({name: socket.playerName});
        socket.emit('joinGame', {gameName: gameName, playerName: socket.playerName});
        updatePlayers(gameName);
        console.log("* Active games: " + Object.keys(games).join(', '));
      }
      else {
        console.log('* Failed to join game: player name taken');
        socket.emit('errorMsg', 'Game ' + gameName + ' already contains player ' + socket.playerName);
      }
    }
  });

  socket.on('startGame', () => {
    const gameName = socket.gameName;
    console.log('* Game starting: ' + gameName);
    const game = games[gameName];
    game.started = true;
    game.missingPlayers = new Set();
    game.log = [];
    console.log('* Shuffling deck and players: ' + gameName);
    const deck = makeDeck();
    shuffleInPlace(deck);
    shuffleInPlace(game.players);
    updatePlayers(gameName);
    console.log('* Dealing hands: ' + gameName);
    for (const player of game.players) {
      player.hand = makeEmptyHand();
    }
    let i = 0;
    let j = 0;
    while(j < deck.length) {
      game.players[i++].hand[deck[j++]]++;
      if (i == game.players.length) { i = 0; }
    }
    for (const player of game.players) {
      player.hand.sort( (a, b) => a - b );
    }
    console.log('* Ready: ' + gameName);
    game.whoseTurn = 0;
    io.in(gameName).emit('startGame');
    game.log.push('The game begins!');
    io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
    game.log.push('Waiting for ' + game.players[game.whoseTurn].name + '...');
    io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
  });

  socket.on('disconnecting', () => {
    console.log("* Player exiting: " + socket.playerName + " (" + socket.id +")");
    const game = games[socket.gameName];
    if (game) {
      if (!game.started) {
        game.players = game.players.filter( player => player.name != socket.playerName );
        updatePlayers(socket.gameName);
        if(game.players.length == 0) {
          delete games[socket.gameName];
        }
      }
      else {
        game.missingPlayers.add(socket.playerName);
        updatePlayers(socket.gameName);
      }
    }
    console.log("* Active games: " + Object.keys(games).join(', '));
  });

});
