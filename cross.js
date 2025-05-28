'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'cross'

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
console.log(`server started on ${unix}`)
if (unix)
  server.on('listening', () => fs.chmodSync(port, 0o777))

const saveFile = `${gname}.json`

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

process.on('SIGINT', () => { saveGames(); fs.unlinkSync(port); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)

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
                players: game.players.map(player => ({ name: player.name, socketId: player.socketId }))
              })
  io.in(room).emit('updateGames', data)
}

const boardSize = 15
const midIndex = (boardSize - 1) / 2
const onEdgeIndex = (i) => (i === 0 || (i+1) === boardSize)
const onInnerIndex = (i) => (i === 1 || (i+2) === boardSize)
const onEdge = (i,j) => (onEdgeIndex(i) || onEdgeIndex(j))
const onInner = (i,j) => (onInnerIndex(i) || onInnerIndex(j))

function makeBoard() {
  const b = new Array()
  for (let i = 0; i < boardSize; i++) {
    const row = new Array()
    b[i] = row
    for (let j = 0; j < boardSize; j++) {
      const tile = {}
      row[j] = tile
      if (i === j) {
        if (onEdgeIndex(i))
          tile.tw = true
        else if (i === midIndex - 2)
          tile.tl = true
        else if (i === midIndex - 1)
          tile.dl = true
        else
          tile.dw = true
      }
      else if (onEdge((i,j))) {
        if (i === midIndex || j === midIndex)
          tile.tw = true
        else if (i === 3 || j === 3 ||
                 i+4 === boardSize || j+4 === boardSize)
          tile.dl = true
      }
      else if (onInner((i,j))) {
        if (i+2 === midIndex || j+2 === midIndex ||
            i-2 === midIndex || j-2 === midIndex)
          tile.tl = true
      }
    }
  }
  return b
}

const pointsPerLetter = {}
for (const l of " ") pointsPerLetter[l] = 0
for (const l of "lsunrtoaie") pointsPerLetter[l] = 1
for (const l of "gd") pointsPerLetter[l] = 2
for (const l of "bcmp") pointsPerLetter[l] = 3
for (const l of "fhvwy") pointsPerLetter[l] = 4
for (const l of "k") pointsPerLetter[l] = 5
for (const l of "jx") pointsPerLetter[l] = 8
for (const l of "z") pointsPerLetter[l] = 10

function makeBag() {
  const b = []
  for (const l of "kjxqz") b.push(l)
  for (const l of " bcmpfhvwy".repeat(2)) b.push(l)
  for (const l of "g".repeat(3)) b.push(l)
  for (const l of "lsud".repeat(4)) b.push(l)
  for (const l of "nrt".repeat(6)) b.push(l)
  for (const l of "o".repeat(8)) b.push(l)
  for (const l of "ai".repeat(9)) b.push(l)
  for (const l of "e".repeat(12)) b.push(l)
  shuffleInPlace(b)
  return b
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
      game = {
        players: [],
        spectators: []
      }
      games[gameName] = game
    }
    else
      game = games[gameName]
    if (!data.playerName) {
      socket.playerName = `Smith${Math.floor(Math.random()*20)}`
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
        if (game.started) socket.emit('gameStarted')
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate spectator`)
        socket.emit('errorMsg', `Game ${gameName} already contains spectator ${socket.playerName}.`)
      }
    }
    else if (game.started) {
      if (game.players.find(player => player.name === socket.playerName && !player.socketId)) {
        if (socket.rooms.size === 2 && socket.rooms.has(socket.id) && socket.rooms.has('lobby')) {
          console.log(`${socket.playerName} rejoining ${gameName}`)
          socket.gameName = gameName
          socket.leave('lobby'); socket.emit('updateGames', [])
          socket.join(gameName)
          const player = game.players.find(player => player.name === socket.playerName)
          player.socketId = socket.id
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          socket.emit('updateSpectators', game.spectators)
          socket.emit('gameStarted')
        }
        else {
          console.log(`error: ${socket.playerName} rejoining ${gameName} while in ${socket.rooms}`)
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
      if (game.players.length > 1 && game.players.length < 5) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.undoLog = []
        game.board = makeBoard()
        game.bag = makeBag()
        for (const player of game.players) {
          player.rack = []
          fillRack(player, game)
        }
        const current = game.players[Math.floor(Math.random() * game.players.length)]
        current.current = true
        game.picking = true
        io.in(gameName).emit('gameStarted')
        io.in(gameName).emit('updatePlayers', game.players)
        io.in(gameName).emit('updateBoard', game.board)
        io.in(gameName).emit('updateBag', game.bag)
      }
      else {
        socket.emit('errorMsg', 'Error: not enough or too many players to start.')
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
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
