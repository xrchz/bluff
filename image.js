'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'image'

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/${gname}.html`)
})
app.use(express.static(`${__dirname}/client`))

const config = require(`${__dirname}/client/config.js`)
const server = require('http').createServer(app)
const io = require('socket.io')(server)

const port = config.ServerPort(gname)
const unix = typeof port === 'string'
server.listen(port)
console.log(`server started on ${port}`)
if (unix)
  server.on('listening', () => fs.chmodSync(port, 0o777))

const saveFile = `${gname}.json`

const games = JSON.parse(fs.readFileSync(saveFile, 'utf8'))

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

function saveGames() {
  let toSave = {}
  for (const [gameName, game] of Object.entries(games))
    if (game.started) toSave[gameName] = game
  fs.writeFileSync(saveFile,
    JSON.stringify(
      toSave,
      (k, v) => k === 'socketId' ? null :
                k === 'spectators' ? [] : v))
}

function updateGames(room) {
  if (!room) room = 'lobby'
  const data = []
  for (const [gameName, game] of Object.entries(games))
    data.push({ name: gameName,
                players: game.players.map(player => ({ name: player.name, socketId: player.socketId }))
              })
  io.in(room).emit('updateGames', data)
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

const InitialMoves = 20
const Direction = 2
const Rotate = 3
const Character = 0
const Drawing = 1
const Cursor = 2

const rotateOnce = x => x << 1 & 0b1110 | x >> 3

function funpow(v, f, x) {
  while (v-- > 0) x = f(x)
  return x
}

const rotateChar = (v, c) =>
  funpow(v, rotateOnce, c)

const reflectArray = (v, a) =>
  funpow(v, a => {a.unshift(a.pop()); return a}, a.slice().reverse())

const reflectChar = (v, c) =>
  reflectArray(v, [0, 1, 2, 3].map(i => (c >> i) % 2)).reduceRight(
    (t, v) => 2 * t + v)

function makeDeck() {
  const deck = []
  for (let t = 0; t < 5; t++) {
    const vMax = t === Rotate ? 4 : 2
    for (let v = 0; v < vMax; v++)
      deck.push({t: t, v: v})
  }
  return deck
}

function appendLog(gameName, entry) {
  const game = games[gameName]
  game.log.push(entry)
  io.in(gameName).emit('appendLog', entry)
}

const stateKeys = {
  game: [
    'players', 'started',
    'moves', 'deck', 'rotation',
    'target', 'drawing', 'cursor',
    'scored', 'ended'
  ], deck: true, target: true, drawing: true,
  players: 'player',
  player: ['hand', 'current' ], hand: true
}

function copy(keys, from, to, restore) {
  for (const key of keys)
    if (key in from) {
      if (stateKeys[key] === true)
        to[key] = JSON.parse(JSON.stringify(from[key]))
      else if (stateKeys[key] in stateKeys) {
        if (!restore || !(key in to))
          to[key] = from[key].map(_ => ({}))
        for (let i = 0; i < from[key].length; i++)
          copy(stateKeys[stateKeys[key]], from[key][i], to[key][i], restore)
      }
      else if (stateKeys[key]) {
        if (!restore || !(key in to))
          to[key] = {}
        copy(stateKeys[key], from[key], to[key], restore)
      }
      else
        to[key] = from[key]
    }
    else if (restore && key in to)
      delete to[key]
}

function appendUndo(gameName) {
  const game = games[gameName]
  const entry = {}
  copy(stateKeys.game, game, entry)
  entry.logLength = game.log.length
  game.undoLog.push(entry)
  io.in(gameName).emit('showUndo', true)
}

function generateTarget() {
  const target = []
  for (let i = 0; i < 4; i++)
    target.push(Math.floor(Math.random() * 4 * 4))
  return target
}

function updateDrawing(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  io.in(roomName).emit('updateDrawing', { drawing: game.drawing, cursor: game.cursor })
}

function updateRemaining(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  io.in(roomName).emit('updateRemaining',
    { moves: game.moves,
      deck: game.deck,
      currentIndex: game.players.findIndex(player => player.current),
      rotation: game.rotation,
      scored: game.scored })
}

function nextTurn(gameName, playerIndex) {
  const game = games[gameName]
  if (game.ended)
    appendLog(gameName, `The game ends with a score of ${game.scored.length}.`)
  else
    game.players[(playerIndex + 1) % game.players.length].current = true
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
      socket.playerName = `Artist${Math.floor(Math.random()*20)}`
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
        game.spectators.push({ socketId: socket.id, name: socket.playerName })
        socket.emit('joinedGame',
          { gameName: gameName, playerName: socket.playerName, spectating: true })
        io.in(gameName).emit('updateSpectators', game.spectators)
        if (game.started) {
          socket.emit('gameStarted')
          socket.emit('updatePlayers', game.players)
          socket.emit('updateTarget', game.target)
          updateDrawing(gameName, socket.id)
          updateRemaining(gameName, socket.id)
          game.log.forEach(entry => socket.emit('appendLog', entry))
        }
        else
          socket.emit('updatePlayers', game.players)
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
          socket.emit('updateSpectators', game.spectators)
          socket.emit('gameStarted')
          io.in(gameName).emit('updatePlayers', game.players)
          socket.emit('updateTarget', game.target)
          updateDrawing(gameName, socket.id)
          updateRemaining(gameName, socket.id)
          game.log.forEach(entry => socket.emit('appendLog', entry))
          if (game.undoLog.length)
            socket.emit('showUndo', true)
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

  socket.on('undoRequest', () => inGame((gameName, game) => {
    if (game.started && game.undoLog.length) {
      const entry = game.undoLog.pop()
      copy(stateKeys.game, entry, game, true)
      io.in(gameName).emit('removeLog', game.log.length - entry.logLength)
      game.log.length = entry.logLength
      io.in(gameName).emit('updatePlayers', game.players)
      io.in(gameName).emit('updateTarget', game.target)
      updateDrawing(gameName)
      updateRemaining(gameName)
      if (!game.undoLog.length)
        io.in(gameName).emit('showUndo', false)
      io.in(gameName).emit('errorMsg', `${socket.playerName} pressed Undo.`)
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried to undo nothing`)
      socket.emit('errorMsg', 'Error: there is nothing to undo.')
    }
  }))

  socket.on('startGame', () => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.length >= 2) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.undoLog = []
        game.log = []
        game.deck = makeDeck()
        shuffleInPlace(game.deck)
        game.moves = InitialMoves
        game.rotation = 0
        game.players.forEach(player => player.hand = [])
        game.scored = []
        game.target = generateTarget()
        game.drawing = Array(4).fill(0)
        game.cursor = Math.floor(Math.random() * 4)
        game.players[Math.floor(Math.random() * game.players.length)].current = true
        io.in(gameName).emit('gameStarted')
        io.in(gameName).emit('updatePlayers', game.players)
        io.in(gameName).emit('updateTarget', game.target)
        updateDrawing(gameName)
        updateRemaining(gameName)
        appendLog(gameName, 'The game begins!')
        updateGames()
      }
      else {
        console.log(`${socket.playerName} attempted to start ${gameName} without 2 players`)
        socket.emit('errorMsg', `Error: ${gameName} needs at least 2 players to start.`)
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('playRequest', cardIndex => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && player.current) {
        if (Number.isInteger(cardIndex) && 0 <= cardIndex && cardIndex < player.hand.length) {
          appendUndo(gameName)
          delete player.current
          const card = player.hand.splice(cardIndex, 1)[0]
          const data = { playerName: player.name, cardIndex: cardIndex, card: card }
          if (card.t < Direction) {
            data.character = Math.pow(2, 2 * card.t + card.v)
            data.oldChar = game.drawing[game.cursor]
            data.newChar = data.oldChar ^ data.character
            game.drawing[game.cursor] = data.newChar
          }
          else if (card.t === Direction) {
            data.oldRotation = game.rotation
            data.direction = card.v * 2 - 1
            game.rotation += data.direction
            game.rotation = ((game.rotation % 4) + 4) % 4
            data.newRotation = game.rotation
          }
          else if (card.t === Rotate) {
            data.rotation = game.rotation
            if (card.v === Character) {
              data.oldChar = game.drawing[game.cursor]
              data.newChar = rotateChar(data.rotation, data.oldChar)
              game.drawing[game.cursor] = data.newChar
            }
            else if (card.v === Drawing) {
              const newDrawing = Array(4)
              let i = data.rotation
              for (const c of game.drawing) {
                newDrawing[i] = rotateChar(data.rotation, c)
                if (++i === 4) i = 0
              }
              game.drawing = newDrawing
            }
            else if (card.v === Cursor) {
              data.oldCursor = game.cursor
              game.cursor += data.rotation
              game.cursor %= 4
              data.newCursor = game.cursor
            }
            else {
              data.targetCursor = (game.cursor + data.rotation) % 4
              data.sourceChar = game.drawing[game.cursor]
              data.targetChar = game.drawing[data.targetCursor]
              game.drawing[data.targetCursor] = data.sourceChar ^ data.targetChar
              data.newChar = game.drawing[data.targetCursor]
            }
          }
          else {
            data.reflection = game.rotation
            if (card.v === Character) {
              data.oldChar = game.drawing[game.cursor]
              data.newChar = reflectChar(data.reflection, data.oldChar)
              game.drawing[game.cursor] = data.newChar
            }
            else
              game.drawing = reflectArray(data.reflection, game.drawing).map(
                c => reflectChar(data.reflection, c))
          }
          appendLog(gameName, data)
          if (!--game.moves) game.ended = true
          if (game.drawing.every((c, i) => c === game.target[i])) {
            appendLog(gameName, `The target is achieved!`)
            game.scored.push(game.target)
            if (game.ended) {
              delete game.target
              delete game.drawing
              delete game.cursor
            }
            else {
              game.target = generateTarget()
              game.drawing = Array(4).fill(0)
              game.cursor = Math.floor(Math.random() * 4)
              io.in(gameName).emit('updateTarget', game.target)
            }
          }
          nextTurn(gameName, playerIndex)
          updateDrawing(gameName)
          io.in(gameName).emit('updatePlayers', game.players)
          updateRemaining(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} made an invalid play`)
          socket.emit('errorMsg', `Error: that is not a valid play.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found or not current`)
        socket.emit('errorMsg', 'Error: it is not your turn.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried moving before start`)
      socket.emit('errorMsg', `Error: game has not started.`)
    }
  }))

  socket.on('drawRequest', targetIndex => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && player.current) {
        if (Number.isInteger(targetIndex) && 0 <= targetIndex &&
            targetIndex < game.players.length && targetIndex !== playerIndex) {
          appendUndo(gameName)
          delete player.current
          const card = game.deck[0]
          const target = game.players[targetIndex]
          target.hand.push(card)
          appendLog(gameName, {'playerName': player.name, 'targetName': target.name, 'card': card})
          if (!--game.moves) game.ended = true
          nextTurn(gameName, playerIndex)
          io.in(gameName).emit('updatePlayers', game.players)
          updateRemaining(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} made an invalid draw`)
          socket.emit('errorMsg', `Error: that is not a valid draw.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found or not current`)
        socket.emit('errorMsg', 'Error: it is not your turn.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried drawing before start`)
      socket.emit('errorMsg', `Error: game has not started.`)
    }
  }))

  socket.on('shiftRequest', cardIndex => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && player.current) {
        if (Number.isInteger(cardIndex) && 0 <= cardIndex && cardIndex < game.deck.length) {
          appendUndo(gameName)
          delete player.current
          const card = game.deck.splice(cardIndex, 1)[0]
          cardIndex = cardIndex ? cardIndex - 1 : game.deck.length
          game.deck.splice(cardIndex, 0, card)
          appendLog(gameName, {playerName: player.name, card: card})
          if (!--game.moves) game.ended = true
          nextTurn(gameName, playerIndex)
          io.in(gameName).emit('updatePlayers', game.players)
          updateRemaining(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} made an invalid shift`)
          socket.emit('errorMsg', `Error: that is not a valid shift.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found or not current`)
        socket.emit('errorMsg', 'Error: it is not your turn.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried shifting before start`)
      socket.emit('errorMsg', `Error: game has not started.`)
    }
  }))

  socket.on('disconnecting', () => {
    console.log(`${socket.playerName} exiting ${socket.gameName}`)
    const gameName = socket.gameName
    const game = games[gameName]
    if (game) {
      if (!game.started) {
        game.players = game.players.filter(player => player.socketId !== socket.id)
        game.spectators = game.spectators.filter(player => player.socketId !== socket.id)
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
          const player = game.players.find(player => player.socketId === socket.id)
          if (player) {
            player.socketId = null
            io.in(gameName).emit('updatePlayers', game.players)
          }
        }
      }
      updateGames()
    }
  })

  socket.on('deleteGame', gameName => {
    delete games[gameName]
    updateGames()
  })

  socket.on('saveGames', saveGames)
})

process.on('SIGINT', () => { saveGames(); if (unix) fs.unlinkSync(port); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)
