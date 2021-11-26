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

function lookupWord(word) {
  let node = wordTrie;
  for (const letter of word) {
    node = node.sub[letter]
    if (!node) return false
  }
  return !!node.end
}

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

function findWord(grid, word) {
  function find(path, index) {
    if (index === word.length) return path
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
        const newindex = index + letter.length
        if (word.substring(index, newindex) === letter) {
          const newpath = Array.from(path)
          newpath.push(newpos)
          const result = find(newpath, newindex)
          if (result) return result
        }
      }
    }
  }
  for (let pos = 0; pos < 16; pos++) {
    const letter = grid[pos]
    if (word.substring(0, letter.length) === letter) {
      const result = find([pos], letter.length)
      if (result) return result
    }
  }
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

function randomGrid(origDice) {
  const dice = Array.from(origDice)
  shuffleInPlace(dice)
  return dice.map(die => {
    const l = die[Math.floor(Math.random() * 6)]
    return l === 'q' ? 'qu' : l
  })
}

function calculateScores(game) {
  game.players.forEach(player =>
    player.wordSet = new Set(player.words))
  for (const player of game.players) {
    player.score = 0
    player.wordData = player.words.map(word => {
      let path = game.words.get(word)
      if (path) {
        const missedBy = game.players.reduce((n, player) => player.wordSet.has(word) ? n : n + 1, 0)
        const points = (word.length - 2) * missedBy
        player.score += points
        return { word: word, path: path, points: points, missedBy: missedBy }
      }
      else {
        let data = { word: word, points: 0 }
        if (!lookupWord(word)) {
          data.points -= game.notWordPenalty
          data.notWord = true
        }
        path = findWord(game.grid, word)
        if (!path) {
          data.points -= game.invalidWordPenalty
          data.invalidWord = true
        }
        else
          data.path = path
        player.score += data.points
        return data
      }
    })
  }
  let score = 0
  let wordData = Array.from(game.words.entries(), pair => {
    const word = pair[0], path = pair[1]
    const missedBy = game.players.reduce((n, player) => player.wordSet.has(word) ? n : n + 1, 0)
    const points = (word.length - 2) * missedBy
    score += points
    return { word: word, path: path, points: points, missedBy: missedBy }
  }).sort((x, y) => x.word < y.word ? -1 : 1)
  game.scores = game.players.map(player => ({ name: player.name, words: player.wordData, score: player.score }))
  game.scores.push({ name: 'God', words: wordData, score: score })
}

const saveFile = 'trace.json'

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

