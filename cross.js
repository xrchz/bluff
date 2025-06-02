'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = 'cross'

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
console.log(`server started on ${unix}`)
if (unix)
  server.on('listening', () => fs.chmodSync(port, 0o777))

const saveFile = `${gname}.json`

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

process.on('SIGINT', () => { saveGames(); fs.unlinkSync(port); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)

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

function updateGames(room) {
  if (!room) room = 'lobby'
  const data = []
  for (const [gameName, game] of Object.entries(games))
    data.push({ name: gameName,
                players: game.players.map(player => ({ name: player.name, socketId: player.socketId })),
                started: game.started,
                ended: game.ended
              })
  io.in(room).emit('updateGames', data)
}

const rackSize = 7
const boardSize = 15
const bonusPoints = 50
const midIndex = (boardSize-1) / 2
const onDiagonal = (i,j) => (i === j || i === boardSize-j-1)
const hasDistFromEdge = (i,n) => (i === n || i+n+1 === boardSize)
const onEdgeIndex = (i) => hasDistFromEdge(i,0)
const onInnerIndex = (i) => hasDistFromEdge(i,1)
const onEdge = (i,j) => (onEdgeIndex(i) || onEdgeIndex(j))
const onInner = (i,j) => (onInnerIndex(i) || onInnerIndex(j))

function makeBoard() {
  const b = new Array()
  for (let i = 0; i < boardSize; i++) {
    const row = new Array()
    b[i] = row
    for (let j = 0; j < boardSize; j++) {
      const tile = {}
      row[j] = tile
      const imid = Math.abs(i - midIndex)
      const jmid = Math.abs(j - midIndex)
      if (onDiagonal(i,j)) {
        if (onEdge(i,j))
          tile.tw = true
        else if (imid === 2 || jmid === 2)
          tile.tl = true
        else if (imid === 1 || jmid === 1)
          tile.dl = true
        else
          tile.dw = true
      }
      else if (onEdge(i,j)) {
        if (i === midIndex || j === midIndex)
          tile.tw = true
        else if (i === 3 || j === 3 ||
                 i+4 === boardSize || j+4 === boardSize)
          tile.dl = true
      }
      else if (onInner(i,j)) {
        if (imid === 2 || jmid === 2)
          tile.tl = true
      }
      else if (
        (hasDistFromEdge(i,2) && jmid === 1) ||
        (hasDistFromEdge(i,3) && jmid === 0) ||
        (hasDistFromEdge(j,2) && imid === 1) ||
        (hasDistFromEdge(j,3) && imid === 0)
      )
        tile.dl = true
    }
  }
  return b
}

const alphabet = 'abcdefghijklmnopqrstuvwxyz'
const sowpods = JSON.parse(fs.readFileSync('sowpods.json', 'utf8'))

const inSowpods = (w) => {
  if (w.length <= 1) return false
  if (w.length > boardSize) return false
  const capitalised = `${w[0].toUpperCase()}${w.slice(1)}`
  return 0 <= sowpods[w.length].indexOf(capitalised)
}

const pointsPerLetter = {}
for (const l of " ") pointsPerLetter[l] = 0
for (const l of "lsunrtoaie") pointsPerLetter[l] = 1
for (const l of "gd") pointsPerLetter[l] = 2
for (const l of "bcmp") pointsPerLetter[l] = 3
for (const l of "fhvwy") pointsPerLetter[l] = 4
for (const l of "k") pointsPerLetter[l] = 5
for (const l of "jx") pointsPerLetter[l] = 8
for (const l of "qz") pointsPerLetter[l] = 10

function makeBag() {
  const b = []
  for (const l of "kjxqz") b.push(l)
  for (const l of " bcmpfhvwy".repeat(2)) b.push(l)
  for (const l of "g".repeat(3)) b.push(l)
  for (const l of "lsud".repeat(4)) b.push(l)
  for (const l of "nrt".repeat(6)) b.push(l)
  for (const l of "o".repeat(8)) b.push(l)
  for (const l of "ai".repeat(9)) b.push(l)
  for (const l of "e".repeat(12)) b.push(l)
  shuffleInPlace(b)
  return b
}

function fillRack(rack, bag) {
  if (rack.length < rackSize && bag.length)
    rack.push(...bag.splice(0, rackSize - rack.length))
}

const canStart = (game) =>
  1 <= game.players.length && game.players.length <= 4

const scoreWord = (word) => {
  let score = 0
  for (const {last, tl, dl, l, blank} of word) {
    if (blank) continue
    const m = last ? (tl ? 3 : dl ? 2 : 1) : 1
    score += m * pointsPerLetter[l]
  }
  for (const {last, dw, tw} of word) {
    if (last) {
      if (dw) score *= 2
      if (tw) score *= 3
    }
  }
  return score
}

const onStart = ({w, i, j, d}) => (
  d ? (i <= midIndex && midIndex < i + w.length && j === midIndex)
    : (i === midIndex && j <= midIndex && midIndex < j + w.length)
)

const validLetter = (l) => (
  typeof l === 'string' &&
  0 < l.length && l.length <= 2 &&
  alphabet.includes(l.at(-1)))

const validPositionOn = (board, a) => (
  Array.isArray(a) && a.length === 2 &&
  a.every((i) => (typeof i === 'number' &&
                  0 <= i && i < boardSize)) &&
  (!('l' in board[a[0]][a[1]])))

const validMovesOn = (board, moves) => (
  Array.isArray(moves) &&
  moves.every((x) => (
    Array.isArray(x) && x.length === 2 &&
    validLetter(x[0]) &&
    (x[1] === null || validPositionOn(board, x[1])))))

const checkOnRackFitsBoard = (moves, isExchange, newRack) => {
  const usedPositions = []
  const played = []
  let onRackFitsBoard = true
  for (const [l, t] of moves) {
    const i = newRack.indexOf(l[0])
    if (i < 0) {
      onRackFitsBoard = false
      break
    }
    if (!isExchange) {
      const s = `${t}`
      if (usedPositions[s]) {
        onRackFitsBoard = false
        break
      }
      usedPositions[s] = true
    }
    played.push(...newRack.splice(i, 1))
  }
  return {onRackFitsBoard, played}
}

const doMoves = (moves, oldBoard) => {
  // make a deep (enough) copy of the board
  const newBoard = []
  for (const row of oldBoard) {
    const newRow = []
    newBoard.push(newRow)
    for (const tile of row) {
      newRow.push(Object.assign({}, tile))
    }
  }
  // clear old last-play markers and detect if any words exist
  let firstWord = true
  for (const row of newBoard) {
    for (const tile of row) {
      if (firstWord && tile.last) firstWord = false
      delete tile.last
    }
  }
  let invalid = false
  // add new last-play markers and blank markers
  // and store set of placed coordinates
  const placedCoords = {}
  for (const [l, [i,j]] of moves) {
    const tile = newBoard[i][j]
    tile.l = l.at(-1)
    tile.blank = 1 < l.length
    tile.last = true
    placedCoords[`${i},${j}`] = true
  }
  // function to detect whether a word contains all the placed coordinates
  const containsAllPlaced = ({w, i, j, d}) => {
    let wi = i
    let wj = j
    const cs = Object.assign({}, placedCoords)
    for (const l of w) {
      delete cs[`${wi},${wj}`]
      if (d) { wi++ } else { wj++ }
    }
    return !(Object.keys(cs).length)
  }
  // function to process a word on the board
  // keep those that:
  // - have > 1 letter
  // - contain a newly placed tile
  // - are in the dictionary (set invalid if not)
  // store also:
  // - score, start tile coordinates, direction
  // - whether it contains an existing tile
  const words = []
  const processWord = (wordTiles, i, j, d) => {
    if (wordTiles.length <= 1) return
    if (wordTiles.some((t) => t.last)) {
      const word = wordTiles.map((t) => t.l)
      if (inSowpods(word.join(''))) {
        words.push({w: word, i, j, d,
                    c: wordTiles.some((t) => !t.last),
                    s: scoreWord(wordTiles)})
      }
      else {
        invalid = `${word} is not in the dictionary`
      }
    }
  }
  // find all words on the board (via possible start tiles, then 2 directions)
  // and process them, stopping if any invalid found
  for (let i = 0; i < boardSize; i++) {
    for (let j = 0; j < boardSize; j++) {
      if (!('l' in newBoard[i][j])) continue
      if (i === 0 || (!('l' in newBoard[i-1][j]))) {
        const wordTiles = []
        let wi = i
        while (wi < boardSize && 'l' in newBoard[wi][j]) {
          wordTiles.push(newBoard[wi][j])
          wi++
        }
        processWord(wordTiles, i, j, true)
        if (invalid) break
      }
      if (j === 0 || (!('l' in newBoard[i][j-1]))) {
        const wordTiles = []
        let wj = j
        while (wj < boardSize && 'l' in newBoard[i][wj]) {
          wordTiles.push(newBoard[i][wj])
          wj++
        }
        processWord(wordTiles, i, j, false)
        if (invalid) break
      }
    }
    if (invalid) break
  }
  if (!invalid) {
    // words now contains all the newly placed words
    // ensure there is one word that contains all newly placed tiles
    // (this implies that all the words are connected: there is a path between
    //  the newly placed tiles of any two words via the main word)
    const mainWord = words.find(containsAllPlaced)
    // also ensure that at least one word is connected to an old tile,
    // or that the main word is the first word and on the start tile
    if (!(mainWord && (words.some((w) => w.c) ||
                       (firstWord && onStart(mainWord))))) {
      invalid = 'no connected main word'
    }
  }
  // check for bonus
  if (!invalid && moves.length === rackSize) {
    words.push({s: bonusPoints})
  }
  return {newBoard, invalid, words}
}

const bagInfo = (game) => {
  const racks = game.players.flatMap((p) => p.rack)
  const all = game.bag.concat(racks)
  return { tiles: all.toSorted(), onRacks: racks.length }
}

const listUndoers = (players) => players.flatMap((p) => p.allowsUndo ? [p.name] : [])

io.on('connection', socket => {
  console.log(`new connection ${socket.id}`)

  socket.emit('ensureLobby')
  socket.join('lobby'); updateGames(socket.id)

  socket.on('pointsPerLetter', () => {
    socket.emit('pointsPerLetter', pointsPerLetter)
  })

  socket.on('joinRequest', data => {
    let game
    let gameName = data.gameName
    if (!gameName) gameName = randomUnusedGameName()
    if (!(gameName in games)) {
      console.log(`new game ${gameName}`)
      game = {
        players: [],
        spectators: []
      }
      games[gameName] = game
    }
    else
      game = games[gameName]
    if (!data.playerName) {
      socket.playerName = `Smith${Math.floor(Math.random()*20)}`
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
        if (game.started) {
          socket.emit('gameStarted')
          socket.emit('updateBoard', game.board)
          socket.emit('updatePlayers', {players: game.players, updateRacks: true})
          socket.emit('updateBag', bagInfo(game))
          socket.emit('updateLog', game.log)
          socket.emit('updateUndo', listUndoers(game.players))
        }
        else {
          socket.emit('updatePlayers', {players: game.players, updateRacks: true})
          io.in(gameName).emit('showStart', canStart(game))
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
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          socket.emit('updateSpectators', game.spectators)
          socket.emit('gameStarted')
          socket.emit('updateBoard', game.board)
          io.in(gameName).emit('updatePlayers', {players: game.players, updateRacks: socket.playerName})
          socket.emit('updateBag', bagInfo(game))
          socket.emit('updateLog', game.log)
          socket.emit('updateUndo', listUndoers(game.players))
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
        socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
        io.in(gameName).emit('updatePlayers', {players: game.players})
        socket.emit('updateSpectators', game.spectators)
        io.in(gameName).emit('showStart', canStart(game))
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

  function inGamePlayer(func) {
    inGame((gameName, game) => {
      if (game.started && !game.ended) {
        const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
        const player = 0 <= playerIndex ? game.players[playerIndex] : {}
        func(gameName, game, playerIndex, player)

      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} out of phase`)
        socket.emit('errorMsg', `Error: action not currently possible.`)
      }
    })
  }

  function inGameCurrentPlayer(func) {
    inGamePlayer((gameName, game, playerIndex, player) => {
      if (player.current) {
        func(gameName, game, playerIndex, player)
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} not found or not current`)
        socket.emit('errorMsg', 'Error: not your turn.')
      }
    })
  }

  socket.on('startGame', () => inGame((gameName, game) => {
    if (!game.started) {
      if (canStart(game)) {
        console.log(`starting ${gameName}`)
        game.started = true
        game.log = []
        game.board = makeBoard()
        game.bag = makeBag()
        for (const player of game.players) {
          player.rack = []
          player.score = 0
          fillRack(player.rack, game.bag)
        }
        const current = game.players[Math.floor(Math.random() * game.players.length)]
        current.current = true
        io.in(gameName).emit('gameStarted')
        io.in(gameName).emit('updateBoard', game.board)
        io.in(gameName).emit('updatePlayers', {players: game.players, updateRacks: true})
        io.in(gameName).emit('updateBag', bagInfo(game))
      }
      else {
        socket.emit('errorMsg', 'Error: not enough or too many players to start.')
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started.`)
    }
  }))

  socket.on('check', s => {
    if (typeof s === 'string') {
      const words = s.toLowerCase().split(/\s+/, 10)
      socket.emit('checked',
        words.map((word) => ({word, valid: inSowpods(word)})))
    }
    else
      socket.emit('checked', [])
  })

  socket.on('preview', moves => inGameCurrentPlayer((gameName, game, playerIndex, player) => {
    if (validMovesOn(game.board, moves)) {
      if (moves.some(([,t]) => t)) {
        const {onRackFitsBoard} = checkOnRackFitsBoard(moves, false, Array.from(player.rack))
        if (onRackFitsBoard) {
          const {invalid, words} = doMoves(moves, game.board)
          socket.emit('preview', !invalid && words)
        }
      }
    }
  }))

  socket.on('play', moves => inGameCurrentPlayer((gameName, game, playerIndex, player) => {
    if (validMovesOn(game.board, moves)) {
      const isExchange = moves.every(([,t]) => t === null)
      const newRack = Array.from(player.rack)
      const {onRackFitsBoard, played} =
        checkOnRackFitsBoard(moves, isExchange, newRack)
      if (onRackFitsBoard) {
        let words = moves.length ? {swapped: played} : 'passed'
        let invalid = false
        let newBoard = game.board
        if (isExchange) {
          game.bag.push(...played)
          if (played.length)
            shuffleInPlace(game.bag)
        }
        else {
          ({newBoard, invalid, words} = doMoves(moves, game.board))
        }
        if (!invalid) {
          const lasts = game.board.flatMap((row, i) => row.flatMap((tile, j) => tile.last ? [[i,j]] : []))
          game.board = newBoard
          player.score += Array.isArray(words) ? words.reduce((a,{s}) => a + s, 0) : 0
          player.rack = newRack
          fillRack(player.rack, game.bag)
          delete player.current
          if (!player.rack.length && !game.bag.length) {
            game.ended = true
            for (const other of game.players) {
              if (other.name === player.name) continue
              const s = other.rack.reduce((a,l) => a + pointsPerLetter[l], 0)
              other.score -= s
              player.score += s
              words.push({other: other.name, rack: other.rack, s})
            }
          }
          else {
            let nextIndex = playerIndex + 1
            if (nextIndex === game.players.length) nextIndex = 0
            game.players[nextIndex].current = true
          }
          game.log.push({name: player.name, words, lasts})
          game.players.forEach((p) => delete p.allowsUndo)
          io.in(gameName).emit('updateBoard', game.board)
          io.in(gameName).emit('updatePlayers', {players: game.players, updateRacks: true})
          io.in(gameName).emit('updateBag', bagInfo(game))
          io.in(gameName).emit('updateLog', game.log.at(-1))
          io.in(gameName).emit('updateUndo', [])
        }
        else {
          socket.emit('errorMsg', invalid)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} made a move that does not fit`)
        socket.emit('errorMsg', 'Error: invalid move letters or targets.')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} made a malformed move`)
      socket.emit('errorMsg', 'Error: invalid move type.')
    }
  }))

  socket.on('toggleUndo', () => inGamePlayer((gameName, game, playerIndex, player) => {
    if (player.allowsUndo) {
      delete player.allowsUndo
      io.in(gameName).emit('updateUndo', listUndoers(game.players))
    }
    else if (0 <= playerIndex && game.log.length) {
      player.allowsUndo = true
      const undoers = listUndoers(game.players)
      if (undoers.length === game.players.length) {
        const {name, words, lasts} = game.log.pop() || {}
        if (lasts) {
          const lastPlayer = game.players.find((p) => p.name === name)
          // words is 'passed', {swapped: [letter...]}, or [word...]
          // where word is either {w,i,j,c,d,s}, {s}, or {other,rack,s}
          // lasts is an array of [i, j] coordinates, of tiles marked last before the move
          if (words.swapped) {
            for (const l of words.swapped) {
              const r = lastPlayer.rack.pop()
              game.bag.push(r)
              lastPlayer.rack.unshift(
                ...game.bag.splice(game.bag.findIndex(l), 1))
            }
            if (words.swapped.length)
              shuffleInPlace(game.bag)
          }
          else if (Array.isArray(words)) {
            for (const {w,i,j,d,other,s} of words) {
              if (other) {
                const otherPlayer = game.players.find((p) => p.name === other)
                otherPlayer.score += s
                lastPlayer.score -= s
              }
              else {
                lastPlayer.score -= s
              }
            }
            game.board.forEach((row) => row.forEach((tile) => {
              if (tile.last) {
                game.bag.push(lastPlayer.rack.pop())
                lastPlayer.rack.unshift(tile.blank ? ' ' : tile.l)
                delete tile.l
                delete tile.blank
                delete tile.last
              }
            }))
            shuffleInPlace(game.bag)
            for (const [i, j] of lasts) game.board[i][j].last = true
          }
          game.players.forEach((p) => delete p.current)
          lastPlayer.current = true
        }
        else {
          console.log(`attempted undo in ${gameName} unsupported`)
          socket.emit('errorMsg', `Undo not supported in this game at this point.`)
        }
        game.players.forEach((p) => delete p.allowsUndo)
        io.in(gameName).emit('updateBoard', game.board)
        io.in(gameName).emit('updatePlayers', {players: game.players, updateRacks: true})
        io.in(gameName).emit('updateBag', bagInfo(game))
        io.in(gameName).emit('updateLog', game.log)
        io.in(gameName).emit('updateUndo', [])
      }
      else {
        io.in(gameName).emit('updateUndo', undoers)
      }
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
        io.in(gameName).emit('updatePlayers', {players: game.players})
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
            io.in(gameName).emit('updatePlayers', {players: game.players})
          }
          if (game.timeout && game.players.every(player => !player.socketId)) {
            console.log(`pausing ${gameName} since all players are disconnected`)
            clearTimeout(game.timeout)
            delete game.timeout
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
