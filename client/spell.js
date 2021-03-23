/* global io */
var socket = io(ServerURI('spell'), SocketOptions('spell'))

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
const infoDiv = document.getElementById('info')
const playersDiv = document.getElementById('players')

const fragment = document.createDocumentFragment()

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
  unseated.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('updateTargets', data => {
  infoDiv.innerHTML = ''
  const targetsList = fragment.appendChild(document.createElement('ul'))
  targetsList.id = 'targets'
  for (const w of data.targets)
    targetsList.appendChild(document.createElement('li')).textContent = w
  const scoredList = fragment.appendChild(document.createElement('ul'))
  scoredList.id = 'scored'
  for (const w of data.scored)
    scoredList.appendChild(document.createElement('li')).textContent = w
  fragment.appendChild(document.createElement('p')).textContent = `Letters Left: ${data.cardsLeft}`
  fragment.appendChild(document.createElement('p')).textContent = `Discards: ${data.discarded}`
  infoDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updatePlayers', data => {
  playersDiv.innerHTML = ''
  for (let playerIndex = 0; playerIndex < data.players.length; playerIndex++) {
    const div = fragment.appendChild(document.createElement('div'))
    const nameDiv = div.appendChild(document.createElement('h3'))
    const player = data.players[playerIndex]
    nameDiv.textContent = player.name
    if (data.playing && !player.play || data.next === playerIndex) {
      nameDiv.classList.add('current')
      nameDiv.textContent += ' (*)'
    }
    if (!player.socketId)
      setDisconnected(nameDiv)
    if (Number.isInteger(data.next) && data.next !== playerIndex &&
        !spectateInput.checked && nameInput.value === data.players[data.next].name) {
      const pool = div.appendChild(document.createElement('p'))
      for (let cardIndex = 0; cardIndex < player.pool.length; cardIndex++) {
        const draw = pool.appendChild(document.createElement('input'))
        draw.type = 'button'
        draw.value = player.pool[cardIndex]
        draw.onclick = () => socket.emit('drawRequest', {playerIndex: playerIndex, cardIndex: cardIndex})
      }
    }
    else
      div.appendChild(document.createElement('p')).textContent = `Pool: ${player.pool.join('')}`
    if (spectateInput.checked || player.name === nameInput.value) {
      const hand = div.appendChild(document.createElement('p'))
      hand.textContent = `Hand: ${player.hand}`
      function addPlayPool(div, c) {
        const play = div.appendChild(document.createElement('input'))
        play.type = 'button'
        play.value = 'Play'
        play.onclick = () => socket.emit('playRequest', `p${c}`)
        if (player.play === `p${c}`) play.classList.add('selected')
        const pool = div.appendChild(document.createElement('input'))
        pool.type = 'button'
        pool.value = 'Pool'
        pool.onclick = () => socket.emit('playRequest', `d${c}`)
        if (player.play === `d${c}`) pool.classList.add('selected')
      }
      if (!spectateInput.checked && data.playing)
        addPlayPool(hand, 'h')
      if (player.drawn) {
        const drawn = div.appendChild(document.createElement('p'))
        drawn.textContent = `Drawn: ${player.drawn}`
        if (!spectateInput.checked && data.playing)
          addPlayPool(drawn, 'd')
      }
      if (data.next === playerIndex) {
        const draw = div.appendChild(document.createElement('input'))
        draw.type = 'button'
        draw.value = 'Deck'
        draw.onclick = () => socket.emit('drawRequest', {playerIndex: -1})
      }
    }
  }
  playersDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

function setDisconnected(nameDiv) {
  nameDiv.classList.add('disconnected')
  nameDiv.textContent += ' (d/c)'
}

socket.on('setDisconnected', playerIndex => {
  if (playerIndex < playersDiv.children.length)
    setDisconnected(playersDiv.children[playerIndex].firstElementChild)
})

const ordinal = n =>
  n === 0 ? '1st' :
  n === 1 ? '2nd' :
  n === 2 ? '3rd' : `${n+1}th`

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('plays' in entry)
    li.textContent =
      `${entry.player} ${entry.plays ? 'plays' : 'pools'} ${entry.fromHand ? 'their' : 'the'} '${entry.letter}' ${entry.fromHand ? 'from hand' : 'they drew'}.`
  else if ('played' in entry)
    li.textContent = `Target '${entry.played}' achieved!`
  else if ('fumbled' in entry)
    li.textContent = `Non-target '${entry.fumbled}' fumbled.`
  else
    li.textContent = `${entry.player} draws ${entry.other === null ? 'from the deck' : `${entry.other}'s ${ordinal(entry.index)} pooled letter '${entry.letter}'`}.`
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
