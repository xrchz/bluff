'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'route'

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

const CardMultiplicity = 5
const MaxClues = 8
const Lives = 3
const HandSize = n => n < 4 ? 5 : 4
const RowsAbove = 2
const ColumnsLeft = 6
const Treasures = 10
const Walls = 3
const Rows = 1 + 2 * RowsAbove
const Columns = 1 + 2 * ColumnsLeft
const Left = 0
const Right = 1
const Up = 2
const Down = 3

function makeDeck() {
  const deck = []
  for (let d = 1; d < 16; d++) {
    let m = CardMultiplicity
    while (m-- > 0) deck.push({d: d, c: Array(4)})
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
    'players', 'started', 'deck', 'discard', 'clues', 'board'
  ],
  deck: true, discard: true, board: true,
  players: 'player',
  player: [ 'current', 'hand', 'finalised' ], hand: true
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

function updateBoard(gameName, roomName) {
  const game = games[gameName]
  if (!roomName) roomName = gameName
  const data = {
    board: game.board, discard: game.discard,
    cards: game.deck.length, clues: game.clues,
    lives: Lives - game.discard.filter(c => c.f).length,
    players: game.players
  }
  io.in(roomName).emit('updateBoard', data)
}

function neighbours(board, pos) {
  if (Number.isInteger(pos)) {
    const result = Array(4).fill(0)
    const col = pos % Columns
    const row = (pos - col) / Columns
    if (col > 0) result[Left] = board[pos-1].d
    if (col+1 < Columns) result[Right] = board[pos+1].d
    if (row > 0) result[Up] = board[pos-Columns].d
    if (row+1 < Rows) result[Down] = board[pos+Columns].d
    return result
  }
}

const opposite = dir => dir & 1 ? dir - 1 : dir + 1

const compatible = (d1, dir, d2) =>
  Boolean(d1 & (1 << opposite(dir))) === Boolean(d2 & (1 << dir))

function checkSealed(board) {
  const cpos = RowsAbove * Columns + ColumnsLeft
  const central = board[cpos]
  const sets = []
  if (central.d & (1 << Left)) sets.push([cpos-1])
  if (central.d & (1 << Right)) sets.push([cpos+1])
  if (central.d & (1 << Up)) sets.push([cpos-Columns])
  if (central.d & (1 << Down)) sets.push([cpos+Columns])
  let newSeals = 0
  for (const set of sets) {
    if (board[set[0]].s) continue
    central.stmp = true
    for (let i = 0; i < set.length; i++) {
      const pos = set[i]
      const c = board[pos]
      if (pos in board && 'd' in c) {
        if (c.stmp) continue
        else {
          c.stmp = true
          if (c.d & (1 << Left)) set.push(pos-1)
          if (c.d & (1 << Right)) set.push(pos+1)
          if (c.d & (1 << Up)) set.push(pos-Columns)
          if (c.d & (1 << Down)) set.push(pos+Columns)
        }
      }
      else {
        delete central.stmp
        set.forEach(pos => delete board[pos].stmp)
        break
      }
    }
    if (central.stmp) {
      delete central.stmp
      set.forEach(pos => {
        delete board[pos].stmp
        if (!board[pos].s && board[pos].t) newSeals++
        board[pos].s = true
      })
    }
  }
  return newSeals
}

function nextTurn(gameName, index) {
  const game = games[gameName]
  const dead = Lives <= game.discard.filter(c => c.f).length
  const drawn = game.players.every(player => player.finalised)
  const sealed = game.board.every(c => !c.d || c.s) && game.board.some(c => c.d && !c.m)
  const score = game.board.reduce((t, c) => t + Number(c.d !== undefined && c.t === true), 0)
  const bonus = game.board.reduce((t, c) => t + Number(c.t === true && c.s === true), 0)
  const finished = score >= Treasures && bonus >= Treasures
  if (dead || drawn || sealed || finished) {
    const ending = `The game ends${dead ? ' in defeat' : score >= Treasures ? ' in victory' : ''} with a score of`
    const scoring = `${bonus ? `${score}+${bonus} = ${score + bonus}` : score} out of ${2*Treasures}`
    const undoes = game.undoCount ? ` (using ${game.undoCount} undo${game.undoCount === 1 ? '' : 's'})` : ''
    appendLog(gameName, `${ending} ${scoring}${undoes}.`)
  }
  else {
    index++
    if (index === game.players.length) index = 0
    game.players[index].current = true
  }
  updateBoard(gameName)
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
               spectators: [] }
      games[gameName] = game
    }
    else
      game = games[gameName]
    if (!data.playerName) {
      socket.playerName = `Seeker${Math.floor(Math.random()*20)}`
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
        if (!game.started)
          socket.emit('updateUnseated', game.players)
        else {
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
          updateBoard(gameName)
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
      game.undoCount++
      const entry = game.undoLog.pop()
      copy(stateKeys.game, entry, game, true)
      io.in(gameName).emit('removeLog', game.log.length - entry.logLength)
      game.log.length = entry.logLength
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
      if (game.players.length >= 2) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.undoLog = []
        game.undoCount = 0
        game.log = []
        game.deck = makeDeck()
        shuffleInPlace(game.deck)
        game.clues = MaxClues
        game.discard = []
        game.board = []
        let i
        for (i = 0; i < Treasures; i++)
          game.board.push({t: true})
        for (; i < Treasures + Walls; i++)
          game.board.push({d: 0})
        for (; i < Rows * Columns - 1; i++)
          game.board.push({})
        shuffleInPlace(game.board)
        const wallsOppositeCentre =
          [ColumnsLeft-1, ColumnsLeft, -ColumnsLeft-1, Columns-1+ColumnsLeft].flatMap(
            i => game.board[RowsAbove * Columns + i].d === 0 ? [opposite(i)] : [])
        let central = game.deck.pop()
        // terminates assuming Walls < 4
        while (wallsOppositeCentre.some(dir => central.d & (1 << dir))) {
          game.deck.unshift(central)
          central = game.deck.pop()
        }
        central.s = true
        central.m = true
        game.board.splice(RowsAbove * Columns + ColumnsLeft, 0, central)
        game.players.forEach(player => player.hand = [])
        const cardsPerHand = HandSize(game.players.length)
        for (let i = 0; i < cardsPerHand; i++)
          game.players.forEach(player => player.hand.push(game.deck.pop()))
        game.players[Math.floor(Math.random() * game.players.length)].current = true
        io.in(gameName).emit('gameStarted')
        updateBoard(gameName)
        appendLog(gameName, 'The game begins!')
        updateGames()
      }
      else {
        socket.emit('errorMsg', 'Error: at least 2 players required.')
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('playRequest', data => inGame((gameName, game) => {
    if (game.started) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && player.current && !player.finalised) {
        const targetNeighbours = neighbours(game.board, data.target)
        if (Number.isInteger(data.index) && 0 <= data.index && data.index < player.hand.length &&
            (data.drop || (targetNeighbours && targetNeighbours.some(d => d)))) {
          appendUndo(gameName)
          delete player.current
          const card = player.hand.splice(data.index, 1)[0]
          let verb, seals, gain = false
          if (!data.drop && targetNeighbours.every((d, i) => d === undefined || compatible(d, i, card.d))) {
            game.board[data.target].d = card.d
            verb = 'plays'
            if (game.board[data.target].t)
              gain = true
            seals = checkSealed(game.board)
          }
          else {
            const dc = {d: card.d}
            game.discard.push(dc)
            if (data.drop) {
              verb = 'drops'
              if (game.clues < MaxClues)
                gain = true
            }
            else {
              verb = 'fumbles'
              dc.f = true
            }
          }
          if (gain) game.clues++
          appendLog(gameName,
            {player: player.name, verb: verb, index: data.index,
             card: card.d, gain: gain, seals: seals, target: data.target})
          if (game.deck.length) player.hand.push(game.deck.pop())
          else player.finalised = true
          nextTurn(gameName, playerIndex)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried playing with bad data ${data.index} ${data.drop} ${data.target}`)
          socket.emit('errorMsg', `Error: invalid play.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried playing out of turn`)
        socket.emit('errorMsg', 'Error: it is not your turn.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried playing out of phase`)
      socket.emit('errorMsg', `Error: playing is not currently possible.`)
    }
  }))

  socket.on('clueRequest', data => inGame((gameName, game) => {
    if (game.started) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && player.current) {
        if (game.clues && Number.isInteger(data.index) && 0 <= data.index &&
            data.index < game.players.length && data.index !== playerIndex &&
            Number.isInteger(data.direction) && 0 <= data.direction && data.direction < 4) {
          appendUndo(gameName)
          delete player.current
          game.clues--
          if (!game.deck.length) player.finalised = true
          const other = game.players[data.index]
          other.hand.forEach(c => c.c[data.direction] = Boolean(c.d & (1 << data.direction)))
          appendLog(gameName, {player: player.name, other: other.name, direction: data.direction})
          nextTurn(gameName, playerIndex)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried clueing with bad data: ${data.index} ${data.direction}`)
          socket.emit('errorMsg', `Error: clue is invalid.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried clueing out of turn`)
        socket.emit('errorMsg', 'Error: it is not your turn.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried clueing out of phase`)
      socket.emit('errorMsg', `Error: clueing is not currently possible.`)
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
          const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
          if (0 <= playerIndex) {
            game.players[playerIndex].socketId = null
            io.in(gameName).emit('setDisconnected', playerIndex)
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

process.on('SIGINT', () => { saveGames(); fs.unlinkSync(port); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)
