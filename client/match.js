/* global io */
var socket = io("https://xrchz.net", {path: '/games/match/socket.io'})

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const pauseButton = document.getElementById('pause')
const spectateInput = document.getElementById('spectate')
const spectatorsDiv = document.getElementById('spectators')
const playersDiv = document.getElementById('players')
const playArea = document.getElementById('playArea')
const noMatchesButton = document.getElementById('noMatches')
const infoArea = document.getElementById('infoArea')
const cardsLeftDiv = document.getElementById('cardsLeft')
const gridDiv = document.getElementById('grid')
const showMatch = document.getElementById('showMatch')
const log = document.getElementById('log')
const timeElapsed = document.getElementById('timeElapsed')
const nowButton = document.getElementById('now')

const nowFragment = document.createDocumentFragment()

const symbols =  [null, '♭', '♮', '♯']

const fragment = document.createDocumentFragment()

function formatSecs(secs) {
  let r, v = '', d = 0, h = 0, m = 0, s = 0
  if (secs >= 60*60*24) {
    r = secs % (60*60*24)
    d = (secs - r) / (60*60*24)
    if (d) v += `${d}d`
    secs = r
  }
  if (secs >= 60*60) {
    r = secs % (60*60)
    h = (secs - r) / (60*60)
    if (h) v += `${h}h`
    secs = r
  }
  if (secs >= 60) {
    s = secs % 60
    m = (secs - s) / 60
    if (m) v += `${m}m`
  }
  else
    s = secs
  if (s) v += `${s}s`
  return v
}

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

pauseButton.onclick = () => {
  socket.emit('pauseRequest')
  errorMsg.innerHTML = ''
}

socket.on('showPause', text => {
  if (!spectateInput.checked) {
    pauseButton.hidden = false
    pauseButton.value = text
    if (text === 'Resume' && nowButton.checked) {
      gridDiv.classList.add('obscured')
      noMatchesButton.hidden = true
    }
    else {
      gridDiv.classList.remove('obscured')
      noMatchesButton.hidden = false
    }
  }
})

startButton.onclick = () => socket.emit('startGame')

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  infoMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  pauseButton.hidden = true
  spectateInput.hidden = false
  spectateInput.previousElementSibling.hidden = false
  spectateInput.disabled = false
  playersDiv.innerHTML = ''
  startButton.hidden = true
  gridDiv.innerHTML = ''
  playArea.hidden = true
  noMatchesButton.hidden = true
  cardsLeftDiv.innerHTML = ''
  nowButton.parentElement.hidden = true
  infoArea.hidden = true
  spectatorsDiv.innerHTML = ''
  while (log.firstElementChild !== timeElapsed) log.removeChild(log.firstElementChild)
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

socket.on('updatePlayers', players => {
  playersDiv.innerHTML = ''
  for (player of players) {
    const li = fragment.appendChild(document.createElement('li'))
    li.textContent = player.name
    if (!player.socketId) {
      li.classList.add('disconnected')
      li.textContent += ' (d/c)'
    }
    if (player.mismatches)
      li.textContent += ` ${player.mismatches}✘`
    if (player.misclaims)
      li.textContent += ` ${player.misclaims}✗`
    if (player.claims)
      li.textContent += ` ${player.claims}✓`
    if (player.matches !== undefined) {
      if (player.matches.length) li.textContent += ` ${player.matches.length}✔`
      for (const match of player.matches) {
        const a = li.appendChild(document.createElement('a'))
        a.textContent = '🂠'
        a.onclick = function () {
          const wasShowing = a.classList.contains('showing')
          playersDiv.querySelectorAll('a.showing').forEach(a => a.classList.remove('showing'))
          showMatch.hidden = true
          if (!wasShowing) {
            a.classList.add('showing')
            showMatch.innerHTML = ''
            for (const card of match) {
              const div = showMatch.appendChild(document.createElement('div'))
              div.classList.add('card')
              div.classList.add(`style${card.style}`)
              div.classList.add(`colour${card.colour}`)
              div.textContent = symbols[card.symbol].repeat(card.number)
            }
            showMatch.hidden = false
          }
        }
      }
    }
  }
  playersDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
  infoMsg.innerHTML = ''
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
  // settingsDiv.hidden = false
  // settingsDiv.previousElementSibling.hidden = false
  joinButton.hidden = true
  if (!spectateInput.checked) {
    spectateInput.previousElementSibling.hidden = true
    spectateInput.hidden = true
    startButton.hidden = false
  }
  infoArea.hidden = false
  errorMsg.innerHTML = ''
  if (history.state === 'lobby')
    history.pushState(data, `Game ${data.gameName}`)
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  playArea.hidden = false
  if (!spectateInput.checked)
    noMatchesButton.hidden = false
  nowButton.checked = true
  nowButton.parentElement.hidden = false
  errorMsg.innerHTML = ''
})

