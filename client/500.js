/* global io */
var socket = io("https://xrchz.net:4500")

const currentDiv = document.getElementById('current')
const startButton = document.getElementById('start')
const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const playerList = document.getElementById('players')
const spectateInput = document.getElementById('spectate')
const errorMsg = document.getElementById('errorMsg')
const log = document.getElementById('log')

socket.on('updatePlayers', players => {
  playerList.innerHTML = players
})

socket.on('setCurrent', player => {
  if (player) {
    currentDiv.textContent = 'Waiting for ' + player + '...'
  }
  else {
    currentDiv.innerHTML = ''
  }
})

startButton.onclick = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
}

socket.on('rejoinGame', (playerName, spectating) => {
  nameInput.value = playerName
  spectateInput.checked = spectating
  gameInput.disabled = true
  nameInput.disabled = true
  spectateInput.disabled = true
  startButton.remove()
  errorMsg.innerHTML = ''
})

socket.on('joinGame', data => {
  gameInput.value = data.gameName
  nameInput.value = data.playerName
  gameInput.disabled = true
  nameInput.disabled = true
  spectateInput.disabled = true
  if (!spectateInput.checked) {
    startButton.value = 'Start!'
    startButton.onclick = () => {
      socket.emit('startGame')
    }
  }
  else {
    startButton.hidden = true
  }
  errorMsg.innerHTML = '';
})

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
