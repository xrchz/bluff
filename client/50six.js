const socket = io(ServerURI('50six'), SocketOptions('50six'))

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const nextButton = document.getElementById('next')
const spectateInput = document.getElementById('spectate')
const unseatedList = document.getElementById('unseated')
const spectatorsList = document.getElementById('spectators')
const log = document.getElementById('log')
const cheatLog = document.getElementById('cheat')
const rotateClockwise = document.getElementById('rotateClockwise')
const rotateAnticlockwise = document.getElementById('rotateAnticlockwise')
const playArea = document.getElementById('playArea')
const rotateButtons = document.getElementById('rotateButtons')
const roundTable = document.getElementById('round')

const playerDivs = []
const playedDivs = []
for (let i = 0; i < 6; i++) {
  playerDivs.push(document.getElementById(`player${i}`))
  playedDivs.push(document.getElementById(`played${i}`))
}
playedDivs.forEach(div => div.classList.add('cards'))

const fragment = document.createDocumentFragment()

function moveContents(fromNode, toNode) {
  while (fromNode.firstChild) { toNode.appendChild(fromNode.firstChild) }
}

function rotateDivsClockwise(divs) {
  divs.unshift(divs.pop())
  moveContents(divs[0], fragment)
  for (let i = 1; i < divs.length; i++)
    moveContents(divs[i], divs[i-1])
  divs[divs.length - 1].appendChild(fragment)
}

function rotateDivsAnticlockwise(divs) {
  divs.push(divs.shift())
  let i = divs.length
  moveContents(divs[--i], fragment)
  while (i-- > 0) moveContents(divs[i], divs[i+1])
  divs[0].appendChild(fragment)
}

rotateClockwise.onclick = () => {
  rotateDivsClockwise(playerDivs)
  rotateDivsClockwise(playedDivs)
}

rotateAnticlockwise.onclick = () => {
  rotateDivsAnticlockwise(playerDivs)
  rotateDivsAnticlockwise(playedDivs)
}

const TeamName = ['Yellow', 'Purple']

const CardChar = c =>
String.fromCodePoint(0x1F0A0 +
  (0x10 * c.s) +
  [0xD, 0xE, 0xA, 0x1, 0x9, 0xB][c.r])

const SuitChar = ['♠', '♥', '♦', '♣']
const SuitClass = ['spades', 'hearts', 'diamonds', 'clubs']

const formatBid = bid =>
  bid.n ? `${bid.p ? '+' : ''}${bid.n}${SuitChar[bid.s]}${bid.c ? '*' : ''}`
        : 'Pass'

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName: gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

startButton.onclick = () => socket.emit('startGame')

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.disabled = false
  spectateInput.previousElementSibling.hidden = false
  undoButton.hidden = true
  nextButton.hidden = true
  startButton.hidden = true
  startButton.disabled = false
  unseatedList.innerHTML = ''
  spectatorsList.innerHTML = ''
  log.innerHTML = ''
  log.hidden = true
  cheatLog.innerHTML = ''
  cheatLog.hidden = true
  roundTable.hidden = true
  const headerRow = roundTable.firstElementChild
  roundTable.innerHTML = ''
  roundTable.appendChild(headerRow)
  playArea.hidden = true
  rotateButtons.hidden = true
  playerDivs.forEach(div => div.innerHTML = '')
  playedDivs.forEach(div => div.innerHTML = '')
  history.replaceState('lobby', 'Lobby')
})

window.onpopstate = function (e) {
  if (e.state === 'lobby') {
    socket.close()
    socket.open()
  }
  else if (e.state)
    socket.emit('joinRequest', e.state)
}

socket.on('updateGames', games => {
  gamesList.innerHTML = ''
  for (const game of games) {
    const li = fragment.appendChild(document.createElement('li'))
    const span = li.appendChild(document.createElement('span'))
    span.textContent = game.name
    span.classList.add('clickable')
    span.onclick = () =>
      gameInput.value = gameInput.value === game.name ? '' : game.name
    const ul = li.appendChild(document.createElement('ul'))
    ul.classList.add('inline')
    for (const player of game.players) {
      const li = ul.appendChild(document.createElement('li'))
      li.textContent = player.name
      if (!player.socketId) {
        li.classList.add('disconnected')
        li.classList.add('clickable')
        li.onclick = () => {
          if (gameInput.value === game.name && nameInput.value === player.name)
            nameInput.value = ''
          else {
            gameInput.value = game.name
            nameInput.value = player.name
          }
        }
      }
    }
  }
  gamesList.appendChild(fragment)
  gamesList.hidden = !games.length
})

socket.on('joinedGame', data => {
  gameInput.value = data.gameName
  nameInput.value = data.playerName
  spectateInput.checked = data.spectating
  gameInput.disabled = true
  nameInput.disabled = true
  spectateInput.disabled = true
  if (!spectateInput.checked) {
    spectateInput.previousElementSibling.hidden = true
    spectateInput.hidden = true
  }
  joinButton.hidden = true
  playArea.hidden = false
  rotateButtons.hidden = false
  errorMsg.innerHTML = ''
  if (history.state === 'lobby')
    history.pushState(data, `Game ${data.gameName}`)
})

