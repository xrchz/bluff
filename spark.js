'use strict'

const express = require('express')
const http = require('http')
const fs = require('fs')
var app = express()
var server = http.createServer(app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/spark.html`)
})
app.use(express.static(`${__dirname}/client`))

const unix = '/run/games/spark.socket'
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

const saveFile = 'spark.json'

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

const Red = 1
const Yellow = 2
const Green = 3
const Blue = 4
const White = 5

function makeDeck() {
  const deck = []
  for (let colour = Red; colour <= White; colour++) {
    for (let number = 1; number <= 5; number++) {
      let multiplicity = number === 1 ? 3 : number === 5 ? 1 : 2
      while (multiplicity--) {
        deck.push({ colour: colour, number: number })
      }
    }
  }
  return deck
}

const colourCls = c =>
  c === Red    ? 'red'    :
  c === Yellow ? 'yellow' :
  c === Green  ? 'green'  :
  c === Blue   ? 'blue'   :
  c === White  ? 'white'  : null

const slotOrd = ['1st', '2nd', '3rd', '4th', '5th']

const cardSpan = c => {
  const cls = colourCls(c.colour)
  return `<span class=${cls}>${cls[0].toUpperCase()}${c.number}</span>`
}

function appendLog(gameName, entry) {
  const game = games[gameName]
  game.log.push(entry)
  io.in(gameName).emit('appendLog', entry)
}

const stateKeys = {
  game: [
    'players', 'started', 'whoseTurn', 'deck',
    'clues', 'lives', 'played', 'dropped', 'ended'
  ],
  deck: true, played: true, dropped: true,
  players: [ 'current', 'hand', 'finalised' ], hand: true
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

function updateTable(gameName, roomName) {
  const game = games[gameName]
  if (!roomName) roomName = gameName
  const data = {
    played: game.played, dropped: game.dropped,
    cards: game.deck.length, clues: game.clues, lives: game.lives }
  io.in(roomName).emit('updatePlayers', { players: game.players, clues: game.clues, ended: game.ended })
  io.in(roomName).emit('updateTable', data)
}

function nextTurn(gameName) {
  const game = games[gameName]
  const dead = !game.lives
  const drawn = game.players.every(player => player.finalised)
  const finished = game.played.every(count => count === 5)
  if (dead || drawn || finished) {
    game.ended = true
    const score = game.played.reduce((total, count) => total + count)
    appendLog(gameName, `The game ends${dead ? ' in defeat' : finished ? ' in victory' : ''} with a score of ${score}.`)
  }
  else {
    game.whoseTurn++
    if (game.whoseTurn === game.players.length) game.whoseTurn = 0
    game.players[game.whoseTurn].current = true
  }
  updateTable(gameName)
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
      socket.playerName = `Pyro${Math.floor(Math.random()*20)}`
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
          updateTable(gameName, socket.id)
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
          updateTable(gameName)
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
      updateTable(gameName)
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
        game.whoseTurn = 0
        game.deck = makeDeck()
        shuffleInPlace(game.deck)
        game.clues = 8
        game.lives = 3
        game.played = [0, 0, 0, 0, 0, 0]
        game.dropped = []
        for (let c = Red; c <= White; c++) {
          game.dropped[c] = [0, 0, 0, 0, 0, 0]
        }
        game.players.forEach(player => player.hand = [])
        for (let i = 0; i < 5; i++)
          game.players.forEach(player =>
            player.hand.push(game.deck.pop()))
        game.players[game.whoseTurn].current = true
        io.in(gameName).emit('gameStarted')
        updateTable(gameName)
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
    if (game.started && !game.ended) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current && !current.finalised) {
          if (Number.isInteger(data.index) && 0 <= data.index && data.index < current.hand.length) {
            appendUndo(gameName)
            delete current.current
            const card = current.hand.splice(data.index, 1)[0]
            if (!game.deck.length)
              current.finalised = true
            let verb, gain = false
            if (!data.drop && game.played[card.colour] + 1 === card.number) {
              game.played[card.colour]++
              verb = 'plays'
              if (game.played[card.colour] === 5)
                gain = true
            }
            else {
              game.dropped[card.colour][card.number]++
              if (data.drop) {
                verb = 'drops'
                if (game.clues < 8)
                  gain = true
              }
              else {
                verb = 'fumbles'
                game.lives--
              }
            }
            if (gain) game.clues++
            appendLog(gameName, `${current.name} ${verb} their ${slotOrd[data.index]} card ${cardSpan(card)}${gain ? ' and gains a clue' : ''}.`)
            if (game.deck.length)
              current.hand.push(game.deck.pop())
            nextTurn(gameName)
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried playing with bad index ${data.index}`)
            socket.emit('errorMsg', `Error: index ${data.index} is invalid.`)
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried playing out of turn`)
          socket.emit('errorMsg', 'Error: it is not your turn.')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried playing but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried playing out of phase`)
      socket.emit('errorMsg', `Error: playing is not currently possible.`)
    }
  }))

  socket.on('clueRequest', data => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current) {
          if (game.clues && Number.isInteger(data.index) && 0 <= data.index &&
              data.index < game.players.length && data.index !== game.whoseTurn &&
              (data.colour || data.number) && !(data.colour && data.number)) {
            appendUndo(gameName)
            delete current.current
            game.clues--
            if (!game.deck.length)
              current.finalised = true
            const other = game.players[data.index]
            const processClue = key => function (card) {
              if (data[key]) {
                const negClue = `${key}NegClue`
                if (card[key] === data[key]) {
                  card[`${key}Clue`] = true
                  delete card[negClue]
                }
                else if (!card[`${key}Clue`]) {
                  if (!card[negClue]) card[negClue] = []
                  if (!card[negClue].includes(data[key]))
                    card[negClue].push(data[key])
                }
              }
            }
            other.hand.forEach(processClue('colour'))
            other.hand.forEach(processClue('number'))
            const clue = data.colour ? colourCls(data.colour) : data.number
            appendLog(gameName, `${current.name} clues ${other.name}'s ${clue} cards.`)
            nextTurn(gameName)
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried clueing with bad data: ${data.index} ${data.colour} ${data.number}`)
            socket.emit('errorMsg', `Error: clue is invalid.`)
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried clueing out of turn`)
          socket.emit('errorMsg', 'Error: it is not your turn.')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried clueing but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player.')
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
          const player = game.players.find(player => player.socketId === socket.id)
          if (player) {
            player.socketId = null
            io.in(gameName).emit('updatePlayers', { players: game.players, clues: game.clues, ended: game.ended })
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
