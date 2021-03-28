'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'robot'

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

function appendLog(gameName, entry) {
  const game = games[gameName]
  game.log.push(entry)
  io.in(gameName).emit('appendLog', entry)
}

function appendUndo(gameName) {
  const game = games[gameName]
  const entry = {}
  copy(stateKeys.game, game, entry)
  entry.logLength = game.log.length
  game.undoLog.push(entry)
  io.in(gameName).emit('showUndo', true)
}

const Gems = 20
const Lava = 20
const Rows = 10
const Cols = 10
const MaxClues = 8
const HandSize = n => n < 4 ? 5 : 4
const CardMultiplicity = 12
const Left = 1
const Up = 2
const Right = 3
const Down = 4

function makeDeck() {
  const deck = []
  for (const c of [Left, Up, Right, Down]) {
    let m = CardMultiplicity
    while (m--) deck.push(c)
  }
  shuffleInPlace(deck)
  return deck
}

function makeGrid() {
  const grid = Array((Rows+2)*(Cols+2))
  console.log('Adding border')
  let i
  for (i = 0; i < Cols+2; i++) {
    grid[i] = {l: true}
    grid[(Rows+1)*(Cols+2)+i] = {l: true}
  }
  for (i = 0; i < Rows+2; i++) {
    grid[i*(Cols+2)] = {l: true}
    grid[i*(Cols+2)+Cols+1] = {l: true}
  }
  console.log('Adding interior')
  const interior = []
  for (i = 0; i < Lava; i++)
    interior.push({l: true})
  interior.push({r: 1 + Math.floor(Math.random() * 4)})
  for (i++; i < Rows * Cols; i++)
    interior.push({})
  function reachableIndices() {
    const reachable = [interior.findIndex(c => c.r)]
    while (true) {
      const i = reachable.find(i => !interior[i].m)
      if (i === undefined) break
      interior[i].m = true
      function add(j) {
        if (0 <= j && j < Rows * Cols && !interior[j].m && !interior[j].l)
          reachable.push(j)
      }
      [i+1, i-1, i+Rows, i-Rows].forEach(add)
    }
    reachable.forEach(i => delete interior[i].m)
    return reachable
  }
  console.log('Ensuring gems are reachable')
  shuffleInPlace(interior)
  let reachable = reachableIndices()
  while (reachable.length - 1 < Gems) {
    console.log(`Only ${reachable.length} reachable but ${Gems} required`)
    shuffleInPlace(interior)
    reachable = reachableIndices()
  }
  shuffleInPlace(reachable)
  console.log('Adding gems')
  for (i = 0; i < Gems;) {
    if (interior[reachable[i]].r) continue
    else interior[reachable[i++]].g = true
  }
  console.log('Finishing making grid')
  i = 0
  for (let r = 1; r <= Rows; r++)
    for (let c = 1; c <= Cols; c++)
      grid[r*(Cols+2)+c] = interior[i++]
  return grid
}

