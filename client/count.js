const socket = io(ServerURI('count'), SocketOptions('count'))

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const spectateInput = document.getElementById('spectate')
const spectatorsList = document.getElementById('spectators')
const log = document.getElementById('log')
const boardDiv = document.getElementById('board')
const playersDiv = document.getElementById('players')

const fragment = document.createDocumentFragment()

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
  spectatorsList.innerHTML = ''
  log.innerHTML = ''
  log.hidden = true
  boardDiv.hidden = true
  playersDiv.hidden = true
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

socket.on('setDisconnected', playerIndex => {
  playerDivs[playerIndex].querySelectorAll('h3').forEach(h3 => h3.classList.add('disconnected'))
})

socket.on('setConnected', playerIndex => {
  playerDivs[playerIndex].querySelectorAll('h3').forEach(h3 => h3.classList.remove('disconnected'))
})

socket.on('updatePlayers', players => {
  playersDiv.innerHTML = ''
  for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
    const player = players[playerIndex]
    const div = fragment.appendChild(document.createElement('div'))
    const h3 = div.appendChild(document.createElement('h3'))
    h3.textContent = player.name
    // TODO: show player current/disconnected
    // TODO: show player button to start if appropriate
    // TODO: show player hand if appropriate
  }
  playersDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', data => {
  boardDiv.innerHTML = ''
  fragment.appendChild(document.createElement('p')).textContent = `Deck: ${data.deckSize}`
  fragment.appendChild(document.createElement('p')).textContent = `↑ ${data.board[0]}`
  fragment.appendChild(document.createElement('p')).textContent = `↑ ${data.board[1]}`
  fragment.appendChild(document.createElement('p')).textContent = `↓ ${data.board[2]}`
  fragment.appendChild(document.createElement('p')).textContent = `↓ ${data.board[3]}`
  boardDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
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

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
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

socket.on('showUndo', show =>
  undoButton.hidden = spectateInput.checked || !show)

undoButton.onclick = () => {
  socket.emit('undoRequest')
  errorMsg.innerHTML = ''
}

socket.on('errorMsg', msg => errorMsg.textContent = msg)
