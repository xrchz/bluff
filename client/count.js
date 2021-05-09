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
    startButton.hidden = false
  }
  joinButton.hidden = true
  playersDiv.hidden = false
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
  playersDiv.children[playerIndex].querySelectorAll('h3').forEach(h3 => h3.classList.add('disconnected'))
})

socket.on('setConnected', playerIndex => {
  playersDiv.children[playerIndex].querySelectorAll('h3').forEach(h3 => h3.classList.remove('disconnected'))
})

socket.on('updatePlayers', players => {
  playersDiv.innerHTML = ''
  const currentIndex = players.findIndex(player => player.current)
  for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
    const player = players[playerIndex]
    const div = fragment.appendChild(document.createElement('div'))
    const h3 = div.appendChild(document.createElement('h3'))
    h3.textContent = player.name
    // TODO: show player disconnected
    if (player.current)
      h3.classList.add('current')
    if (player.hand && (spectateInput.checked || player.name === nameInput.value)) {
      const ul = div.appendChild(document.createElement('ul'))
      player.hand.forEach((n, cardIndex) => {
        const li = ul.appendChild(document.createElement('li'))
        li.textContent = n
        if (!spectateInput.checked && player.validPiles) {
          li.classList.add('clickable')
          li.onclick = () => {
            const selected = ul.querySelector('li.selected')
            if (selected) {
              selected.classList.remove('selected')
              boardDiv.querySelectorAll('p').forEach(p => {
                p.classList.remove('clickable')
                p.onclick = null
              })
            }
            if (selected !== li) {
              li.classList.add('selected')
              for (const pileIndex of player.validPiles[cardIndex]) {
                const deckp = boardDiv.children[pileIndex+1]
                deckp.classList.add('clickable')
                deckp.onclick = () => socket.emit('playRequest',
                  { pileIndex: pileIndex, cardIndex: cardIndex })
              }
            }
          }
        }
      })
      if (!player.minPlays && !spectateInput.checked && player.validPiles) {
        const button = div.appendChild(document.createElement('input'))
        button.type = 'button'
        button.value = 'Done'
        button.onclick = () => socket.emit('doneRequest')
      }
    }
    if (currentIndex < 0 && startButton.disabled && !spectateInput.checked && player.name === nameInput.value) {
      const button = div.appendChild(document.createElement('input'))
      button.type = 'button'
      button.value = 'Me 1st!'
      button.onclick = () => socket.emit('firstRequest', playerIndex)
    }
  }
  playersDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', data => {
  boardDiv.innerHTML = ''
  fragment.appendChild(document.createElement('p')).textContent = `Deck: ${data.deckSize}`
  for (let i = 0; i < 4; i++) {
    const p = fragment.appendChild(document.createElement('p'))
    const span = p.appendChild(document.createElement('span'))
    span.textContent = i < 2 ? '↑' : '↓'
    p.appendChild(document.createElement('span')).textContent =
      `${data.board[i]}`
  }
  boardDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  startButton.disabled = true
  log.hidden = false
  boardDiv.hidden = false
  errorMsg.innerHTML = ''
})

const ordinal = n =>
  n < 1 ? '1st' :
  n < 2 ? '2nd' :
  n < 3 ? '3rd' : `${n+1}th`

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('pileIndex' in entry) {
    li.textContent = `${entry.name} plays ${entry.card} on the ${ordinal(entry.pileIndex)} pile.`
  }
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