const stateKeys = {
  game: [
    'players', 'started',
    'deck', 'grid', 'discarded',
    'cluesLeft', 'score', 'ended'
  ],
  deck: true, discarded: true, grid: true,
  players: 'player',
  player: [ 'playerIndex', 'cardIndex', 'hand' ], hand: true
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

function updateInfo(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  io.in(roomName).emit('updateInfo', {
    cardsLeft: game.deck.length,
    cluesLeft: game.cluesLeft,
    score: game.score,
    discarded: game.discarded
  })
}

function updateGrid(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  io.in(roomName).emit('updateGrid', game.grid)
}

function updatePlayers(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  io.in(roomName).emit('updatePlayers', {
    players: game.players,
    cluesLeft: game.cluesLeft,
    ended: game.ended
  })
}

function checkEndRound(gameName, lastPlayer) {
  const game = games[gameName]
  if (game.players.every(player => 'cardIndex' in player)) {
    const lastPlayerIndex = lastPlayer.playerIndex
    const lastCardIndex = lastPlayer.cardIndex
    delete lastPlayer.playerIndex
    delete lastPlayer.cardIndex
    appendUndo(gameName)
    if (Number.isInteger(lastPlayerIndex)) lastPlayer.playerIndex = lastPlayerIndex
    lastPlayer.cardIndex = lastCardIndex
    const clueAttempts = game.players.reduce((t, player) =>
      'playerIndex' in player && 0 <= player.playerIndex ? t + 1 : t, 0)
    game.players.forEach(player => {
      if ('playerIndex' in player && 0 <= player.playerIndex) {
        const other = game.players[player.playerIndex]
        if (clueAttempts <= game.cluesLeft) {
          other.hand.forEach(card => {
            if (card.d === player.cardIndex)
              card.c = true
            else if (card.c !== true)
              card.c.push(player.cardIndex)
          })
        }
        appendLog(gameName,
          {name: player.name, other: other.name, direction: player.cardIndex})
        delete player.playerIndex
        delete player.cardIndex
      }
    })
    if (clueAttempts <= game.cluesLeft) {
      game.cluesLeft -= clueAttempts
      appendLog(gameName, {clueAttempts: clueAttempts})
    }
    else
      appendLog(gameName, {clueAttempts: clueAttempts, cluesLeft: game.cluesLeft})
    const plays = []
    game.players.forEach(player => {
      if ('cardIndex' in player) {
        const card = player.hand.splice(player.cardIndex, 1)[0].d
        const drop = player.playerIndex === -1
        game.discarded.push(card)
        plays.push(drop ? false : card)
        if (game.deck.length) player.hand.push({d: game.deck.pop(), c: []})
        appendLog(gameName, {name: player.name, card: card, index: player.cardIndex, drop: drop})
        delete player.playerIndex
        delete player.cardIndex
      }
      else
        plays.push(false)
    })
    let robotIndex = game.grid.findIndex(c => c.r)
    plays.forEach(d => {
      if (!game.grid[robotIndex].l) {
        if (d && game.grid[robotIndex].r !== d) {
          game.grid[robotIndex].r = d
          appendLog(gameName, {turn: d})
        }
        else {
          const cont = !d
          d = game.grid[robotIndex].r
          delete game.grid[robotIndex].r
          robotIndex +=
            (d === Left ? -1 :
             d === Down ? Cols + 2 :
             d === Up ? -(Cols + 2) : 1)
          game.grid[robotIndex].r = d
          let gem = false, clue = false
          if (game.grid[robotIndex].g) {
            delete game.grid[robotIndex].g
            game.score++
            gem = true
            if (game.cluesLeft < MaxClues) {
              game.cluesLeft++
              clue = true
            }
          }
          appendLog(gameName,
            {move: d, cont: cont, gem: gem, clue: clue, lava: game.grid[robotIndex].l})
        }
      }
    })
    const dead = game.grid[robotIndex].l
    const finished = !game.grid.find(c => c.g)
    if (dead || finished || !game.deck.length) {
      game.ended = true
      const ending = dead ? ' in defeat' : finished ? ' in victory' : ''
      const undos = game.undoCount ? '.' : ` (using ${game.undoCount} undos).`
      appendLog(gameName, `The game ends${ending} with a score of ${game.score}/${Gems}${undos}`)
    }
    updateGrid(gameName)
    updateInfo(gameName)
    updatePlayers(gameName)
  }
  else
    updatePlayers(gameName)
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
      socket.playerName = `Radio${Math.floor(Math.random()*20)}`
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
          updateGrid(gameName, socket.id)
          updateInfo(gameName, socket.id)
          updatePlayers(gameName, socket.id)
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
          updateInfo(gameName, socket.id)
          updatePlayers(gameName)
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
      updateGrid(gameName)
      updateInfo(gameName)
      updatePlayers(gameName)
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
        game.score = 0
        game.cluesLeft = MaxClues
        game.discarded = []
        game.grid = makeGrid()
        game.players.forEach(player => player.hand = [])
        const cardsPerHand = HandSize(game.players.length)
        for (let i = 0; i < cardsPerHand; i++)
          game.players.forEach(player => player.hand.push(
            {d: game.deck.pop(), c: []}))
        io.in(gameName).emit('gameStarted')
        updateGrid(gameName)
        updateInfo(gameName)
        updatePlayers(gameName)
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

  function handleMove(func) {
    inGame((gameName, game) => {
      if (game.started && !game.ended) {
        const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
        const player = game.players[playerIndex]
        if (0 <= playerIndex) {
          func(player, playerIndex, game) &&
            checkEndRound(gameName, player)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} is not a valid player`)
          socket.emit('errorMsg', 'Error: player not found.')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried moving out of phase`)
        socket.emit('errorMsg', 'Error: the game has not started or has ended.')
      }
    })
  }

  socket.on('playRequest', cardIndex => handleMove(player => {
    if (Number.isInteger(cardIndex) && 0 <= cardIndex && cardIndex < player.hand.length) {
      delete player.playerIndex
      player.cardIndex = cardIndex
      return true
    }
    else {
      console.log(`error: ${socket.playerName} tried playing with invalid data ${cardIndex}`)
      socket.emit('errorMsg', 'Error: not a valid play.')
      return false
    }
  }))

  socket.on('dropRequest', cardIndex => handleMove(player => {
    if (Number.isInteger(cardIndex) && 0 <= cardIndex && cardIndex < player.hand.length) {
      player.playerIndex = -1
      player.cardIndex = cardIndex
      return true
    }
    else {
      console.log(`error: ${socket.playerName} tried dropping with invalid data ${cardIndex}`)
      socket.emit('errorMsg', 'Error: not a valid drop.')
      return false
    }
  }))

  socket.on('clueRequest', data => handleMove((player, playerIndex, game) => {
    if (Number.isInteger(data.playerIndex) && 0 <= data.playerIndex &&
        data.playerIndex < game.players.length && data.playerIndex !== playerIndex &&
        [Left, Up, Right, Down].includes(data.direction)) {
      player.playerIndex = data.playerIndex
      player.cardIndex = data.direction
      return true
    }
    else {
      console.log(`error: ${socket.playerName} tried clueing with invalid data ${data.playerIndex} ${data.cardIndex}`)
      socket.emit('errorMsg', 'Error: not a valid clue.')
      return false
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
