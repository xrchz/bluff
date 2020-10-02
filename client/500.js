/* global io */
var socket = io("https://xrchz.net:4500")

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const log = document.getElementById('log')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const spectateInput = document.getElementById('spectate')
const spectatorsDiv = document.getElementById('spectators')
const unseated = document.getElementById('unseated')
const kittyDiv = document.getElementById('kitty')
const playerSouth = document.getElementById('playerSouth')
const playerWest = document.getElementById('playerWest')
const playerNorth = document.getElementById('playerNorth')
const playerEast = document.getElementById('playerEast')
const playedSouth = document.getElementById('playedSouth')
const playedWest = document.getElementById('playedWest')
const playedNorth = document.getElementById('playedNorth')
const playedEast = document.getElementById('playedEast')
const rotateDiv = document.getElementById('rotate')
const rotateClockwise = document.getElementById('rotateClockwise')
const rotateAnticlockwise = document.getElementById('rotateAnticlockwise')
const scoreTable = document.getElementById('score')

const seatDivs = [playerSouth, playerWest, playerNorth, playerEast]
const cardDivs = [playedSouth, playedWest, playedNorth, playedEast]

const fragment = document.createDocumentFragment()

function moveContents(fromNode, toNode) {
  while (fromNode.firstChild) { toNode.appendChild(fromNode.firstChild) }
}

function rotateDivsClockwise(divs) {
  divs.push(divs.shift())
  moveContents(divs[3], fragment)
  moveContents(divs[2], divs[3])
  moveContents(divs[1], divs[2])
  moveContents(divs[0], divs[1])
  divs[0].appendChild(fragment)
}

function rotateDivsAnticlockwise(divs) {
  divs.unshift(divs.pop())
  moveContents(divs[0], fragment)
  moveContents(divs[1], divs[0])
  moveContents(divs[2], divs[1])
  moveContents(divs[3], divs[2])
  divs[3].appendChild(fragment)
}

rotateClockwise.onclick = () => {
  rotateDivsClockwise(seatDivs)
  rotateDivsClockwise(cardDivs)
}

rotateAnticlockwise.onclick = () => {
  rotateDivsAnticlockwise(seatDivs)
  rotateDivsAnticlockwise(cardDivs)
}

joinButton.onclick = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
}

startButton.onclick = () => { socket.emit('startGame') }

undoButton.onclick = () => { socket.emit('undoRequest') }

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
  joinButton.parentNode.removeChild(joinButton)
  rotateDiv.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updateSeats', seats => {
  const seated = !spectateInput.checked && seats.find(seat => seat.player && seat.player.name === nameInput.value)
  let emptySeats = false
  for (let i = 0; i < 4; i++) {
    const div = seatDivs[i]
    const seat = seats[i]
    div.innerHTML = ''
    let elem
    if (seat.player) {
      elem = document.createElement('div')
      elem.textContent = seat.player.name
      div.appendChild(elem)
      if (seat.player.name === nameInput.value && !spectateInput.checked) {
        elem = document.createElement('input')
        elem.type = 'button'
        elem.value = 'Leave seat'
        elem.onclick = () => { socket.emit('leaveSeat') }
        div.appendChild(elem)
      }
    }
    else {
      emptySeats = true
      elem = document.createElement('div')
      elem.textContent = 'Empty'
      elem.classList.add('empty')
      div.appendChild(elem)
      if (!spectateInput.checked && !seated) {
        elem = document.createElement('input')
        elem.type = 'button'
        elem.value = 'Sit here'
        elem.onclick = () => { socket.emit('sitHere', { playerName: nameInput.value, seatIndex: i }) }
        div.appendChild(elem)
      }
    }
  }
  if (!emptySeats && seated) {
    startButton.hidden = false
  }
  if (emptySeats) {
    startButton.hidden = true
  }
  errorMsg.innerHTML = ''
})