socket.on('updateSpectators', spectators => {
  spectatorsList.innerHTML = ''
  if (spectators.length)
    spectators.unshift({ name: 'Spectators:' })
  for (spectator of spectators) {
    const elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsList.appendChild(elem)
  }
})

socket.on('updateSeats', players => {
  unseatedList.innerHTML = ''
  const filledSeats = Array(playerDivs.length).fill(false)
  let elem
  for (const player of players) {
    if ('seat' in player) {
      const playerDiv = playerDivs[player.seat]
      playerDiv.innerHTML = ''
      const h3 = playerDiv.appendChild(document.createElement('h3'))
      h3.textContent = player.name
      h3.classList.add(TeamName[player.seat % 2])
      if (!player.socketId) h3.classList.add('disconnected')
      filledSeats[player.seat] = true
    }
    else {
      elem = document.createElement('li')
      elem.textContent = player.name
      fragment.appendChild(elem)
    }
  }
  unseatedList.appendChild(fragment)
  for (let i = 0; i < playerDivs.length; i++) {
    if (!filledSeats[i]) {
      playerDivs[i].innerHTML = ''
      playerDivs[i].appendChild(document.createElement('h4')).textContent = 'Empty Seat'
    }
  }
  startButton.hidden = players.length < 6 || elem
  const current = players.find(player => player.name === nameInput.value)
  if (current && !spectateInput.checked) {
    if ('seat' in current) {
      const button = playerDivs[current.seat].appendChild(document.createElement('input'))
      button.type = 'button'
      button.value = 'Leave Seat'
      button.onclick = () => socket.emit('leaveSeat')
    }
    else {
      for (let i = 0; i < playerDivs.length; i++) {
        if (players.find(player => player.seat === i)) continue
        const button = playerDivs[i].appendChild(document.createElement('input'))
        button.type = 'button'
        button.value = 'Sit Here'
        button.onclick = () => socket.emit('joinSeat', i)
      }
    }
  }
  errorMsg.innerHTML = ''
})

socket.on('setDisconnected', playerIndex => {
  playerDivs[playerIndex].querySelectorAll('h3').forEach(h3 => h3.classList.add('disconnected'))
})

socket.on('setConnected', playerIndex => {
  playerDivs[playerIndex].querySelectorAll('h3').forEach(h3 => h3.classList.remove('disconnected'))
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  startButton.disabled = true
  playArea.querySelectorAll('input[type=button]').forEach(button =>
    button.parentElement.removeChild(button)
  )
  log.hidden = false
  cheatLog.hidden = false
  roundTable.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updatePlayers', players => {
  const currentIndex = players.findIndex(player => player.name === nameInput.value)
  for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
    const player = players[playerIndex]
    const playerDiv = playerDivs[playerIndex]
    playerDiv.innerHTML = ''
    const nameDiv = playerDiv.appendChild(document.createElement('h3'))
    nameDiv.textContent = player.name
    nameDiv.classList.add(TeamName[playerIndex % 2])
    if (player.current) {
      nameDiv.textContent += ' (*)'
      nameDiv.classList.add('current')
    }
    if (!player.socketId) nameDiv.classList.add('disconnected')
    const hand = playerDiv.appendChild(document.createElement('ul'))
    hand.classList.add('cards','inline')
    for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex++) {
      const card = player.hand[cardIndex]
      const li = hand.appendChild(document.createElement('li'))
      if (spectateInput.checked || currentIndex === playerIndex) {
        li.textContent = CardChar(card)
        li.classList.add(SuitClass[card.s])
        if (player.current && player.validPlays && player.validPlays.includes(cardIndex)) {
          li.classList.add('clickable')
          li.onclick = () => socket.emit('playRequest', cardIndex)
        }
      }
      else
        li.textContent = '🂠'
    }
    if (!spectateInput.checked && currentIndex === playerIndex &&
        player.current && player.courtOption) {
      const li = hand.appendChild(document.createElement('li'))
      const button = li.appendChild(document.createElement('input'))
      button.type = 'button'
      button.value = 'Court'
      button.onclick = () => socket.emit('courtRequest')
    }
    if (!spectateInput.checked && currentIndex === playerIndex &&
        player.validBids && player.current) {
      if (player.validBids.length === 1) {
        socket.emit('bidRequest', 0)
        break
      }
      const bids = playerDiv.appendChild(document.createElement('ul'))
      bids.classList.add('inline')
      for (let bidIndex = 0; bidIndex < player.validBids.length; bidIndex++) {
        const vb = player.validBids[bidIndex]
        const li = bids.appendChild(document.createElement('li'))
        const button = li.appendChild(document.createElement('input'))
        button.type = 'button'
        button.value = formatBid(vb)
        button.classList.add(SuitClass[vb.s])
        button.classList.add('bid')
        button.onclick = () => socket.emit('bidRequest', bidIndex)
      }
    }
    if (player.tricks) {
      const tricks = playerDiv.appendChild(document.createElement('ul'))
      tricks.classList.add('cards', 'inline')
      for (let trickIndex = 0; trickIndex < player.tricks.length; trickIndex++) {
        const trick = player.tricks[trickIndex]
        const li = tricks.appendChild(document.createElement('li'))
        li.classList.add('clickable')
        li.onclick = () => socket.emit('trickRequest',
          { playerIndex: playerIndex, trickIndex: trickIndex })
        if (player.trickOpen[trickIndex]) {
          for (const card of trick) {
            const span = li.appendChild(document.createElement('span'))
            span.textContent = CardChar(card)
            span.classList.add(SuitClass[card.s])
          }
        }
        else {
          li.textContent = '🂠'
          li.classList.add('trick')
        }
      }
    }
  }
  errorMsg.innerHTML = ''
})

