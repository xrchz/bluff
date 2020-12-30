'use strict'

const express = require('express')
const http = require('http')
const fs = require('fs')
var app = express()
var server = http.createServer(app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/acorn.html`)
})
app.use(express.static(`${__dirname}/client`))

const unix = '/run/games/acorn.socket'
server.listen(unix)
console.log(`server started on ${unix}`)
server.on('listening', () => fs.chmodSync(unix, 0o777))

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

const saveFile = 'acorn.json'

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

function updateGames(room) {
  if (!room) room = 'lobby'
  const data = []
  for (const [gameName, game] of Object.entries(games))
    data.push({ name: gameName,
                players: game.players.map(player => ({ name: player.name, disconnected: !player.socketId }))
              })
  io.in(room).emit('updateGames', data)
}

function makeGrid(size, acorns) {
  const cells = []
  for (let i = 0; i < size * size; i++)
    cells.push({})
  for (let i = 0; i < acorns; i++)
    cells[i].acorn = true
  shuffleInPlace(cells)
  const grid = []
  for (let i = 0; i < size; i++) {
    const row = []
    for (let j = 0; j < size; j++)
      row.push(cells.pop())
    grid.push(row)
  }
  return grid
}

function floodFill(grid, i, j) {
  const a = [[i, j]]
  while (a.length) {
    const c = a.pop()
    const cell = grid[c[0]][c[1]]
    let t = 0, n = []
    for (let i = c[0] - 1; i <= c[0] + 1; i++)
      for (let j = c[1] - 1; j <= c[1] + 1; j++)
        if (0 <= i && i < grid.length && 0 <= j && j < grid.length) {
          if (grid[i][j].acorn) t++
          else if (grid[i][j].dug === undefined) n.push([i, j])
        }
    cell.dug = t
    if (!t) Array.prototype.push.apply(a, n)
  }
}

function appendLog(gameName, entry) {
  const game = games[gameName]
  game.log.push(entry)
  io.in(gameName).emit('appendLog', entry)
}

const stateKeys = {
  game: [
    'players', 'started', 'whoseTurn',
    'bidding', 'digging', 'grid', 'ended'
  ],
  grid: true,
  players: [ 'current', 'bid', 'stamina', 'acorns' ]
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
  entry.logLength = game.log.length
  game.undoLog.push(entry)
  io.in(gameName).emit('showUndo', true)
}

function updateGrid(gameName, roomName) {
  const game = games[gameName]
  if (!roomName) roomName = gameName
  const data = { grid: game.grid }
  const current = game.players.find(player => player.current)
  if (current) data.current = current.name
  io.in(roomName).emit('updateGrid', data)
}

function updateBids(gameName, roomName) {
  const game = games[gameName]
  if (!roomName) roomName = gameName
  io.in(roomName).emit('updateBids', { players: game.players, bidding: game.bidding, whoseTurn: game.whoseTurn })
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
      game = { players: [],
               spectators: [],
               size: 15,
               acorns: 25,
               stamina: 10,
               minReward: 0, maxReward: 3 }
      games[gameName] = game
    }
    else
      game = games[gameName]
    if (!data.playerName) {
      socket.playerName = `Squirrel${Math.floor(Math.random()*20)}`
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
        if (!game.started) {
          socket.emit('updateUnseated', game.players)
        }
        else {
          socket.emit('gameStarted')
          updateGrid(gameName, socket.id)
          updateBids(gameName, socket.id)
          game.log.forEach(entry => socket.emit('appendLog', entry))
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
          socket.emit('gameStarted')
          updateGrid(gameName, socket.id)
          updateBids(gameName, socket.id)
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
        io.in(gameName).emit('updateUnseated', game.players)
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
      updateGrid(gameName)
      updateBids(gameName)
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
      console.log(`starting ${gameName}`)
      game.started = true
      game.undoLog = []
      game.log = []
      game.whoseTurn = Math.floor(Math.random() * game.players.length)
      game.grid = makeGrid(game.size, game.acorns)
      game.players.forEach(player => {
        player.acorns = 0
        player.stamina = game.stamina
      })
      game.bidding = true
      io.in(gameName).emit('gameStarted')
      updateGrid(gameName)
      updateBids(gameName)
      appendLog(gameName, 'The game begins!')
      updateGames()
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('bidRequest', bid => inGame((gameName, game) => {
    if (game.bidding) {
      const player = game.players.find(player => player.socketId === socket.id)
      if (player && !player.bid) {
        if (Number.isInteger(bid) && 0 <= bid && bid <= player.stamina) {
          appendUndo(gameName)
          player.bid = bid
          appendLog(gameName, `${player.name} bids.`)
          if (game.players.every(player => player.bid !== undefined)) {
            delete game.bidding
            let winner = game.players[game.whoseTurn]
            for (let i = 1; i < game.players.length; i++) {
              const candidate = game.players[(game.whoseTurn + i) % game.players.length]
              if (candidate.bid > winner.bid)
                winner = candidate
            }
            appendLog(gameName, `${winner.name} wins the bidding with ${winner.bid}.`)
            winner.stamina -= winner.bid
            game.players.forEach(player => delete player.bid)
            winner.current = true
            game.digging = true
            updateGrid(gameName)
          }
          updateBids(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} made an invalid bid`)
          socket.emit('errorMsg', `Error: that is not a valid bid.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found or already bid`)
        socket.emit('errorMsg', 'Error: it is not your turn to bid.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried bidding out of phase`)
      socket.emit('errorMsg', `Error: bidding is not currently possible.`)
    }
  }))

  socket.on('digRequest', data => inGame((gameName, game) => {
    if (game.digging) {
      const current = game.players.find(player => player.current)
      if (current) {
        if (current.socketId === socket.id) {
          if (Number.isInteger(data.i) && 0 <= data.i && data.i < game.size &&
              Number.isInteger(data.j) && 0 <= data.j && data.j < game.size &&
              !game.grid[data.i][data.j].dug) {
            appendUndo(gameName)
            delete game.digging
            delete current.current
            const cell = game.grid[data.i][data.j]
            let what = 'nothing'
            if (cell.acorn) {
              cell.dug = true
              const reward = game.minReward + Math.floor(Math.random() * (game.maxReward - game.minReward))
              what = `an acorn providing ${reward} stamina`
              current.stamina += reward
              current.acorns += 1
              game.acorns -= 1
            }
            else
              floodFill(game.grid, data.i, data.j)
            appendLog(gameName, `${current.name} digs up ${what}.`)
            if (game.acorns) {
              game.bidding = true
              game.whoseTurn++
              if (game.whoseTurn === game.players.length) game.whoseTurn = 0
              updateBids(gameName)
            }
            else {
              game.ended = true
              let maxAcorns = 0
              game.players.forEach(player => { if (player.acorns > maxAcorns) maxAcorns = player.acorns })
              const victors = game.players.filter(player => player.acorns === maxAcorns).map(player => player.name).join(', ')
              appendLog(gameName, `The game ends with ${victors.length > 1 ? `tied victors: ${victors}.` : `${victors} victorious!`}`)
            }
            updateGrid(gameName)
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried digging with bad data: ${data.i} ${data.j}`)
            socket.emit('errorMsg', `Error: dig cell is invalid.`)
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried digging out of turn`)
          socket.emit('errorMsg', 'Error: it is not your turn.')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried digging but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried digging out of phase`)
      socket.emit('errorMsg', `Error: digging is not currently possible.`)
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
        io.in(gameName).emit('updateUnseated', game.players)
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
            updateBids(gameName)
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

process.on('SIGINT', () => { saveGames(); fs.unlinkSync(unix); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)
