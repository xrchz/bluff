/* global io */
var socket = io(ServerURI('robot'), SocketOptions('robot'))

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const log = document.getElementById('log')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const spectateInput = document.getElementById('spectate')
const spectatorsList = document.getElementById('spectators')
const unseated = document.getElementById('unseated')
const gridDiv = document.getElementById('grid')
const infoDiv = document.getElementById('info')
const playersDiv = document.getElementById('players')

const fragment = document.createDocumentFragment()

const CardChar = ['←', '↑', '→', '↓']
const RobotChar = ['◀', '▲', '▶', '▼'] // '◁' '△' '▷' '▽'
const Columns = 12

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

startButton.onclick = () => { socket.emit('startGame') }

undoButton.onclick = () => {
  socket.emit('undoRequest')
  errorMsg.innerHTML = ''
}

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.disabled = false
  spectateInput.previousElementSibling.hidden = false
  undoButton.hidden = true
  unseated.innerHTML = ''
  startButton.hidden = true
  startButton.disabled = false
  spectatorsList.innerHTML = ''
  log.innerHTML = ''
  log.hidden = true
  gridDiv.innerHTML = ''
  infoDiv.innerHTML = ''
  playersDiv.innerHTML = ''
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

socket.on('updateUnseated', players => {
  unseated.innerHTML = ''
  let elem
  for (player of players) {
    if (player.seated) { continue }
    elem = document.createElement('li')
    elem.textContent = player.name
    unseated.appendChild(elem)
  }
  startButton.hidden = players.length < 2
  errorMsg.innerHTML = ''
})

