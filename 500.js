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

const games = {}

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

const sameColour = (s1, s2) =>
  s1 + s2 === 3 || s1 + s2 === 7

const contractValue = c =>
  c.suit === Misere ?
    (c.n < 10 ? 250 : 500) :
    (c.n - 6) * 100 + (c.suit + 1) * 20

function calculateScore(contract, contractTricks) {
  const opponentTricks = 10 - contractTricks
  const contractMade = contract.suit === Misere ? contractTricks === 0 : contractTricks >= contract.n
  const opponentScore = contract.suit === Misere ? 0 : opponentTricks * 10
  const contractScore = contractMade ?
    (contractTricks === 10 ? Math.min(250, contractValue(contract)) : contractValue(contract)) :
    -contractValue(contract)
  return { made: contractMade, score: [contractScore, opponentScore] }
}

function makeDeck() {
  const deck = []
  for (let suit = Spades; suit <= Clubs; suit++) {
    for (let rank = 5; rank <= Ace; rank++) {
      deck.push({ rank: rank, suit: suit,
        effectiveRank: rank, effectiveSuit: suit })
    }
  }
  for (let suit = Diamonds; suit <= Hearts; suit++) {
    for (let rank = 4; rank <= Ace; rank++) {
      deck.push({ rank: rank, suit: suit,
       effectiveRank: rank,  effectiveSuit: suit })
    }
  }
  deck.push({ rank: Joker, effectiveRank: Joker, effectiveSuit: TrumpSuit })
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
      if (c.rank === Jack) {
        if (c.suit === trump) {
          c.effectiveRank = RightBower
        }
        else if (sameColour(c.suit, trump)) {
          c.effectiveRank = LeftBower
          c.effectiveSuit = trump
        }
      }
      else if (c.rank === Joker) {
        c.effectiveSuit = trump
      }
      if (c.effectiveSuit === trump) { c.effectiveSuit = TrumpSuit }
    }
  }
  else {
    return function (c) {}
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

function formatCard(c, trump) {
  if (trump === Misere) { trump = NoTrumps }
  let suit = c.effectiveSuit
  if (suit === TrumpSuit) { suit = trump < NoTrumps ? trump : c.suit }
  let chr
  if (c.rank === Joker) {
    chr = '\u{1F0DF}'
  }
  else {
    let codepoint = 0x1F000
    codepoint += c.suit === Spades ? 0xA0 :
      c.suit === Hearts ? 0xB0 :
      c.suit === Diamonds ? 0xC0 :
      c.suit === Clubs ? 0xD0 : 0xE0
    codepoint += c.rank === Ace ? 1 :
      c.rank <= Jack ? c.rank : c.rank + 1
    chr = String.fromCodePoint(codepoint)
  }
  const cls = suit === Spades   ? 'spades'   :
    suit === Clubs    ? 'clubs'    :
    suit === Diamonds ? 'diamonds' :
    suit === Hearts   ? 'hearts'   : null
  return { chr: chr, cls: cls }
}

function formatBid(b) {
  if (b.pass) {
    b.formatted = 'Pass'
  }
  else if (b.suit === Misere) {
    if (b.n < 10) {
      b.formatted = 'Misere'
    }
    else {
      b.formatted = 'Open Misere'
    }
  }
  else {
    b.formatted = b.n.toString()
    if (b.suit === Spades) {
      b.formatted += '♠'
      b.cls = 'spades'
    }
    else if (b.suit === Clubs) {
      b.formatted += '♣'
      b.cls = 'clubs'
    }
    else if (b.suit === Diamonds) {
      b.formatted += '♦'
      b.cls = 'diamonds'
    }
    else if (b.suit === Hearts) {
      b.formatted += '♥'
      b.cls = 'hearts'
    }
    else if (b.suit === NoTrumps) {
      b.formatted += 'NT'
    }
  }
}

function validBids(lastBid) {
  const bids = []
  for (let n = 6; n <= 7; n++) {
    if (lastBid && lastBid.n > n) { continue }
    for (let suit = Spades; suit <= NoTrumps; suit++) {
      if (lastBid && lastBid.n === n && lastBid.suit >= suit) { continue }
      bids.push({ n: n, suit: suit })
    }
  }
  if (lastBid && lastBid.n === 7) {
    bids.push({ n: 7.5, suit: Misere })
  }
  for (let n = 8; n < 10; n++) {
    if (lastBid && lastBid.n > n) { continue }
    for (let suit = Spades; suit <= NoTrumps; suit++) {
      if (lastBid && lastBid.n === n && lastBid.suit >= suit) { continue }
      bids.push({ n: n, suit: suit })
    }
  }
  for (let suit = Spades; suit <= NoTrumps; suit++) {
    if (lastBid && lastBid.n === 10 && lastBid.suit >= suit) { continue }
    bids.push({ n: 10, suit: suit })
    if (suit === Diamonds) { bids.push({ n: 10, suit: Misere }) }
  }
  bids.push({ pass: true })
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
  io.in(gameName).emit('updatePlayers', game.players)
  io.in(gameName).emit('updateKitty', { kitty: game.kitty })
}

function appendLog(gameName, entry) {
  const game = games[gameName]
  game.log.push(entry)
  io.in(gameName).emit('appendLog', entry)
}

function restoreScore(socket, teamNames, rounds, players) {
  if (rounds.length) {
    socket.emit('initScore', teamNames)
    const total = [0, 0]
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i]
      const score = calculateScore(round.contract, round.tricksMade).score
      for (const i of [0, 1]) { total[i] += score[i] }
      if (round.contractorIndex % 2) { score.push(score.shift()) }
      socket.emit('appendScore', {
        round: i+1,
        contractor: players[round.contractorIndex].name,
        contract: round.contract,
        tricks: round.tricksMade,
        score: score,
        total: total
      })
    }
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
          restoreScore(socket, game.teamNames, game.rounds, game.players)
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
            kitty.contractorIndex = game.players.findIndex(player => player.name === socket.playerName)
          }
          socket.emit('updateKitty', kitty)
          if (game.trick) {
            socket.emit('updateTrick', { trick: game.trick, leader: game.leader })
          }
          for (const entry of game.log) {
            socket.emit('appendLog', entry)
          }
          restoreScore(socket, game.teamNames, game.rounds, game.players)
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

  socket.on('bidRequest', bid => inGame((gameName, game) => {
    if (game.bidding) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current) {
          if (current.validBids && (bid.pass || current.validBids.find(b => b.n === bid.n && b.suit === b.suit))) {
            delete current.validBids
            delete current.current
            current.lastBid = bid
            if (!bid.pass) {
              game.lastBidder = game.whoseTurn
              appendLog(gameName, `${current.name} bids ${bid.formatted}.`)
            }
            else {
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
              game.players.forEach(player => delete player.lastBid)
              game.dealer = clockwise(game.dealer)
              startRound(gameName)
            }
            else if (nextTurn === game.lastBidder) {
              appendLog(gameName, `Bidding ends with ${lastBidder.name} contracting ${lastBid.formatted}.`)
              delete game.bidding
              lastBidder.contract = lastBid
              game.players.forEach(player => delete player.lastBid)
              game.selectKitty = true
              game.whoseTurn = game.lastBidder
              lastBidder.current = true
              lastBidder.selecting = true
              game.players.forEach(player => sortAndFormat(player.hand, lastBid.suit))
              sortAndFormat(game.kitty, lastBid.suit)
              io.in(gameName).emit('updatePlayers', game.players)
              io.in(gameName).emit('updateKitty',
                { kitty: game.kitty,
                  contractorName: lastBidder.name,
                  contractorIndex: game.lastBidder })
            }
            else {
              game.whoseTurn = nextTurn
              game.players[game.whoseTurn].current = true
              game.players[game.whoseTurn].validBids = validBids(lastBid)
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
              const trump = current.contract.suit
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
              appendLog(gameName, `${current.name} exchanges with the kitty.`)
              delete game.selectKitty
              delete current.selecting
              // TODO: nominate joker suit if possible and desired
              // TODO: mark contractor's partner as open if misere
              // TODO: mark contractor as open if open misere
              game.playing = true
              game.players.forEach(player => player.tricks = [])
              current.validPlays = true
              game.leader = game.whoseTurn
              game.trick = []
              io.in(gameName).emit('updatePlayers', game.players)
              io.in(gameName).emit('updateKitty', { kitty: game.kitty })
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

  socket.on('playRequest', index => inGame((gameName, game) => {
    if (game.playing && game.trick) {
      const current = game.players[game.whoseTurn]
      if (current) {
        if (current.name === socket.playerName && current.current) {
          if (current.validPlays) {
            if (current.validPlays === true && Number.isInteger(index) && 0 <= index && index < current.hand.length ||
                current.validPlays.includes(index)) {
              delete current.validPlays
              delete current.current
              const played = current.hand.splice(index, 1)[0]
              game.trick.push(played)
              appendLog(gameName, `${current.name} plays ${played.formatted.chr}.`)
              io.in(gameName).emit('updateTrick', { trick: game.trick, leader: game.leader })
              io.in(gameName).emit('updatePlayers', game.players)
              const contractor = game.players[game.lastBidder]
              const trump = contractor.contract.suit
              const calling = game.trick[0].effectiveSuit
              if (game.trick.length < 4) {
                game.whoseTurn = clockwise(game.whoseTurn)
                const next = game.players[game.whoseTurn]
                next.current = true
                if (next.hand.some(c => c.effectiveSuit === calling)) {
                  next.validPlays = []
                  next.hand.forEach((c, i) => { if (c.effectiveSuit === calling) { next.validPlays.push(i) } })
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
                  if ((currentCard.effectiveSuit === TrumpSuit &&
                        (winningCard.effectiveSuit !== TrumpSuit ||
                         winningCard.effectiveRank < currentCard.effectiveRank)) ||
                      (currentCard.effectiveSuit === calling &&
                        (winningCard.effectiveSuit !== calling && winningCard.effectiveSuit !== TrumpSuit ||
                         winningCard.effectiveSuit === calling && winningCard.effectiveRank < currentCard.effectiveRank))) {
                    winningIndex = i
                  }
                }
                winningIndex = (game.leader + winningIndex) % 4
                const winner = game.players[winningIndex]
                winner.tricks.push({ cards: game.trick, open: false })
                appendLog(gameName, `${winner.name} wins the trick.`)
                game.trick = []
                if (current.hand.length) {
                  game.leader = winningIndex
                  game.whoseTurn = winningIndex
                  // TODO: handle misere case where next turn may be winner's partner
                  winner.current = true
                  winner.validPlays = true
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
                    delete game.leader
                    delete game.playing
                    const contract = contractor.contract
                    delete contractor.contract
                    const contractTricks = contractor.tricks.length +
                      game.players[opposite(game.lastBidder)].tricks.length
                    if (!game.rounds.length) {
                      io.in(gameName).emit('initScore', game.teamNames)
                    }
                    game.rounds.push({ contractorIndex: game.lastBidder, contract: contract, tricksMade: contractTricks })
                    const result = calculateScore(contract, contractTricks)
                    appendLog(gameName, `${contractor.name}'s partnership ${result.made ? 'makes' : 'fails'} their contract, scoring ${result.score[0]}.`)
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
                      checkEnd(gameName)
                      if (game.ended) {
                        io.in(gameName).emit('updatePlayers', game.players)
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
        if (game.ended && game.players.every(player => !player.socketId)) {
          console.log(`removing finished game ${gameName}`)
          delete games[gameName]
        }
      }
    }
    console.log("active games: " + Object.keys(games).join(', '))
  })
})
