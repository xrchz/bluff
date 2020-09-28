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
const playerSouth = document.getElementById('playerSouth')
const playerWest = document.getElementById('playerWest')
const playerNorth = document.getElementById('playerNorth')
const playerEast = document.getElementById('playerEast')
const rotateDiv = document.getElementById('rotate')
const rotateClockwise = document.getElementById('rotateClockwise')
const rotateAnticlockwise = document.getElementById('rotateAnticlockwise')

const seatDivs = [playerSouth, playerWest, playerNorth, playerEast]

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

socket.on('updateSeats', data => {
  const seated = Boolean(data.seats.find(seat => seat.player && seat.player.name == nameInput.value))
  for (let i = 0; i < 4; i++) {
    const seatDiv = seatDivs[i]
    const seat = data.seats[i]
    while (seatDiv.firstChild) { seatDiv.firstChild.remove() }
    let elem
    if (seat.player) {
      elem = document.createElement('div')
      elem.textContent = seat.player.name
      seatDiv.appendChild(elem)
      if (!data.missingPlayers) { // game not started
        if (seat.player.name == nameInput.value && !spectateInput.checked) {
          elem = document.createElement('input')
          elem.type = 'button'
          elem.value = 'Leave seat'
          elem.onclick = () => { socket.emit('leaveSeat') }
          seatDiv.appendChild(elem)
        }
      }
      // add bids if appropriate - if name matches and not spectating and valid bids are on the player
      // add hand if appropriate - display hand if name matches or spectating, otherwise card backs
      // add tricks if any
    }
    else {
      elem = document.createElement('div')
      elem.textContent = 'Empty'
      elem.classList.add('empty')
      seatDiv.appendChild(elem)
      if (!spectateInput.checked && !seated) {
        elem = document.createElement('input')
        elem.type = 'button'
        elem.value = 'Sit here'
        elem.onclick = () => { socket.emit('sitHere', { playerName: nameInput.value, seatIndex: i }) }
        seatDiv.appendChild(elem)
      }
    }
  }
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