noMatchesButton.onclick = function () {
  socket.emit('claimRequest')
}

socket.on('updateGrid', grid => {
  const selected = []
  for (let i = 0; i < grid.length; i++) {
    const card = grid[i]
    const div = fragment.appendChild(document.createElement('div'))
    div.classList.add('card')
    if (!card) continue
    div.classList.add(`style${card.style}`)
    div.classList.add(`colour${card.colour}`)
    const a = div.appendChild(document.createElement(spectateInput.checked ? 'span' : 'a'))
    a.textContent = symbols[card.symbol].repeat(card.number)
    if (!spectateInput.checked) {
      a.onclick = function () {
        infoMsg.innerHTML = ''
        if (gridDiv.classList.contains('obscured')) return
        if (div.classList.contains('selected')) {
          selected.splice(selected.findIndex(j => j === i), 1)
          div.classList.remove('selected')
        }
        else if (selected.length < 3) {
          div.classList.add('selected')
          selected.push(i)
          if (selected.length === 3)
            socket.emit('matchRequest', selected)
        }
      }
    }
  }
  nowFragment.replaceChildren()
  if (nowButton.checked) {
    gridDiv.innerHTML = ''
    gridDiv.appendChild(fragment)
    infoMsg.innerHTML = ''
    errorMsg.innerHTML = ''
  }
  else
    nowFragment.appendChild(fragment)
})

socket.on('updateCardsLeft', n => {
  cardsLeftDiv.textContent = `${n} cards left`
})

socket.on('updateTimer', secs => {
  timeElapsed.textContent = formatSecs(secs)
})

nowButton.onchange = function () {
  if (!pauseButton.hidden) {
    if (pauseButton.value === 'Pause') {
      noMatchesButton.hidden = false
      gridDiv.classList.remove('obscured')
    }
    else
      gridDiv.classList.add('obscured')
  }
  gridDiv.innerHTML = ''
  gridDiv.appendChild(nowFragment)
}

socket.on('appendLog', entry => {
  if (entry.elapsed !== undefined)
    fragment.appendChild(document.createElement('li')).textContent = formatSecs(entry.elapsed)
  const li = fragment.appendChild(document.createElement('li'))
  const label = li.appendChild(document.createElement('label'))
  const input = label.appendChild(document.createElement('input'))
  input.type = 'radio'
  input.name = 'frame'
  label.appendChild(document.createElement('span')).textContent = entry.desc
  input.onchange = function () {
    if (!nowFragment.childElementCount)
      while (gridDiv.firstElementChild)
        nowFragment.appendChild(gridDiv.removeChild(gridDiv.firstElementChild))
    else
      gridDiv.innerHTML = ''
    for (let i = 0; i < entry.grid.length; i++) {
      const card = entry.grid[i]
      const div = fragment.appendChild(document.createElement('div'))
      div.classList.add('card')
      if (!card) continue
      div.classList.add(`style${card.style}`)
      div.classList.add(`colour${card.colour}`)
      div.textContent = symbols[card.symbol].repeat(card.number)
      if (entry.selected && entry.selected.includes(i))
        div.classList.add('selected')
    }
    gridDiv.appendChild(fragment)
    gridDiv.classList.remove('obscured')
    noMatchesButton.hidden = true
  }
  log.insertBefore(fragment, timeElapsed)
  infoMsg.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('gameOver', () => {
  gridDiv.querySelectorAll('a').forEach(a => {
    a.parentElement.textContent = a.textContent
  })
  noMatchesButton.hidden = true
  pauseButton.hidden = true
  timeElapsed.nextElementSibling.hidden = true
  timeElapsed.hidden = true
  infoMsg.innerHTML = 'Game over.'
  errorMsg.innerHTML = ''
})

socket.on('infoMsg', msg => {
  infoMsg.innerHTML = msg
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
