'use strict'

const express = require('express')
const http = require('http')
const fs = require('fs')
var app = express()
var server = http.createServer(app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/trace.html`)
})
app.use(express.static(`${__dirname}/client`))

const unix = '/run/games/trace.socket'
server.listen(unix)
console.log(`server started on ${unix}`)
server.on('listening', () => fs.chmodSync(unix, 0o777))
process.on('SIGINT', () => { fs.unlinkSync(unix); process.exit() })

const wordTrie = { sub: {} }
for (const word of fs.readFileSync('trace.txt', 'utf8').split('\n')) {
  if (word.length < 3) continue
  let prev, node = wordTrie
  for (let i = 0; i < word.length; i++) {
    const letter = word[i]
    if (node.sub[letter] === undefined)
      node.sub[letter] = { sub: {} }
    if (letter === 'q') prev = node
    node = node.sub[letter]
    if (letter === 'u' && 0 < i && word[i-1] === 'q')
      prev.sub['qu'] = node
  }
  node.end = true
}
/*
x
x.sub['a'] = y
y.sub['q'] = z
z.sub['u'] = w
w.sub['a'] = v
v.end
want: y.sub['qu'] = v
i = 0, node = x
i = 1, node = y, prev = y
i = 2, node = w, prev = y
*/

const wordRegexp = /^[a-z][a-z][a-z]+$/

function findAllWords(grid) {
  const words = new Map()
  function addWords(path, prefix, node) {
    if (node.end && !words.has(prefix)) words.set(prefix, path)
    const pos = path[path.length - 1]
    const col = pos % 4
    const row = (pos - col) / 4
    for (const coldelta of [-1, 0, 1]) {
      for (const rowdelta of [-1, 0, 1]) {
        if (coldelta === 0 && rowdelta === 0) continue
        if (col + coldelta < 0 || col + coldelta >= 4) continue
        if (row + rowdelta < 0 || row + rowdelta >= 4) continue
        const newpos = (row + rowdelta) * 4 + col + coldelta
        if (path.includes(newpos)) continue
        const letter = grid[newpos]
        if (node.sub[letter] === undefined) continue
        const newpath = Array.from(path)
        newpath.push(newpos)
        addWords(newpath, prefix + letter, node.sub[letter])
      }
    }
  }
  for (let pos = 0; pos < 16; pos++) {
    const letter = grid[pos]
    const node = wordTrie.sub[letter]
    if (node) addWords([pos], letter, node)
  }
  return words
}

const hardDice = [
  'aaciot', 'ahmors', 'egkluy', 'abilty',
  'acdemp', 'egintv', 'gilruw', 'elpstu',
  'denosw', 'acelrs', 'abjmoq', 'eefhiy',
  'ehinps', 'dknotu', 'adenvz', 'biforx']

const easyDice = [
  'aaeegn', 'elrtty', 'aoottw', 'abbjoo',
  'ehrtvw', 'cimotu', 'distty', 'eiosst',
  'delrvy', 'achops', 'himnqu', 'eeinsu',
  'eeghnw', 'affkps', 'hlnnrz', 'deilrx']

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

/*
const letterFreqs = []
for (let i = 0; i <= 26; i++) letterFreqs[i] = 0
for (const word of wordList) {
  for (let i = 0; i < word.length; i++) {
    if (word[i] === 'q' && i+1 < word.length && word[i+1] === 'u') {
      letterFreqs[26]++
      i++
    }
    else
      letterFreqs[word.charCodeAt(i) - 97]++
  }
}
console.log(letterFreqs)
const logBase = 1 / Math.log(360)
for (let i = 0; i <= 26; i++) letterFreqs[i] = logBase * Math.log(letterFreqs[i])
console.log(letterFreqs)
const logFreqTotal = letterFreqs.reduce((t, n) => t + n)
console.log(logFreqTotal)

function randomGridLetter() {
  const r = Math.random() * logFreqTotal
  let t = 0
  for (let i = 0; i <= 26; i++) {
    t += letterFreqs[i]
    if (t >= r) {
      return i < 26 ? String.fromCharCode(i + 97) : 'qu'
    }
  }
}
for (let i = 0; i < 16; i++)
  console.log(randomGridLetter())
*/

function randomGrid(origDice) {
  const dice = Array.from(origDice)
  shuffleInPlace(dice)
  return dice.map(die => {
    const l = die[Math.floor(Math.random() * 6)]
    return l === 'q' ? 'qu' : l
  })
}

const games = {}

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
      game = {
        players: [],
        spectators: [],
        timeLimit: 180
      }
      games[gameName] = game
    }
    else
      game = games[gameName]
    if (!data.playerName) {
      socket.playerName = `Finger${Math.floor(Math.random()*20)}`
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
        // updateSettings(game, socket.id)
        io.in(gameName).emit('updateSpectators', game.spectators)
        if (!game.started) {
          socket.emit('updateUnseated', game.players)
        }
        else {
          socket.emit('gameStarted', { grid: game.grid, players: game.players.map(player => player.name) })
          game.players.forEach((player, index) =>
            player.words.forEach(word =>
              socket.emit('appendWord', { player: index, word: word })))
          // reconnection for spectator
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
          // updateSettings(game, socket.id)
          socket.emit('updateSpectators', game.spectators)
          socket.emit('gameStarted', { grid: game.grid, players: game.players.map(player => player.name) })
          game.players.forEach((player, index) =>
            player.words.forEach(word =>
              socket.emit('appendWord', { player: index, word: word })))
          // reconnection
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
        // updateSettings(game, socket.id)
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

  socket.on('startGame', () => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.length) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.grid = randomGrid(hardDice)
        game.words = findAllWords(game.grid)
        game.players.forEach(player => player.words = [])
        io.in(gameName).emit('gameStarted', { grid: game.grid, players: game.players.map(player => player.name) })
      }
      else {
        socket.emit('errorMsg', 'Error: not enough players to start.')
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('wordRequest', word => inGame((gameName, game) => {
    if (game.started) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      if (playerIndex !== -1) {
        const player = game.players[playerIndex]
        if (wordRegexp.test(word)) {
          const index = player.words.findIndex(w => w === word)
          if (index === -1) {
            player.words.push(word)
            // console.log(`${socket.playerName} at ${playerIndex} in ${gameName} submitted ${word}`)
            io.in(gameName).emit('appendWord', { player: playerIndex, word: word })
          }
          // else animate the found word
        }
        else {
          console.log(`${socket.playerName} submitted invalid word ${word} in ${gameName}`)
          socket.emit('errorMsg', `Error: that is not a valid word.`)
        }
      }
      else {
        console.log(`${socket.playerName} not found as player in ${gameName} when submitting word`)
        socket.emit('errorMsg', `Error: could not find you as a player.`)
      }
    }
    else {
      console.log(`${socket.playerName} submitted a word to not started ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} has not started.`)
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
      updateGames()
    }
  })
})
