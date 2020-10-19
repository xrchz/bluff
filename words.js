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

const TotalWords = 25
const TeamWords = 8
const Assassins = 1
const FirstGivingSeconds = 300
const GivingSeconds = 180
const GuessingSeconds = 240

const wordList = fs.readFileSync('words.txt', 'utf8').split('\n')
wordList.pop()

const games = {}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

function randomWords() {
  const a = []
  for (let i = 0; i < wordList.length; i++) {
    const j = Math.floor(Math.random() * (i+1))
    if (j < i) a[i] = a[j]
    a[j] = wordList[i]
  }
  a.length = TotalWords
  return a
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
                players: game.players.map(player => ({ name: player.name, disconnected: !player.socketId }))
              })
  io.in(room).emit('updateGames', data)
}

const Blue = 0
const Red = 1
const Assassin = 2
const teamName = c => c === Blue ? 'Blue' : c === Red ? 'Red' : null
const colourName = c => c === Blue ? 'blue' : c === Red ? 'red' : c === Assassin ? 'assassin' : 'neutral'
const typeIcon = t => t === 'friend' ? '✓' : t === 'foe' ? '✗' : t === 'assassin' ? '☠' : '–'

const canStart = game =>
  game.teams[Blue].length >= 2 &&
  game.teams[Red].length >= 2 &&
  game.players.every(player => player.team !== undefined)

function updateTeams(gameName, socketId) {
  const game = games[gameName]
  const room = socketId ? socketId : gameName
  io.in(room).emit('updateTeams',
    { teams: game.teams,
      started: game.started,
      guessing: !!game.guessesLeft,
      whoseTurn: game.whoseTurn,
      wordsLeft: game.wordsLeft,
      winner: game.winner
    })
  if (!game.started)
    io.in(room).emit('showStart', canStart(game))
}

function updateClue(gameName, socketId) {
  const game = games[gameName]
  const leaderId = game.winner === undefined && game.teams[game.whoseTurn][0].socketId
  if (!socketId || leaderId === socketId) {
    io.in(gameName).emit('showClue', false)
    if (game.giving)
      io.in(leaderId).emit('showClue', game.wordsLeft[game.whoseTurn])
  }
}

function updateWords(gameName, socketId) {
  const room = socketId ? socketId : gameName
  const game = games[gameName]
  io.in(room).emit('updateWords', {
    words: game.words,
    guessing: !!game.guessesLeft,
    whoseTurn: game.whoseTurn,
    winner: game.winner
  })
}

function formatSeconds(secs) {
  if (secs > 60) {
    const s = secs % 60
    return `${(secs - s)/60}m${s}s`
  }
  else
    return `${secs}s`
}

function startTimer(gameName) {
  const game = games[gameName]
  function callback() {
    if (game.secondsLeft) {
      io.in(gameName).emit('updateTimeLimit', `${formatSeconds(game.secondsLeft)} left`)
      game.secondsLeft--
      game.timeout = setTimeout(callback, 1000)
    }
    else {
      io.in(gameName).emit('updateTimeLimit', '')
      const clues = game.clues[game.whoseTurn]
      if (game.giving) {
        const clue = { text: `(timeout) (0)`, guesses: [] }
        clues.push(clue)
        io.in(gameName).emit('updateClues', { team: game.whoseTurn, clues: clues })
        delete game.giving
        game.guessesLeft = Infinity
        game.secondsLeft = GuessingSeconds
        game.timeout = setTimeout(callback, 0)
        io.in(gameName).emit('showPause', { show: true, text: 'Pause' })
      }
      else if (!!game.guessesLeft) {
        const clue = clues[clues.length - 1]
        clue.guesses.push({ who: 'all', what: '(timeout)', classes: ['pass'] })
        io.in(gameName).emit('updateClues', { team: game.whoseTurn, clues: clues })
        game.whoseTurn = 1 - game.whoseTurn
        delete game.guessesLeft
        game.giving = true
        game.secondsLeft = GivingSeconds
        game.timeout = setTimeout(callback, 0)
        io.in(gameName).emit('showPause', { show: true, text: 'Pause' })
      }
      updateTeams(gameName)
      updateWords(gameName)
      updateClue(gameName)
    }
  }
  game.timeout = setTimeout(callback, 0)
  io.in(gameName).emit('showPause', { show: true, text: 'Pause' })
}

