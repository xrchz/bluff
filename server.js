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

app.get((req, res) => {
  res.sendFile(__dirname + '/client/index.html');
});
app.use(express.static(__dirname + '/client'));

server.listen(1909, "0.0.0.0");
console.log('server started on https://xrchz.net:1909');

var games = {};

function randomNormal(samples) {
  if (!samples) { samples = 6; }
  let t = 0;
  for(let n = 0; n < samples; n++) {
    t += Math.random();
  }
  return t / samples - 0.5;
}

function randomLetter() {
  return String.fromCharCode(65 + Math.random() * 26);
}

function randomUnusedGameName() {
  if (Object.keys(games).length == 26 * 26) return 'Overflow';
  let name;
  do { name = randomLetter() + randomLetter(); } while (name in games);
  return name;
}

function formatPlayer(player, forWhom, current, disconnected) {
  let s = player.name;
  if (forWhom.handLength && forWhom.handLength[player.name]) {
    s += ' ' + '🂠'.repeat(forWhom.handLength[player.name]);
  }
  else if (player.hand && player.name == forWhom.name) {
    s += ' ' + '🂠'.repeat(player.hand.length);
  }
  else if (player.hand && forWhom.spectating) {
    s += ' ' + cardsSpan(player.hand.map(cardName).join(''));
  }
  let classes = [];
  let annots = [];
  if (disconnected) { classes.push('disconnected'); annots.push('(d/c)');}
  if (current) { classes.push('current'); annots.push('(*)');}
  if (classes.length) {
    s = `<span class="${classes.join(' ')}">${s} ${annots.join(' ')}</span>`;
  }
  return s;
}

function updatePlayers(gameName) {
  const game = games[gameName];
  const isDisconnected = game.missingPlayers ?
    (player => game.missingPlayers.has(player.name)) : (player => false);
  const currentName = (game.started && !game.ended) ? game.players[game.whoseTurn].name : null;
  for (const forWhom of game.members) {
    let players = [];
    if (isDisconnected(forWhom)) { continue; }
    for (const player of game.players) {
      players.push(formatPlayer(player, forWhom, player.name == currentName, isDisconnected(player)));
    }
    players = players.map(x => `<li>${x}</li>`).join('');
    const spectators = game.spectators.map(x => `<li class="spectator">${x.name} (s)</li>`).join('');
    io.in(forWhom.id).emit('updatePlayers', `<ul>${players}${spectators}</ul>`);
  }
}

function updateHand(player) {
  io.in(player.id).emit('updateHand', player.hand.map(cardName));
}

function updateHands(game) {
  for (const player of game.players) {
    updateHand(player)
  }
}

function noisyObservation(n) {
  return n == 0 ? 0 :
    Math.max(1, Math.round(n + randomNormal() * Math.sqrt(2 * n)));
}

