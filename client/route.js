/* global io */
var socket = io(ServerURI('route'), SocketOptions('route'))

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
const boardDiv = document.getElementById('board')
const infoDiv = document.getElementById('info')
const playersDiv = document.getElementById('players')

const fragment = document.createDocumentFragment()

const CardChar = [
  ' ', '╡', '╞', '═',
  '╨', '╝', '╚', '╩',
  '╥', '╗', '╔', '╦',
  '║', '╣', '╠', '╬'
]
const ClueChar = ['←','→','↑','↓']
const Rows = 5
const Columns = 13

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
  boardDiv.innerHTML = ''
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
  boardDiv.style.gridTemplateColumns = `repeat(${Columns}, 1fr)`
  unseated.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', data => {
  const currentIndex = data.players.findIndex(player => player.name === nameInput.value)
  const current = !spectateInput.checked && data.players[currentIndex].current
  boardDiv.innerHTML = ''
  function cardLight() {
    log.querySelectorAll('li.selected').forEach(li => li.classList.remove('selected'))
    boardDiv.parentElement.querySelectorAll('.cardLight').forEach(el =>
      el.classList.remove('cardLight'))
    if (boardDiv.cardLight === this.textContent)
      delete boardDiv.cardLight
    else {
      boardDiv.cardLight = this.textContent
      boardDiv.parentElement.querySelectorAll('.clickable').forEach(el => {
        if (el.textContent === this.textContent)
          el.classList.add('cardLight')
      })
    }
  }
  for (let i = 0; i < data.board.length; i++) {
    const div = fragment.appendChild(document.createElement('div'))
    const cell = data.board[i]
    if (cell.d !== undefined) {
      div.textContent = CardChar[cell.d]
      if (cell.d) {
        div.classList.add('clickable')
        div.onclick = cardLight
      }
    }
    else if (current) {
      const col = i % Columns
      const row = (i - col) / Columns
      if (0 < col && (2 & data.board[i-1].d) ||
          col+1 < Columns && (1 & data.board[i+1].d) ||
          0 < row && (8 & data.board[i-Columns].d) ||
          row+1 < Rows && (4 & data.board[i+Columns].d)) {
        div.classList.add('playable')
        div.boardIndex = i
      }
    }
    if (cell.d === 0)
      div.classList.add('wall')
    if (cell.s)
      div.classList.add('sealed')
    if (cell.t)
      div.classList.add('treasure')
  }
  boardDiv.appendChild(fragment)

  infoDiv.innerHTML = ''
  const div = fragment.appendChild(document.createElement('div'))
  div.appendChild(document.createElement('p')).textContent = `Cards: ${data.cards}`
  div.appendChild(document.createElement('p')).textContent = `Clues: ${data.clues}`
  div.appendChild(document.createElement('p')).textContent = `Lives: ${data.lives}`
  if (data.discard.length) {
    const div = fragment.appendChild(document.createElement('div'))
    const p = div.appendChild(document.createElement('p'))
    p.textContent = `Discards: `
    const ul = p.appendChild(document.createElement('ul'))
    ul.classList.add('inline')
    for (const c of data.discard) {
      const li = ul.appendChild(document.createElement('li'))
      li.textContent = CardChar[c.d]
      if (c.f) li.classList.add('fumbled')
      li.classList.add('clickable')
      li.onclick = cardLight
    }
  }
  infoDiv.appendChild(fragment)

  playersDiv.innerHTML = ''
  function cluesList(clue) {
    const ul = document.createElement('ul')
    ul.classList.add('clues')
    for (let i = 0; i < clue.length; i++) {
      const c = clue[i]
      const li = ul.appendChild(document.createElement('li'))
      if (typeof(c) === 'boolean') {
        li.textContent = ClueChar[i]
        li.classList.add(`${c ? 'pos' : 'neg'}Clue`)
      }
      else
        li.textContent = '-'
    }
    return ul
  }
  for (let playerIndex = 0; playerIndex < data.players.length; playerIndex++) {
    const player = data.players[playerIndex]
    const div = fragment.appendChild(document.createElement('div'))
    const h3 = div.appendChild(document.createElement('h3'))
    h3.textContent = player.name
    if (player.current) {
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
      if (playerIndex === currentIndex && current) {
        const ul = li.appendChild(cluesList(card.c))
        const dropButton = li.appendChild(document.createElement('input'))
        dropButton.type = 'button'
        dropButton.value = '✗'
        dropButton.onclick = () => socket.emit('playRequest', {index: cardIndex, drop: true})
        ul.classList.add('clickable')
        ul.onclick = () => {
          ol.querySelectorAll('ul.selected').forEach(ul => ul.classList.remove('selected'))
          boardDiv.querySelectorAll('div.playable').forEach(div => div.replaceChildren())
          if (ol.cardIndex === cardIndex) delete ol.cardIndex
          else {
            ul.classList.add('selected')
            ol.cardIndex = cardIndex
            boardDiv.querySelectorAll('div.playable').forEach(div => {
              const playButton = div.appendChild(document.createElement('input'))
              playButton.type = 'button'
              playButton.onclick = () => socket.emit('playRequest', {index: cardIndex, target: div.boardIndex})
            })
          }
        }
      }
      else {
        if (playerIndex !== currentIndex || data.players.every(player => !player.current)) {
          li.appendChild(document.createElement('span')).textContent = CardChar[card.d]
          li.firstElementChild.classList.add('clickable')
          li.firstElementChild.onclick = cardLight
          li.appendChild(document.createElement('span')).textContent = ' ['
          li.appendChild(cluesList(card.c))
          li.appendChild(document.createElement('span')).textContent = ']'
        }
        else
          li.appendChild(cluesList(card.c))
      }
    }
    if (current && playerIndex !== currentIndex && data.clues) {
      const clueButtons = div.appendChild(document.createElement('div'))
      clueButtons.appendChild(document.createElement('span')).textContent = CardChar[15]
      clueButtons.appendChild(document.createElement('span')).textContent = ' ['
      for (let direction = 0; direction < 4; direction++) {
        const clueButton = clueButtons.appendChild(document.createElement('input'))
        clueButton.type = 'button'
        clueButton.value = ClueChar[direction]
        clueButton.onclick = () =>
          socket.emit('clueRequest', {index: playerIndex, direction: direction})
      }
    }
  }
  playersDiv.appendChild(fragment)
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

const plural = (n, s) =>
  n === 1 ? `a ${s}` : `${n} ${s}s`

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('verb' in entry) {
    li.textContent = `${entry.player} ${entry.verb} their ${ordinal(entry.index)} card ${CardChar[entry.card]}`
    if (entry.gain) {
      li.textContent += ', gaining a clue'
      if (entry.seals) li.textContent += ` and sealing ${plural(entry.seals, 'treasure')}`
    }
    else if (entry.seals)
      li.textContent += `, sealing ${plural(entry.seals, 'treasure')}`
    li.textContent += '.'
    if ('target' in entry) {
      li.classList.add('clickable')
      li.onclick = () => {
        boardDiv.parentElement.querySelectorAll('.cardLight').forEach(el =>
          el.classList.remove('cardLight'))
        delete boardDiv.cardLight
        const selected = li.classList.contains('selected')
        log.querySelectorAll('li.selected').forEach(li => li.classList.remove('selected'))
        if (!selected) {
          li.classList.add('selected')
          boardDiv.children[entry.target].classList.add('cardLight')
        }
      }
    }
  }
  else if ('other' in entry) {
    li.textContent = `${entry.player} clues ${entry.other} about ${ClueChar[entry.direction]}.`
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