socket.on('updateTrick', data => {
  let i = data.nextIndex
  while (true) {
    if (i) i--
    else i = playedDivs.length - 1
    if (data.trick.length) {
      const card = data.trick.pop()
      playedDivs[i].innerHTML = ''
      const span = playedDivs[i].appendChild(document.createElement('span'))
      span.textContent = CardChar(card)
      span.classList.add(SuitClass[card.s])
    }
    else
      playedDivs[i].innerHTML = ''
    if (i === data.nextIndex) break
  }
  errorMsg.innerHTML = ''
})

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('bid' in entry) {
    li.appendChild(document.createElement('span')).textContent = `${entry.name} bids `
    const span = li.appendChild(document.createElement('span'))
    span.textContent = formatBid(entry.bid)
    span.classList.add(SuitClass[entry.bid.s])
    li.appendChild(document.createElement('span')).textContent = '.'
  }
  else if ('winningBid' in entry) {
    li.appendChild(document.createElement('span')).textContent = `${entry.name} wins the bidding with `
    const span = li.appendChild(document.createElement('span'))
    span.textContent = formatBid(entry.winningBid)
    span.classList.add(SuitClass[entry.winningBid.s])
    li.appendChild(document.createElement('span')).textContent = '.'
  }
  else if ('card' in entry) {
    li.appendChild(document.createElement('span')).textContent = `${entry.name} plays `
    const span = li.appendChild(document.createElement('span'))
    span.textContent = CardChar(entry.card)
    span.classList.add(SuitClass[entry.card.s])
    li.appendChild(document.createElement('span')).textContent = '.'
  }
  else if ('bidWon' in entry)
    li.textContent = `${TeamName[entry.biddingTeam]} ${entry.bidWon ? 'makes' : 'fails'} their bid,` +
                     ` ${entry.bidWon ? 'winning' : 'losing'} ${entry.delta} points.`
  else if ('allTrumps' in entry)
    li.textContent = `${TeamName[entry.allTrumps]} has all the trumps, so this deal is void.`
  else if ('winningTeam' in entry)
    li.textContent = `${TeamName[entry.winningTeam]} wins the game.`
  else
    li.textContent = 'Error: unhandled log entry'
  log.appendChild(li)
  li.scrollIntoView(false)
  errorMsg.innerHTML = ''
})

socket.on('appendCheat', entry =>
  cheatLog.appendChild(document.createElement('li')).textContent = entry
)

socket.on('removeLog', n => {
  while (n-- > 0) log.removeChild(log.lastElementChild)
  errorMsg.innerHTML = ''
})

function fillRoundRow(round, tr) {
  tr.appendChild(document.createElement('td')).textContent = round.number
  tr.appendChild(document.createElement('td')).textContent = round.contractorName
  const td = tr.appendChild(document.createElement('td'))
  td.textContent = formatBid(round.contract)
  td.classList.add(SuitClass[round.contract.s])
  if (round.cardPoints) {
    tr.appendChild(document.createElement('td')).textContent = round.cardPoints[0]
    tr.appendChild(document.createElement('td')).textContent = round.cardPoints[1]
    tr.appendChild(document.createElement('td')).textContent = round.teamPoints[0]
    tr.appendChild(document.createElement('td')).textContent = round.teamPoints[1]
  }
  else {
    let n = 4
    while (n--) tr.appendChild(document.createElement('td'))
  }
}

socket.on('appendRound', round => {
  const tr = document.createElement('tr')
  fillRoundRow(round, tr)
  roundTable.insertBefore(tr, roundTable.firstElementChild.nextElementSibling)
  errorMsg.innerHTML = ''
})

socket.on('updateRound', round => {
  const tr = roundTable.firstElementChild.nextElementSibling
  tr.innerHTML = ''
  fillRoundRow(round, tr)
  errorMsg.innerHTML = ''
})

socket.on('removeRound', n => {
  while (n-- > 0)
    roundTable.removeChild(roundTable.firstElementChild.nextElementSibling)
  errorMsg.innerHTML = ''
})

socket.on('showUndo', show =>
  undoButton.hidden = spectateInput.checked || !show)

undoButton.onclick = () => {
  socket.emit('undoRequest')
  errorMsg.innerHTML = ''
}

socket.on('showNext', show =>
  nextButton.hidden = spectateInput.checked || !show)

nextButton.onclick = () => {
  socket.emit('nextRequest')
  errorMsg.innerHTML = ''
}

socket.on('errorMsg', msg => errorMsg.textContent = msg)