socket.on('updateSpectators', spectators => {
  spectatorsList.innerHTML = ''
  let elem
  if (spectators.length) {
    spectators.unshift({ name: 'Spectators:' })
  }
  for (spectator of spectators) {
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
  if (!spectateInput.checked) {
    spectateInput.previousElementSibling.hidden = true
    spectateInput.hidden = true
  }
  joinButton.hidden = true
  errorMsg.innerHTML = ''
  if (history.state === 'lobby')
    history.pushState(data, `Game ${data.gameName}`)
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  startButton.disabled = true
  log.hidden = false
  gridDiv.style.gridTemplateColumns = `repeat(${Columns}, 1fr)`
  unseated.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('updateGrid', grid => {
  gridDiv.innerHTML = ''
  for (const c of grid) {
    const div = fragment.appendChild(document.createElement('div'))
    if (c.g) div.classList.add('gem')
    if (c.l) div.classList.add('lava')
    if (c.r) {
      div.classList.add('robot')
      div.textContent = RobotChar[c.r-1]
    }
  }
  gridDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updatePlayers', data => {
  playersDiv.innerHTML = ''
  const currentIndex = data.players.findIndex(player => player.name === nameInput.value)
  const current = data.players[currentIndex]
  for (let playerIndex = 0; playerIndex < data.players.length; playerIndex++) {
    const player = data.players[playerIndex]
    const div = fragment.appendChild(document.createElement('div'))
    const h3 = div.appendChild(document.createElement('h3'))
    h3.textContent = player.name
    if (!data.ended && !('cardIndex' in player)) {
      h3.classList.add('current')
      h3.textContent += ' (*)'
    }
    if (!player.socketId) {
      h3.classList.add('disconnected')
      h3.textContent += ' (d/c)'
    }
    const ol = div.appendChild(document.createElement('ol'))
    for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex++) {
      const card = player.hand[cardIndex]
      const li = ol.appendChild(document.createElement('li'))
      if (playerIndex !== currentIndex || spectateInput.checked)
        li.appendChild(document.createElement('span')).textContent =
          `${CardChar[card.d-1]} `
      const cluesSpan = li.appendChild(document.createElement('span'))
      if (Array.isArray(card.c) && card.c.length)
        cluesSpan.textContent = '[' +
          (card.c.length === 1 ? `¬${CardChar[card.c[0]-1]}` :
           `¬(${card.c.map(d => CardChar[d-1]).join(' ∨ ')})`) + ']'
      else if (card.c === true)
        cluesSpan.textContent = `[${CardChar[card.d-1]}]`
      else
        cluesSpan.textContent = '[]'
      if (!spectateInput.checked && !data.ended && playerIndex === currentIndex) {
        const play = li.appendChild(document.createElement('input'))
        play.type = 'button'
        play.value = 'Play'
        play.onclick = () => socket.emit('playRequest', cardIndex)
        if (0 <= currentIndex && current.cardIndex === cardIndex && !('playerIndex' in current))
          play.classList.add('selected')
        const drop = li.appendChild(document.createElement('input'))
        drop.type = 'button'
        drop.value = 'Drop'
        drop.onclick = () => socket.emit('dropRequest', cardIndex)
        if (0 <= currentIndex && current.cardIndex === cardIndex && current.playerIndex === -1)
          drop.classList.add('selected')
      }
    }
    if (!spectateInput.checked && !data.ended && data.cluesLeft && playerIndex !== currentIndex) {
      const cluesDiv = div.appendChild(document.createElement('div'))
      for (let direction = 0; direction < CardChar.length; direction++) {
        const button = cluesDiv.appendChild(document.createElement('input'))
        button.type = 'button'
        button.value = CardChar[direction]
        button.onclick = () => socket.emit('clueRequest',
          {playerIndex: playerIndex, direction: direction+1})
        if (0 <= currentIndex && current.playerIndex === playerIndex &&
            current.cardIndex === direction+1)
          button.classList.add('selected')
      }
    }
  }
  playersDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateInfo', data => {
  infoDiv.innerHTML = ''
  fragment.appendChild(document.createElement('p')).textContent = `Cards: ${data.cardsLeft}`
  fragment.appendChild(document.createElement('p')).textContent = `Clues: ${data.cluesLeft}`
  fragment.appendChild(document.createElement('p')).textContent =
    `Dropped: ${data.dropped.map(d => CardChar[d-1]).join(' ')}`
  infoDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('setDisconnected', playerIndex => {
  if (playerIndex < playersDiv.children.length) {
    const nameDiv = playersDiv.children[playerIndex].firstElementChild
    nameDiv.classList.add('disconnected')
    nameDiv.textContent += ' (d/c)'
  }
})

const ordinal = n =>
  n === 0 ? '1st' :
  n === 1 ? '2nd' :
  n === 2 ? '3rd' : `${n+1}th`

const plural = (n, s1, s2) =>
  `${n} ${n === 1 ? s1 : s2}`

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('turn' in entry)
    li.textContent = `The robot turns ${RobotChar[entry.turn-1]}.`
  else if ('move' in entry) {
    li.textContent = `The robot ${entry.cont ? 'continues' : 'moves'} ${RobotChar[entry.move-1]}`
    if (entry.lava) li.textContent += ` and sinks into the lava`
    if (entry.gem) li.textContent += ` and collects a gem`
    if (entry.gain) li.textContent += `, gaining a clue.`
    else li.textContent += `.`
  }
  else if ('name' in entry) {
    if ('other' in entry)
      li.textContent = `${entry.name} clues ${entry.other}'s ${CardChar[entry.direction-1]} cards.`
    else
      li.textContent = `${entry.name} ${entry.drop ? 'drops' : 'plays'} their ${ordinal(entry.index)} card ${CardChar[entry.card-1]}.`
  }
  else if ('clueAttempts' in entry) {
    if ('cluesLeft' in entry)
      li.textContent =
        `${plural(entry.clueAttempts, 'clue attempt', 'clue attempts')} failed` +
        ` since only ${plural(entry.cluesLeft, 'clue is', 'clues are')} possible.`
    else
      li.textContent =
        `${plural(entry.clueAttempts, 'clue succeeds', 'clues succeed')}.`
  }
  else
    li.textContent = 'Error: unhandled log entry'
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
