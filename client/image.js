/* global io */
var socket = io(ServerURI('image'), SocketOptions('image'))

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const joinButton = document.getElementById('join')
const spectateInput = document.getElementById('spectate')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const gamesList = document.getElementById('games')
const spectatorsList = document.getElementById('spectators')
const log = document.getElementById('log')
const targetDiv = document.getElementById('target')
const drawingDiv = document.getElementById('drawing')
const infoDiv = document.getElementById('info')
const playersDiv = document.getElementById('players')

const Characters =
  [' ','▘','▝','▀',

   '▗','▚','▐','▜',

   '▖','▌','▞','▛',

   '▄','▙','▟','█']

const Directions = ['↺','↻']
const RotationTargets = ['○','⊕','⬚','⟴']
const ReflectionTargets = ['□','⊞']
const Rotations = ['0','↻','π','↺']
const Reflections = ['—', '\\', '|', '/']

const CardChar = c =>
  c.t < 2 ? Characters[Math.pow(2, 2 * c.t + c.v)] :
  c.t < 3 ? Directions[c.v] :
  c.t < 4 ? RotationTargets[c.v] : ReflectionTargets[c.v]

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
  startButton.hidden = true
  startButton.disabled = false
  spectatorsList.innerHTML = ''
  log.innerHTML = ''
  log.hidden = true
  targetDiv.innerHTML = ''
  drawingDiv.innerHTML = ''
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

socket.on('updatePlayers', players => {
  playersDiv.innerHTML = ''
  if (!startButton.disabled)
    startButton.hidden = players.length < 2
  const currentIndex = players.findIndex(player => player.current)
  const isCurrent = 0 <= currentIndex && !spectateInput.checked && players[currentIndex].name === nameInput.value
  for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
    const player = players[playerIndex]
    const div = fragment.appendChild(document.createElement('div'))
    const name = div.appendChild(document.createElement('h3'))
    name.textContent = player.name
    name.undecoratedPlayerName = player.name
    if (!player.socketId) {
      name.classList.add('disconnected')
      name.textContent += ' (d/c)'
    }
    if (player.current) {
      name.classList.add('current')
      name.textContent += ' (*)'
    }
    if (player.hand) {
      const ol = div.appendChild(document.createElement('ol'))
      for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex++) {
        const card = player.hand[cardIndex]
        const li = ol.appendChild(document.createElement('li'))
        const button = li.appendChild(document.createElement('input'))
        button.type = 'button'
        button.value = CardChar(card)
        if (isCurrent && playerIndex === currentIndex)
          button.onclick = () => socket.emit('playRequest', cardIndex)
        else
          button.disabled = true
      }
      if (isCurrent && playerIndex !== currentIndex) {
        const button = ol.appendChild(document.createElement('li')).appendChild(document.createElement('input'))
        button.type = 'button'
        button.value = '⬇'
        button.onclick = () => socket.emit('drawRequest', playerIndex)
      }
    }
  }
  playersDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
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
  errorMsg.innerHTML = ''
})

