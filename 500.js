'use strict'

const express = require('express')
const https = require('https')
const fs = require('fs')
const options = {
  key: fs.readFileSync('/etc/ssl/xrchz/key.pem'),
  cert: fs.readFileSync('/etc/ssl/xrchz/cert.pem')
};
var app = express()
var server = https.createServer(options, app)
var io = require('socket.io')(server)

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/client/500.html`)
})
app.use(express.static(`${__dirname}/client`))

const port = 4500
server.listen(port, "0.0.0.0")
console.log(`server started on https://xrchz.net:${port}`)

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

const saveFile = 'games.json'

const games = JSON.parse(fs.readFileSync(saveFile, 'utf8'))

function saveGames() {
  let toSave = {}
  for(const [gameName, game] of Object.entries(games)) {
    if (game.started) { toSave[gameName] = game }
  }
  fs.writeFileSync(saveFile,
    JSON.stringify(
      toSave,
      (k, v) => k === 'socketId' ? null :
                k === 'spectators' ? [] : v))
}

const Ten   = 10
const Jack  = 11
const Queen = 12
const King  = 13
const Ace   = 14
const LeftBower = 14.4
const RightBower = 14.8
const Joker = 15

const Spades = 1
const Clubs = 2
const Diamonds = 3
const Misere = 3.5
const Hearts = 4
const NoTrumps = 5
const TrumpSuit = 6
const JokerSuit = 7

const sameColour = (s1, s2) =>
  s1 + s2 === 3 || s1 + s2 === 7

const contractValue = c =>
  c.trumps === Misere ?
    (c.n < 10 ? 250 : 500) :
    (c.n - 6) * 100 + (c.trumps + 1) * 20

function calculateScore(contract, contractTricks) {
  const contractMade = contract.trumps === Misere ? contractTricks === 0 : contractTricks >= contract.n
  const opponentScore = contract.trumps === Misere ? 0 : (10 - contractTricks) * 10
  const value = contractValue(contract)
  const slam = contractTricks === 10 && value < 250
  const contractScore = contractMade ? (slam ? 250 : value) : -value
  return { made: contractMade, score: [contractScore, opponentScore], slam: slam }
}

function makeDeck() {
  const deck = []
  for (let suit = Spades; suit <= Clubs; suit++) {
    for (let rank = 5; rank <= Ace; rank++) {
      deck.push({ rank: rank, suit: suit })
    }
  }
  for (let suit = Diamonds; suit <= Hearts; suit++) {
    for (let rank = 4; rank <= Ace; rank++) {
      deck.push({ rank: rank, suit: suit })
    }
  }
  deck.push({ rank: Joker, suit: JokerSuit })
  return deck
}

function clockwise(playerIndex) {
  playerIndex++
  if (playerIndex === 4) playerIndex = 0
  return playerIndex
}

const opposite = playerIndex => clockwise(clockwise(playerIndex))

function setEffective(trump) {
  if (trump < NoTrumps && trump !== Misere) {
    return function (c) {
      if (c.rank === Jack && c.suit === trump) {
        c.effectiveRank = RightBower
        c.effectiveSuit = trump
      }
      else if (c.rank === Jack && sameColour(c.suit, trump)) {
        c.effectiveRank = LeftBower
        c.effectiveSuit = trump
      }
      else if (c.rank === Joker) {
        c.effectiveRank = Joker
        c.effectiveSuit = trump
      }
      else {
        c.effectiveRank = c.rank
        c.effectiveSuit = c.suit
      }
      if (c.effectiveSuit === trump) { c.effectiveSuit = TrumpSuit }
    }
  }
  else {
    return function (c) {
      c.effectiveRank = c.rank
      c.effectiveSuit = c.suit
    }
  }
}

const byEffective = (c1, c2) =>
  c1.effectiveSuit === c2.effectiveSuit ?
    c1.effectiveRank - c2.effectiveRank : c1.effectiveSuit - c2.effectiveSuit

function sortAndFormat(cards, trump) {
  cards.forEach(setEffective(trump))
  cards.sort(byEffective)
  cards.forEach(c => { c.formatted = formatCard(c, trump) })
}

