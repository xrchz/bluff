'use strict'

const express = require('express')
const https = require('https')
const fs = require('fs')
const options = {
  key: fs.readFileSync('/etc/ssl/xrchz/key.pem'),
  cert: fs.readFileSync('/etc/ssl/xrchz/cert.pem')
}
var app = express()
var server = https.createServer(options, app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/words.html`)
})
app.use(express.static(`${__dirname}/client`))

const port = 4321
server.listen(port, "0.0.0.0")
console.log(`server started on https://xrchz.net:${port}`)

const games = {}

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

function appendLog(gameName, entry) {
  const game = games[gameName]
  game.log.push(entry)
  io.in(gameName).emit('appendLog', entry)
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

const Blue = 0
const Red = 1

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
      game = { teams: [[], []],
               players: [],
               spectators: [] }
      games[gameName] = game
    }
    else
      game = games[gameName]
    if (!data.playerName) {
      socket.playerName = `Potato${Math.floor(Math.random()*20)}`
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
          socket.emit('updateTeams', game.teams)
        }
        else {
          socket.emit('gameStarted')
          // ...
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
          // ...
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
        if (game.players.length < 4) {
          console.log(`${socket.playerName} joining ${gameName}`)
          socket.leave('lobby'); socket.emit('updateGames', [])
          socket.join(gameName)
          socket.gameName = gameName
          game.players.push({ socketId: socket.id, name: socket.playerName })
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          socket.emit('updateSpectators', game.spectators)
          io.in(gameName).emit('updateUnseated', game.players)
          io.in(gameName).emit('updateTeams', game.teams)
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

  socket.on('undoRequest', () => inGame((gameName, game) => {
    if (game.started && game.undoLog.length) {
      const entry = game.undoLog.pop()
      copy(stateKeys.game, entry, game, true)
      io.in(gameName).emit('updatePlayers', game.players)
      let kitty = { kitty: game.kitty }
      if (game.selectKitty) {
        kitty.contractorName = game.players[game.lastBidder].name,
        kitty.contractorIndex = game.lastBidder
      }
      io.in(gameName).emit('updateKitty', kitty)
      io.in(gameName).emit('showJoker', false)
      if (game.nominateJoker) {
        const player = game.players.find(p => p.nominating)
        io.in(player.socketId).emit('showJoker', true)
      }
      if (game.trick)
        io.in(gameName).emit('updateTrick', { trick: game.trick, leader: game.leader })
      io.in(gameName).emit('removeLog', game.log.length - entry.logLength)
      game.log.length = entry.logLength
      game.rounds.length = entry.roundsLength
      restoreScore(gameName, game.teamNames, game.rounds, game.players)
      if (!game.undoLog.length)
        io.in(gameName).emit('showUndo', false)
      io.in(gameName).emit('errorMsg', `${socket.playerName} pressed Undo.`)
      io.in(gameName).emit('blameMsg', '')
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried to undo nothing`)
      socket.emit('errorMsg', 'Error: there is nothing to undo.')
    }
  }))

  socket.on('sitHere', index => inGame((gameName, game) => {
    if (!game.started) {
      const seat = game.seats[index]
      if (seat) {
        if (!seat.player) {
          const player = game.players.find(player => player.socketId === socket.id)
          if (player) {
            if (!player.seated) {
              seat.player = player
              player.seated = true
              io.in(gameName).emit('updateUnseated', game.players)
              io.in(gameName).emit('updateSeats', game.seats)
              console.log(`${socket.playerName} in ${gameName} took their seat`)
            }
            else {
              console.log(`error: ${socket.playerName} in ${gameName} tried to sit but is already seated`)
              socket.emit('errorMsg', 'Error: you are already seated.')
            }
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried to sit but is not a player`)
            socket.emit('errorMsg', 'Error: a non-player cannot sit.')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried sitting in an occupied seat`)
          socket.emit('errorMsg', 'Error: trying to sit in an occupied seat.')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried sitting at invalid index ${index}`)
        socket.emit('errorMsg', 'Error: trying to sit at an invalid seat index.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried sitting when game already started`)
      socket.emit('errorMsg', 'Error: cannot sit after the game has started.')
    }
  }))

  socket.on('leaveSeat', () => inGame((gameName, game) => {
    if (!game.started) {
      const player = game.players.find(player => player.socketId === socket.id)
      if (player) {
        if (player.seated) {
          const seat = game.seats.find(seat => seat.player && seat.player.name === player.name)
          if (seat) {
            delete seat.player
            player.seated = false
            io.in(gameName).emit('updateUnseated', game.players)
            io.in(gameName).emit('updateSeats', game.seats)
            console.log(`${socket.playerName} in ${gameName} left their seat`)
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} is tried to leave seat but no seat has them`)
            socket.emit('errorMsg', 'Error: could not find you in any seat.')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} is not seated but tried to leave their seat`)
          socket.emit('errorMsg', 'Error: you are not seated so cannot leave your seat.')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} is not a player but tried to leave a seat`)
        socket.emit('errorMsg', 'Error: non-player trying to leave seat.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried leaving seat when game already started`)
      socket.emit('errorMsg', 'Error: cannot leave seat after the game has started.')
    }
  }))

  socket.on('startGame', () => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.length === 4 && game.seats.every(seat => seat.player)) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.undoLog = []
        game.log = []
        game.players = game.seats.map(seat => seat.player)
        delete game.seats
        game.players.forEach(player => delete player.seated)
        game.teamNames = [`${game.players[0].name} & ${game.players[2].name}`,
                          `${game.players[1].name} & ${game.players[3].name}`]
        game.total = [0, 0]
        game.rounds = []
        game.dealer = Math.floor(Math.random() * 4)
        io.in(gameName).emit('gameStarted')
        appendLog(gameName, 'The game begins!')
        startRound(gameName)
        updateGames()
      }
      else {
        socket.emit('errorMsg', 'Error: 4 seated players required to start the game.')
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
        game.teams[Blue] = game.teams[Blue].filter(notThisPlayer)
        game.teams[Red] = game.teams[Red].filter(notThisPlayer)
        io.in(gameName).emit('updateSpectators', game.spectators)
        io.in(gameName).emit('updateSeats', game.seats)
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
          game.players.find(player => player.socketId === socket.id).socketId = null
          io.in(gameName).emit('updatePlayers', game.players)
        }
      }
      updateGames()
    }
  })
})
