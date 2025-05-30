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
const previewDiv = document.getElementById('preview')
const bagDiv = document.getElementById('bag')
const bagLabel = bagDiv.firstElementChild
const bagList = bagLabel.nextElementSibling
const playArea = document.getElementById('playArea')
const boardDiv = document.getElementById('board')
const shuffleButton = document.getElementById('shuffle')
const rackList = document.getElementById('rack')
const playButton = document.getElementById('play')
const swapInput = document.getElementById('swap')
const blankDiv = document.getElementById('blank')
const checkerForm = document.getElementById('checker')

const alphabet = 'abcdefghijklmnopqrstuvwxyz'
const boardSize = 15

{
  const onBlankClick = (e) => {
    const selected = document.querySelector('.selected')
    selected.querySelector('.letter').textContent = e.currentTarget.value
    blankDiv.hidden = true
    shuffleButton.disabled = false
    resetPlayButton()
    if (selected.classList.contains('cell'))
      selected.classList.remove('selected')
  }

  const blankButtons = []
  for (const c of `${alphabet} `) {
    const input = document.createElement('input')
    input.type = 'button'
    input.value = c
    input.addEventListener('click', onBlankClick, {passive: true})
    blankButtons.push(input)
  }
  const input = document.createElement('input')
  input.type = 'button'
  input.value = '⮌'
  input.addEventListener('click', (e) => {
    blankDiv.hidden = true
    document.querySelector('.selected').classList.remove('selected')
    shuffleButton.disabled = false
    resetPlayButton()
    if (!swapInput.checked && isCurrent)
      socket.emit('preview', constructMoves())
  })
  blankButtons.push(input)
  blankDiv.append(...blankButtons)
}

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
  swapInput.checked = false
  playButton.value = 'Play'
  blankDiv.hidden = true
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

const onChangeJoining = (e) => {
  document.querySelectorAll('.joining').forEach((x) => x.classList.remove('joining'))
  const a = Array.from(document.querySelectorAll('#games > li > a')).find(
    (a) => a.textContent === gameInput.value)
  if (a) {
    const p = Array.from(a.parentElement.querySelectorAll('a.disconnected')).find(
      (a) => a.textContent === nameInput.value)
    if (p) p.classList.add('joining')
  }
}

gameInput.addEventListener('change', onChangeJoining)
nameInput.addEventListener('change', onChangeJoining)