function stopTimer(gameName) {
  const game = games[gameName]
  clearTimeout(game.timeout)
  delete game.timeout
  delete game.secondsLeft
  io.in(gameName).emit('updateTimeLimit', '')
  io.in(gameName).emit('showPause', { show: false })
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
               spectators: [],
               assassins: Assassins
             }
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
        socket.emit('updateAssassins', game.assassins)
        io.in(gameName).emit('updateSpectators', game.spectators)
        if (!game.started) {
          socket.emit('updateUnseated', game.players)
          updateTeams(gameName)
        }
        else {
          updateTeams(gameName, socket.id)
          socket.emit('gameStarted')
          updateWords(gameName, socket.id)
          updateClue(gameName, socket.id)
          socket.emit('updateClues', { team: Blue, clues: game.clues[Blue] })
          socket.emit('updateClues', { team: Red, clues: game.clues[Red] })
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
          socket.emit('updateAssassins', game.assassins)
          socket.emit('updateSpectators', game.spectators)
          updateTeams(gameName)
          socket.emit('gameStarted')
          updateWords(gameName, socket.id)
          updateClue(gameName, socket.id)
          socket.emit('updateClues', { team: Blue, clues: game.clues[Blue] })
          socket.emit('updateClues', { team: Red, clues: game.clues[Red] })
          if (game.timeout)
            socket.emit('showPause', { show: true, text: 'Pause' })
          else if (game.secondsLeft) {
            socket.emit('updateTimeLimit', `${formatSeconds(game.secondsLeft)} left`)
            socket.emit('showPause', { show: true, text: 'Resume' })
          }
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
        socket.emit('updateAssassins', game.assassins)
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
          if (!game.teams[colour].length) player.leader = true
          game.teams[colour].push(player)
          player.team = colour
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
      const team = game.teams[player.team]
      if (team) {
        const index = team.findIndex(player => player.socketId === socket.id)
        if (0 <= index) {
          team.splice(index, 1)
          if (player.leader && team.length) team[0].leader = true
          delete player.leader
          delete player.team
          io.in(gameName).emit('updateUnseated', game.players)
          updateTeams(gameName)
          console.log(`${socket.playerName} in ${gameName} left their team`)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} not found in their team`)
          socket.emit('errorMsg', 'Error: you were not found in your team.')
        }
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

  socket.on('setAssassins', n => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.find(player => player.socketId === socket.id) && Number.isInteger(n) && 0 <= n && n <= 2) {
        game.assassins = n
        socket.to(gameName).emit('updateAssassins', n)
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} failed setting assassins to ${n}`)
        socket.emit('errorMsg', 'Error: cannot set assassins: invalid number or player.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried setting assassins when game already started`)
      socket.emit('errorMsg', 'Error: cannot set assassins after the game has started.')
    }
  }))

  socket.on('startGame', () => inGame((gameName, game) => {
    if (!game.started) {
      if (canStart(game)) {
        console.log(`starting ${gameName}`)
        game.started = true
        for (const index of [Blue, Red]) {
          const team = game.teams[index]
          const leaderIndex = team.findIndex(player => player.leader)
          team.unshift(team.splice(leaderIndex, 1)[0])
        }
        game.words = randomWords().sort().map(word => ({word: word}))
        game.whoseTurn = Math.floor(Math.random() * 2)
        const colours = []
        colours.length = game.words.length
        let i = 0
        colours[i++] = game.whoseTurn
        for (let j = 0; j < TeamWords; j++) colours[i++] = game.whoseTurn
        for (let j = 0; j < TeamWords; j++) colours[i++] = 1 - game.whoseTurn
        for (let j = 0; j < game.assassins; j++) colours[i++] = Assassin
        shuffleInPlace(colours)
        game.words.forEach((x, i) => { if (colours[i] !== undefined) x.colour = colours[i] })
        game.wordsLeft = [TeamWords, TeamWords]
        game.wordsLeft[game.whoseTurn]++
        game.log = []
        io.in(gameName).emit('gameStarted')
        game.giving = true
        game.secondsLeft = FirstGivingSeconds
        startTimer(gameName)
        game.clues = [[], []]
        updateTeams(gameName)
        updateWords(gameName)
        updateClue(gameName)
      }
      else {
        socket.emit('errorMsg', 'Error: missing players or not enough players to start.')
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('clueRequest', data => inGame((gameName, game) => {
    if (game.giving) {
      const leader = game.teams[game.whoseTurn][0]
      if (leader && leader.socketId === socket.id) {
        if (Number.isInteger(data.n) && 0 <= data.n && data.n <= game.wordsLeft[game.whoseTurn] + 1) {
          stopTimer(gameName)
          if (data.n > game.wordsLeft[game.whoseTurn]) data.n = Infinity
          const clue = { text: `${data.clue} (${data.n === Infinity ? '∞' : data.n.toString()})`,
                         guesses: [] }
          game.clues[game.whoseTurn].push(clue)
          io.in(gameName).emit('updateClues', { team: game.whoseTurn, clues: game.clues[game.whoseTurn] })
          delete game.giving
          game.guessesLeft = data.n === 0 ? Infinity : data.n + 1
          game.secondsLeft = GuessingSeconds
          startTimer(gameName)
          updateTeams(gameName)
          updateWords(gameName)
          updateClue(gameName)
        }
        else {
          console.log(`${socket.playerName} gave invalid clue in ${gameName}`)
          socket.emit('errorMsg', `Error: not a valid clue number.`)
        }
      }
      else {
        console.log(`${socket.playerName} attempted to give clue in ${gameName} out of turn`)
        socket.emit('errorMsg', `Error: it is not your turn to give a clue.`)
      }
    }
    else {
      console.log(`${socket.playerName} attempted to give clue in ${gameName}`)
      socket.emit('errorMsg', `Error: it is not time to give clues.`)
    }
  }))

  socket.on('guessRequest', index => inGame((gameName, game) => {
    if (!!game.guessesLeft) {
      const player = game.teams[game.whoseTurn].find(player => player.socketId === socket.id)
      const clues = game.clues[game.whoseTurn]
      const clue = clues && clues[clues.length - 1]
      if (player && clue) {
        if (index === false ||
            Number.isInteger(index) && 0 <= index && index < game.words.length && !game.words[index].guessed) {
          let endTurn
          if (index === false) {
            clue.guesses.push({ who: player.name, what: 'pass', classes: ['pass'] })
            endTurn = true
          }
          else {
            const word = game.words[index]
            word.guessed = true
            game.guessesLeft--
            if ([Blue, Red].includes(word.colour))
              game.wordsLeft[word.colour] =
                game.words.reduce((n, w) => w.colour === word.colour && !w.guessed ? n + 1 : n, 0)
            endTurn = game.guessesLeft === 0
            let type
            if (word.colour === game.whoseTurn)
              type = 'friend'
            else if (word.colour === 1 - game.whoseTurn) {
              type = 'foe'
              endTurn = true
            }
            else if (word.colour === Assassin) {
              type = 'assassin'
              endTurn = type
            }
            else {
              type = 'neutral'
              endTurn = true
            }
            const guess = { who: player.name, what: `${word.word} (${typeIcon(type)})`, classes: [type] }
            const colourClass = colourName(word.colour)
            if (colourClass) guess.classes.push(colourClass)
            clue.guesses.push(guess)
          }
          io.in(gameName).emit('updateClues', { team: game.whoseTurn, clues: clues })
          if (game.wordsLeft.includes(0)) {
            stopTimer(gameName)
            game.winner = game.whoseTurn
            delete game.guessesLeft
            delete game.whoseTurn
          }
          else if (endTurn === 'assassin') {
            stopTimer(gameName)
            game.winner = 1 - game.whoseTurn
            delete game.guessesLeft
            delete game.whoseTurn
          }
          else if (endTurn) {
            stopTimer(gameName)
            game.whoseTurn = 1 - game.whoseTurn
            delete game.guessesLeft
            game.giving = true
            game.secondsLeft = GivingSeconds
            startTimer(gameName)
            updateClue(gameName)
          }
          updateTeams(gameName)
          updateWords(gameName)
        }
        else {
          console.log(`${socket.playerName} gave invalid guess ${index} in ${gameName}`)
          socket.emit('errorMsg', `Error: that is not a valid word index.`)
        }
      }
      else {
        console.log(`${socket.playerName} attempted to give guess in ${gameName} out of turn`)
        socket.emit('errorMsg', `Error: it is not your turn to guess a word.`)
      }
    }
    else {
      console.log(`${socket.playerName} attempted to give guess in ${gameName}`)
      socket.emit('errorMsg', `Error: it is not time to give guesses.`)
    }
  }))

  socket.on('pauseRequest', () => inGame((gameName, game) => {
    if (game.timeout) {
      clearTimeout(game.timeout)
      delete game.timeout
      io.in(gameName).emit('showPause', { show: true, text: 'Resume' })
    }
    else if (game.secondsLeft)
      startTimer(gameName)
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
        }
      }
      if (gameName in games) updateTeams(gameName)
      updateGames()
    }
  })
})
