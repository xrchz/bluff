const socket = io(ServerURI('50six'), SocketOptions('50six'))

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const spectateInput = document.getElementById('spectate')
const unseatedList = document.getElementById('unseated')
const spectatorsList = document.getElementById('spectators')
const log = document.getElementById('log')
const playArea = document.getElementById('playArea')
const roundTable = document.getElementById('round')

const playerDivs = []
const playedDivs = []
for (let i = 0; i < 6; i++) {
  playerDivs.push(document.getElementById(`player${i}`))
  playedDivs.push(document.getElementById(`played${i}`))
}

const fragment = document.createDocumentFragment()

const CardChar = c =>
String.fromCodePoint(0x1F0A0 +
  (0x10 * c.s) +
  [0xD, 0xE, 0xA, 0x1, 0x9, 0xB][c.r])

const SuitChar = ['♠', '♥', '♦', '♣']

const formatBid = bid =>
  bid.n ? `${bid.p ? '+' : ''}${bid.n}${SuitChar[bid.s]}` : 'Pass'

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
  startButton.hidden = true
  startButton.disabled = false
  unseatedList.innerHTML = ''
  spectatorsList.innerHTML = ''
  log.innerHTML = ''
  log.hidden = true
  roundTable.hidden = true
  roundTable.replaceChildren(roundTable.firstElementChild)
  playArea.hidden = true
  playerDivs.forEach(div => div.replaceChildren())
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

function setDisconnected(h3) {
  if (!h3.classList.contains('disconnected')) {
    h3.textContent += ' (d/c)'
    h3.classList.add('disconnected')
  }
}

socket.on('updateSeats', players => {
  unseatedList.innerHTML = ''
  const filledSeats = Array(playerDivs.length).fill(false)
  let elem
  for (player of players) {
    if ('seat' in player) {
      const playerDiv = playerDivs[player.seat]
      if (!playerDiv.querySelector('h3')) {
        const h3 = playerDiv.appendChild(document.createElement('h3'))
        h3.textContent = player.name
        if (!player.socketId) setDisconnected(h3)
      }
      filledSeats[player.seat] = true
    }
    else {
      elem = document.createElement('li')
      elem.textContent = player.name
      fragment.appendChild(elem)
    }
  }
  // TODO: show Empty for empty seats
  unseatedList.appendChild(fragment)
  for (let i = 0; i < playerDivs.length; i++) {
    if (!filledSeats[i])
      playerDivs[i].querySelectorAll('h3').forEach(h3 => h3.parentElement.removeChild(h3))
  }
  if (!startButton.disabled) {
    startButton.hidden = players.length < 6 || elem
    const current = players.find(player => player.name === nameInput.value)
    if (current && !spectateInput.checked) {
      playArea.querySelectorAll('input[type=button]').forEach(button =>
        button.parentElement.removeChild(button))
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
  }
  errorMsg.innerHTML = ''
})

socket.on('setDisconnected', playerIndex => {
  playerDivs[playerIndex].querySelectorAll('h3').forEach(setDisconnected)
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  startButton.disabled = true
  playArea.querySelectorAll('input[type=button]').forEach(button =>
    button.parentElement.removeChild(button)
  )
  log.hidden = false
  roundTable.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updatePlayers', players => {
  const currentIndex = players.findIndex(player => player.name === nameInput.value)
  for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
    const player = players[playerIndex]
    const playerDiv = playerDivs[playerIndex]
    playerDiv.replaceChildren()
    const nameDiv = playerDiv.appendChild(document.createElement('h3'))
    nameDiv.textContent = player.name
    if (player.current) {
      nameDiv.textContent += ' (*)'
      nameDiv.classList.add('current')
    }
    if (!player.socketId) setDisconnected(nameDiv)
    const hand = playerDiv.appendChild(document.createElement('ul'))
    hand.classList.add('inline')
    for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex++) {
      const card = player.hand[cardIndex]
      const li = hand.appendChild(document.createElement('li'))
      if (spectateInput.checked || currentIndex === playerIndex) {
        li.textContent = CardChar(card)
        if (player.current && player.validPlays && player.validPlays.includes(cardIndex)) {
          li.classList.add('clickable')
          li.onclick = () => socket.emit('playRequest', cardIndex)
        }
      }
      else
        li.textContent = '🂠'
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
        button.onclick = () => socket.emit('bidRequest', bidIndex)
      }
    }
    if (player.tricks) {
      const tricks = playerDiv.appendChild(document.createElement('ul'))
      tricks.classList.add('inline')
      for (let trickIndex = 0; trickIndex < player.tricks.length; trickIndex++) {
        const trick = player.tricks[trickIndex]
        const li = tricks.appendChild(document.createElement('li'))
        li.classList.add('clickable')
        li.onclick = () => socket.emit('trickRequest',
          { playerIndex: playerIndex, trickIndex: trickIndex })
        if (player.trickOpen[trickIndex])
          li.textContent = trick.map(CardChar).join('')
        else
          li.textContent = '🂠'
      }
    }
  }
  errorMsg.innerHTML = ''
})

socket.on('updateTrick', data => {
  if (data.trick.length) {
    let i = data.nextIndex
    for (let j = data.trick.length - 1; 0 <= j; j--) {
      if (i) i--
      else i = playedDivs.length - 1
      playedDivs[i].textContent = CardChar(data.trick[j])
    }
  }
  else
    playedDivs.forEach(div => div.textContent = '')
  errorMsg.innerHTML = ''
})

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('bid' in entry)
    li.textContent = `${entry.name} bids ${formatBid(entry.bid)}.`
  else if ('winningBid' in entry)
    li.textContent = `${entry.name} wins the bidding with ${formatBid(entry.winningBid)}.`
  else if ('card' in entry)
    li.textContent = `${entry.name} plays ${CardChar(entry.card)}.`
  else if ('bidWon' in entry)
    li.textContent = `${TeamName[entry.biddingTeam]} ${entry.bidWon ? 'makes' : 'fails'} their bid,` +
                     ` ${entry.bidWon ? 'gaining' : 'losing'} ${entry.delta} points.`
  else
    li.textContent = 'Error: unhandled log entry'
  log.appendChild(li)
  li.scrollIntoView(false)
  errorMsg.innerHTML = ''
})

socket.on('removeLog', n => {
  while (n-- > 0) log.removeChild(log.lastElementChild)
  errorMsg.innerHTML = ''
})

function fillRoundRow(round, tr) {
  tr.appendChild(document.createElement('td')).textContent = round.number
  tr.appendChild(document.createElement('td')).textContent = round.contractorName
  tr.appendChild(document.createElement('td')).textContent = formatBid(round.contract)
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
  tr.replaceChildren()
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

socket.on('errorMsg', msg => errorMsg.textContent = msg)
