/* global io */
var socket = io("https://xrchz.net", {path: '/games/acorn/socket.io'})

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const blameMsg = document.getElementById('blame')
const log = document.getElementById('log')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const spectateInput = document.getElementById('spectate')
const spectatorsDiv = document.getElementById('spectators')
const unseated = document.getElementById('unseated')
const bidsDiv = document.getElementById('bids')
const gridDiv = document.getElementById('grid')

const DugColours = ['black', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']

const fragment = document.createDocumentFragment()

joinButton.onclick = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
}

startButton.onclick = () => { socket.emit('startGame') }

undoButton.onclick = () => { socket.emit('undoRequest') }

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
  spectatorsDiv.innerHTML = ''
  log.innerHTML = ''
  log.hidden = true
  bidsDiv.innerHTML = ''
  bidsDiv.hidden = true
  gridDiv.innerHTML = ''
  gridDiv.hidden = true
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
      if (player.disconnected) {
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
    elem = document.createElement('li')
    elem.textContent = player.name
    unseated.appendChild(elem)
  }
  startButton.hidden = !players.length
  errorMsg.innerHTML = ''
})

socket.on('updateSpectators', spectators => {
  spectatorsDiv.innerHTML = ''
  let elem
  if (spectators.length) {
    spectators.unshift({ name: 'Spectators:' })
  }
  for (spectator of spectators) {
    elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsDiv.appendChild(elem)
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
  log.hidden = false
  bidsDiv.hidden = false
  gridDiv.hidden = false
  unseated.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('updateBids', data => {
  unseated.innerHTML = ''
  for (player of data.players) {
    const li = fragment.appendChild(document.createElement('li'))
    li.textContent = `${player.name} [${player.stamina}]`
    if (player.current) {
      li.textContent += ' (*)'
      li.classList.add('current')
    }
    if (player.disconnected) {
      li.textContent += ' (d/c)'
      li.classList.add('disconnected')
    }
    if (player.name === data.players[data.whoseTurn].name)
      li.classList.add('rotator')
  }
  unseated.appendChild(fragment)

  bidsDiv.innerHTML = ''
  if (data.bidding) {
    const toBid = data.players.filter(player => player.bid === undefined)
    const current = toBid.find(player => player.name === nameInput.value)
    if (!spectateInput.checked && current) {
      const form = fragment.appendChild(document.createElement('form'))
      const select = form.appendChild(document.createElement('select'))
      const submit = form.appendChild(document.createElement('input'))
      submit.type = 'submit'
      submit.value = 'Bid'
      for (let i = 0; i <= current.stamina; i++)
        select.appendChild(document.createElement('option')).textContent = i.toString()
      select.firstElementChild.selected = true
      form.onsubmit = () => {
        socket.emit('bidRequest', Array.from(select.children).findIndex(x => x.selected))
        return false
      }
    }
    fragment.appendChild(document.createElement('span')).textContent = 'Waiting for bids from: '
    const ul = fragment.appendChild(document.createElement('ul'))
    ul.classList.add('inline')
    for (const player of toBid)
      ul.appendChild(document.createElement('li')).textContent = player.name
  }
  bidsDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateGrid', data => {
  gridDiv.innerHTML = ''
  const current = !spectateInput.checked && nameInput.value === data.current
  for (let i = 0; i < data.grid.length; i++)
    for (let j = 0; j < data.grid.length; j++) {
      const cell = data.grid[i][j]
      const div = fragment.appendChild(document.createElement('div'))
      if (cell.dug === undefined && current) {
        const button = div.appendChild(document.createElement('input'))
        button.type = 'button'
        button.onclick = () => socket.emit('digRequest', {i: i, j: j})
      }
      if (cell.dug) {
        if (cell.acorn)
          div.textContent = '🌰'
        else {
          div.textContent = cell.dug.toString()
          div.style.color = DugColours[cell.dug - 1]
        }
      }
    }
  gridDiv.appendChild(fragment)
  gridDiv.style.gridTemplateColumns = `repeat(${data.grid.length}, 2em)`
  errorMsg.innerHTML = ''
})

socket.on('appendLog', markup => {
  const li = document.createElement('li')
  li.innerHTML = markup
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
