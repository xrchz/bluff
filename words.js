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

function updateTeams(gameName) {
  const game = games[gameName]
  io.in(gameName).emit('updateTeams', game.teams)
  io.in(gameName).emit('showStart',
    game.teams[Red].length >= 2 && game.teams[Blue].length >= 2 &&
    game.players.every(player => player.team !== undefined))
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
          updateTeams(gameName)
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
        console.log(`${socket.playerName} joining ${gameName}`)
        socket.leave('lobby'); socket.emit('updateGames', [])
        socket.join(gameName)
        socket.gameName = gameName
        game.players.push({ socketId: socket.id, name: socket.playerName })
        socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
        socket.emit('updateSpectators', game.spectators)
        updateTeams(gameName)
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

  socket.on('joinTeam', colour => inGame((gameName, game) => {
    if (!game.started) {
      if (colour === Red || colour === Blue) {
        const player = game.players.find(player => player.socketId === socket.id)
        if (player && player.team === undefined) {
          game.teams[colour].push(player)
          player.team = colour
          if (game.teams[colour].length === 1) player.leader = true
          io.in(gameName).emit('updateUnseated', game.players)
          updateTeams(gameName)
          console.log(`${socket.playerName} in ${gameName} joined team ${colour}`)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} failed to join ${colour}`)
          socket.emit('errorMsg', 'Error: you are not a player or already on a team.')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried joining invalid team ${colour}`)
        socket.emit('errorMsg', 'Error: trying to join an invalid team colour.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried joining when game already started`)
      socket.emit('errorMsg', 'Error: cannot join a team after the game has started.')
    }
  }))

  socket.on('leaveTeam', () => inGame((gameName, game) => {
    if (!game.started) {
      const player = game.players.find(player => player.socketId === socket.id)
      if (player && player.team !== undefined) {
        game.teams[player.team] = game.teams[player.team].filter(x => x.socketId !== player.socketId)
        if (game.teams[player.team].length === 1) game.teams[player.team][0].leader = true
        delete player.leader
        delete player.team
        io.in(gameName).emit('updateUnseated', game.players)
        updateTeams(gameName)
        console.log(`${socket.playerName} in ${gameName} left their team`)
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} failed to leave their team`)
        socket.emit('errorMsg', 'Error: you are not a player or not on a team.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried leaving when game already started`)
      socket.emit('errorMsg', 'Error: cannot leave a team after the game has started.')
    }
  }))

  socket.on('setLeader', playerName => inGame((gameName, game) => {
    if (!game.started) {
      const player = game.players.find(player => player.name === playerName)
      if (player && game.teams[player.team]) {
        const team = game.teams[player.team]
        team.forEach(player => delete player.leader)
        player.leader = true
        updateTeams(gameName)
        console.log(`${socket.playerName} in ${gameName} set ${playerName} as leader`)
        /* leader jumps to top
        const index = team.findIndex(x => player.socketId === x.socketId)
        if (0 <= index) {
          delete team[0].leader
          team.unshift(team.splice(index, 1)[0])
          player.leader = true
          updateTeams(gameName)
          console.log(`${socket.playerName} in ${gameName} set ${playerName} as leader`)
        }
        else {
          console.log(`error: ${player.name} in ${gameName} not found on their team`)
          socket.emit('errorMsg', `Error: could not find player ${playerName} on their team.`)
        }
        */
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} failed to set ${playerName} as leader`)
        socket.emit('errorMsg', `Error: could not find player ${playerName} on a team.`)
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried setting leader when game already started`)
      socket.emit('errorMsg', 'Error: cannot set leader after the game has started.')
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
        for (const team of [Blue, Red]) {
          game.teams[team] = game.teams[team].filter(notThisPlayer)
          if (game.teams[team].length === 1) game.teams[team][0].leader = true
        }
        io.in(gameName).emit('updateSpectators', game.spectators)
        updateTeams(gameName)
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