socket.on('updateGames', games => {
  gamesList.innerHTML = ''
  for (const game of games) {
    const li = fragment.appendChild(document.createElement('li'))
    let a = li.appendChild(document.createElement('a'))
    a.textContent = game.name
    a.onclick = () => {
      gameInput.value = gameInput.value === game.name ? '' : game.name
      gameInput.dispatchEvent(new Event('change'))
    }
    const ul = li.appendChild(document.createElement('ul'))
    ul.classList.add('inline')
    for (const player of game.players) {
      a = ul.appendChild(document.createElement('li'))
      if (!player.socketId) {
        a = a.appendChild(document.createElement('a'))
        a.classList.add('disconnected')
        a.onclick = () => {
          if (gameInput.value === game.name && nameInput.value === player.name) {
            nameInput.value = ''
            nameInput.dispatchEvent(new Event('change'))
          }
          else {
            gameInput.value = game.name
            nameInput.value = player.name
            nameInput.dispatchEvent(new Event('change'))
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

const coordsOfCell = (x) => {
  const [,is,js] = x.id.split('-')
  return [is, js].map(Number)
}

const constructMoves = () => {
  const moves = []
  if (swapInput.checked) {
    for (const tile of document.querySelectorAll('.selected')) {
      moves.push([tile.querySelector('.letter').textContent, null])
    }
  }
  else {
    for (const placed of document.querySelectorAll('.placed')) {
      const ls = placed.querySelector('.letter')
      const l = `${ls.parentElement.classList.contains('blank') ? ' ' : ''}${ls.textContent}`
      const ij = coordsOfCell(placed)
      moves.push([l, ij])
    }
  }
  return moves
}

const removeCursors = () => {
  document.querySelectorAll('.cursor-right, .cursor-down').forEach(
    (x) => x.classList.remove('cursor-right', 'cursor-down'))
}

const onClickTile = (e) => {
  if (!blankDiv.hidden) return
  const tile = e.currentTarget
  if (tile.classList.contains('selected')) {
    if (!swapInput.checked && tile.firstElementChild.classList.contains('blank')) {
      playButton.disabled = true
      shuffleButton.disabled = true
      blankDiv.hidden = false
      return
    }
    tile.classList.remove('selected')
    if (swapInput.checked && !document.querySelector('.selected'))
      playButton.value = 'Pass'
    return
  }
  const onBoard = tile.classList.contains('cell')
  if (swapInput.checked) {
    if (!onBoard) {
      tile.classList.add('selected')
      playButton.value = 'Swap'
    }
    return
  }
  const selected = document.querySelector('.selected')
  let moved = false
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
          moved = true
          removeSelected(selected)
        }
      }
      else {
        // tile is an empty board cell: put selected here
        const span = selected.firstElementChild
        tile.appendChild(span)
        tile.classList.add('placed')
        moved = true
        removeSelected(selected)
      }
    }
    else {
      // tile is a rack tile:
      // move selected and insert it on tile's left/right
      moved = selected.classList.contains('cell')
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
    removeCursors()
    tile.classList.add('selected')
  }
  else if (onBoard && !tile.firstElementChild) {
    // empty board tile, could be for typing
    if (tile.classList.contains('cursor-right')) {
      tile.classList.remove('cursor-right')
      tile.classList.add('cursor-down')
    }
    else if (tile.classList.contains('cursor-down')) {
      tile.classList.remove('cursor-down')
    }
    else {
      removeCursors()
      tile.classList.add('cursor-right')
    }
  }
  if (moved && isCurrent) socket.emit('preview', constructMoves())
}

document.addEventListener('keyup', (e) => {
  if (document.querySelector('.selected')) return
  if (swapInput.checked) return
  const tile = document.querySelector('.cursor-right, .cursor-down')
  const l = e.key.toLowerCase()
  if (tile) {
    const d = tile.classList.contains('cursor-down')
    if (l === 'backspace') {
      let [i, j] = coordsOfCell(tile)
      if (d) { i-- } else { j-- }
      while (true) {
        const cell = document.getElementById(`c-${i}-${j}`)
        if (cell && cell.firstElementChild && !cell.classList.contains('placed')) {
          if (d) { i-- } else { j-- }
        }
        else break
      }
      const cell = document.getElementById(`c-${i}-${j}`)
      if (cell && cell.classList.contains('placed')) {
        const li = rackList.lastElementChild
        if (li) {
          cell.dispatchEvent(new Event('click'))
          li.dispatchEvent(new Event('click'))
          tile.classList.remove('cursor-right', 'cursor-down')
          cell.classList.add(d ? 'cursor-down' : 'cursor-right')
        }
      }
      else {
        tile.classList.remove('cursor-right', 'cursor-down')
      }
    }
    else if (alphabet.includes(l)) {
      const rackLetters = Array.from(document.querySelectorAll('#rack .letter')).filter(
        (x) => x.textContent === l || x.parentNode.classList.contains('blank'))
      const rackLetter = rackLetters?.find((x) => !x.parentNode.classList.contains('blank')) ||
                         rackLetters?.at(0)
      if (rackLetter) {
        const rackLi = rackLetter.parentElement.parentElement
        rackLi.dispatchEvent(new Event('click'))
        tile.dispatchEvent(new Event('click'))
        if (tile.querySelector('.letter').textContent !== l) {
          tile.dispatchEvent(new Event('click'))
          tile.dispatchEvent(new Event('click'))
          Array.from(document.querySelectorAll('#blank > input')).find(
            (x) => x.value === l).dispatchEvent(new Event('click'))
        }
        let [i, j] = coordsOfCell(tile)
        while (i < boardSize && j < boardSize &&
               document.getElementById(`c-${i}-${j}`).firstElementChild) {
          if (d) { i++ } else { j++ }
        }
        tile.classList.remove('cursor-right', 'cursor-down')
        if (i < boardSize && j < boardSize) {
          document.getElementById(`c-${i}-${j}`).classList.add(
            d ? 'cursor-down' : 'cursor-right')
        }
      }
    }
  }
}, {passive: true})

const pointsPerLetter = {}
socket.emit('pointsPerLetter')
socket.on('pointsPerLetter', (x) =>
  Object.assign(pointsPerLetter, x)
)

const fillLetterSpan = (span, l) => {
  const ls = document.createElement('span')
  ls.classList.add('letter')
  ls.textContent = l
  if (l === ' ') span.classList.add('blank')
  const ps = document.createElement('span')
  ps.classList.add('points')
  ps.textContent = span.classList.contains('blank') ? 0 : pointsPerLetter[l]
  span.append(ls, ps)
}

let isCurrent = false

const swapAllowed = () => (isCurrent && swapInput.checked)
const resetPlayButton = () => {
  playButton.disabled = !swapAllowed()
  playButton.value = swapInput.checked ?
    (document.querySelector('.selected') ? 'Swap' : 'Pass')
    : 'Play'
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
  document.querySelectorAll('.selected').forEach(
    (t) => t.classList.remove('selected'))
  previewDiv.innerHTML = ''
  resetPlayButton()
  const shuffled = Array.from(rackList.children)
  shuffleInPlace(shuffled)
  rackList.replaceChildren(...shuffled)
}, {passive: true})

socket.on('updatePlayers', ({players, updateRacks}) => {
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
    const thisPlayer = (player.name === nameInput.value)
    if (player.current)
      span.classList.add('current')
    if (thisPlayer)
      isCurrent = player.current
    playersList.appendChild(li)
    if ((updateRacks === true || updateRacks === nameInput.value) && player.rack) {
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
  nameInput.dispatchEvent(new Event('change'))
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
        if (tile.blank) span.classList.add('blank')
        if (tile.last) span.classList.add('last')
        fillLetterSpan(span, tile.l)
        cellDiv.appendChild(span)
      }
    }
  }
  boardDiv.appendChild(fragment)
})

socket.on('updateBag', baglen => {
  bagList.innerHTML = ''
  bagLabel.innerHTML = `${baglen} tile${baglen === 1 ? '' : 's'} left`
})

const createPlayList = (words) => {
  const ul = document.createElement('ul')
  let total = 0
  for (const {w, s, other, rack} of words) {
    const li = document.createElement('li')
    total += s
    const sp = `${s} point${s === 1 ? '' : 's'}`
    li.textContent =
      Array.isArray(w) ?
      `${w.join('')} for ${sp}` :
      (Array.isArray(rack) ?
        `the last tile, getting ${s} from ${other}'s rack ${rack.join('')}` :
        `their whole rack for ${s} bonus points`)
    ul.appendChild(li)
  }
  return {ul, total}
}

socket.on('preview', (words) => {
  previewDiv.innerHTML = ''
  if (Array.isArray(words)) {
    const span = document.createElement('span')
    const {ul, total} = createPlayList(words)
    span.textContent = `Would score ${total} playing:`
    previewDiv.append(span, ul)
    playButton.disabled = false
  }
  else playButton.disabled = true
})

playButton.addEventListener('click', (e) =>
  socket.emit('play', constructMoves()),
{passive: true})

swapInput.addEventListener('change', (e) => {
  if (swapInput.checked)
    document.querySelectorAll('.placed').forEach(removeFromBoard)
  else
    document.querySelectorAll('.selected').forEach(
      (t) => t.classList.remove('selected'))
  resetPlayButton()
}, {passive: true})

socket.on('showLastPlay', (data) => {
  lastPlayDiv.innerHTML = ''
  const {name, words} = data || {}
  if (typeof words === 'string')
    lastPlayDiv.textContent = `${name} ${words}`
  else if (Array.isArray(words)) {
    const span = document.createElement('span')
    const {ul, total} = createPlayList(words)
    span.textContent = `${name} scored ${total}, playing:`
    lastPlayDiv.append(span, ul)
  }
  previewDiv.innerHTML = ''
  resetPlayButton()
})

const checkWord = checkerForm.querySelector('input[type=text]')
const checkOutput = checkerForm.querySelector('span')
checkerForm.onsubmit = () => {
  socket.emit('check', checkWord.value)
  return false
}
socket.on('checked', ({word, valid}) => {
  checkOutput.textContent = word ? `${word} is ${valid ? ' ' : 'NOT '}VALID` : ''
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
