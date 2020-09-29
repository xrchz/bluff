/* global io */
var socket = io("https://xrchz.net:4500")

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const log = document.getElementById('log')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const spectateInput = document.getElementById('spectate')
const spectatorsDiv = document.getElementById('spectators')
const unseated = document.getElementById('unseated')
const kittyDiv = document.getElementById('kitty')
const playerSouth = document.getElementById('playerSouth')
const playerWest = document.getElementById('playerWest')
const playerNorth = document.getElementById('playerNorth')
const playerEast = document.getElementById('playerEast')
const rotateDiv = document.getElementById('rotate')
const rotateClockwise = document.getElementById('rotateClockwise')
const rotateAnticlockwise = document.getElementById('rotateAnticlockwise')

const seatDivs = [playerSouth, playerWest, playerNorth, playerEast]

const fragment = document.createDocumentFragment()

function moveContents(fromNode, toNode) {
  while (fromNode.firstChild) { toNode.appendChild(fromNode.firstChild) }
}

rotateClockwise.onclick = () => {
  seatDivs.push(seatDivs.shift())
  moveContents(seatDivs[3], fragment)
  moveContents(seatDivs[2], seatDivs[3])
  moveContents(seatDivs[1], seatDivs[2])
  moveContents(seatDivs[0], seatDivs[1])
  seatDivs[0].appendChild(fragment)
}

rotateAnticlockwise.onclick = () => {
  seatDivs.unshift(seatDivs.pop())
  moveContents(seatDivs[0], fragment)
  moveContents(seatDivs[1], seatDivs[0])
  moveContents(seatDivs[2], seatDivs[1])
  moveContents(seatDivs[3], seatDivs[2])
  seatDivs[3].appendChild(fragment)
}

joinButton.onclick = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
}

socket.on('joinedGame', data => {
  gameInput.value = data.gameName
  nameInput.value = data.playerName
  spectateInput.checked = data.spectating
  gameInput.disabled = true
  nameInput.disabled = true
  spectateInput.disabled = true
  spectateInput.previousElementSibling.hidden = true
  spectateInput.hidden = true
  joinButton.remove()
  rotateDiv.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updateSeats', seats => {
  const seated = Boolean(seats.find(seat => seat.player && seat.player.name === nameInput.value))
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
    if (player.name === nameInput.value || spectateInput.checked) {
      for (const c of player.formattedHand) {
        const span = elem.appendChild(document.createElement('span'))
        span.textContent = c.chr
        if (c.cls) { span.classList.add(c.cls) }
      }
    }
    else {
      elem.textContent = '🂠'.repeat(player.hand.length)
    }
    const bid = player.lastBid || player.contract
    if (bid) {
      elem = document.createElement('div')
      fragment.appendChild(elem)
      elem.classList.add('bids')
      if (bid.cls) { elem.classList.add(bid.cls) }
      elem.textContent = bid.formatted
    }
    if (player.name === nameInput.value && player.validBids) {
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
    div.appendChild(fragment)
  }
  errorMsg.innerHTML = ''
})

socket.on('updateKitty', cards => {
  kittyDiv.innerHTML = ''
  if (spectateInput.checked) {
    for (const c of cards) {
      const span = kittyDiv.appendChild(document.createElement('span'))
      span.textContent = c.chr
      if (c.cls) { span.classList.add(c.cls) }
    }
  }
  else {
    kittyDiv.textContent = '🂠'.repeat(3)
  }
  errorMsg.innerHTML = ''
})

socket.on('updateUnseated', players => {
  while (unseated.firstChild) { unseated.firstChild.remove() }
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
  while (spectatorsDiv.firstChild) { spectatorsDiv.firstChild.remove() }
  let elem
  for (spectator of spectators) {
    elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsDiv.appendChild(elem)
  }
})

startButton.onclick = () => { socket.emit('startGame') }

socket.on('gameStarted', () => {
  startButton.remove()
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

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