socket.on('updatePlayers', players => {
  for (let i = 0; i < 4; i++) {
    const div = seatDivs[i]
    const player = players[i]
    const partner = players[(i + 2) % 4]
    div.innerHTML = ''
    let elem
    elem = document.createElement('div')
    fragment.appendChild(elem)
    elem = elem.appendChild(document.createElement('span'))
    elem.textContent = player.name
    if (player.current) {
      elem.textContent += ' (*)'
      elem.classList.add('current')
    }
    if (!player.socketId) {
      elem.textContent += ' (d/c)'
      elem.classList.add('disconnected')
    }
    elem = document.createElement('div')
    fragment.appendChild(elem)
    elem.classList.add('cards')
    if (player.name === nameInput.value ||
        spectateInput.checked ||
        player.open && (player.dummy || players.every(p => p.hand.length < 10))) {
      const playableBase = !spectateInput.checked && player.validPlays &&
        (!player.dummy || partner.name === nameInput.value)
      for (let i = 0; i < player.hand.length; i++) {
        const playable = playableBase && (player.validPlays === true || player.validPlays.includes(i))
        const c = player.hand[i].formatted
        const a = elem.appendChild(document.createElement(playable ? 'a' : 'span'))
        a.textContent = c.chr
        if (c.cls) { a.classList.add(c.cls) }
        if (playable) { a.onclick = () => { socket.emit('playRequest', i) } }
      }
    }
    else {
      elem.innerHTML = '<span>🂠</span>'.repeat(player.selecting ? 10 : player.hand.length)
    }
    const bid = player.lastBid || player.contract
    if (bid) {
      elem = document.createElement('div')
      fragment.appendChild(elem)
      elem.classList.add('bids')
      if (bid.cls) { elem.classList.add(bid.cls) }
      elem.textContent = bid.formatted
    }
    if (player.name === nameInput.value && player.validBids && !spectateInput.checked) {
      elem = document.createElement('div')
      fragment.appendChild(elem)
      elem.classList.add('bids')
      for (const b of player.validBids) {
        const a = elem.appendChild(document.createElement('a'))
        if (b.cls) { a.classList.add(b.cls) }
        a.textContent = b.formatted
        a.onclick = () => { socket.emit('bidRequest', b) }
      }
    }
    if (player.tricks) {
      elem = document.createElement('div')
      fragment.appendChild(elem)
      elem.classList.add('tricks')
      for (let i = 0; i < player.tricks.length; i++) {
        const trick = player.tricks[i]
        const t = elem.appendChild(document.createElement('div'))
        t.classList.add('cards')
        if (trick.open) {
          for (const c of trick.cards) {
            const a = t.appendChild(document.createElement('a'))
            a.textContent = c.formatted.chr
            if (c.formatted.cls) { a.classList.add(c.formatted.cls) }
            a.onclick = () => { socket.emit('trickRequest', { open: false, index: i, playerName: player.name }) }
          }
        }
        else {
          const a = t.appendChild(document.createElement('a'))
          a.textContent = '🂠'
          a.onclick = () => { socket.emit('trickRequest', { open: true, index: i, playerName: player.name }) }
        }
      }
    }
    div.appendChild(fragment)
  }
  errorMsg.innerHTML = ''
})

socket.on('updateKitty', data => {
  kittyDiv.innerHTML = ''
  if (!data) { return }
  const div = kittyDiv.appendChild(document.createElement('div'))
  div.classList.add('cards')
  if (spectateInput.checked) {
    for (const c of data.kitty) {
      const span = div.appendChild(document.createElement('span'))
      span.textContent = c.formatted.chr
      if (c.formatted.cls) { span.classList.add(c.formatted.cls) }
    }
  }
  else if (data.contractorName && nameInput.value === data.contractorName) {
    for (let i = 0; i < data.kitty.length; i++) {
      const a = div.appendChild(document.createElement('a'))
      const c = data.kitty[i].formatted
      a.textContent = c.chr
      if (c.cls) { a.classList.add(c.cls) }
      a.onclick = () => { socket.emit('kittyRequest', { from: 'kitty', index: i }) }
    }
    if (data.kitty.length < 3) {
      const handDiv = seatDivs[data.contractorIndex].firstChild.nextSibling
      if (handDiv.firstChild && handDiv.firstChild.tagName === "SPAN") {
        for (let i = 0; handDiv.firstChild; i++) {
          const span = handDiv.removeChild(handDiv.firstChild)
          const a = fragment.appendChild(document.createElement('a'))
          a.textContent = span.textContent
          a.classList = span.classList
          a.onclick = () => { socket.emit('kittyRequest', { from: 'hand', index: i }) }
        }
        handDiv.appendChild(fragment)
      }
    }
    else {
      const elem = kittyDiv.appendChild(document.createElement('input'))
      elem.type = 'button'
      elem.value = 'Done'
      elem.onclick = () => { socket.emit('kittyRequest', { done: true }) }
    }
  }
  else {
    div.innerHTML = '<span>🂠</span>'.repeat(3)
  }
  errorMsg.innerHTML = ''
})

