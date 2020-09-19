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

server.listen(1909, "0.0.0.0");
console.log('server started on https://xrchz.net:1909');

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

function updateHand(player) {
  io.in(player.id).emit('updateHand', player.hand.map(cardName));
}

function updateHands(gameName) {
  const game = games[gameName];
  for (const player of game.players) {
    if (!game.missingPlayers.has(player.name)) {
      updateHand(player)
    }
  }
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

const asc = (a, b) => a - b;

const Ten = 10;
const Jack = 11;
const Queen = 12;
const King = 13;
const Ace = 14;
const Joker = 15;

const cardName = r =>
  r == Ten   ? 'T' :
  r == Jack  ? 'J' :
  r == Queen ? 'Q' :
  r == King  ? 'K' :
  r == Ace   ? 'A' :
  r == Joker ? '?' : r;

const cardNum = c =>
  c == 'T' ? Ten :
  c == 'J' ? Jack :
  c == 'Q' ? Queen :
  c == 'K' ? King :
  c == 'A' ? Ace :
  c == '?' ? Joker : parseInt(c);

const sayRegExp = /^([2-9]|[TJQKA])\1*$/;

function tryPlay(player, str, deck) {
  let cards = Array.from(str).map(cardNum).sort(asc);
  const toDeck = [];
  const hand = player.hand.filter(card => {
    if ( cards.length > 0 && card == cards[0] ) {
      toDeck.push(cards.shift());
      return false;
    }
    else {
      return true;
    }
  });
  if (cards.length > 0) {
    return false;
  }
  else {
    Array.prototype.push.apply(deck, toDeck);
    player.hand = hand;
    return true;
  }
}

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

function changeTurn(gameName) {
  const game = games[gameName];
  const player = game.players[game.whoseTurn];
  if (game.pendingWinner && game.pendingWinner.hand.length == 0) {
    game.log.push(game.pendingWinner.name + ' wins!');
    io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
  }
  else {
    game.pendingWinner = null;
    io.in(gameName).emit('setCurrent', player.name);
    io.in(player.id).emit('showMove');
  }
}

function findLastPlay(log) {
  for (let i = log.length - 1; i > 0; i--) {
    if (log[i].bluff) {
      return false;
    }
    if (log[i].who) {
      return log[i];
    }
  }
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
          const player = game.players.find(player => player.name == data.playerName);
          player.id = socket.id;
          updatePlayers(gameName);
          updateHand(player);
          if (game.players[game.whoseTurn].name == player.name) {
            socket.emit('showMove');
          }
          else {
            const last = findLastPlay(game.log);
            if (last && last.who != player.name) {
              socket.emit('showBluff');
            }
          }
          for (const entry of game.log) {
            socket.emit('appendLog', entry.who ? (entry.pub + (entry.who == player.name ? entry.pri : '')) :
                                     entry.bluff ? entry.msg : entry);
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
        game.players.push({name: socket.playerName, id: socket.id});
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
    const game = games[gameName];
    if (game.players.length > 1) {
      console.log('* Game starting: ' + gameName);
      game.started = true;
      game.deck = [];
      game.missingPlayers = new Set();
      game.log = [];
      console.log('* Shuffling deck and players: ' + gameName);
      const deck = makeDeck();
      shuffleInPlace(deck);
      shuffleInPlace(game.players);
      updatePlayers(gameName);
      console.log('* Dealing hands: ' + gameName);
      for (const player of game.players) {
        player.hand = [];
      }
      let i = 0;
      let j = 0;
      while(j < deck.length) {
        game.players[i++].hand.push(deck[j++]);
        if (i == game.players.length) { i = 0; }
      }
      for (const player of game.players) {
        player.hand.sort(asc);
      }
      console.log('* Ready: ' + gameName);
      game.whoseTurn = 0;
      io.in(gameName).emit('startGame');
      game.log.push('The game begins!');
      io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
      updateHands(gameName);
      changeTurn(gameName);
    }
    else {
      socket.emit('errorMsg', 'Not enough players to start the game');
    }
  });

  socket.on('bluff', () => {
    const gameName = socket.gameName;
    const game = games[gameName];
    const last = findLastPlay(game.log);
    if (last) {
      const legit = (last.say.length == last.act.length &&
        Array.from(last.act).every(c => c == '?' || c == last.say[0]));
      game.log.push(socket.playerName + ' accuses ' + last.who);
      io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
      let loser;
      if (legit) {
        game.log.push('but ' + last.who + ' had innocently played ' + last.act);
        io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
        loser = socket.playerName;
      }
      else {
        game.log.push('and catches them bluffing with ' + last.act);
        io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
        loser = last.who;
      }
      game.log.push({bluff: true, msg: loser + ' takes the deck to hand'});
      io.in(gameName).emit('appendLog', game.log[game.log.length - 1].msg);
      const player = game.players.find(player => player.name == loser);
      player.hand = player.hand.concat(game.deck).sort(asc);
      game.deck = [];
      updateHand(player);
      io.in(gameName).emit('hideBluff');
      changeTurn(gameName);
    }
    else {
      socket.emit('errorMsg', 'Error: There was no play to call bluff on');
    }
  });

  socket.on('move', data => {
    const gameName = socket.gameName;
    const game = games[gameName];
    if (game.players[game.whoseTurn].name == socket.playerName) {
      const player = game.players[game.whoseTurn];
      if ( sayRegExp.test(data.say) ) {
        if ( tryPlay(player, data.play, game.deck) ) {
          const entry = {pub: socket.playerName + ' claims ' + data.say,
                         who: socket.playerName,
                         pri: ' (actually ' + data.play + ')',
                         say: data.say,
                         act: data.play};
          game.log.push(entry);
          socket.to(gameName).emit('appendLog', entry.pub);
          socket.emit('appendLog', entry.pub + entry.pri);
          updateHand(player);
          socket.emit('hideMove');
          socket.emit('hideBluff');
          socket.to(gameName).emit('showBluff');
          game.whoseTurn++;
          if (game.whoseTurn == game.players.length) { game.whoseTurn = 0; }
          if (player.hand.length == 0) {
            game.log.push(player.name + ' wins unless they are caught...');
            io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
            io.in(gameName).emit('setCurrent');
            game.pendingWinner = player;
          }
          else {
            changeTurn(gameName);
          }
        }
        else {
          socket.emit('errorMsg', 'You cannot play that with your hand');
        }
      }
      else {
        socket.emit('errorMsg', 'Error: What you say is not valid: ensure all cards are the same');
      }
    }
    else {
      socket.emit('errorMsg', 'Error: Tried to move when it is not your turn');
    }
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
