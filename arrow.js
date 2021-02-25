'use strict'

const express = require('express')
const http = require('http')
const fs = require('fs')
var app = express()
var server = http.createServer(app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/arrow.html`)
})
app.use(express.static(`${__dirname}/client`))

const unix = '/run/games/arrow.socket'
server.listen(unix)
console.log(`server started on ${unix}`)
server.on('listening', () => fs.chmodSync(unix, 0o777))

const saveFile = 'arrow.json'

const games = JSON.parse(fs.readFileSync(saveFile, 'utf8'))

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

process.on('SIGINT', () => { saveGames(); fs.unlinkSync(unix); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)

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

function makePieces() {
  const pieces = []
  for (let d0 = 0; d0 < 2; d0++)
    for (let d1 = 0; d1 < 2; d1++)
      for (let d2 = 0; d2 < 2; d2++)
        for (let d3 = 0; d3 < 2; d3++)
          pieces.push({d: [d0, d1, d2, d3]})
  return pieces
}

function lineIndex(x, i, j) {
  if (x === 0) return 4 * i + j
  if (x === 1) return 4 * j + i
  if (x === 2 && i === 0) return 4 * j + j
  return 4 * j + (3 - j)
}

function markArrow(board) {
  for (let x = 0; x < 3; x++) {
    const imax = x < 2 ? 4 : 2
    for (let i = 0; i < imax; i++) {
      let ds = [0, 0, 0, 0]
      let j, d
      for (j = 0; j < 4; j++) {
        const k = lineIndex(x, i, j)
        if (!board[k]) { j = 5; break }
        for (d = 0; d < 4; d++)
          ds[d] += board[k].d[d]
      }
      if (j === 5) continue
      for (d = 0; d < 4; d++) {
        if (ds[d] === 0 || ds[d] === 4) {
          for (j = 0; j < 4; j++) {
            const k = lineIndex(x, i, j)
            board[k].arrow = true
          }
          return true
        }
      }
    }
  }
  return false
}

const stateKeys = {
  game: [
    'players', 'started', 'picking', 'dropping',
    'board', 'pieces', 'ended'
  ],
  board: true, pieces: true,
  players: [ 'current', 'winner' ]
}

function copy(keys, from, to, restore) {
  for (const key of keys)
    if (key in from) {
      if (stateKeys[key] === true)
        to[key] = JSON.parse(JSON.stringify(from[key]))
      else if (key === 'players') {
        if (!restore)
          to.players = from.players.map(_ => ({}))
        for (let i = 0; i < from.players.length; i++)
          copy(stateKeys.players, from.players[i], to.players[i], restore)
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
  game.undoLog.push(entry)
  io.in(gameName).emit('showUndo', true)
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
      socket.playerName = `Archer${Math.floor(Math.random()*20)}`
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
        io.in(gameName).emit('updateSpectators', game.spectators)
        socket.emit('updatePlayers', game.players)
        if (game.started) {
          socket.emit('gameStarted')
          socket.emit('updateBoard', game.board)
          socket.emit('updatePieces', { pieces: game.pieces })
        }
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
          io.in(gameName).emit('updatePlayers', game.players)
          socket.emit('gameStarted')
          socket.emit('updateBoard', game.board)
          const data = { pieces: game.pieces }
          const current = game.players.find(player => player.current)
          if (current) data.currentPlayer = current.name
          socket.emit('updatePieces', data)
          if (game.undoLog.length) socket.emit('showUndo', true)
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
      io.in(gameName).emit('updatePlayers', game.players)
      io.in(gameName).emit('updateBoard', game.board)
      const data = { pieces: game.pieces }
      const current = game.players.find(player => player.current)
      if (current) data.currentPlayer = current.name
      io.in(gameName).emit('updatePieces', data)
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
      if (game.players.length) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.undoLog = []
        game.pieces = makePieces()
        game.board = []
        for (let i = 0; i < 16; i++) game.board[i] = null
        const current = game.players[Math.floor(Math.random() * game.players.length)]
        current.current = true
        game.picking = true
        io.in(gameName).emit('gameStarted')
        io.in(gameName).emit('updatePlayers', game.players)
        io.in(gameName).emit('updateBoard', game.board)
        io.in(gameName).emit('updatePieces', { pieces: game.pieces, currentPlayer: current.name })
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

  socket.on('pickRequest', pieceIndex => inGame((gameName, game) => {
    if (game.picking) {
      const currentIndex = game.players.findIndex(player => player.socketId === socket.id)
      if (0 <= currentIndex) {
        const player = game.players[currentIndex]
        if (player.current &&
            Number.isInteger(pieceIndex) && 0 <= pieceIndex && pieceIndex < game.pieces.length &&
            game.pieces[pieceIndex] !== null) {
          appendUndo(gameName)
          game.pieces[pieceIndex].selected = true
          let nextIndex = currentIndex + 1
          if (nextIndex === game.players.length) nextIndex = 0
          const nextPlayer = game.players[nextIndex]
          delete player.current
          nextPlayer.current = true
          delete game.picking
          game.dropping = true
          io.in(gameName).emit('updatePlayers', game.players)
          io.in(gameName).emit('updatePieces', { pieces: game.pieces, currentPlayer: nextPlayer.name })
        }
        else {
          console.log(`${socket.playerName} played invalid data or is not current`)
          socket.emit('errorMsg', `Error: invalid play data.`)
        }
      }
      else {
        console.log(`${socket.playerName} not found as player in ${gameName}`)
        socket.emit('errorMsg', `Error: could not find you as a player.`)
      }
    }
    else {
      console.log(`${socket.playerName} picking in wrong state for ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} is not open for picking.`)
    }
  }))

  socket.on('dropRequest', placeIndex => inGame((gameName, game) => {
    if (game.dropping) {
      const currentIndex = game.players.findIndex(player => player.socketId === socket.id)
      const pieceIndex = game.pieces.findIndex(piece => piece && piece.selected)
      if (0 <= currentIndex) {
        const player = game.players[currentIndex]
        if (player.current && 0 <= pieceIndex &&
            Number.isInteger(placeIndex) && 0 <= placeIndex && placeIndex < game.board.length &&
            game.board[placeIndex] === null) {
          appendUndo(gameName)
          delete game.dropping
          const piece = game.pieces[pieceIndex]
          game.pieces[pieceIndex] = null
          game.board[placeIndex] = piece
          const data = { pieces: game.pieces }
          if (markArrow(game.board)) {
            game.ended = true
            delete player.current
            player.winner = true
            io.in(gameName).emit('updatePlayers', game.players)
          }
          else {
            data.currentPlayer = player.name
            game.picking = true
          }
          io.in(gameName).emit('updateBoard', game.board)
          io.in(gameName).emit('updatePieces', data)
        }
        else {
          console.log(`${socket.playerName} played invalid data or is not current`)
          socket.emit('errorMsg', `Error: invalid play data.`)
        }
      }
      else {
        console.log(`${socket.playerName} not found as player in ${gameName}`)
        socket.emit('errorMsg', `Error: could not find you as a player.`)
      }
    }
    else {
      console.log(`${socket.playerName} dropping in wrong state for ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} is not open for dropping.`)
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
          const player = game.players.find(player => player.socketId === socket.id)
          if (player) {
            player.socketId = null
            io.in(gameName).emit('updatePlayers', game.players)
          }
          if (game.timeout && game.players.every(player => !player.socketId)) {
            console.log(`pausing ${gameName} since all players are disconnected`)
            clearTimeout(game.timeout)
            delete game.timeout
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