socket.on('updateTrick', data => {
  for(let i = 0; i < 4; i++) {
    const div = cardDivs[(data.leader + i) % 4]
    div.innerHTML = ''
    if (i < data.trick.length) {
      const c = data.trick[i].formatted
      const elem = div.appendChild(document.createElement('span'))
      elem.textContent = c.chr
      if (c.cls) { elem.classList.add(c.cls) }
    }
  }
})

socket.on('updateUnseated', players => {
  unseated.innerHTML = ''
  let elem
  for (player of players) {
    if (player.seated) { continue }
    elem = document.createElement('li')
    elem.textContent = player.name
    unseated.appendChild(elem)
  }
  errorMsg.innerHTML = ''
})

socket.on('updateSpectators', spectators => {
  spectatorsDiv.innerHTML = ''
  let elem
  for (spectator of spectators) {
    elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsDiv.appendChild(elem)
  }
})

socket.on('removeScore', () => {
  scoreTable.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('initScore', teamNames => {
  scoreTable.innerHTML = ''
  let elem = fragment.appendChild(document.createElement('thead'))
  elem = elem.appendChild(document.createElement('tr'))
  elem.appendChild(document.createElement('th')).textContent = 'Round'
  elem.appendChild(document.createElement('th')).textContent = 'Contractor'
  elem.appendChild(document.createElement('th')).textContent = 'Contract'
  elem.appendChild(document.createElement('th')).textContent = 'Tricks'
  elem.appendChild(document.createElement('th')).textContent = `${teamNames[0]} Score`
  elem.appendChild(document.createElement('th')).textContent = `${teamNames[1]} Score`
  elem.appendChild(document.createElement('th')).textContent = `${teamNames[0]} Total`
  elem.appendChild(document.createElement('th')).textContent = `${teamNames[1]} Total`
  scoreTable.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('appendScore', data => {
  const elem = fragment.appendChild(document.createElement('tr'))
  elem.appendChild(document.createElement('th')).textContent = data.round.toString()
  elem.appendChild(document.createElement('td')).textContent = data.contractor
  const contract = document.createElement('span')
  contract.classList.add('bids')
  if (data.contract.cls) { contract.classList.add(data.contract.cls) }
  contract.textContent = data.contract.formatted
  elem.appendChild(document.createElement('td')).appendChild(contract)
  elem.appendChild(document.createElement('td')).textContent = data.tricks.toString()
  elem.appendChild(document.createElement('td')).textContent = data.score[0]
  elem.appendChild(document.createElement('td')).textContent = data.score[1]
  elem.appendChild(document.createElement('td')).textContent = data.total[0]
  elem.appendChild(document.createElement('td')).textContent = data.total[1]
  scoreTable.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('gameStarted', () => {
  startButton.parentNode.removeChild(startButton)
  log.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('appendLog', markup => {
  const li = document.createElement('li')
  li.innerHTML = markup
  log.appendChild(li)
  li.scrollIntoView(false)
  errorMsg.innerHTML = ''
})

socket.on('removeLog', n => {
  while(n-- > 0) {
    log.removeChild(log.lastElementChild)
  }
  errorMsg.innerHTML = ''
})

socket.on('showUndo', show => {
  if (!show) {
    undoButton.hidden = true
  }
  else if (!spectateInput.checked) {
    undoButton.hidden = false
  }
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