process.on('SIGINT', () => { saveGames(); fs.unlinkSync(unix); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)

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

function formatSeconds(secs) {
  const s = secs % 60
  return `${(secs - s) / 60}:${s.toString().padStart(2, '0')}`
}

function startTimer(gameName) {
  const game = games[gameName]
  function callback() {
    if (game.secondsLeft) {
      io.in(gameName).emit('updateTimeLimit', formatSeconds(game.secondsLeft))
      game.secondsLeft--
      game.timeout = setTimeout(callback, 1000)
    }
    else {
      io.in(gameName).emit('updateTimeLimit', '')
      delete game.secondsLeft
      delete game.timeout
      game.ended = true
      io.in(gameName).emit('showPause', { show: false })
      calculateScores(game)
      io.in(gameName).emit('showScores', game.scores)
    }
  }
  game.timeout = setTimeout(callback, 0)
  io.in(gameName).emit('showPause', { show: true, text: 'Pause' })
}

function updateSettings(game, room) {
  io.in(room).emit('updateTimeSetting', formatSeconds(game.timeLimit))
  io.in(room).emit('updatePenalty', { id: 'notWordPenalty', n: game.notWordPenalty })
  io.in(room).emit('updatePenalty', { id: 'invalidWordPenalty', n: game.invalidWordPenalty })
}

function clearOtherApprovals(players, id) {
  players.forEach(other => {
    if (other.socketId !== id) {
      other.approve = false
      io.in(other.socketId).emit('clearApproval')
    }
  })
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
        timeLimit: 180,
        notWordPenalty: 1,
        invalidWordPenalty: 2
      }
      game.grid = randomGrid(hardDice)
      game.words = findAllWords(game.grid)
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
        socket.join(`${gameName}spectators`)
        game.spectators.push({ socketId: socket.id, name: socket.playerName })
        socket.emit('joinedGame',
          { gameName: gameName, playerName: socket.playerName, godWords: game.words.size, spectate: true })
        updateSettings(game, socket.id)
        io.in(gameName).emit('updateSpectators', game.spectators)
        socket.emit('updatePlayers', game.players)
        if (game.started) {
          socket.emit('gameStarted', game.grid)
          socket.emit('setupLists', game.players.map(player => player.name))
          if (!game.ended) {
            game.players.forEach((player, index) =>
              player.words.forEach(word =>
                socket.emit('appendWord', { player: index, word: word })))
          }
          else
            socket.emit('showScores', game.scores)
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
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName, godWords: game.words.size })
          updateSettings(game, socket.id)
          socket.emit('updateSpectators', game.spectators)
          io.in(gameName).emit('updatePlayers', game.players)
          socket.emit('gameStarted', game.grid)
          if (!game.ended) {
            player.words.forEach(word => socket.emit('appendWord', { word: word }))
            if (game.timeout)
              socket.emit('showPause', { show: true, text: 'Pause' })
            else if (game.secondsLeft) {
              socket.emit('updateTimeLimit', formatSeconds(game.secondsLeft))
              socket.emit('showPause', { show: true, text: 'Resume' })
            }
          }
          else
            socket.emit('showScores', game.scores)
        }
        else {
          console.log(`error: ${socket.playerName} rejoining ${gameName} while in ${socket.rooms}`)
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
        socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName, godWords: game.words.size })
        updateSettings(game, socket.id)
        socket.emit('clearApproval')
        socket.emit('updateSpectators', game.spectators)
        io.in(gameName).emit('updatePlayers', game.players)
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

  socket.on('setTimeSetting', n => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.find(player => player.socketId === socket.id) && Number.isInteger(n) && 0 < n) {
        game.timeLimit = n
        io.in(gameName).emit('updateTimeSetting', formatSeconds(game.timeLimit))
        clearOtherApprovals(game.players, socket.id)
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} failed setting time limit to ${n}`)
        socket.emit('errorMsg', 'Error: cannot set time limit: invalid number or player.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried setting time limit when game already started`)
      socket.emit('errorMsg', 'Error: cannot set time limit after the game has started.')
    }
  }))

  socket.on('setPenalty', data => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.find(player => player.socketId === socket.id) &&
          Number.isInteger(data.n) && 0 <= data.n &&
          typeof(data.id) === 'string' && data.id.endsWith('Penalty') && game[data.id] !== undefined) {
        game[data.id] = data.n
        io.in(gameName).emit('updatePenalty', data)
        clearOtherApprovals(game.players, socket.id)
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} failed setting ${data.id} to ${data.n}`)
        socket.emit('errorMsg', 'Error: cannot set penalty: invalid settings or player.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried setting ${data.id} when game already started`)
      socket.emit('errorMsg', 'Error: cannot set penalty after the game has started.')
    }
  }))

  socket.on('setApprove', approve => inGame((gameName, game) => {
    if (!game.started) {
      const player = game.players.find(player => player.socketId === socket.id)
      if (player) {
        player.approve = approve
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} failed to (dis)approve`)
        socket.emit('errorMsg', 'Error: cannot set approval: invalid player.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried (dis)approving settings when game already started`)
      socket.emit('errorMsg', 'Error: cannot change approval after the game has started.')
    }
  }))

  socket.on('startGame', () => inGame((gameName, game) => {
    if (!game.started) {
      if (game.players.length) {
        if (game.players.every(player => player.approve)) {
          console.log(`starting ${gameName}`)
          game.started = true
          game.players.forEach(player => player.words = [])
          io.in(gameName).emit('gameStarted', game.grid)
          io.in(`${gameName}spectators`).emit('setupLists', game.players.map(player => player.name))
          game.secondsLeft = game.timeLimit
          startTimer(gameName)
        }
        else {
          socket.emit('errorMsg', `Cannot start when players disapprove: ${game.players.flatMap(player => player.approve ? [] : [player.name]).join(', ')}.`)
        }
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
    if (game.started && !game.ended) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      if (playerIndex !== -1) {
        const player = game.players[playerIndex]
        if (wordRegexp.test(word)) {
          if (!game.timeout) startTimer(gameName)
          const index = player.words.findIndex(w => w === word)
          if (index === -1) {
            player.words.push(word)
            // console.log(`${socket.playerName} at ${playerIndex} in ${gameName} submitted ${word}`)
            socket.emit('appendWord', { word: word })
            io.in(`${gameName}spectators`).emit('appendWord', { player: playerIndex, word: word })
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
      console.log(`${socket.playerName} submitted a word to not active ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} has not started or has finished.`)
    }
  }))

  socket.on('undoRequest', word => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
      if (playerIndex !== -1) {
        const player = game.players[playerIndex]
        const index = player.words.findIndex(w => w === word)
        if (index > -1) {
          if (!game.timeout) startTimer(gameName)
          player.words.splice(index, 1)
          socket.emit('scratchWord', { index: index })
          io.in(`${gameName}spectators`).emit('scratchWord', { player: playerIndex, index: index })
        }
        else {
          console.log(`${socket.playerName} tried scratching ${word}`)
          socket.emit('errorMsg', `Error: that word is not on your list.`)
        }
      }
      else {
        console.log(`${socket.playerName} not found as player in ${gameName} when scratching a word`)
        socket.emit('errorMsg', `Error: could not find you as a player.`)
      }
    }
    else {
      console.log(`${socket.playerName} tried undoing in not active ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} has not started or has finished.`)
    }
  }))

  socket.on('pauseRequest', () => inGame((gameName, game) => {
    if (game.started && !game.ended) {
      if (game.timeout) {
        clearTimeout(game.timeout)
        delete game.timeout
        io.in(gameName).emit('showPause', { show: true, text: 'Resume' })
      }
      else startTimer(gameName)
    }
    else {
      console.log(`${socket.playerName} tried to pause ${gameName}`)
      socket.emit('errorMsg', `Error: ${gameName} not active.`)
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
