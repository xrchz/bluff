/* global io */
var socket = io(ServerURI('cross'), SocketOptions('cross'))

const fragment = document.createDocumentFragment()

const errorMsg = document.getElementById('errorMsg')
const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const joinButton = document.getElementById('join')
const spectateInput = document.getElementById('spectate')
const spectatorsList = document.getElementById('spectators')
const playersList = document.getElementById('players')
const gamesList = document.getElementById('games')
const startButton = document.getElementById('start')
const playArea = document.getElementById('playArea')
const boardDiv = document.getElementById('board')

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.previousElementSibling.hidden = false
  spectateInput.disabled = false
  startButton.hidden = true
  spectatorsList.innerHTML = ''
  playersList.innerHTML = ''
  playArea.hidden = true
  boardDiv.innerHTML = ''
  history.replaceState('lobby', 'Lobby')
})

socket.on('updateSpectators', spectators => {
  spectatorsList.innerHTML = ''
  if (spectators.length) {
    spectators.unshift({ name: 'Spectators:' })
  }
  for (spectator of spectators) {
    const elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsList.appendChild(elem)
  }
})

socket.on('updatePlayers', players => {
  playersList.innerHTML = ''
  for (player of players) {
    const li = document.createElement('li')
    li.textContent = player.name
    if (!player.socketId)
      li.classList.add('disconnected')
    playersList.appendChild(li)
  }
  errorMsg.innerHTML = ''
})

socket.on('joinedGame', data => {
  gameInput.value = data.gameName
  nameInput.value = data.playerName
  spectateInput.checked = data.spectating
  gameInput.disabled = true
  nameInput.disabled = true
  spectateInput.disabled = true
  joinButton.hidden = true
  if (!spectateInput.checked) {
    spectateInput.previousElementSibling.hidden = true
    spectateInput.hidden = true
  }
  errorMsg.innerHTML = ''
  if (history.state === 'lobby')
    history.pushState(data, `Game ${data.gameName}`)
})

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

startButton.onclick = () => socket.emit('startGame')

socket.on('showStart', show => {
  if (!spectateInput.checked)
    startButton.hidden = !show
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  joinButton.hidden = true
  playArea.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', board => {
  boardDiv.innerHTML = ''
  for (let i = 0; i < board.length; i++) {
    const row = board[i]
    for (let j = 0; j < row.length; j++) {
      const tile = row[j]
      const tileDiv = fragment.appendChild(document.createElement('div'))
      tileDiv.classList.add('tile')
      if (tile.dl) tileDiv.classList.add('dl')
      if (tile.tl) tileDiv.classList.add('tl')
      if (tile.dw) tileDiv.classList.add('dw')
      if (tile.tw) tileDiv.classList.add('tw')
    }
  }
  boardDiv.appendChild(fragment)
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
