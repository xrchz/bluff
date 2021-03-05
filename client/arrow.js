/* global io */
var socket = io("https://xrchz.net", {path: '/games/arrow/socket.io'})

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const playersList = document.getElementById('players')
const spectateInput = document.getElementById('spectate')
const spectatorsList = document.getElementById('spectators')
const playArea = document.getElementById('playArea')
const noMatchesButton = document.getElementById('noMatches')
const boardDiv = document.getElementById('board')
const piecesDiv = document.getElementById('pieces')

const fragment = document.createDocumentFragment()

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

undoButton.onclick = () => {
  socket.emit('undoRequest')
  errorMsg.innerHTML = ''
}

startButton.onclick = () => socket.emit('startGame')

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.previousElementSibling.hidden = false
  spectateInput.disabled = false
  startButton.hidden = true
  startButton.disabled = false
  undoButton.hidden = true
  playersList.innerHTML = ''
  spectatorsList.innerHTML = ''
  playArea.hidden = true
  boardDiv.innerHTML = ''
  piecesDiv.innerHTML = ''
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
    let a = li.appendChild(document.createElement('a'))
    a.textContent = game.name
    a.onclick = () => {
      gameInput.value = gameInput.value === game.name ? '' : game.name
    }
    const ul = li.appendChild(document.createElement('ul'))
    ul.classList.add('inline')
    for (const player of game.players) {
      a = ul.appendChild(document.createElement('li'))
      if (!player.socketId) {
        a = a.appendChild(document.createElement('a'))
        a.classList.add('disconnected')
        a.onclick = () => {
          if (gameInput.value === game.name && nameInput.value === player.name)
            nameInput.value = ''
          else {
            gameInput.value = game.name
            nameInput.value = player.name
          }
        }
      }
      a.textContent = player.name
    }
  }
  gamesList.appendChild(fragment)
  gamesList.hidden = !games.length
})

socket.on('updatePlayers', players => {
  playersList.innerHTML = ''
  if (!startButton.disabled)
    startButton.hidden = players.length <= 1
  for (const player of players) {
    const li = fragment.appendChild(document.createElement('li'))
    li.textContent = player.name
    if (!player.socketId)
      li.classList.add('disconnected')
    if (player.current)
      li.classList.add('current')
    if (player.winner)
      li.classList.add('winner')
  }
  playersList.appendChild(fragment)
})

socket.on('updateSpectators', spectators => {
  spectatorsList.innerHTML = ''
  let elem
  if (spectators.length) {
    spectators.unshift({ name: 'Spectators:' })
  }
  for (const spectator of spectators) {
    elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsList.appendChild(elem)
  }
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

socket.on('gameStarted', () => {
  startButton.hidden = true
  startButton.disabled = true
  playArea.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', board => {
  boardDiv.innerHTML = ''
  for (let i = 0; i < board.length; i++) {
    const piece = board[i]
    const div = fragment.appendChild(document.createElement('div'))
    div.classList.add('piece')
    if (piece) {
      for (let d = 0; d < 4; d++)
        div.classList.add(`d${d}${piece.d[d]}`)
      if (piece.arrow)
        div.classList.add('arrow')
    }
    else {
      div.classList.add('empty')
      div.placeIndex = i
    }
  }
  boardDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updatePieces', data => {
  piecesDiv.innerHTML = ''
  const current = !spectateInput.checked && nameInput.value === data.currentPlayer
  const dropping = data.pieces.some(piece => piece && piece.selected)
  if (current && dropping) {
    boardDiv.querySelectorAll('div.empty').forEach(div => {
      div.classList.add('playable')
      div.onclick = () => socket.emit('dropRequest', div.placeIndex)
    })
  }
  for (let i = 0; i < data.pieces.length; i++) {
    const piece = data.pieces[i]
    const div = fragment.appendChild(document.createElement('div'))
    div.classList.add('piece')
    if (piece === null) continue
    for (let d = 0; d < 4; d++)
      div.classList.add(`d${d}${piece.d[d]}`)
    if (piece.selected)
      div.classList.add('selected')
    if (current && !dropping) {
      div.classList.add('selectable')
      div.onclick = () => socket.emit('pickRequest', i)
    }
  }
  piecesDiv.appendChild(fragment)
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
