'use strict'

const express = require('express')
const https = require('https')
const fs = require('fs')
const options = {
  key: fs.readFileSync('/etc/ssl/xrchz/key.pem'),
  cert: fs.readFileSync('/etc/ssl/xrchz/cert.pem')
};
var app = express()
var server = https.createServer(options, app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/500.html`)
})
app.use(express.static(`${__dirname}/client`))

const port = 4500
server.listen(port, "0.0.0.0")
console.log(`server started on https://xrchz.net:${port}`)

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

const randomLetter = () => String.fromCharCode(65 + Math.random() * 26)

function randomUnusedGameName() {
  if (Object.keys(games).length == 26 * 26) {
    console.log('all game names in use')
    return 'Overflow'
  }
  let name
  do { name = randomLetter() + randomLetter() } while (name in games)
  return name
}

const games = {}

const cardsSpan = s => '<span class=cards>' + s + '</span>'

function formatPlayer(player, trump, forWhom, current, disconnected) {
  let s = player.name
  if (player.hand && forWhom.spectating) {
    s += ' ' + cardsSpan(player.hand.map(formatCard(trump)).join(''))
  }
  let classes = []
  let annots = []
  if (disconnected) { classes.push('disconnected'); annots.push('(d/c)') }
  if (current) { classes.push('current'); annots.push('(*)') }
  if (classes.length) {
    s = `<span class="${classes.join(' ')}">${s} ${annots.join(' ')}</span>`
  }
  return s
}

function updatePlayers(gameName) {
  const game = games[gameName]
  const isDisconnected = game.missingPlayers ?
    player => game.missingPlayers.has(player.name) : player => false
  const currentName = (game.started && !game.ended) ? game.players[game.whoseTurn].name : null
  const trump = game.trump ? game.trump : NoTrumps
  for (const forWhom of game.members) {
    let players = []
    if (isDisconnected(forWhom)) { continue }
    for (const player of game.players) {
      players.push(formatPlayer(player, trump, forWhom, player.name == currentName, isDisconnected(player)))
    }
    players = players.map(x => `<li>${x}</li>`).join('')
    const spectators = game.spectators.map(x => `<li class="spectator">${x.name} (s)</li>`).join('')
    io.in(forWhom.id).emit('updatePlayers', `<ul>${players}${spectators}</ul>`)
  }
}

function changeTurn(gameName) {
  const game = games[gameName]
  const player = game.players[game.whoseTurn]
  io.in(gameName).emit('setCurrent', player.name)
}

const Ten   = 10
const Jack  = 11
const Queen = 12
const King  = 13
const Ace   = 14
const LeftBower = 14.4
const RightBower = 14.8
const Joker = 15

const Spades = 1
const Clubs = 2
const Diamonds = 3
const Hearts = 4
const NoTrumps = 5

function makeDeck() {
  const deck = []
  for (let suit = Spades; suit <= Clubs; suit++) {
    for (let rank = 5; rank <= Ace; rank++) {
      deck.push({ rank: rank, suit: suit })
    }
  }
  for (let suit = Diamonds; suit <= Hearts; suit++) {
    for (let rank = 4; rank <= Ace; rank++) {
      deck.push({ rank: rank, suit: suit })
    }
  }
  deck.push({ rank: Joker })
  return deck
}

function clockwise(playerIndex) {
  playerIndex++
  if (playerIndex == 4) playerIndex = 0
  return playerIndex
}

function reorderCard(c, trump) {
  let suit = c.suit
  let rank = c.rank
  if (rank == Jack) {
    if (suit == trump) {
      rank = RightBower
    }
    else if ((suit + 2) % 4 == trump) {
      rank = LeftBower
    }
  }
  else if (rank == Joker) {
    suit = trump
  }
  if (suit == trump) { suit = NoTrumps }
  return { rank: rank, suit: suit }
}

function bySuit (trump) {
  if (trump == NoTrumps) {
    function cmp (c1, c2) {
      if (c1.suit == c2.suit) {
        return c1.rank - c2.rank
      }
      else if (c1.rank == Joker || c2.rank == Joker) {
        return c1.rank == Joker ? (c2.rank == Joker ? 0 : 1) : -1
      }
      else {
        return c1.suit - c2.suit
      }
    }
    return cmp
  }
  else {
    function cmp (c1, c2) {
      let x1 = reorderCard(c1, trump)
      let x2 = reorderCard(c2, trump)
      if (x1.suit == x2.suit) {
        return x1.rank - x2.rank
      }
      else {
        return x1.suit - x2.suit
      }
    }
    return cmp
  }
}

function formatMove(entry, forWhom) {
  return entry
}

function deal(game) {
  const deck = makeDeck()
  shuffleInPlace(deck)
  for (const player of game.players) {
    player.hand = []
  }
  game.kitty = []
  function dealRound(numCards) {
    let dealTo = game.dealer
    do {
      dealTo = clockwise(dealTo)
      let left = numCards
      while (left-- > 0) {
        game.players[dealTo].hand.push(deck.shift())
      }
    } while (dealTo != game.dealer)
    game.kitty.push(deck.shift())
  }
  dealRound(3)
  dealRound(4)
  dealRound(3)
  for (const player of game.players) {
    player.hand.sort(bySuit(NoTrumps))
  }
}

const formatCard = trump => {
  return c => {
    const suit = reorderCard(c, trump).suit
    let str
    if (c.rank == Joker) {
      str = '\u{1F0DF}'
    }
    else {
      let codepoint = 0x1F000
      codepoint += c.suit == Spades ? 0xA0 :
        c.suit == Hearts ? 0xB0 :
        c.suit == Diamonds ? 0xC0 :
        c.suit == Clubs ? 0xD0 : 0xE0
      codepoint += c.rank == Ace ? 1 :
        c.rank <= Jack ? c.rank : c.rank + 1
      str = String.fromCodePoint(codepoint)
    }
    const cls = []
    if (suit == Spades) { cls.push('spades') }
    if (suit == Clubs) { cls.push('clubs') }
    if (suit == Diamonds) { cls.push('diamonds') }
    if (suit == Hearts) { cls.push('hearts') }
    if (cls) {
      return `<span class="${cls.join(' ')}">${str}</span>`
    }
    else {
      return str
    }
  }
}

io.on('connection', socket => {
  console.log(`new connection ${socket.id}`)

  socket.on('joinRequest', data => {
    let game
    let gameName = data.gameName
    if (!gameName) {
      gameName = randomUnusedGameName(games)
    }
    if (!(gameName in games)) {
      console.log(`new game ${gameName}`)
      game = { seats: [{}, {}, {}, {}],
               players: [],
               spectators: [] }
      games[gameName] = game
    }
    else {
      game = games[gameName]
    }
    if (!data.playerName) {
      socket.playerName = 'Bauer'+Math.floor(Math.random()*20)
      console.log(`random name ${socket.playerName} for ${socket.id}`)
    }
    else {
      socket.playerName = data.playerName
      console.log(`name ${socket.playerName} supplied for ${socket.id}`)
    }
    if (data.spectate) {
      if (game.spectators.every(spectator => spectator.name != socket.playerName)) {
        console.log(`${socket.playerName} joining ${gameName} as spectator`)
        socket.gameName = gameName
        socket.join(gameName)
        const spectator = { id: socket.id, name: socket.playerName }
        game.spectators.push(spectator)
        io.in(gameName).emit('updateSpectators', game.spectators)
        // update game situation for spectator
        socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName, spectating: true })
        if (!game.started) { socket.emit('updateUnseated', game.players) }
        socket.emit('updateSeats', { seats: game.seats, missingPlayers: game.missingPlayers })
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate spectator`)
        socket.emit('errorMsg', 'Game ' + gameName + ' already contains spectator ' + socket.playerName)
      }
    }
    else if (game.started) {
      if (game.missingPlayers.has(socket.playerName)) {
        if (Object.keys(socket.rooms).length == 1) {
          console.log(`${socket.playerName} rejoining ${gameName}`)
          socket.gameName = gameName
          socket.join(gameName)
          game.missingPlayers.delete(socket.playerName)
          const player = game.players.find(player => player.name == socket.playerName)
          player.id = socket.id
          io.in(gameName).emit('updateSeats', { seats: game.seats, missingPlayers: game.missingPlayers })
          // update game situation for rejoined player
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          socket.emit('updateSpectators', game.spectators)
        }
        else {
          console.log(`error: ${socket.playerName} rejoining ${gameName} while in other rooms`)
          socket.emit('errorMsg', 'Error: somehow this connection is already used in another game')
        }
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as extra player`)
        socket.emit('errorMsg', 'Game ' + gameName + ' has already started. Try spectating.')
      }
    }
    else {
      if (game.players.every(player => player.name != socket.playerName)) {
        console.log(`${socket.playerName} joining ${gameName}`)
        socket.join(gameName)
        socket.gameName = gameName
        const player = { id: socket.id, name: socket.playerName }
        game.players.push(player)
        socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
        socket.emit('updateSpectators', game.spectators)
        io.in(gameName).emit('updateUnseated', game.players)
        io.in(gameName).emit('updateSeats', { seats: game.seats, missingPlayers: game.missingPlayers })
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate player`)
        socket.emit('errorMsg', 'Game ' + gameName + ' already contains player ' + socket.playerName)
      }
    }
    console.log("active games: " + Object.keys(games).join(', '))
  })

  socket.on('sitHere', data => {
    const gameName = socket.gameName
    const game = games[gameName]
    if (!game.started) {
      const seat = game.seats[data.seatIndex]
      if (seat) {
        if (!seat.player) {
          const player = game.players.find(player => player.name == data.playerName)
          if (player) {
            if (!player.seated) {
              seat.player = player
              player.seated = true
              io.in(gameName).emit('updateUnseated', game.players)
              io.in(gameName).emit('updateSeats', { seats: game.seats, missingPlayers: game.missingPlayers })
              console.log(`${socket.playerName} in ${gameName} took their seat`)
            }
            else {
              console.log(`error: ${socket.playerName} in ${gameName} tried to sit but is already seated`)
              socket.emit('errorMsg', 'Error: you are already seated')
            }
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried to sit but is not a player`)
            socket.emit('errorMsg', 'Error: a non-player cannot sit')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried sitting in an occupied seat`)
          socket.emit('errorMsg', 'Error: trying to sit in an occupied seat')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried sitting at invalid index ${data.seatIndex}`)
        socket.emit('errorMsg', 'Error: trying to sit at an invalid seat index')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried sitting when game already started`)
      socket.emit('errorMsg', 'Error: cannot sit after the game has started')
    }
  })

  socket.on('leaveSeat', () => {
    const gameName = socket.gameName
    const game = games[gameName]
    if (!game.started) {
      const player = game.players.find(player => player.name == socket.playerName)
      if (player) {
        if (player.seated) {
          const seat = game.seats.find(seat => seat.player && seat.player.name == player.name)
          if (seat) {
            delete seat.player
            player.seated = false
            io.in(gameName).emit('updateUnseated', game.players)
            io.in(gameName).emit('updateSeats', { seats: game.seats, missingPlayers: game.missingPlayers })
            console.log(`${socket.playerName} in ${gameName} left their seat`)
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} is tried to leave seat but no seat has them`)
            socket.emit('errorMsg', 'Error: could not find you in any seat')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} is not seated but tried to leave their seat`)
          socket.emit('errorMsg', 'Error: you are not seated so cannot leave your seat')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} is not a player but tried to leave a seat`)
        socket.emit('errorMsg', 'Error: non-player trying to leave seat')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried leaving seat when game already started`)
      socket.emit('errorMsg', 'Error: cannot leave seat after the game has started')
    }
  })

  socket.on('startGame', () => {
    const gameName = socket.gameName;
    const game = games[gameName];
    if (game.players.length == 4) {
      console.log(`starting ${gameName}`)
      game.started = true
      game.missingPlayers = new Set()
      game.log = []
      game.lastActivity = Date.now()
      game.timeout = setInterval(game => {
        if (game.missingPlayers.size == game.players.length &&
            Date.now() - game.lastActivity > 30 * 60 * 1000) {
          console.log(`ending ${gameName} due to inactivity`)
          clearInterval(game.timeout)
          delete games[gameName]
        }
      }, 60 * 60 * 1000, game)
      game.dealer = Math.floor(Math.random() * 4)
      deal(game)
      game.bidding = true
      game.whoseTurn = clockwise(game.dealer)
      io.in(gameName).emit('gameStarted')
      game.log.push('The game begins!')
      io.in(gameName).emit('appendLog', game.log[game.log.length - 1])
      updatePlayers(gameName)
      changeTurn(gameName)
    }
    else {
      socket.emit('errorMsg', 'Exactly 4 players required to start the game')
    }
  })

  socket.on('disconnecting', () => {
    console.log(`${socket.playerName} exiting ${socket.gameName}`)
    const gameName = socket.gameName
    const game = games[gameName]
    if (game) {
      if (!game.started) {
        game.players = game.players.filter( player => player.name != socket.playerName )
        game.spectators = game.spectators.filter( player => player.name != socket.playerName )
        io.in(gameName).emit('updateSpectators', game.spectators)
        io.in(gameName).emit('updateSeats', { seats: game.seats, missingPlayers: game.missingPlayers })
        io.in(gameName).emit('updateUnseated', game.players)
        if (game.players.length == 0 && game.spectators.length == 0) {
          console.log(`removing empty game ${gameName}`)
          delete games[gameName]
        }
      }
      else {
        const spectators = game.spectators.filter( player => player.name != socket.playerName )
        if (spectators.length < game.spectators.length) {
          game.spectators = spectators
          io.in(gameName).emit('updateSpectators', game.spectators)
        }
        else {
          game.missingPlayers.add(socket.playerName)
          io.in(gameName).emit('updateSeats', { seats: game.seats, missingPlayers: game.missingPlayers })
        }
        if (game.ended && game.missingPlayers.size == game.players.length) {
          console.log(`removing finished game ${gameName}`)
          delete games[gameName]
        }
      }
    }
    console.log("active games: " + Object.keys(games).join(', '))
  })
})