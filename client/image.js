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

/*
const Characters =
  [' ','╴','╶','─',
   '╵','┘','└','┴',
   '╷','┐','┌','┬',
   '│','┤','├','┼',]
*/
const Characters =
  [' ','▘','▗','▚',

   '▝','▀','▐','▜',

   '▖','▌','▄','▙',

   '▞','▛','▟','█']

const Directions = ['↺','↻']
const Referents = ['□','⊞','⬚']

const CardChar = c =>
  c.t < 2 ? Characters[Math.pow(2, 2 * c.t + c.v)] :
  c.t < 3 ? Directions[c.v] : Referents[c.v]

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
  const playing = startButton.disabled && players.some(player => player.hand)
  const thisPlayer = players.find(player => player.name === nameInput.value)
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
    if (player.hand) {
      if (!player.move) {
        name.classList.add('current')
        name.textContent += ' (*)'
      }
      const ol = div.appendChild(document.createElement('ol'))
      for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex++) {
        const card = player.hand[cardIndex]
        const li = ol.appendChild(document.createElement('li'))
        if (!spectateInput.checked && thisPlayer && thisPlayer.move &&
            thisPlayer.move.player === playerIndex &&
            thisPlayer.move.card === cardIndex)
          li.classList.add('selected')
        if (!spectateInput.checked && playing) {
          const hidden = player.name === nameInput.value && !card.r
          const cardText = hidden ? ' ' : CardChar(card)
          const button = li.appendChild(document.createElement('input'))
          button.type = 'button'
          button.value = cardText
          // TODO: indicate whether the card is revealed to its holder
          button.onclick = () =>
            socket.emit('moveRequest', {player: playerIndex, card: cardIndex})
        }
        else {
          li.appendChild(document.createElement('span')).textContent = CardChar(card)
          // TODO: indicate whether the card is revealed to its holder
        }
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
  fragment.appendChild(document.createElement('p')).textContent = `Cards: ${data.cards}`
  fragment.appendChild(document.createElement('p')).textContent = `Clues: ${data.clues}`
  fragment.appendChild(document.createElement('p')).textContent = `Score: ${data.scored.length}`
  // TODO: click to show individual scored drawings
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
  else if ('cluesRevealed' in entry) {
    for (const clue of entry.cluesRevealed) {
      fragment.appendChild(document.createElement('li')).textContent =
        `${playerName(clue.mover)} clues ${playerName(clue.player)} about their ${ordinal(clue.card)} card: '${CardChar(clue.revealedCard)}'.`
    }
    li.appendChild(document.createElement('ul')).appendChild(fragment)
  }
  else if ('cluesDiscarded' in entry) {
    // TODO: say what clues were attempted
    li.textContent = 'Not enough clue tokens for clues.'
  }
  else if ('playsPlayed' in entry) {
    for (const play of entry.playsPlayed) {
      fragment.appendChild(document.createElement('li')).textContent =
        `${playerName(play.mover)} plays their ${ordinal(play.card)} card: '${CardChar(play.playedCard)}'.`
    }
    li.appendChild(document.createElement('ul')).appendChild(fragment)
  }
  else if ('playsDiscarded' in entry) {
    // TODO: say what plays were attempted
    li.textContent = 'Not enough cards left in the deck to play.'
  }
  else if ('characters' in entry) {
    entry.characters.push(entry.oldChar)
    li.textContent = `Characters combine: ${entry.characters.map(c => `'${Characters[c]}'`).join(' + ')}`
    li.textContent += ` = '${Characters[entry.newChar]}'.`
  }
  else if ('directions' in entry) {
    li.textContent = `Directions combine: ${entry.directions.map(b => Directions[b]).join(' + ')}`
    li.textContent += ` = ${Math.abs(entry.vector)}×${Directions[Number(entry.vector > 0)]}.`
  }
  else if ('referents' in entry) {
    li.textContent = `Referents combine: ${entry.referents.map(b => Referents[b]).join(' + ')}`
    let comboStr = ''
    for (let i = 0; i < Referents.length; i++)
      if (entry.combo & (1 << i))
        comboStr += Referents[i]
    li.textContent += ` = ${entry.combo ? comboStr : 'none'}.`
  }
  else if ('newlyCorrect' in entry) {
    li.textContent = `${plural(entry.newlyCorrect,'character')} became correct,`
    li.textContent += ` producing ${plural(entry.newClues,'clue')}.`
  }
  else if ('characterRotate' in entry) {
    li.textContent = `Character '${Characters[entry.characterRotate]}' rotates to '${Characters[entry.newChar]}'.`
  }
  else if ('drawingRotate' in entry) {
    li.textContent = `The drawing rotates by ${entry.drawingRotate}.`
  }
  else if ('cursorRotate' in entry) {
    li.textContent = `The cursor rotates from ${entry.cursorRotate} to ${entry.newCursor}.`
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