socket.on('updateDrawing', data => {
  drawingDiv.innerHTML = ''
  for (let i = 0; i < data.drawing.length; i++) {
    const div = fragment.appendChild(document.createElement('div'))
    div.textContent = Characters[data.drawing[i]]
    if (i === data.cursor)
      div.classList.add('cursor')
  }
  fragment.insertBefore(fragment.lastElementChild, fragment.lastElementChild.previousElementSibling)
  drawingDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateTarget', target => {
  targetDiv.innerHTML = ''
  for (const c of target)
    fragment.appendChild(document.createElement('div')).textContent = Characters[c]
  fragment.insertBefore(fragment.lastElementChild, fragment.lastElementChild.previousElementSibling)
  targetDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateRemaining', data => {
  infoDiv.innerHTML = ''
  const div = fragment.appendChild(document.createElement('div'))
  div.appendChild(document.createElement('p')).textContent = `Moves: ${data.moves}`
  div.appendChild(document.createElement('p')).textContent = `{Rota, Reflec}tion: ${Rotations[data.rotation]}, ${Reflections[data.rotation]}`
  div.appendChild(document.createElement('p')).textContent = `Score: ${data.scored.length}`
  // TODO: click to show individual scored drawings
  const current = !spectateInput.checked && 0 <= data.currentIndex && nameInput.value === playerName(data.currentIndex)
  const ul = fragment.appendChild(document.createElement('div')).appendChild(document.createElement('ul'))
  ul.classList.add('inline')
  for (let cardIndex = 0; cardIndex < data.deck.length; cardIndex++) {
    if (current) {
      const button = ul.appendChild(document.createElement('li')).appendChild(document.createElement('input'))
      button.type = 'button'
      button.value = '⬅'
      button.onclick = () => socket.emit('shiftRequest', cardIndex)
    }
    const li = ul.appendChild(document.createElement('li'))
    li.textContent = CardChar(data.deck[cardIndex])
  }
  infoDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

const playerName = playerIndex =>
  playersDiv.children[playerIndex].firstElementChild.undecoratedPlayerName

const ordinal = n =>
  n === 0 ? '1st' :
  n === 1 ? '2nd' :
  n === 2 ? '3rd' : `${n+1}th`

const plural = (n, s) =>
  n === 1 ? `1 ${s}` : `${n} ${s}s`

socket.on('appendLog', entry => {
  const li = log.appendChild(document.createElement('li'))
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('playerName' in entry) {
    if ('targetName' in entry)
      li.textContent = `${entry.playerName} adds card ${CardChar(entry.card)} to ${entry.targetName}'s hand.`
    else if ('cardIndex' in entry) {
      fragment.appendChild(document.createElement('li')).textContent =
        `${entry.playerName} plays their ${ordinal(entry.cardIndex)} card, ${CardChar(entry.card)}.`
      const li2 = fragment.appendChild(document.createElement('li'))
      if ('character' in entry)
        li2.textContent =
          `Result: '${Characters[entry.oldChar]}' ⊕ '${Characters[entry.character]}' = '${Characters[entry.newChar]}'.`
      else if ('direction' in entry)
        li2.textContent =
          `{Rota, Reflec}tion ${entry.direction < 0 ? 'decreases' : 'increases'} ` +
          `from ${Rotations[entry.oldRotation]}, ${Reflections[entry.oldRotation]} ` +
          `to ${Rotations[entry.newRotation]}, ${Reflections[entry.newRotation]}.`
      else if ('oldChar' in entry)
        li2.textContent =
          `Character '${Characters[entry.oldChar]}' ` +
          ('reflection' in entry ? `reflects by ${Reflections[entry.reflection]}`
                                 : `rotates by ${Rotations[entry.rotation]}`) +
          ` to '${Characters[entry.newChar]}'.`
      else if ('oldCursor' in entry)
        li2.textContent =
          `Cursor moves from ${entry.oldCursor} by ${Rotations[entry.rotation]} to ${entry.newCursor}.`
      else if ('targetCursor' in entry)
        li2.textContent =
          `At ${entry.targetCursor} (cursor + ${Rotations[entry.rotation]}), '${Characters[entry.targetChar]}' ⊕ '${Characters[entry.sourceChar]}' = '${Characters[entry.newChar]}'.`
      else
        li2.textContent =
          `The drawing ` +
          ('reflection' in entry ? `reflects by ${Reflections[entry.reflection]}.`
                                 : `rotates by ${Rotations[entry.rotation]}.`)
      li.appendChild(document.createElement('ul')).appendChild(fragment)
    }
    else
      li.textContent = `${entry.playerName} shifts card ${CardChar(entry.card)} left.`
  }
  else {
    li.textContent = 'TODO: log'
  }
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
