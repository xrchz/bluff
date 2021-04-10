'use strict'

const fs = require('fs')
const express = require('express')
const app = express()
const gname = '50six'

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

const stateKeys = {
  game: [
    'players', 'started', 'deck', 'trick',
    'winningBid', 'lastBidder', 'bidding', 'playing',
    'rounds'
  ],
  deck: true, trick: true, winningBid: true,
  rounds: 'round',
  round: ['contract', 'contractor', 'cardPoints', 'teamPoints'],
  contract: true, cardPoints: true, teamPoints: true,
  players: 'player',
  player: [ 'current', 'lastBid', 'hand', 'tricks' ],
  lastBid: true, hand: true, tricks: true
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

function makeDeck() {
  const deck = []
  for (let r = 0; r < 6; r++) {
    for (let s = 0; s < 4; s++) {
      deck.push({r: r, s: s})
      deck.push({r: r, s: s})
    }
  }
  return deck
}

const cardCmp = (a, b) =>
  a.s === b.s ?
    a.r - b.r :
    a.s - b.s

const Jack = 5

const rankPoints = r =>
  r === Jack ? 3 : Math.floor(r / 2)

function setValidBids(game, playerIndex) {
  const teamSuits = game.bidSuits[playerIndex % 2]
  if (!teamSuits) return
  const player = game.players[playerIndex]
  const hand = player.hand
  const hasSuit = Array(4).fill(false)
  const hasJack = Array(4).fill(false)
  for (const c of hand) {
    hasSuit[c.s] = true
    if (c.r === Jack)
      hasJack[c.s] = true
  }
  player.validBids = [{}]
  const nextN = 'lastBidder' in game ? game.winningBid.n + 1 : 28
  if (nextN > 56) return
  const passed = game.forcedBid ?
    'lastBidder' in game && game.lastBidder !== playerIndex :
    player.passed
  for (let s = 0; s < 4; s++) {
    if (passed && !teamSuits[s]) continue
    if (!hasSuit[s]) continue
    const bid = {s: s, n: nextN}
    if (!hasJack[s]) bid.p = true
    player.validBids.push(bid)
    if (nextN < 40) {
      const bid = {s: s, n: 40}
      if (!hasJack[s]) bid.p = true
      player.validBids.push(bid)
    }
  }
}

function setValidPlays(player, callingSuit) {
  player.validPlays = []
  let canPlayOffsuit = true
  for (const card of player.hand)
    if (card.s === callingSuit) {
      canPlayOffsuit = false
      break
    }
  for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex++) {
    const suit = player.hand[cardIndex].s
    if (suit === callingSuit || canPlayOffsuit)
      player.validPlays.push(cardIndex)
  }
}

function trickWinningIndex(trick, trump) {
  let suit = trick[0].s
  let winningIndex = 0
  for (let i = 0; i < trick.length; i++) {
    if (suit !== trump && trick[i].s === trump) {
      suit = trump
      winningIndex = i
    }
    if (trick[i].s === suit && trick[i].r > trick[winningIndex].r)
      winningIndex = i
  }
  return winningIndex
}

function updateTrick(gameName, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  if (game.trick) {
    io.in(gameName).emit('updateTrick', {
      trick: game.trick,
      nextIndex: game.players.findIndex(player => player.current)
    })
  }
}