function updatePile(player, pile) {
  if (player.spectating) {
    io.in(player.id).emit('updatePileSpectator', pile.map(cardName).join(''));
  }
  else {
    io.in(player.id).emit('updatePile', player.pileLength);
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
  r == Joker ? '?' : String.fromCharCode(48 + r);

const cardNum = c =>
  c == 'T' ? Ten :
  c == 'J' ? Jack :
  c == 'Q' ? Queen :
  c == 'K' ? King :
  c == 'A' ? Ace :
  c == '?' ? Joker : parseInt(c);

const sayRegExp = /^([2-9]|[TJQKA])\1*$/;

function tryPlay(player, str, pile) {
  let cards = Array.from(str).map(cardNum).sort(asc);
  const toPile = [];
  const hand = player.hand.filter(card => {
    if ( cards.length > 0 && card == cards[0] ) {
      toPile.push(cards.shift());
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
    Array.prototype.push.apply(pile, toPile);
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
    game.ended = true;
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

const cardsSpan = s => '<span class=cards>' + s + '</span>';

function formatMove(entry, forWhom, spectating) {
  if (entry.who) {
    let result = entry.who + ' claims ' + cardsSpan(entry.say) + ' (';
    if ( entry.who == forWhom || spectating ) {
      result += 'actually ' + cardsSpan(entry.act)
    }
    else {
      if(!entry.obs.has(forWhom)) {
        entry.obs.set(forWhom, noisyObservation(entry.act.length));
      }
      result += 'looks like ' + '🂠'.repeat(entry.obs.get(forWhom))
    }
    return result + ')'
  }
  else {
    return entry.bluff ? entry.msg : entry;
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
      game = { players: [],
               spectators: [],
               members: [] };
      games[gameName] = game;
    }
    else {
      game = games[gameName];
    }
    if (!data.playerName) {
      socket.playerName = 'Linbug'+Math.floor(Math.random()*20);
      console.log("* Generated random name: " + socket.playerName + " (" + socket.id +")");
    }
    else {
      socket.playerName = data.playerName;
    }
    if (game.started) {
      if (game.missingPlayers.has(socket.playerName)) {
        if (Object.keys(socket.rooms).length == 1) {
          socket.gameName = gameName;
          socket.join(gameName);
          game.missingPlayers.delete(socket.playerName);
          const player = game.players.find(player => player.name == socket.playerName);
          player.id = socket.id;
          updatePlayers(gameName);
          updatePile(player, game.pile);
          updateHand(player);
          if (!game.ended) {
            const current = game.players[game.whoseTurn];
            socket.emit('setCurrent', current.name);
            if (current.name == player.name) {
              socket.emit('showMove');
            }
            const last = findLastPlay(game.log);
            if (last && last.who != player.name) {
              socket.emit('showBluff');
            }
          }
          for (const entry of game.log) {
            socket.emit('appendLog', formatMove(entry, player.name, player.spectating));
          }
          socket.emit('rejoinGame', player.name, player.spectating);
          if (player.spectating != data.spectate) {
            socket.emit('errorMsg', 'You cannot become a spectator: rejoined as player');
          }
        }
        else {
          socket.emit('errorMsg', 'Error: somehow this connection is already used in another game');
        }
      }
      else if (data.spectate) {
        if (game.members.every(player => player.name != socket.playerName)) {
          socket.gameName = gameName;
          socket.join(gameName);
          const player = { id: socket.id, name: socket.playerName, spectating: true };
          game.members.push(player);
          game.spectators.push(player);
          updatePlayers(gameName);
          if (!game.ended) {
            const current = game.players[game.whoseTurn];
            socket.emit('setCurrent', current.name);
          }
          for (const entry of game.log) {
            socket.emit('appendLog', formatMove(entry, player.name, player.spectating));
          }
          socket.emit('rejoinGame', player.name, player.spectating);
        }
        else {
          socket.emit('errorMsg', 'Game ' + gameName + ' already contains member ' + socket.playerName);
        }
      }
      else {
        socket.emit('errorMsg', 'Game ' + gameName + ' has already started. Try spectating.');
      }
    }
    else {
      if (game.members.every(player => player.name != socket.playerName)) {
        socket.join(gameName);
        socket.gameName = gameName;
        const player = { id: socket.id, name: socket.playerName, spectating: data.spectate };
        game.members.push(player);
        if (!data.spectate) { game.players.push(player); } else { game.spectators.push(player); }
        socket.emit('joinGame', {gameName: gameName, playerName: socket.playerName});
        updatePlayers(gameName);
        console.log("* Active games: " + Object.keys(games).join(', '));
      }
      else {
        console.log('* Failed to join game: player name taken');
        socket.emit('errorMsg', 'Game ' + gameName + ' already contains member ' + socket.playerName);
      }
    }
  });

  socket.on('startGame', () => {
    const gameName = socket.gameName;
    const game = games[gameName];
    if (game.players.length > 1) {
      console.log('* Game starting: ' + gameName);
      game.started = true;
      game.pile = [];
      game.missingPlayers = new Set();
      game.log = [];
      console.log('* Shuffling deck and players: ' + gameName);
      const deck = makeDeck();
      shuffleInPlace(deck);
      shuffleInPlace(game.players);
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
      for (const player of game.members) {
        player.pileLength = 0;
        updatePile(player, game.pile);
        if (!player.spectating) {
          player.hand.sort(asc);
          player.handLength = new Map();
          for (const other of game.players) {
            if (player.name != other.name) {
              player.handLength[other.name] = noisyObservation(other.hand.length);
            }
          }
        }
      }
      console.log('* Ready: ' + gameName);
      game.whoseTurn = 0;
      io.in(gameName).emit('startGame');
      game.log.push('The game begins!');
      io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
      updateHands(game);
      updatePlayers(gameName);
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
      let loserName;
      if (legit) {
        game.log.push('but ' + last.who + ' had innocently played ' + cardsSpan(last.act));
        io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
        loserName = socket.playerName;
      }
      else {
        game.log.push('and catches them bluffing with ' + cardsSpan(last.act));
        io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
        loserName = last.who;
      }
      game.log.push({bluff: true, msg: loserName + ' takes the pile to hand'});
      io.in(gameName).emit('appendLog', game.log[game.log.length - 1].msg);
      const loser = game.players.find(player => player.name == loserName);
      loser.hand = loser.hand.concat(game.pile).sort(asc);
      game.pile = [];
      for (const player of game.members) {
        player.pileLength = 0;
        updatePile(player, game.pile);
        if (player.name != loserName && !player.spectating) {
          player.handLength[loserName] = noisyObservation(loser.hand.length);
        }
      }
      updateHand(loser);
      updatePlayers(gameName);
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
      const currentPlayer = game.players[game.whoseTurn];
      if ( sayRegExp.test(data.say) ) {
        if ( tryPlay(currentPlayer, data.play, game.pile) ) {
          const entry = {who: socket.playerName, say: data.say, act: data.play, obs: new Map()};
          game.log.push(entry);
          updateHand(currentPlayer);
          for (const player of game.members) {
            io.in(player.id).emit('appendLog', formatMove(entry, player.name, player.spectating));
            if(!player.spectating) {
              player.pileLength = noisyObservation(game.pile.length);
              if (player.name != currentPlayer.name) {
                player.handLength[currentPlayer.name] = noisyObservation(currentPlayer.hand.length);
              }
            }
            updatePile(player, game.pile);
          }
          socket.emit('hideMove');
          socket.emit('hideBluff');
          socket.to(gameName).emit('showBluff');
          game.whoseTurn++;
          if (game.whoseTurn == game.players.length) { game.whoseTurn = 0; }
          if (currentPlayer.hand.length == 0) {
            game.log.push(currentPlayer.name + ' wins unless they are caught...');
            io.in(gameName).emit('appendLog', game.log[game.log.length - 1]);
            io.in(gameName).emit('setCurrent');
            game.pendingWinner = currentPlayer;
          }
          else {
            changeTurn(gameName);
          }
          updatePlayers(gameName);
        }
        else {
          socket.emit('errorMsg', 'You cannot play that with your hand');
        }
      }
      else {
        socket.emit('errorMsg', 'What you say is not a valid claim');
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
        game.members = game.members.filter( player => player.name != socket.playerName );
        game.players = game.players.filter( player => player.name != socket.playerName );
        game.spectators = game.spectators.filter( player => player.name != socket.playerName );
        updatePlayers(socket.gameName);
        if(game.members.length == 0) {
          delete games[socket.gameName];
        }
      }
      else {
        const spectators = game.spectators.filter( player => player.name != socket.playerName );
        if (spectators.length < game.spectators.length) {
          game.members = game.members.filter( player => player.name != socket.playerName );
          game.spectators = spectators;
        }
        else {
          game.missingPlayers.add(socket.playerName);
        }
        updatePlayers(socket.gameName);
        if (game.ended && game.missingPlayers.size == game.players.length) {
          delete games[socket.gameName];
        }
      }
    }
    console.log("* Active games: " + Object.keys(games).join(', '));
  });

});
