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
const playArea = document.getElementById('playArea')
const boardDiv = document.getElementById('board')
const rackList = document.getElementById('rack')

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
  bagDiv.innerHTML = ''
  lastPlayDiv.innerHTML = ''
  history.replaceState('lobby', 'Lobby')
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
    console.log(`For ${player.name} got rack ${player.rack}`)
    if (player.rack) {
      console.log(`${player.name} Rack is true`)
      const thisPlayer = (player.name === nameInput.value)
      console.log(`${player.name} thisPlayer is ${thisPlayer}`)
      if (thisPlayer || spectateInput.checked) {
        rackList.innerHTML = ''
        for (const l of player.rack) {
          const li = document.createElement('li')
          const span = document.createElement('span')
          span.textContent = l
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
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', board => {
  boardDiv.innerHTML = ''
  for (let i = 0; i < board.length; i++) {
    const row = board[i]
    for (let j = 0; j < row.length; j++) {
      const tile = row[j]
      const tileDiv = fragment.appendChild(document.createElement('div'))
      tileDiv.classList.add('tile')
      if (tile.dl) tileDiv.classList.add('dl')
      if (tile.tl) tileDiv.classList.add('tl')
      if (tile.dw) tileDiv.classList.add('dw')
      if (tile.tw) tileDiv.classList.add('tw')
      if (tile.l) {
        const span = document.createElement('span')
        span.textContent = tile.l
        tileDiv.appendChild(span)
      }
      if (tile.blank) tileDiv.classList.add('blank')
      if (tile.last) tileDiv.classList.add('last')
    }
  }
  boardDiv.appendChild(fragment)
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
