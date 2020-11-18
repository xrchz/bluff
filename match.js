'use strict'

const express = require('express')
const http = require('http')
const fs = require('fs')
var app = express()
var server = http.createServer(app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/match.html`)
})
app.use(express.static(`${__dirname}/client`))

const unix = '/run/games/match.socket'
server.listen(unix)
console.log(`server started on ${unix}`)
server.on('listening', () => fs.chmodSync(unix, 0o777))
process.on('SIGINT', () => { fs.unlinkSync(unix); process.exit() })

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

const games = {}

const randomLetter = () => String.fromCharCode(65 + Math.random() * 26)

function randomUnusedGameName() {
  if (Object.keys(games).length === 26 * 26) {
    console.log('all game names in use')
    return 'Overflow'
  }
  let name
  do { name = randomLetter() + randomLetter() } while (name in games)
  return name
}

function updateGames(room) {
  if (!room) room = 'lobby'
  const data = []
  for (const [gameName, game] of Object.entries(games))
    data.push({ name: gameName,
                players: game.players.map(player => ({ name: player.name, disconnected: !player.socketId }))
              })
  io.in(room).emit('updateGames', data)
}

function makeDeck() {
  const deck = []
  for (let s = 1; s <= 3; s++)
    for (let c = 1; c <= 3; c++)
      for (let y = 1; y <= 3; y++)
        for (let n = 1; n <= 3; n++)
          deck.push(
            {symbol: s, colour: c, style: y, number: n})
  return deck
}

const findProblems = cards =>
  (['colour', 'number', 'symbol', 'style']).filter(key =>
    (new Set(cards.map(card => card[key]))).size === 2)

function checkForMatch(grid) {
  for (let i = 0; i < grid.length; i++)
    if (grid[i])
      for (let j = 0; j < i; j++)
        if (grid[j])
          for (let k = 0; k < j; k++)
            if (grid[k])
              if (!findProblems([grid[i], grid[j], grid[k]]).length)
                return true
  return false
}

io.on('connection', socket => {
  console.log(`new connection ${socket.id}`)

  socket.emit('ensureLobby')
  socket.join('lobby'); updateGames(socket.id)

  socket.on('joinRequest', data => {
    let game
    let gameName = data.gameName
    if (!gameName) gameName = randomUnusedGameName()
    if (!(gameName in games)) {
      console.log(`new game ${gameName}`)
      game = { players: [], spectators: [] }
      games[gameName] = game
    }
    else
      game = games[gameName]
    if (!data.playerName) {
      socket.playerName = `Pattern${Math.floor(Math.random()*20)}`
      console.log(`random name ${socket.playerName} for ${socket.id}`)
    }
    else {
      socket.playerName = data.playerName
      console.log(`name ${socket.playerName} supplied for ${socket.id}`)
    }
    if (data.spectate) {
      if (game.spectators.every(spectator => spectator.name !== socket.playerName)) {
        console.log(`${socket.playerName} joining ${gameName} as spectator`)
        socket.gameName = gameName
        socket.leave('lobby'); socket.emit('updateGames', [])
        socket.join(gameName)
        socket.join(`${gameName}spectators`)
        game.spectators.push({ socketId: socket.id, name: socket.playerName })
        socket.emit('joinedGame',
          { gameName: gameName, playerName: socket.playerName, spectating: true })
        // updateSettings(game, socket.id)
        io.in(gameName).emit('updateSpectators', game.spectators)
        socket.emit('updatePlayers', game.players)
        if (game.started) {
          socket.emit('gameStarted')
          socket.emit('updateGrid', game.grid)
          socket.emit('updateCardsLeft', game.deck.length)
        }
        if (game.ended)
          socket.emit('gameOver')
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate spectator`)
        socket.emit('errorMsg', `Game ${gameName} already contains spectator ${socket.playerName}.`)
      }
    }
    else if (game.started) {
      if (game.players.find(player => player.name === socket.playerName && !player.socketId)) {
        const rooms = Object.keys(socket.rooms)
        if (rooms.length === 2 && rooms.includes(socket.id) && rooms.includes('lobby')) {
          console.log(`${socket.playerName} rejoining ${gameName}`)
          socket.gameName = gameName
          socket.leave('lobby'); socket.emit('updateGames', [])
          socket.join(gameName)
          const player = game.players.find(player => player.name === socket.playerName)
          player.socketId = socket.id
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          // updateSettings(game, socket.id)
          socket.emit('updateSpectators', game.spectators)
          io.in(gameName).emit('updatePlayers', game.players)
          socket.emit('gameStarted')
          socket.emit('updateGrid', game.grid)
          socket.emit('updateCardsLeft', game.deck.length)
          if (game.ended) socket.emit('gameOver')
        }
        else {
          console.log(`error: ${socket.playerName} rejoining ${gameName} while in ${rooms}`)
          socket.emit('errorMsg', 'Error: somehow this connection is already used in another game.')
        }
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as extra player`)
        socket.emit('errorMsg', `Game ${gameName} has already started. Try spectating.`)
      }
    }
    else {
      if (game.players.every(player => player.name !== socket.playerName)) {
        console.log(`${socket.playerName} joining ${gameName}`)
        socket.leave('lobby'); socket.emit('updateGames', [])
        socket.join(gameName)
        socket.gameName = gameName
        game.players.push({ socketId: socket.id, name: socket.playerName })
        socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
        // updateSettings(game, socket.id)
        socket.emit('updateSpectators', game.spectators)
        io.in(gameName).emit('updatePlayers', game.players)
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate player`)
        socket.emit('errorMsg', `Game ${gameName} already contains player ${socket.playerName}.`)
      }
    }
    updateGames()
  })

  function inGame(func) {
    const gameName = socket.gameName
    const game = games[gameName]
    if (game) func(gameName, game)
    else {
      console.log(`${socket.playerName} failed to find game ${gameName}`)
      socket.emit('errorMsg', `Game ${gameName} not found. Try reconnecting.`)
    }
  }

  socket.on('startGame', () => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.length) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.deck = makeDeck();
        shuffleInPlace(game.deck);
        game.grid = [];
        for (let i = 0; i < 12; i++) game.grid.push(game.deck.pop())
        game.players.forEach(player => {
          player.matches = []
          player.mismatches = 0
          player.claims = 0
          player.misclaims = 0
        })
        io.in(gameName).emit('gameStarted')
        io.in(gameName).emit('updateGrid', game.grid)
        io.in(gameName).emit('updatePlayers', game.players)
        io.in(gameName).emit('updateCardsLeft', game.deck.length)
      }
      else {
        socket.emit('errorMsg', 'Error: not enough players to start.')
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('matchRequest', selected => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const player = game.players.find(player => player.socketId === socket.id)
      if (player) {
        if (Array.isArray(selected) && selected.length === 3 &&
            selected.every(i => Number.isInteger(i) && 0 <= i && i < 12 && game.grid[i])) {
          const cards = selected.map(i => game.grid[i])
          const problems = findProblems(cards).map(s => `${s}s`)
          if (problems.length) {
            player.mismatches++
            const s = problems.slice(0, -1).join(', ') +
              (problems.length > 1 ? ' and ' : '') + problems.slice(-1)[0]
            io.in(gameName).emit('updatePlayers', game.players)
            socket.emit('infoMsg', `${s.charAt(0).toUpperCase()}${s.slice(1)} must all match or all differ.`)
          }
          else {
            player.matches.push(cards)
            if (game.deck.length >= 3)
              selected.forEach(i => game.grid[i] = game.deck.pop())
            else
              selected.forEach(i => delete game.grid[i])
            delete game.matchExists
            io.in(gameName).emit('updateGrid', game.grid)
            io.in(gameName).emit('updatePlayers', game.players)
            io.in(gameName).emit('updateCardsLeft', game.deck.length)
          }
        }
        else {
          console.log(`${socket.playerName} submitted invalid selection`)
          socket.emit('errorMsg', `Error: invalid selection data.`)
        }
      }
      else {
        console.log(`${socket.playerName} not found as player in ${gameName} when selecting`)
        socket.emit('errorMsg', `Error: could not find you as a player.`)
      }
    }
    else {
      console.log(`${socket.playerName} selecting in not active ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} has not started or has finished.`)
    }
  }))

  socket.on('claimRequest', () => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const player = game.players.find(player => player.socketId === socket.id)
      if (player) {
        if (game.matchExists === undefined)
          game.matchExists = checkForMatch(game.grid)
        if (game.matchExists) {
          player.misclaims++
          io.in(gameName).emit('updatePlayers', game.players)
          socket.emit('infoMsg', `A match is present.`)
        }
        else if (game.deck.length) {
          while (game.grid.length) {
            const card = game.grid.pop()
            if (card) game.deck.push(card)
          }
          shuffleInPlace(game.deck)
          for (let i = 0; i < 12 && game.deck.length; i++)
            game.grid.push(game.deck.pop())
          delete game.matchExists
          player.claims++
          io.in(gameName).emit('updatePlayers', game.players)
          io.in(gameName).emit('updateGrid', game.grid)
        }
        else {
          game.ended = true
          player.claims++
          io.in(gameName).emit('updatePlayers', game.players)
          io.in(gameName).emit('gameOver')
        }
      }
      else {
        console.log(`${socket.playerName} not found as player in ${gameName} when claiming`)
        socket.emit('errorMsg', `Error: could not find you as a player.`)
      }
    }
    else {
      console.log(`${socket.playerName} claiming in not active ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} has not started or has finished.`)
    }
  }))

  socket.on('pauseRequest', () => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      if (!game.paused) {
        game.paused = true
        io.in(gameName).emit('showPause', { show: true, text: 'Resume' })
      }
      else {
        delete game.paused
        io.in(gameName).emit('showPause', { show: true, text: 'Pause' })
      }
    }
    else {
      console.log(`${socket.playerName} tried to pause ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} not active.`)
    }
  }))

  socket.on('disconnecting', () => {
    console.log(`${socket.playerName} exiting ${socket.gameName}`)
    const gameName = socket.gameName
    const game = games[gameName]
    if (game) {
      if (!game.started) {
        const notThisPlayer = player => player.socketId !== socket.id
        game.players = game.players.filter(notThisPlayer)
        game.spectators = game.spectators.filter(notThisPlayer)
        io.in(gameName).emit('updateSpectators', game.spectators)
        io.in(gameName).emit('updatePlayers', game.players)
        if (game.players.length === 0 && game.spectators.length === 0) {
          console.log(`removing empty game ${gameName}`)
          delete games[gameName]
        }
      }
      else {
        const spectators = game.spectators.filter(player => player.socketId !== socket.id)
        if (spectators.length < game.spectators.length) {
          game.spectators = spectators
          io.in(gameName).emit('updateSpectators', game.spectators)
        }
        else {
          game.players.find(player => player.socketId === socket.id).socketId = null
          io.in(gameName).emit('updatePlayers', game.players)
        }
      }
      updateGames()
    }
  })
})
