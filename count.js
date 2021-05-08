'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'count'

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

function makeDeck() {
  const deck = []
  for (let i = 2; i <= 99; i++)
    deck.push(i)
  return deck
}

const HandSize = n =>
  n === 1 ? 8 :
  n === 2 ? 7 : 6

function validPiles(hand, board) {
  return hand.map(n =>
    board.flatMap((p, i) =>
      ((i < 2 && (n > p || n === p - 10)) ||
       (i >= 2 && (n < p || n === p + 10)))
      ? [i] : []
    )
  )
}

function updateBoard(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  io.in(roomName).emit('updateBoard',
    { board: game.board, deckSize: game.deck.length })
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
      socket.playerName = `Dracula${Math.floor(Math.random()*20)}`
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
        // TODO: what to do if a spectator joins and the game hasn't started
        if (game.started) {
          socket.emit('gameStarted')
          // TODO: what to do if a spectator joins and the game has started
        }
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate spectator`)
        socket.emit('errorMsg', `Game ${gameName} already contains spectator ${socket.playerName}.`)
      }
    }
    else if (game.started) {
      const playerIndex = game.players.findIndex(player => player.name === socket.playerName)
      const player = game.players[playerIndex]
      if (0 <= playerIndex && !player.socketId) {
        const rooms = Object.keys(socket.rooms)
        if (rooms.length === 2 && rooms.includes(socket.id) && rooms.includes('lobby')) {
          console.log(`${socket.playerName} rejoining ${gameName}`)
          socket.gameName = gameName
          socket.leave('lobby'); socket.emit('updateGames', [])
          socket.join(gameName)
          player.socketId = socket.id
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          socket.emit('updateSpectators', game.spectators)
          socket.emit('gameStarted')
          io.in(gameName).emit('updatePlayers', game.players)
          io.in(gameName).emit('setConnected', playerIndex)
          updateBoard(gameName, socket.id)
          // TODO: what to do if a player joins and the game has started
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
        if (game.players.length < 6) {
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
          console.log(`${socket.playerName} barred from joining ${gameName} which is full`)
          socket.emit('errorMsg', `Game ${gameName} already has enough players. Try spectating.`)
        }
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
    if (!game.started && game.players.length && game.players.length < 6) {
      game.started = true
      game.log = []
      game.undoLog = []
      game.deck = makeDeck()
      shuffleInPlace(game.deck)
      game.board = [1, 1, 100, 100]
      const handSize = HandSize(game.players.length)
      game.players.forEach(player => {
        player.hand = []
        for (let i = 0; i < handSize; i++)
          player.hand.push(game.deck.pop())
      })
      io.in(gameName).emit('gameStarted')
      io.in(gameName).emit('updatePlayers', game.players)
      updateBoard(gameName)
      appendLog(gameName, 'The game begins!')
      updateGames()
    }
    else {
      console.log(`${socket.playerName} tried to start ${gameName} incorrectly with ${game.players.length}`)
      socket.emit('errorMsg', 'Error: need between 1-5 players to start.')
    }
  }))

  socket.on('firstRequest', playerIndex => inGame((gameName, game) => {
    if (game.started && game.players.every(player => !player.current) &&
        Number.isInteger(playerIndex) && 0 <= playerIndex && playerIndex < game.players.length) {
      // TODO: appendUndo
      const player = game.players[playerIndex]
      player.current = 2
      player.validPiles = validPiles(player.hand, game.board)
      appendLog(gameName, `${player.name} elects to go first.`)
      io.in(gameName).emit('updatePlayers', game.players)
    }
    else {
      console.log(`${socket.playerName} tried to set first player incorrectly`)
      socket.emit('errorMsg', 'Error: already have a current player.')
    }
  }))

  socket.on('playRequest', data => inGame((gameName, game) => {
    if (game.started) {
      const currentIndex = game.players.findIndex(player => player.current)
      const player = game.players[currentIndex]
      if (0 <= currentIndex && player.current) {
        if (Number.isInteger(data.pileIndex) &&
            0 <= data.pileIndex && data.pileIndex < 4 &&
            Number.isInteger(data.cardIndex) &&
            0 <= data.cardIndex && data.cardIndex < player.hand.length &&
            player.validPiles[data.cardIndex].includes(data.pileIndex)) {
          // TODO: appendUndo
          const card = player.hand[data.cardIndex]
          game.board[data.pileIndex] = card
          player.hand.splice(data.cardIndex, 1)
          appendLog(gameName,
            {name: player.name, card: card, pileIndex: data.pileIndex})
          player.current--
          const nextPlayer = player.current ? player :
            game.players[(currentIndex + 1) % game.players.length]
          if (!player.current) {
            delete player.current
            delete player.validPiles
            const handSize = HandSize(game.players.length)
            while (game.deck.length && player.hand.length < handSize)
              player.hand.push(game.deck.pop())
            nextPlayer.current = game.deck.length ? 2 : 1
          }
          nextPlayer.validPiles = validPiles(nextPlayer.hand, game.board)
          // TODO: check if nextPlayer.validPiles.every(is empty), i.e., cannot move (game over)
          io.in(gameName).emit('updatePlayers', game.players)
          updateBoard(gameName)
        }
      }
    }
    // TODO: error messages
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

process.on('SIGINT', () => {
  saveGames()
  if (unix) fs.unlinkSync(port)
  process.exit()
})
process.on('uncaughtExceptionMonitor', saveGames)
