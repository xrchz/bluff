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

const MaxClues = 8
const CardMultiplicity = 5
const Horizontal = 0
const Vertical = 1
const Direction = 2
const Referent = 3
const Cursor = -1
const Nothing = 0
const Drawing = 1

function rotateOnce(x) {
  const l = (x >> 0) % 2
  const r = (x >> 1) % 2
  const u = (x >> 2) % 2
  const d = (x >> 3) % 2
  return 8 * r + 4 * l + 2 * u + 1 * d
}

function rotateChar(v, c) {
  while (v-- > 0) c = rotateOnce(c)
  return c
}

function makeDeck() {
  const deck = []
  for (let t = 0; t < 4; t++)
    for (let b = 0; b < 2; b++)
      for (let n = 0; n < CardMultiplicity; n++)
        deck.push({t: t, b: b})
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
    'deck', 'clues',
    'target', 'drawing', 'cursor',
    'scored', 'ended'
  ], deck: true, target: true, drawing: true,
  players: 'player',
  player: ['hand' ], hand: true
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
  io.in(roomName).emit('updateRemaining', { cards: game.deck.length, clues: game.clues, scored: game.scored })
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
        game.clues = MaxClues
        game.players.forEach(player => player.hand = [])
        const handSize = game.players.length < 4 ? 5 : 4
        for (let i = 0; i < handSize; i++)
          game.players.forEach(player => player.hand.push(game.deck.pop()))
        game.scored = []
        game.target = generateTarget()
        game.drawing = Array(4).fill(0)
        game.cursor = Math.floor(Math.random() * 4)
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

  socket.on('moveRequest', data => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      if (0 <= playerIndex) {
        if (Number.isInteger(data.player) && 0 <= data.player && data.player < game.players.length &&
            Number.isInteger(data.card) && 0 <= data.card && data.card < game.players[data.player].hand.length) {
          const player = game.players[playerIndex]
          player.move = data
          player.move.mover = playerIndex
          if (game.players.every(player => player.move)) {
            appendUndo(gameName)
            const clueAttempts = game.players.flatMap(player =>
              player.move.player === player.move.mover ? [] : [player.move])
            if (clueAttempts.length <= game.clues) {
              // TODO: clue all cards of the same type
              // TODO: add negative clues
              clueAttempts.forEach(clue => {
                clue.revealedCard = game.players[clue.player].hand[clue.card]
                clue.revealedCard.r = true
              })
              game.clues -= clueAttempts.length
              appendLog(gameName, {'cluesRevealed': clueAttempts})
            }
            else {
              appendLog(gameName, {'cluesDiscarded': clueAttempts})
            }
            const playAttempts = game.players.flatMap(player =>
              player.move.player === player.move.mover ? [player.move] : [])
            if (playAttempts.length <= game.deck.length) {
              playAttempts.forEach(play =>
                play.playedCard = game.players[play.player].hand.splice(play.card, 1, game.deck.pop())[0])
              appendLog(gameName, {'playsPlayed': playAttempts})
              const characters = playAttempts.flatMap(play =>
                play.playedCard.t < 2 ?
                [Math.pow(2, 2 * play.playedCard.t + play.playedCard.b)]
                : [])
              const oldDrawing = game.drawing.slice()
              const oldChar = game.drawing[game.cursor]
              const newChar = characters.reduce((n, c) => n ^ c, oldChar)
              if (characters.length) appendLog(gameName, {'characters': characters, 'oldChar': oldChar, 'newChar': newChar})
              game.drawing[game.cursor] = newChar
              const reducer = (s, c) => s + (c * 2 - 1)
              const directions = playAttempts.flatMap(play => play.playedCard.t === Direction ? [play.playedCard.b] : [])
              const vector = directions.reduce(reducer, 0)
              if (directions.length) appendLog(gameName, {'directions': directions, 'vector': vector})
              const referents = playAttempts.flatMap(play => play.playedCard.t === Referent ? [play.playedCard.b] : [])
              const referent = Math.sign(referents.reduce(reducer, 0))
              if (referents.length) appendLog(gameName, {'referents': referents, 'referent': referent})
              if (referent === Cursor) {
                game.cursor += vector
                game.cursor = ((game.cursor % 4) + 4) % 4
                // TODO: log change of cursor
              }
              else if (referent === Drawing) {
                const newDrawing = Array(4)
                const modVector = ((vector % 4) + 4) % 4
                let i = modVector
                for (const c of game.drawing) {
                  newDrawing[i] = rotateChar(modVector, c)
                  if (++i === 4) i = 0
                }
                game.drawing = newDrawing
                // TODO: log change of drawing
              }
              // TODO: else log no movement
              const newlyCorrect = game.drawing.reduce((s, c, i) =>
                (oldDrawing[i] !== game.target[i]) && (c === game.target[i]) ? s + 1 : s, 0)
              if (newlyCorrect) {
                const newClues = Math.min(MaxClues - game.clues, newlyCorrect)
                appendLog(gameName, {newlyCorrect: newlyCorrect, newClues: newClues})
                game.clues += newClues
              }
              if (game.drawing.every((c, i) => c === game.target[i])) {
                appendLog(gameName, `The target is achieved!`)
                game.scored.push(game.target)
                if (game.deck.length) {
                  game.target = generateTarget()
                  game.drawing = Array(4).fill(0)
                  game.cursor = Math.floor(Math.random() * 4)
                }
                else {
                  delete game.target
                  delete game.drawing
                  delete game.cursor
                }
                socket.emit('updateTarget', game.target)
              }
              if (!game.deck.length) {
                appendLog(gameName, `The game ends with a score of ${game.scored.length}.`)
                game.ended = true
              }
              updateDrawing(gameName)
            }
            else {
              appendLog(gameName, {'playsDiscarded': playAttempts})
            }
            game.players.forEach(player => delete player.move)
            updateRemaining(gameName)
          }
          io.in(gameName).emit('updatePlayers', game.players)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} made an invalid move`)
          socket.emit('errorMsg', `Error: that is not a valid move.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found`)
        socket.emit('errorMsg', 'Error: player not found.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried moving before start`)
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