function appendRound(gameName, round, roomName) {
  if (!roomName) roomName = gameName
  const game = games[gameName]
  const data = {
    number: game.rounds.length,
    contract: round.contract,
    contractorName: game.players[round.contractor].name
  }
  if (round.cardPoints) {
    data.yellowPoints = round.cardPoints[0]
    data.purplePoints = round.cardPoints[1]
  }
  if (round.teamPoints) {
    data.yellowScore = round.teamPoints[0]
    data.purpleScore = round.teamPoints[1]
  }
  io.in(roomName).emit('appendRound', data)
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
      socket.playerName = `Bolo${Math.floor(Math.random()*20)}`
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
        socket.emit('updateSeats', game.players)
        io.in(gameName).emit('updateSpectators', game.spectators)
        if (!game.started)
          socket.emit('updateSeats', game.players)
        else {
          socket.emit('gameStarted')
          socket.emit('updatePlayers', game.players)
          updateTrick(gameName, socket.id)
          game.log.forEach(entry => socket.emit('appendLog', entry))
          game.rounds.forEach(round => appendRound(gameName, round, socket.id))
          // TODO: update the game situation for the spectator
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
          socket.emit('updatePlayers', game.players)
          updateTrick(gameName, socket.id)
          game.rounds.forEach(round => appendRound(gameName, round, socket.id))
          // TODO: update the game situation for a rejoined player
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
          io.in(gameName).emit('updateSeats', game.players)
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

  socket.on('joinSeat', seat => inGame((gameName, game) => {
    const player = game.players.find(player => player.socketId === socket.id)
    if (player && !('seat' in player)) {
      if (Number.isInteger(seat) && 0 <= seat && seat < 6 &&
          !game.players.find(player => player.seat === seat)) {
        player.seat = seat
        io.in(gameName).emit('updateSeats', game.players)
      }
      else {
        console.log(`${socket.playerName} in ${gameName} tried to sit with bad data`)
        socket.emit('errorMsg', 'That seat is already occupied.')
      }
    }
    else {
      console.log(`${socket.playerName} not found, or tried to sit but is already seated`)
      socket.emit('errorMsg', 'Error: player not found or already seated.')
    }
  }))

  socket.on('leaveSeat', () => inGame((gameName, game) => {
    const player = game.players.find(player => player.socketId === socket.id)
    if (player && 'seat' in player) {
      delete player.seat
      io.in(gameName).emit('updateSeats', game.players)
    }
    else {
      console.log(`${socket.playerName} not found or not seated`)
      socket.emit('errorMsg', 'Error: player not found or not yet seated.')
    }
  }))

  socket.on('undoRequest', () => inGame((gameName, game) => {
    if (game.started && game.undoLog.length) {
      const entry = game.undoLog.pop()
      const roundsLength = game.rounds.length
      copy(stateKeys.game, entry, game, true)
      io.in(gameName).emit('removeLog', game.log.length - entry.logLength)
      game.log.length = entry.logLength
      io.in(gameName).emit('removeRound', roundsLength - game.rounds.length)
      if (game.rounds.length)
        io.in(gameName).emit('updateRound', game.rounds[game.rounds.length - 1])
      io.in(gameName).emit('updatePlayers', game.players)
      updateTrick(gameName)
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
    if (!game.started && game.players.length === 6) {
      game.started = true
      game.log = []
      game.undoLog = []
      game.rounds = []
      game.dealer = Math.floor(Math.random() * game.players.length)
      io.in(gameName).emit('gameStarted')
      appendLog(gameName, 'The game begins!')
      game.deck = makeDeck()
      shuffleInPlace(game.deck)
      game.players.forEach(player => player.hand = [])
      game.players.forEach(player => player.tricks = [])
      for (let round = 0; round < 2; round++) {
        let i = game.dealer + 1
        while (true) {
          if (i === game.players.length) i = 0
          for (let cards = 0; cards < 4; cards++)
            game.players[i].hand.push(game.deck.pop())
          if (i === game.dealer) break
          else i++
        }
      }
      game.players.forEach(player => player.hand.sort(cardCmp))
      appendLog(gameName, `${game.players[game.dealer].name} deals.`)
      // TODO: check no team has no jacks, redeal if so
      game.bidSuits = []
      for (const teamIndex of [0, 1])
        game.bidSuits.push(Array(4).fill(false))
      const currentIndex = (game.dealer + 1) % game.players.length
      game.players[currentIndex].current = true
      game.bidding = true
      setValidBids(game, currentIndex)
      io.in(gameName).emit('updatePlayers', game.players)
    }
    else {
      console.log(`${socket.playerName} tried to start ${gameName} incorrectly`)
      socket.emit('errorMsg', 'Error: need exactly 6 players to start.')
    }
  }))

  socket.on('bidRequest', bidIndex => inGame((gameName, game) => {
    console.log(`Received bidRequest with ${bidIndex} from ${socket.playerName}`)
    const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
    const player = game.players[playerIndex]
    if (0 <= playerIndex && game.bidding && player.current) {
      if (player.validBids && Number.isInteger(bidIndex) &&
          0 <= bidIndex && bidIndex < player.validBids.length) {
        if (player.validBids.length > 1) appendUndo(gameName)
        delete player.current
        const teamIndex = playerIndex % 2
        player.lastBid = player.validBids[bidIndex]
        if (player.lastBid.n) {
          appendLog(gameName, {name: player.name, bid: player.lastBid})
          game.lastBidder = playerIndex
          game.winningBid = player.lastBid
          game.bidSuits[teamIndex][player.lastBid.s] = true
        }
        else {
          appendLog(gameName, `${player.name} passes.`)
          player.passed = true
        }
        if (game.players.every(player => player.lastBid && !player.lastBid.n)) {
          if ('lastBidder' in game) {
            appendLog(gameName, {name: game.players[game.lastBidder].name,
                                 winningBid: game.winningBid})
            delete game.bidding
            game.players.forEach(player => delete player.validBids)
            // TODO: check the other team has a trump, otherwise start a new round
            const nextPlayer = game.players[(game.lastBidder + 1) % game.players.length]
            nextPlayer.current = true
            const round = { contractor: game.lastBidder, contract: game.winningBid }
            game.rounds.push(round)
            appendRound(gameName, round)
            game.playing = true
            game.trick = []
            setValidPlays(nextPlayer)
            io.in(gameName).emit('updatePlayers', game.players)
          }
          else if (!game.forcedBid) {
            const nextIndex = (game.dealer + 1) % game.players.length
            const biddingTeam = nextIndex % 2
            game.bidSuits[1 - biddingTeam] = false
            game.players.forEach((player, index) => {
              if (index % 2 !== biddingTeam) delete player.validBids })
            game.forcedBid = true
            game.players[nextIndex].current = true
            setValidBids(game, nextIndex)
            io.in(gameName).emit('updatePlayers', game.players)
          }
          else {
            const nextIndex = (playerIndex + 2) % game.players.length
            game.players[nextIndex].current = true
            setValidBids(game, nextIndex)
            io.in(gameName).emit('updatePlayers', game.players)
          }
        }
        else {
          const nextIndex = (playerIndex + (game.forcedBid ? 2 : 1)) % game.players.length
          game.players[nextIndex].current = true
          setValidBids(game, nextIndex)
          io.in(gameName).emit('updatePlayers', game.players)
        }
      }
      else {
        console.log(`${socket.playerName} tried bidding in ${gameName} with bad index ${bidIndex}`)
        socket.emit('errorMsg', 'That is not a valid bid.')
      }
    }
    else {
      console.log(`${socket.playerName} tried bidding in ${gameName} out of phase`)
      socket.emit('errorMsg', 'Player not current, or game not in bidding phase.')
    }
  }))

  socket.on('playRequest', cardIndex => inGame((gameName, game) => {
    const playerIndex = game.players.findIndex(player => player.socketId === socket.id)
    const player = game.players[playerIndex]
    if (0 <= playerIndex && game.playing && player.current) {
      if (player.validPlays && player.validPlays.includes(cardIndex)) {
        appendUndo(gameName)
        delete player.current
        const card = player.hand.splice(cardIndex, 1)[0]
        appendLog(gameName, {name: player.name, card: card})
        game.trick.push(card)
        if (game.trick.length === game.players.length) {
          const winningIndex = trickWinningIndex(game.trick, game.winningBid.s)
          const winnerIndex =
            (game.players.length + playerIndex -
             (game.trick.length - 1 - winningIndex)) % game.players.length
          const winner = game.players[winnerIndex]
          appendLog(gameName, `${winner.name} wins the trick.`)
          winner.tricks.push(game.trick)
          if (!winner.hand.length) {
            delete game.playing
            const round = game.rounds[game.rounds.length - 1]
            round.cardPoints = [0, 0]
            game.players.forEach((player, index) => {
              round.cardPoints[index % 2] += player.tricks.reduce(
                (n, trick) => trick.reduce((n, c) => n + rankPoints(c.r), n),
              0)
            })
            const biddingTeam = round.contractor % 2
            const bidWon = (round.contract.c ? 56 : round.contract.n) <=
              round.cardPoints[biddingTeam]
            round.teamPoints = game.rounds.length - 1 ?
                                 Array.from(game.rounds[game.rounds.length - 2].teamPoints) :
                                 [6, 6]
            const points = (round.contract.n < 40 ? 1 : 2) + (round.contract.c ? 0 : 1)
            const delta = bidWon ? -points : points+1
            round.teamPoints[biddingTeam] += delta
            round.teamPoints[1 - biddingTeam] -= delta
            // TODO: appendLog(gameName, end of round info)
            io.in(gameName).emit('updateRound', round)
            // TODO: open all tricks
            // TODO: check for end of game, or prepare for startRoundRequest
          }
          else {
            game.trick = []
            winner.current = true
            setValidPlays(winner)
            io.in(gameName).emit('updatePlayers', game.players)
            // TODO: delay before closing the trick
            // TODO: check for court scenario
            updateTrick(gameName)
          }
        }
        else {
          const nextPlayer = game.players[(playerIndex + 1) % game.players.length]
          nextPlayer.current = true
          setValidPlays(nextPlayer, game.trick[0].s)
          io.in(gameName).emit('updatePlayers', game.players)
          updateTrick(gameName)
        }
      }
      else {
        console.log(`${socket.playerName} tried playing in ${gameName} with bad index ${cardIndex}`)
        socket.emit('errorMsg', 'That is not a valid play.')
      }
    }
    else {
      console.log(`${socket.playerName} tried playing in ${gameName} out of phase`)
      socket.emit('errorMsg', 'Player not current, or game not in playing phase.')
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
        io.in(gameName).emit('updateSeats', game.players)
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
    console.log(`Received deleteGame message with argument ${gameName}`)
    delete games[gameName]
    updateGames()
  })

  socket.on('saveGames', saveGames)
})

process.on('SIGINT', () => { saveGames(); fs.unlinkSync(port); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)