function deal(game) {
  const deck = makeDeck()
  shuffleInPlace(deck)
  for (const player of game.players) {
    player.hand = []
  }
  game.kitty = []
  function dealRound(numCards) {
    let dealTo = game.dealer
    do {
      dealTo = clockwise(dealTo)
      let left = numCards
      while (left-- > 0) {
        game.players[dealTo].hand.push(deck.shift())
      }
    } while (dealTo !== game.dealer)
    game.kitty.push(deck.shift())
  }
  dealRound(3)
  dealRound(4)
  dealRound(3)
  game.players.forEach(player => sortAndFormat(player.hand, NoTrumps))
  sortAndFormat(game.kitty, NoTrumps)
}

const suitCls = suit =>
  suit === Spades   ? 'spades'   :
  suit === Clubs    ? 'clubs'    :
  suit === Diamonds ? 'diamonds' :
  suit === Hearts   ? 'hearts'   : null

const suitChr = suit =>
  suit === Spades   ? '♤' :
  suit === Clubs    ? '♧' :
  suit === Diamonds ? '♢' :
  suit === Hearts   ? '♡' : ''

const trumpsChr = suit =>
  suit === Spades   ? '♠' :
  suit === Clubs    ? '♣' :
  suit === Diamonds ? '♦' :
  suit === Hearts   ? '♥' :
  suit === NoTrumps ? 'NT' : ''

function formatCard(c, trump) {
  let chr
  if (c.rank === Joker) {
    chr = '🃟'
  }
  else {
    let codepoint = 0x1F000
    codepoint +=
      c.suit === Spades   ? 0xA0 :
      c.suit === Hearts   ? 0xB0 :
      c.suit === Diamonds ? 0xC0 :
      c.suit === Clubs    ? 0xD0 : 0
    codepoint += c.rank === Ace ? 1 :
      c.rank <= Jack ? c.rank : c.rank + 1
    chr = String.fromCodePoint(codepoint)
  }
  const suit = c.effectiveSuit === TrumpSuit ? trump : c.effectiveSuit
  return { chr: chr, cls: suitCls(suit) }
}

function reformatJoker(c, jsuit) {
  c.formatted.cls = suitCls(jsuit)
  c.formatted.chr = `🃏${suitChr(jsuit)}`
  c.effectiveSuit = jsuit
}

function formatBid(b) {
  if (b.pass) {
    b.formatted = 'Pass'
  }
  else if (b.trumps === Misere) {
    if (b.n < 10) {
      b.formatted = 'Mis'
    }
    else {
      b.formatted = 'OMis'
    }
  }
  else {
    b.formatted = b.n.toString()
    b.formatted += trumpsChr(b.trumps)
    b.cls = suitCls(b.trumps)
    if (!b.cls) delete b.cls
  }
}

function validBids(lastBid) {
  const bids = [{ pass: true }]
  for (let n = 6; n <= 7; n++) {
    if (lastBid && lastBid.n > n) { continue }
    for (let trumps = Spades; trumps <= NoTrumps; trumps++) {
      if (lastBid && lastBid.n === n && lastBid.trumps >= trumps) { continue }
      bids.push({ n: n, trumps: trumps })
    }
  }
  if (lastBid && lastBid.n === 7) {
    bids.push({ n: 7.5, trumps: Misere })
  }
  for (let n = 8; n < 10; n++) {
    if (lastBid && lastBid.n > n) { continue }
    for (let trumps = Spades; trumps <= NoTrumps; trumps++) {
      if (lastBid && lastBid.n === n && lastBid.trumps >= trumps) { continue }
      bids.push({ n: n, trumps: trumps })
    }
  }
  for (let trumps = Spades; trumps <= NoTrumps; trumps++) {
    if (lastBid && lastBid.n === 10 && lastBid.trumps >= trumps) { continue }
    bids.push({ n: 10, trumps: trumps })
    if (trumps === Diamonds) { bids.push({ n: 10, trumps: Misere }) }
  }
  bids.forEach(formatBid)
  return bids
}

function startRound(gameName) {
  const game = games[gameName]
  appendLog(gameName, `${game.players[game.dealer].name} deals.`)
  deal(game)
  game.bidding = true
  game.whoseTurn = clockwise(game.dealer)
  game.players[game.whoseTurn].current = true
  game.players[game.whoseTurn].validBids = validBids()
  game.players[game.whoseTurn].bidFilter = NoTrumps
  io.in(gameName).emit('updatePlayers', game.players)
  io.in(gameName).emit('updateKitty', { kitty: game.kitty })
}

