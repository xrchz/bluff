/* global io */
var socket = io(ServerURI('cross'), SocketOptions('cross'))

const fragment = document.createDocumentFragment()

const errorMsg = document.getElementById('errorMsg')
const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const joinButton = document.getElementById('join')
const spectateInput = document.getElementById('spectate')
const spectatorsList = document.getElementById('spectators')
const playersList = document.getElementById('players')
const gamesList = document.getElementById('games')
const startButton = document.getElementById('start')
const lastPlayDiv = document.getElementById('lastPlay')
const bagDiv = document.getElementById('bag')
const bagLabel = bagDiv.firstElementChild
const bagList = bagLabel.nextElementSibling
const playArea = document.getElementById('playArea')
const boardDiv = document.getElementById('board')
const shuffleButton = document.getElementById('shuffle')
const rackList = document.getElementById('rack')
const playButton = document.getElementById('play')

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.previousElementSibling.hidden = false
  spectateInput.disabled = false
  startButton.hidden = true
  spectatorsList.innerHTML = ''
  playersList.innerHTML = ''
  playArea.hidden = true
  boardDiv.innerHTML = ''
  rackList.innerHTML = ''
  bagDiv.hidden = true
  bagList.innerHTML = ''
  bagLabel.innerHTML = ''
  lastPlayDiv.innerHTML = ''
  playButton.disabled = true
  history.replaceState('lobby', 'Lobby')
})

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
  if (spectators.length) {
    spectators.unshift({ name: 'Spectators:' })
  }
  for (spectator of spectators) {
    const elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsList.appendChild(elem)
  }
})

const createRackLi = () => {
  const li = document.createElement('li')
  li.addEventListener('click', onClickTile, {passive: true})
  return li
}

const removeSelected = (selected) => {
  selected.classList.remove('selected')
  if (selected.classList.contains('cell'))
    selected.classList.remove('placed')
  else selected.remove()
}

const removeFromBoard = (tile) => {
  const li = createRackLi()
  li.appendChild(tile.firstElementChild)
  tile.classList.remove('placed')
  rackList.appendChild(li)
}

const onClickTile = (e) => {
  const tile = e.currentTarget
  if (tile.classList.contains('selected')) {
    tile.classList.remove('selected')
    return
  }
  const onBoard = tile.classList.contains('cell')
  const selected = document.querySelector('.selected')
  if (selected) {
    if (onBoard) {
      if (tile.firstElementChild) {
        // tile is a board cell with a tile
        if (tile.classList.contains('placed')) {
          // cell's tile is newly-placed:
          // remove tile from board and replace on rack (or a nearby empty cell?)
          removeFromBoard(tile)
          // then move selected to tile's former cell
          tile.appendChild(selected.firstElementChild)
          tile.classList.add('placed')
          removeSelected(selected)
        }
      }
      else {
        // tile is an empty board cell: put selected here
        const span = selected.firstElementChild
        // TODO: handle blank letter selection and class add
        tile.appendChild(span)
        tile.classList.add('placed')
        removeSelected(selected)
      }
    }
    else {
      // tile is a rack tile:
      // move selected and insert it on tile's left/right
      const rackItems = Array.from(rackList.children)
      const ti = rackItems.indexOf(tile)
      const si = rackItems.indexOf(selected)
      const pos = ti < si ? 'beforebegin' : 'afterend'
      const li = createRackLi()
      li.appendChild(selected.firstElementChild)
      tile.insertAdjacentElement(pos, li)
      removeSelected(selected)
    }
  }
  else if (!onBoard || tile.classList.contains('placed')) {
    tile.classList.add('selected')
  }
}

const pointsPerLetter = {}
socket.emit('pointsPerLetter')
socket.on('pointsPerLetter', (x) =>
  Object.assign(pointsPerLetter, x)
)

const fillLetterSpan = (span, l) => {
  span.classList.add('letter')
  const ls = document.createElement('span')
  ls.textContent = l
  const ps = document.createElement('span')
  ps.classList.add('points')
  ps.textContent = pointsPerLetter[l]
  span.append(ls, ps)
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const t = array[i]
    array[i] = array[j]
    array[j] = t
  }
}

shuffleButton.addEventListener('click', (e) => {
  document.querySelectorAll('.placed').forEach(removeFromBoard)
  const shuffled = Array.from(rackList.children)
  shuffleInPlace(shuffled)
  rackList.replaceChildren(...shuffled)
}, {passive: true})

socket.on('updatePlayers', players => {
  playersList.innerHTML = ''
  for (player of players) {
    const li = document.createElement('li')
    const span = document.createElement('span')
    span.textContent = player.name
    li.appendChild(span)
    if (typeof player.score === 'number') {
      const span = document.createElement('span')
      span.textContent = player.score.toString()
      span.classList.add('score')
      li.appendChild(span)
    }
    if (!player.socketId)
      span.classList.add('disconnected')
    if (player.current)
      span.classList.add('current')
    playersList.appendChild(li)
    if (player.rack) {
      const thisPlayer = (player.name === nameInput.value)
      if (thisPlayer || spectateInput.checked) {
        rackList.innerHTML = ''
        for (const l of player.rack) {
          const li = createRackLi()
          const span = document.createElement('span')
          fillLetterSpan(span, l)
          li.appendChild(span)
          rackList.appendChild(li)
        }
      }
    }
  }
  errorMsg.innerHTML = ''
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

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

startButton.onclick = () => socket.emit('startGame')

socket.on('showStart', show => {
  if (!spectateInput.checked)
    startButton.hidden = !show
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  joinButton.hidden = true
  playArea.hidden = false
  bagDiv.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', board => {
  boardDiv.innerHTML = ''
  for (let i = 0; i < board.length; i++) {
    const row = board[i]
    for (let j = 0; j < row.length; j++) {
      const tile = row[j]
      const cellDiv = fragment.appendChild(document.createElement('div'))
      cellDiv.id = `c-${i}-${j}`
      cellDiv.classList.add('cell')
      cellDiv.addEventListener('click', onClickTile, {passive: true})
      if (tile.dl) cellDiv.classList.add('dl')
      if (tile.tl) cellDiv.classList.add('tl')
      if (tile.dw) cellDiv.classList.add('dw')
      if (tile.tw) cellDiv.classList.add('tw')
      if (tile.l) {
        const span = document.createElement('span')
        fillLetterSpan(span, tile.l)
        if (tile.blank) span.classList.add('blank')
        if (tile.last) span.classList.add('last')
        cellDiv.appendChild(span)
      }
    }
  }
  boardDiv.appendChild(fragment)
})

socket.on('updateBag', baglen => {
  bagList.innerHTML = ''
  bagLabel.innerHTML = `${baglen} tile${bag.length === 1 ? '' : 's'} left`
})

socket.on('showLastPlay', (data) => {
  lastPlayDiv.innerHTML = ''
  const {name, words} = data || {}
  if (typeof words === 'string')
    lastPlayDiv.textContent = `${name} ${words}`
  else if (Array.isArray(words)) {
    const span = document.createElement('span')
    const ul = document.createElement('ul')
    let total = 0
    for (const {w, s} of words) {
      const li = document.createElement('li')
      total += s
      li.textContent = `${w.join('')} for ${s} point${s === 1 ? '' : 's'}`
      ul.appendChild(li)
    }
    span.textContent = `${name} scored ${total}, playing:`
    lastPlayDiv.append(span, ul)
  }
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
