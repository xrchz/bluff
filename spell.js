'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'spell'

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

const wordList = fs.readFileSync('words.txt', 'utf8').split('\n')
wordList.pop()

const Words = 4
const LetterMultiplicity = 3
const PoolSize = 3

function chunks(w, n) {
  const c = []
  let i = 0
  while (i < w.length) {
    c.push(w.slice(i, i + n))
    i += n
  }
  return c
}

function makeTargets(n) {
  const a = wordList.slice()
  shuffleInPlace(a)
  a.length = Words
  return a.flatMap(w => chunks(w, n))
}

function makeDeck(targets) {
  const deck = []
  for (const w of targets) {
    for (const c of w) {
      let m = LetterMultiplicity
      while (m-- > 0) deck.push(c)
    }
  }
  shuffleInPlace(deck)
  return deck
}

const stateKeys = {
  game: [
    'players', 'started', 'deck', 'targets', 'scored', 'discarded'
  ],
  deck: true, targets: true, scored: true,
  players: 'player',
  player: [ 'hand', 'drawn', 'pool', 'play' ],
  pool: true
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

function updateTargets(gameName, roomName) {
  const game = games[gameName]
  if (!roomName) roomName = gameName
  const data = {
    targets: game.targets, scored: game.scored,
    cardsLeft: game.deck.length, discarded: game.discarded
  }
  io.in(roomName).emit('updateTargets', data)
}

const drawable = game =>
  game.players.reduce((t, p) => t + p.pool.length, game.deck.length)

const nextToDraw = players =>
  players.findIndex(player => player.drawn === undefined)

function updatePlayers(gameName, roomName) {
  const game = games[gameName]
  if (!roomName) roomName = gameName
  const next = nextToDraw(game.players)
  const data = {
    playing: next < 0,
    cardsLeft: game.deck.length,
    next: (game.targets.length && 0 <= next &&
           game.players.length - next <= drawable(game)) ? next : false,
    players: game.players
  }
  io.in(roomName).emit('updatePlayers', data)
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
      socket.playerName = `Buzz${Math.floor(Math.random()*20)}`
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
          updateTargets(gameName, socket.id)
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
          updateTargets(gameName, socket.id)
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
      updateTargets(gameName)
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
        game.targets = makeTargets(game.players.length)
        game.deck = makeDeck(game.targets)
        game.scored = []
        game.discarded = ''
        game.players.forEach(player => player.hand = game.deck.pop())
        game.players.forEach(player => player.pool = [])
        game.leader = Math.floor(Math.random() * game.players.length)
        game.drawing = true
        io.in(gameName).emit('gameStarted')
        appendLog(gameName, 'The game begins!')
        updateTargets(gameName)
        updatePlayers(gameName)
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

  socket.on('playRequest', play => inGame((gameName, game) => {
    if (game.started) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && nextToDraw(game.players) < 0) {
        if (typeof play === 'string' && play.length === 2 &&
            ['p','d'].includes(play[0]) && ['h','d'].includes(play[1])) {
          player.play = play
          if (game.players.every(player => player.play)) {
            delete player.play
            appendUndo(gameName)
            player.play = play
            let played = ''
            game.players.forEach(player => {
              const fromHand = player.play[1] === 'h'
              const plays = player.play[0] === 'p'
              const letter = player[fromHand ? 'hand' : 'drawn']
              const data = { player: player.name, plays: plays, fromHand: fromHand, letter: letter }
              if (plays) played += letter
              else {
                player.pool.unshift(letter)
                if (player.pool.length > PoolSize) {
                  data.discarding = player.pool.pop()
                  game.discarded += data.discarding
                }
              }
              appendLog(gameName, data)
              if (fromHand) player.hand = player.drawn
              delete player.drawn
              delete player.play
            })
            const index = game.targets.findIndex(t => t === played)
            if (0 <= index) {
              game.scored.push(game.targets.splice(index, 1)[0])
              appendLog(gameName, {played: played})
            }
            else if (played) {
              game.discarded += played
              appendLog(gameName, {fumbled: played})
            }
            if (!game.targets.length || drawable(game) < game.players.length)
              appendLog(gameName,
                `The game ends with a score of ${game.scored.length}/${game.targets.length+game.scored.length}.`)
            updateTargets(gameName)
          }
          updatePlayers(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried playing with bad data ${play}`)
          socket.emit('errorMsg', `Error: invalid play.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried playing out of turn`)
        socket.emit('errorMsg', 'Error: it is not your turn to play.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried playing out of phase`)
      socket.emit('errorMsg', `Error: playing is not currently possible.`)
    }
  }))

  socket.on('drawRequest', data => inGame((gameName, game) => {
    if (game.started) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && nextToDraw(game.players) === playerIndex && game.targets.length) {
        if (Number.isInteger(data.playerIndex) &&
            -1 <= data.playerIndex && data.playerIndex < game.players.length &&
            (data.playerIndex < 0 && game.deck.length ||
             Number.isInteger(data.cardIndex) &&
             0 <= data.cardIndex && data.cardIndex < game.players[data.playerIndex].pool.length)) {
          appendUndo(gameName)
          const other = game.players[data.playerIndex]
          player.drawn = data.playerIndex < 0 ? game.deck.pop() : other.pool.splice(data.cardIndex, 1)[0]
          appendLog(gameName, {player: player.name, other: data.playerIndex < 0 ? null : other.name,
                               index: data.cardIndex, letter: player.drawn})
          updateTargets(gameName)
          updatePlayers(gameName)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried drawing with bad data: ${data.playerIndex} ${data.cardIndex}`)
          socket.emit('errorMsg', `Error: draw is invalid.`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried drawing out of turn`)
        socket.emit('errorMsg', 'Error: it is not your turn.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried drawing out of phase`)
      socket.emit('errorMsg', `Error: drawing is not currently possible.`)
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