function startPlaying(gameName) {
  const game = games[gameName]
  const contractor = game.players[game.lastBidder]
  const trump = contractor.contract.trumps
  if (trump === Misere) {
    const partner = game.players[opposite(game.lastBidder)]
    partner.dummy = true
    if (contractor.contract.n === 10) {
      contractor.open = true
    }
  }
  game.playing = true
  game.players.forEach(player => player.tricks = [])
  game.unledSuits = [Spades, Clubs, Diamonds, Hearts]
  contractor.validPlays = true
  if ((trump === Misere || trump === NoTrumps) &&
    contractor.hand.find(c => c.effectiveRank === Joker && c.effectiveSuit === JokerSuit)) {
    contractor.restrictJokers = game.unledSuits.map(s => ({ suit: s, chr: suitChr(s), cls: suitCls(s) }))
  }
  game.leader = game.lastBidder
  game.trick = []
  io.in(gameName).emit('updatePlayers', game.players)
}

function appendLog(gameName, entry) {
  const game = games[gameName]
  game.log.push(entry)
  io.in(gameName).emit('appendLog', entry)
}

function restoreScore(room, teamNames, rounds, players) {
  if (rounds.length) {
    io.in(room).emit('initScore', teamNames)
    const total = [0, 0]
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i]
      const score = calculateScore(round.contract, round.tricksMade).score
      if (round.contractorIndex % 2) { score.push(score.shift()) }
      for (const i of [0, 1]) { total[i] += score[i] }
      io.in(room).emit('appendScore', {
        round: i+1,
        contractor: players[round.contractorIndex].name,
        contract: round.contract,
        tricks: round.tricksMade,
        score: score,
        total: total
      })
    }
  }
  else {
    io.in(room).emit('removeScore')
  }
}

function checkEnd(gameName) {
  const game = games[gameName]
  for (const i of [0, 1]) {
    if (game.total[i] >= 500 && game.lastBidder % 2 === i) {
      appendLog(gameName, `${game.teamNames[i]} win!`)
      game.ended = true
      return
    }
    if (game.total[i] <= -500) {
      appendLog(gameName, `${game.teamNames[i]} go out backwards!`)
      game.ended = true
      return
    }
  }
}

const stateKeys = {
  game: [
    'players', 'teamNames', 'total',
    'started', 'dealer',
    'bidding', 'whoseTurn', 'lastBidder',
    'selectKitty', 'kitty', 'nominateJoker',
    'playing', 'leader', 'trick', 'unledSuits',
    'ended'
  ],
  teamNames: true, total: true,
  kitty: true,
  trick: true, unledSuits: true,
  players: [
    'current', 'open', 'dummy',
    'validBids', 'bidFilter', 'lastBid', 'contract',
    'selecting', 'nominating',
    'validPlays', 'restrictJokers', 'hand', 'tricks'
  ],
  validBids: true, lastBid: true, contract: true,
  validPlays: true, restrictJokers: true, hand: true
}

function copy(keys, from, to, restore) {
  for (const key of keys) {
    if (key in from) {
      if (stateKeys[key] === true) {
        to[key] = JSON.parse(JSON.stringify(from[key]))
      }
      else if (key === 'players') {
        if (!restore) {
          to.players = [{}, {}, {}, {}]
        }
        for (let i = 0; i < 4; i++) {
          copy(stateKeys.players, from.players[i], to.players[i], restore)
        }
      }
      else if (stateKeys[key]) {
        if (!restore || !(key in to)) {
          to[key] = {}
        }
        copy(stateKeys[key], from[key], to[key], restore)
      }
      else if (key === 'tricks') {
        const func = restore ?
          (cards => ({ cards: JSON.parse(JSON.stringify(cards)), open: false })) :
          (trick => JSON.parse(JSON.stringify(trick.cards)))
        to.tricks = from.tricks.map(func)
      }
      else {
        to[key] = from[key]
      }
    }
    else if (restore && key in to) {
      delete to[key]
    }
  }
}

function appendUndo(gameName) {
  const game = games[gameName]
  const entry = {}
  copy(stateKeys.game, game, entry)
  entry.logLength = game.log.length
  entry.roundsLength = game.rounds.length
  game.undoLog.push(entry)
  io.in(gameName).emit('showUndo', true)
}

