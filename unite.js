'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'unite'

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
                players: game.players.map(player =>
                  ({ name: player.name, socketId: player.socketId, winner: player.winner }))
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

function makeDeck() {
  const deck = []
  for (let s = 0; s < 4; s++) {
    const sdeck = []
    deck.push(sdeck)
    for (let r = 0; r < 10; r++)
      sdeck.push(r)
    shuffleInPlace(sdeck)
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
    'players', 'started', 'board', 'deck', 'ended'
  ], board: true, deck: true,
  players: [ 'current', 'winner', 'hand' ], hand: true
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

function updateBoard(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  io.in(roomName).emit('updateBoard', { board: game.board, deck: game.deck })
}

const absRow = (relRow, playerIndex) =>
  playerIndex === 0 ? relRow : (2 - relRow)

function validColumns(z) {
  const vc = [[],[]]
/*
  1 y  3 n  3 n
  2 n  2 n  2 y
  1 y  1 y  3 n
*/
  for (let side = 0; side < 2; side++) {
    if (z[0][side] < z[1][side])
      vc[side].push(0)
    if (z[1][side] < z[0][side] &&
        z[1][side] < z[2][side])
      vc[side].push(1)
    if (z[2][side] < z[1][side])
      vc[side].push(2)
  }
  return vc
}

const cardCmp = (a, b) =>
  a.s === b.s ? a.r - b.r : a.s - b.s

function plotColumns(col, dir) {
  let t1 = col, t2, t3
  if ((col === 1 && dir === 0) || (col === -1 && dir === 1)) {
    t2 = t1
    t3 = 0
  }
  else {
    const i = dir ? 1 : -1
    if (col === 0) {
      t2 = i
      t3 = i
    }
    else {
      t2 = t1 + i
      t3 = t2 + i
    }
  }
  return [t2, t3]
}

function validPlots(board, hand, playerIndex) {
  const vp = []
  const row = absRow(0, playerIndex)
  const L = playerIndex
  const R = 1 - playerIndex
  const base = playerIndex ? board.b[row].slice().reverse() : board.b[row]
  for (let dir = 0; dir < 2; dir++) {
    let col = -board.z[row][L]
    col += col === -1 ? 1 : 2
    for (const baseCard of base) {
      const pcs = plotColumns(col, dir)
      if (hand.includes(baseCard.r) &&
          -board.z[1][L] < pcs[0] && pcs[0] < board.z[1][R] &&
          -board.z[2 - row][L] < pcs[1] && pcs[1] < board.z[2 - row][R])
        vp.push([col, pcs[0], pcs[1]])
      if (col === -1) col = 0
      else if (col === 0) col = 1
      else col += 2
    }
  }
  return vp
}

function checkPlot(newHand, newBoard, cols, hand, board, playerIndex) {
  if (!(Array.isArray(cols) && cols.length === 3)) return false
  if (!board.validPlots.some(v => cols.every((c, i) => c === v[i]))) return false
  const row = absRow(0, playerIndex)
  const colSign = playerIndex ? -1 : 1
  const toCards = (r, s) => r === null ? [] : [{r: r, s: s}]
  const oldCards = hand.flatMap(toCards)
  const newCards = newHand.flatMap(toCards).concat(newBoard)
  newCards.sort(cardCmp)
  const c1 = board.b[row].find(c => c.c === colSign * cols[0])
  const c2 = board.b[1].find(c => c.c === colSign * cols[1])
  const c3 = board.b[2 - row].find(c => c.c === colSign * cols[2])
  oldCards.push({r: c1.r, s: c1.s})
  oldCards.push({r: c2.r, s: c2.s})
  oldCards.push({r: c3.r, s: c3.s})
  oldCards.sort(cardCmp)
  if (oldCards.length !== newCards.length) return false
  for (let i = 0; i < oldCards.length; i++)
    if (!(oldCards[i].r === newCards[i].r &&
          oldCards[i].s === newCards[i].s))
      return false
  return [c1, c2, c3]
}

const colShift = (row, dir, col) =>
  col + dir * (
    (Math.abs(col) <= 2 &&
      ((Math.sign(col) === Math.sign(dir))
        === (Math.abs(col) === 1 && row === 1))) ?
    1 : 2)

const cardShift = (row, dir) =>
  c => c.c = colShift(row, dir, c.c)

function rebalance(board) {
  const imbalances = board.z.map(z => z[1] - z[0])
  if (imbalances.every(b => 2 < b)) {
    board.z.forEach(z => {
      z[0] += 2
      z[1] -= 2
    })
    board.b.forEach((row, i) => row.forEach(cardShift(i, -1)))
  }
  else if (imbalances.every(b => b < -2)) {
    board.z.forEach(z => {
      z[0] -= 2
      z[1] += 2
    })
    board.b.forEach((row, i) => row.forEach(cardShift(i, +1)))
  }
}

function checkWin(gameName) {
  const game = games[gameName]
  const winner = game.players.find(player =>
    player.hand.every(r => r !== null) &&
    (new Set(player.hand)).size === 1)
  if (winner) {
    game.ended = true
    winner.winner = true
    appendLog(gameName, `The game ends with ${winner.name} victorious!`)
  }
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
      socket.playerName = `Knight${Math.floor(Math.random()*20)}`
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
        socket.emit('updatePlayers', game.players)
        if (game.started) {
          socket.emit('gameStarted')
          updateBoard(gameName, socket.id)
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
        if (socket.rooms.size === 2 && socket.rooms.has(socket.id) && socket.rooms.has('lobby')) {
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
          updateBoard(gameName, socket.id)
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
      if (game.players.length < 2) {
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
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as extra player`)
        socket.emit('errorMsg', `Game ${gameName} is full. Try spectating.`)
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
      updateBoard(gameName)
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
      if (game.players.length === 2) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.undoLog = []
        game.log = []
        game.deck = makeDeck()
        game.players.forEach(player => player.hand = [null, null, null, null])
        const playerIndex = Math.floor(Math.random() * 2)
        const currentPlayer = game.players[playerIndex]
        currentPlayer.current = true
        game.board = { b: [[],[],[]], z: [[1,1],[2,2],[1,1]] }
        game.board.b[0].push({s: 0, c: 0, r: game.deck[0].pop()})
        game.board.b[1].push({s: 0, c: -1, r: game.deck[0].pop()})
        game.board.b[1].push({s: 0, c: +1, r: game.deck[0].pop()})
        game.board.b[2].push({s: 0, c: 0, r: game.deck[0].pop()})
        game.board.validColumns = validColumns(game.board.z)
        game.board.validPlots = validPlots(game.board, currentPlayer.hand, playerIndex)
        io.in(gameName).emit('gameStarted')
        io.in(gameName).emit('updatePlayers', game.players)
        updateBoard(gameName)
        appendLog(gameName, 'The game begins!')
        updateGames()
      }
      else {
        console.log(`${socket.playerName} attempted to start ${gameName} without 2 players`)
        socket.emit('errorMsg', `Error: ${gameName} needs exactly 2 players to start.`)
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('takeRequest', data => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const suit = data.suit
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && player.current) {
        if (Number.isInteger(suit) && 0 <= suit && suit < 4 && game.deck[suit].length &&
            ((player.hand[suit] === null && !data.pos && !data.keepHand) ||
              typeof data.keepHand === 'boolean' &&
              data.pos && Number.isInteger(data.pos.row) && 0 <= data.pos.row && data.pos.row < 3 &&
              Number.isInteger(data.pos.side) && 0 <= data.pos.side && data.pos.side < 2 &&
              game.board.validColumns[data.pos.side].includes(data.pos.row))) {
          appendUndo(gameName)
          const rank = game.deck[suit].pop()
          const handRank = player.hand[suit]
          if (handRank !== null) {
            const side = data.pos.side
            const row = data.pos.row
            const col = game.board.z[row][side] * (side ? 1 : -1)
            const toBoard = { s: suit, r: rank, c: col }
            game.board.z[row][side] += 2
            if (!data.keepHand) {
              toBoard.r = player.hand[suit]
              player.hand[suit] = rank
            }
            game.board.b[row][['unshift','push'][side]](toBoard)
          }
          else {
            player.hand[suit] = rank
          }
          appendLog(gameName, {name: player.name, suit: suit, rank: rank,
                               keepHand: data.keepHand, handRank: handRank})
          delete player.current
          checkWin(gameName)
          if (!game.ended) {
            const nextIndex = 1 - playerIndex
            const nextPlayer = game.players[nextIndex]
            nextPlayer.current = true
            rebalance(game.board)
            game.board.validColumns = validColumns(game.board.z)
            game.board.validPlots = validPlots(game.board, nextPlayer.hand, nextIndex)
          }
          io.in(gameName).emit('updatePlayers', game.players)
          updateBoard(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} made an invalid take`)
          socket.emit('errorMsg', `Error: that is not a valid take.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found or not current`)
        socket.emit('errorMsg', 'Error: it is not your turn to take.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried taking before start`)
      socket.emit('errorMsg', `Error: taking is not currently possible.`)
    }
  }))

  socket.on('reorderRequest', data => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && player.current) {
        const boardCards = checkPlot(data.hand, data.board, data.cols,
                                     player.hand, game.board, playerIndex)
        if (boardCards) {
          appendUndo(gameName)
          player.hand = data.hand
          const oldCards = boardCards.map(c => ({r: c.r, s: c.s}))
          data.board.forEach((c, i) => {
            boardCards[i].r = c.r
            boardCards[i].s = c.s
          })
          appendLog(gameName, {name: player.name, oldCards: oldCards, newCards: data.board})
          delete player.current
          checkWin(gameName)
          if (!game.ended) {
            const nextIndex = 1 - playerIndex
            const nextPlayer = game.players[nextIndex]
            nextPlayer.current = true
            game.board.validPlots = validPlots(game.board, nextPlayer.hand, nextIndex)
          }
          io.in(gameName).emit('updatePlayers', game.players)
          updateBoard(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried reordering with bad data`)
          socket.emit('errorMsg', `Error: reorder data is invalid.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found or not current`)
        socket.emit('errorMsg', 'Error: it is not your turn to reorder.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried reordering before start`)
      socket.emit('errorMsg', `Error: reordering is not currently possible.`)
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
