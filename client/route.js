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
  null, null, null, '═',
  null, '╝',  '╚',  '╩',
  null, '╗',  '╔',  '╦',
  '║',  '╣',  '╠',  '╬'
]
const ClueChar = ['╡', '╞', '╨', '╥']
const Rows = 7
const Columns = 9

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
  unseated.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', data => {
  const currentIndex = data.players.findIndex(player => player.name === nameInput.value)
  const current = !spectateInput.checked && data.players[currentIndex].current
  boardDiv.innerHTML = ''
  for (let i = 0; i < data.board.length; i++) {
    const div = fragment.appendChild(document.createElement('div'))
    const cell = data.board[i]
    if (cell.d !== undefined)
      div.textContent = CardChar[cell.d]
    else if (current) {
      const col = i % Columns
      const row = (i - col) / Columns
      if (0 < col && data.board[i-1].d !== undefined ||
          col+1 < Columns && data.board[i+1].d !== undefined ||
          0 < row && data.board[i-Columns].d !== undefined ||
          row+1 < Rows && data.board[i+Columns].d !== undefined) {
        div.classList.add('playable')
        div.boardIndex = i
      }
    }
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
      if (playerIndex === currentIndex) {
        if (current) {
          const ul = li.appendChild(cluesList(card.c))
          const dropButton = li.appendChild(document.createElement('input'))
          dropButton.type = 'button'
          dropButton.value = 'Drop'
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
        else
          li.appendChild(cluesList(card.c))
      }
      else {
        li.appendChild(document.createElement('span')).textContent = CardChar[card.d]
        li.appendChild(document.createElement('span')).textContent = ' ('
        li.appendChild(cluesList(card.c))
        li.appendChild(document.createElement('span')).textContent = ')'
      }
    }
    if (current && playerIndex !== currentIndex) {
      for (let direction = 0; direction < 4; direction++) {
        const clueButton = div.appendChild(document.createElement('input'))
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

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else if ('verb' in entry) {
    li.textContent = `${entry.player} ${entry.verb} their ${ordinal(entry.index)} card ${CardChar[entry.card]}${entry.gain ? ', gaining a clue.' : '.'}`
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