io.on('connection', socket => {
  console.log(`new connection ${socket.id}`)

  socket.on('joinRequest', data => {
    let game
    let gameName = data.gameName
    if (!gameName) {
      gameName = randomUnusedGameName(games)
    }
    if (!(gameName in games)) {
      console.log(`new game ${gameName}`)
      game = { seats: [{}, {}, {}, {}],
               players: [],
               spectators: [] }
      games[gameName] = game
    }
    else {
      game = games[gameName]
    }
    if (!data.playerName) {
      socket.playerName = 'Bauer'+Math.floor(Math.random()*20)
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
        socket.join(gameName)
        const spectator = { socketId: socket.id, name: socket.playerName }
        game.spectators.push(spectator)
        socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName, spectating: true })
        io.in(gameName).emit('updateSpectators', game.spectators)
        if (!game.started) {
          socket.emit('updateUnseated', game.players)
          socket.emit('updateSeats', game.seats)
        }
        else {
          socket.emit('gameStarted')
          socket.emit('updatePlayers', game.players)
          socket.emit('updateKitty', { kitty: game.kitty })
          if (game.trick) {
            socket.emit('updateTrick', { trick: game.trick, leader: game.leader })
          }
          for (const entry of game.log) {
            socket.emit('appendLog', entry)
          }
          restoreScore(socket.id, game.teamNames, game.rounds, game.players)
        }
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate spectator`)
        socket.emit('errorMsg', 'Game ' + gameName + ' already contains spectator ' + socket.playerName)
      }
    }
    else if (game.started) {
      if (game.players.find(player => player.name === socket.playerName && !player.socketId)) {
        if (Object.keys(socket.rooms).length === 1) {
          console.log(`${socket.playerName} rejoining ${gameName}`)
          socket.gameName = gameName
          socket.join(gameName)
          const player = game.players.find(player => player.name === socket.playerName)
          player.socketId = socket.id
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          socket.emit('updateSpectators', game.spectators)
          socket.emit('gameStarted')
          io.in(gameName).emit('updatePlayers', game.players)
          let kitty = { kitty: game.kitty }
          if (player.contract && game.selectKitty) {
            kitty.contractorName = player.name,
            kitty.contractorIndex = game.lastBidder
          }
          socket.emit('updateKitty', kitty)
          if (game.nominateJoker && player.nominating) {
            socket.emit('showJoker', true)
          }
          if (game.trick) {
            socket.emit('updateTrick', { trick: game.trick, leader: game.leader })
          }
          for (const entry of game.log) {
            socket.emit('appendLog', entry)
          }
          restoreScore(socket.id, game.teamNames, game.rounds, game.players)
          if (game.undoLog.length) {
            socket.emit('showUndo', true)
          }
        }
        else {
          console.log(`error: ${socket.playerName} rejoining ${gameName} while in other rooms`)
          socket.emit('errorMsg', 'Error: somehow this connection is already used in another game')
        }
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as extra player`)
        socket.emit('errorMsg', 'Game ' + gameName + ' has already started. Try spectating.')
      }
    }
    else {
      if (game.players.every(player => player.name !== socket.playerName)) {
        if (game.players.length < 4) {
          console.log(`${socket.playerName} joining ${gameName}`)
          socket.join(gameName)
          socket.gameName = gameName
          const player = { socketId: socket.id, name: socket.playerName }
          game.players.push(player)
          socket.emit('joinedGame', { gameName: gameName, playerName: socket.playerName })
          socket.emit('updateSpectators', game.spectators)
          io.in(gameName).emit('updateUnseated', game.players)
          io.in(gameName).emit('updateSeats', game.seats)
        }
        else {
          console.log(`${socket.playerName} barred from joining ${gameName} which is full`)
          socket.emit('errorMsg', 'Game ' + gameName + ' already has enough players. Try spectating.')
        }
      }
      else {
        console.log(`${socket.playerName} barred from joining ${gameName} as duplicate player`)
        socket.emit('errorMsg', 'Game ' + gameName + ' already contains player ' + socket.playerName)
      }
    }
    console.log("active games: " + Object.keys(games).join(', '))
  })

  function inGame(func) {
    const gameName = socket.gameName
    const game = games[gameName]
    if (game) {
      func(gameName, game)
    }
    else {
      console.log(`${socket.playerName} failed to find game ${gameName}`)
      socket.emit('errorMsg', `Game ${gameName} not found`)
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
      if (game.trick) {
        io.in(gameName).emit('updateTrick', { trick: game.trick, leader: game.leader })
      }
      io.in(gameName).emit('removeLog', game.log.length - entry.logLength)
      game.log.length = entry.logLength
      game.rounds.length = entry.roundsLength
      restoreScore(gameName, game.teamNames, game.rounds, game.players)
      if (!game.undoLog.length) {
        io.in(gameName).emit('showUndo', false)
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried to undo nothing`)
      socket.emit('errorMsg', 'Error: there is nothing to undo')
    }
  }))

  socket.on('sitHere', data => inGame((gameName, game) => {
    if (!game.started) {
      const seat = game.seats[data.seatIndex]
      if (seat) {
        if (!seat.player) {
          const player = game.players.find(player => player.name === data.playerName)
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
              socket.emit('errorMsg', 'Error: you are already seated')
            }
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried to sit but is not a player`)
            socket.emit('errorMsg', 'Error: a non-player cannot sit')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried sitting in an occupied seat`)
          socket.emit('errorMsg', 'Error: trying to sit in an occupied seat')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried sitting at invalid index ${data.seatIndex}`)
        socket.emit('errorMsg', 'Error: trying to sit at an invalid seat index')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried sitting when game already started`)
      socket.emit('errorMsg', 'Error: cannot sit after the game has started')
    }
  }))

  socket.on('leaveSeat', () => inGame((gameName, game) => {
    if (!game.started) {
      const player = game.players.find(player => player.name === socket.playerName)
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
            socket.emit('errorMsg', 'Error: could not find you in any seat')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} is not seated but tried to leave their seat`)
          socket.emit('errorMsg', 'Error: you are not seated so cannot leave your seat')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} is not a player but tried to leave a seat`)
        socket.emit('errorMsg', 'Error: non-player trying to leave seat')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried leaving seat when game already started`)
      socket.emit('errorMsg', 'Error: cannot leave seat after the game has started')
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
        game.teamNames = [`${game.players[0].name} & ${game.players[2].name}`,
                          `${game.players[1].name} & ${game.players[3].name}`]
        game.total = [0, 0]
        game.rounds = []
        game.dealer = Math.floor(Math.random() * 4)
        io.in(gameName).emit('gameStarted')
        appendLog(gameName, 'The game begins!')
        startRound(gameName)
      }
      else {
        socket.emit('errorMsg', '4 seated players required to start the game')
      }
    }
    else {
      console.log(`${socket.playerName} attempted to start ${gameName} again`)
      socket.emit('errorMsg', `Error: ${gameName} has already started`)
    }
  }))

  socket.on('filterRequest', index => inGame((gameName, game) => {
    if (game.bidding) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current && current.bidFilter) {
          if (Number.isInteger(index) && 0 <= index && index < 5) {
            current.bidFilter = index + 1
            sortAndFormat(current.hand, current.bidFilter)
            socket.emit('updatePlayers', game.players)
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried filtering an invalid index`)
            socket.emit('errorMsg', 'Error: that is not a valid bid filter')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried bid filter out of turn`)
          socket.emit('errorMsg', 'Error: it is not your turn to bid filter')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried bid filter but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried bid filter out of phase`)
      socket.emit('errorMsg', 'Error: bid filtering is not currently possible')
    }
  }))

  socket.on('bidRequest', bid => inGame((gameName, game) => {
    if (game.bidding) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current) {
          if (current.validBids && (bid.pass || current.validBids.find(b => b.n === bid.n && b.trumps === bid.trumps)) &&
              current.bidFilter && (bid.pass || bid.trumps === current.bidFilter || bid.trumps === Misere && current.bidFilter === NoTrumps)) {
            appendUndo(gameName)
            delete current.validBids
            delete current.bidFilter
            delete current.current
            current.lastBid = bid
            if (!bid.pass) {
              game.lastBidder = game.whoseTurn
              appendLog(gameName, `${current.name} bids ${bid.formatted}.`)
            }
            else {
              sortAndFormat(current.hand, NoTrumps)
              appendLog(gameName, `${current.name} passes.`)
            }
            let nextTurn = clockwise(game.whoseTurn)
            while (game.players[nextTurn].lastBid &&
              game.players[nextTurn].lastBid.pass &&
              nextTurn !== game.whoseTurn) {
              nextTurn = clockwise(nextTurn)
            }
            const lastBidder = game.players[game.lastBidder]
            const lastBid = lastBidder ? lastBidder.lastBid : null
            if (nextTurn === game.whoseTurn && bid.pass) {
              appendLog(gameName, 'Bidding ends with no contract. Redealing...')
              game.players.forEach(player => { delete player.lastBid; delete player.bidFilter })
              game.dealer = clockwise(game.dealer)
              startRound(gameName)
            }
            else if (nextTurn === game.lastBidder) {
              appendLog(gameName, `Bidding ends with ${lastBidder.name} contracting ${lastBid.formatted}.`)
              delete game.bidding
              lastBidder.contract = lastBid
              game.players.forEach(player => { delete player.lastBid; delete player.bidFilter })
              game.selectKitty = true
              game.whoseTurn = game.lastBidder
              lastBidder.current = true
              lastBidder.selecting = true
              game.players.forEach(player => sortAndFormat(player.hand, lastBid.trumps))
              sortAndFormat(game.kitty, lastBid.trumps)
              io.in(gameName).emit('updatePlayers', game.players)
              io.in(gameName).emit('updateKitty',
                { kitty: game.kitty,
                  contractorName: lastBidder.name,
                  contractorIndex: game.lastBidder })
            }
            else {
              game.whoseTurn = nextTurn
              const next = game.players[game.whoseTurn]
              next.current = true
              next.validBids = validBids(lastBid)
              const prevBid = next.lastBid
              next.bidFilter = prevBid ? (prevBid.trumps === Misere ? NoTrumps : prevBid.trumps) : NoTrumps
              io.in(gameName).emit('updatePlayers', game.players)
            }
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried bidding an invalid bid`)
            socket.emit('errorMsg', 'Error: that is not a valid bid')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried bidding out of turn`)
          socket.emit('errorMsg', 'Error: it is not your turn to bid')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried bidding but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried bidding out of phase`)
      socket.emit('errorMsg', 'Error: bidding is not currently possible')
    }
  }))

  socket.on('kittyRequest', data => inGame((gameName, game) => {
    if (game.selectKitty) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current && current.selecting) {
          if (current.contract) {
            if (!data.done) {
              const fromTo = data.from === 'hand' ? [current.hand, game.kitty] : [game.kitty, current.hand]
              if (Number.isInteger(data.index) && 0 <= data.index && data.index < fromTo[0].length) {
                const removed = fromTo[0].splice(data.index, 1)[0]
                fromTo[1].push(removed)
                fromTo[1].sort(byEffective)
                io.in(gameName).emit('updatePlayers', game.players)
                io.in(gameName).emit('updateKitty',
                  { kitty: game.kitty,
                    contractorName: current.name,
                    contractorIndex: game.whoseTurn })
              }
              else {
                console.log(`error: ${socket.playerName} in ${gameName} tried taking from ${data.from} with bad index ${data.index}`)
                socket.emit('errorMsg', `Error: index ${data.index} for taking from ${data.from} is invalid`)
              }
            }
            else {
              appendUndo(gameName)
              appendLog(gameName, `${current.name} exchanges with the kitty.`)
              delete game.selectKitty
              delete current.selecting
              io.in(gameName).emit('updateKitty', { kitty: game.kitty })
              if ((current.contract.trumps === Misere || current.contract.trumps === NoTrumps) &&
                  current.hand.find(c => c.effectiveRank === Joker)) {
                game.nominateJoker = true
                current.nominating = true
                socket.emit('showJoker', true)
              }
              else {
                startPlaying(gameName)
              }
            }
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried taking from ${data.from} but has no contract`)
            socket.emit('errorMsg', 'Error: you do not have the contract')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried taking from ${data.from} out of turn`)
          socket.emit('errorMsg', `Error: it is not your turn to take from ${data.from}`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried taking from ${data.from} but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried taking from ${data.from} out of phase`)
      socket.emit('errorMsg', `Error: taking from ${data.from} is not currently possible`)
    }
  }))

  socket.on('jokerRequest', index => inGame((gameName, game) => {
    if (game.nominateJoker) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current && current.nominating) {
          if (Number.isInteger(index) && 0 <= index && index < 5) {
            const joker = current.hand.find(c => c.effectiveRank === Joker)
            if (joker) {
              if (index < 4) {
                appendUndo(gameName)
                reformatJoker(joker, index + 1)
                current.hand.sort(byEffective)
                appendLog(gameName, `${current.name} nominates joker suit ${joker.formatted.chr[2]}.`)
              }
              delete game.nominateJoker
              delete current.nominating
              socket.emit('showJoker', false)
              startPlaying(gameName)
            }
            else {
              console.log(`error: ${socket.playerName} in ${gameName} tried nominating joker without it`)
              socket.emit('errorMsg', `Error: you do not have the joker`)
            }
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried nominating joker with invalid index`)
            socket.emit('errorMsg', `Error: invalid index for nominating joker suit`)
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried nominating joker out of turn`)
          socket.emit('errorMsg', `Error: it is not your turn to nominate the joker suit`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried nominating joker but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried nominating joker out of phase`)
      socket.emit('errorMsg', `Error: nominating joker suit is not currently possible`)
    }
  }))

  socket.on('playRequest', data => inGame((gameName, game) => {
    if (game.playing && game.trick) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current) {
          if (current.validPlays) {
            if ((current.validPlays === true &&
                 Number.isInteger(data.index) && 0 <= data.index && data.index < current.hand.length ||
                 current.validPlays.includes(data.index)) &&
                (current.hand[data.index].effectiveRank !== Joker || !current.restrictJokers ||
                 current.restrictJokers.find(j => j.suit === data.jsuit))) {
              appendUndo(gameName)
              delete current.validPlays
              delete current.restrictJokers
              delete current.current
              const played = current.hand.splice(data.index, 1)[0]
              if (data.jsuit) reformatJoker(played, data.jsuit)
              game.trick.push(played)
              appendLog(gameName, `${current.name} plays ${played.formatted.chr}.`)
              io.in(gameName).emit('updateTrick', { trick: game.trick, leader: game.leader })
              io.in(gameName).emit('updatePlayers', game.players)
              const contractor = game.players[game.lastBidder]
              const trump = contractor.contract.trumps
              const calling = game.trick[0].effectiveSuit
              if (trump === Misere || trump === NoTrumps) {
                game.unledSuits = game.unledSuits.filter(s => s !== played.effectiveSuit)
              }
              game.whoseTurn = clockwise(game.whoseTurn)
              if (game.players[game.whoseTurn].dummy) {
                game.trick.push(null)
                game.whoseTurn = clockwise(game.whoseTurn)
              }
              if (game.trick.length < 4) {
                const next = game.players[game.whoseTurn]
                next.current = true
                if (next.hand.some(c => c.effectiveSuit === calling)) {
                  next.validPlays = []
                  next.hand.forEach((c, i) => { if (c.effectiveSuit === calling) { next.validPlays.push(i) } })
                }
                else if (trump === Misere) {
                  const jokerIndex = next.hand.findIndex(c =>
                    c.effectiveRank === Joker && c.effectiveSuit === JokerSuit)
                  if (0 <= jokerIndex) {
                    next.validPlays = [jokerIndex]
                  }
                  else {
                    next.validPlays = true
                  }
                }
                else {
                  next.validPlays = true
                }
                io.in(gameName).emit('updatePlayers', game.players)
              }
              else {
                let winningIndex = 0
                for (let i = 1; i < 4; i++) {
                  const currentCard = game.trick[i]
                  const winningCard = game.trick[winningIndex]
                  if (currentCard &&
                      ((currentCard.effectiveSuit === JokerSuit) ||
                       (currentCard.effectiveSuit === TrumpSuit &&
                         (winningCard.effectiveSuit !== TrumpSuit ||
                          winningCard.effectiveRank < currentCard.effectiveRank)) ||
                       (currentCard.effectiveSuit === calling &&
                         (winningCard.effectiveSuit !== calling && winningCard.effectiveSuit < TrumpSuit ||
                          winningCard.effectiveSuit === calling && winningCard.effectiveRank < currentCard.effectiveRank)))) {
                    winningIndex = i
                  }
                }
                winningIndex = (game.leader + winningIndex) % 4
                const winner = game.players[winningIndex]
                const winnerPartner = game.players[opposite(winningIndex)]
                winner.tricks.push({ cards: game.trick.filter(c => c), open: false })
                appendLog(gameName, `${winner.name} wins the trick.`)
                delete game.whoseTurn
                game.trick = []
                if (current.hand.length && !winnerPartner.dummy) {
                  game.leader = winningIndex
                  game.whoseTurn = winningIndex
                  winner.current = true
                  winner.validPlays = true
                  if ((trump === Misere || trump === NoTrumps) &&
                      winner.hand.find(c => c.effectiveRank === Joker && c.effectiveSuit === JokerSuit) &&
                      current.hand.length > 1) {
                    winner.restrictJokers = game.unledSuits.map(s => ({ suit: s, chr: suitChr(s), cls: suitCls(s) }))
                  }
                  const promise = new Promise(resolve => setTimeout(resolve, 1500))
                  promise.then(() => {
                    io.in(gameName).emit('updateTrick', { trick: game.trick, leader: game.leader })
                    io.in(gameName).emit('updatePlayers', game.players)
                  })
                }
                else {
                  const promise = new Promise(resolve => setTimeout(resolve, 1500))
                  promise.then(() => {
                    io.in(gameName).emit('updateTrick', { trick: game.trick, leader: game.leader })
                    io.in(gameName).emit('updatePlayers', game.players)
                    delete game.leader
                    delete game.playing
                    const contract = contractor.contract
                    delete contractor.contract
                    const contractorPartner = game.players[opposite(game.lastBidder)]
                    if (contract.trumps === Misere) {
                      delete contractor.open
                      delete contractorPartner.dummy
                      contractorPartner.hand = []
                    }
                    const contractTricks = contractor.tricks.length + contractorPartner.tricks.length
                    if (!game.rounds.length) {
                      io.in(gameName).emit('initScore', game.teamNames)
                    }
                    game.rounds.push({ contractorIndex: game.lastBidder, contract: contract, tricksMade: contractTricks })
                    const result = calculateScore(contract, contractTricks)
                    appendLog(gameName,
                      `${contractor.name}'s partnership ${result.made ? 'makes' : 'fails'} their contract, ${result.slam ? 'slamming' : 'scoring'} ${result.score[0]}.`)
                    appendLog(gameName, `The opponents score ${result.score[1]}.`)
                    if (game.lastBidder % 2) { result.score.push(result.score.shift()) }
                    for (const i of [0, 1]) { game.total[i] += result.score[i] }
                    io.in(gameName).emit('appendScore', {
                      round: game.rounds.length,
                      contractor: contractor.name,
                      contract: contract,
                      tricks: contractTricks,
                      score: result.score,
                      total: game.total
                    })
                    const promise = new Promise(resolve => setTimeout(resolve, 2000))
                    promise.then(() => {
                      game.players.forEach(player => delete player.tricks)
                      delete game.trick
                      delete game.unledSuits
                      checkEnd(gameName)
                      if (game.ended) {
                        io.in(gameName).emit('updatePlayers', game.players)
                        delete game.dealer
                        delete game.kitty
                        io.in(gameName).emit('updateKitty')
                      }
                      else {
                        appendLog(gameName, 'The next round begins.')
                        game.dealer = clockwise(game.dealer)
                        startRound(gameName)
                      }
                    })
                  })
                }
              }
            }
            else {
              console.log(`error: ${socket.playerName} in ${gameName} tried playing with bad index ${data.index}`)
              socket.emit('errorMsg', `Error: index ${data.index} is invalid`)
            }
          }
          else {
            console.log(`error: ${socket.playerName} in ${gameName} tried playing but has no validPlays`)
            socket.emit('errorMsg', 'Error: you do not have any valid plays')
          }
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried playing out of turn`)
          socket.emit('errorMsg', 'Error: it is not your turn')
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried playing but there is no current player`)
        socket.emit('errorMsg', 'Error: could not find current player')
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried playing out of phase`)
      socket.emit('errorMsg', `Error: playing is not currently possible`)
    }
  }))

  socket.on('trickRequest', data => inGame((gameName, game) => {
    if (game.playing) {
      const player = game.players.find(player => player.name === data.playerName)
      if (player) {
        if (player.tricks && Number.isInteger(data.index) && 0 <= data.index && data.index < player.tricks.length) {
          player.tricks[data.index].open = Boolean(data.open)
          io.in(gameName).emit('updatePlayers', game.players)
        }
        else {
          console.log(`error: ${socket.playerName} in ${gameName} tried toggling a trick with bad index`)
          socket.emit('errorMsg', `Error: toggling a trick with an invalid index`)
        }
      }
      else {
        console.log(`error: ${socket.playerName} in ${gameName} tried toggling a trick of an unknown player`)
        socket.emit('errorMsg', `Error: toggling a trick of an unknown player`)
      }
    }
    else {
      console.log(`error: ${socket.playerName} in ${gameName} tried toggling a trick out of phase`)
      socket.emit('errorMsg', `Error: toggling a trick is not currently possible`)
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
        const seat = game.seats.find(seat => seat.player && seat.player.socketId === socket.id)
        if (seat) { delete seat.player }
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
    }
    console.log("active games: " + Object.keys(games).join(', '))
  })

  socket.on('saveGames', saveGames)
})

process.on('SIGINT', () => { saveGames(); process.exit() })
process.on('uncaughtExceptionMonitor', saveGames)
