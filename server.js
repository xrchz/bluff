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

function randomGameName() {
  if (Object.keys(games).length == 26 * 26) return 'Overflow';
  let name;
  do { name = randomLetter() + randomLetter(); } while (name in games);
  return name;
}

function updatePlayers(gameName) {
  let players = Object.keys(games[gameName].players);
  io.in(gameName).emit('updatePlayers', 'Current players: ' + players.join(', '));
  return players;
}

io.on('connection', socket => {
  console.log("* * * A new connection has been made.");
  console.log("* ID of new socket object: " + socket.id);

  socket.on('joinGame', data => {
    let game;
    let gameName = data.gameName;
    if (!(gameName in games)) {
      game = { players: {} };
      gameName = randomGameName();
      games[gameName] = game;
    }
    else { game = games[gameName]; }
    if (!data.playerName) {
      socket.playerName = 'Player'+Math.floor(Math.random()*20);
      console.log("* Generated random name: " + socket.playerName + " (" + socket.id +")");
    }
    else { socket.playerName = data.playerName; }
    if (!(socket.playerName in game.players)) {
      socket.join(gameName);
      socket.gameName = gameName;
      game.players[socket.playerName] = {};
      socket.emit('updateGame', {gameName: gameName, playerName: socket.playerName});
      updatePlayers(gameName);
      console.log("* Active games: " + Object.keys(games).join(', '));
    }
    else {
      console.log('* Failed to join game: player name taken');
      socket.emit('errorMsg', 'Game ' + gameName + ' already contains player ' + socket.playerName);
    }
  });

  socket.on('disconnecting', () => {
    console.log("* Player exiting: " + socket.playerName + " (" + socket.id +")");
    let game = games[socket.gameName];
    if (game) {
      delete game.players[socket.playerName];
      let players = updatePlayers(socket.gameName);
      if(players.length == 0) {
        delete games[socket.gameName];
      }
    }
    console.log("* Active games: " + Object.keys(games).join(', '));
  });

});
