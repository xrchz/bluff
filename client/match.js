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

const fragment = document.createDocumentFragment()

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

socket.on('showPause', data => {
  if (!spectateInput.checked) {
    pauseButton.hidden = !data.show
    if (data.text) pauseButton.value = data.text
    if (data.text === 'Resume')
      true // TODO letterGrid.classList.add('obscured')
    else {
      true
      // TODO letterGrid.classList.remove('obscured')
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
  infoArea.hidden = true
  spectatorsDiv.innerHTML = ''
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
              div.classList.add(card.style)
              div.classList.add(card.colour)
              div.textContent = card.symbol.repeat(card.number)
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
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  playArea.hidden = false
  if (!spectateInput.checked)
    noMatchesButton.hidden = false
  errorMsg.innerHTML = ''
})

noMatchesButton.onclick = function () {
  socket.emit('claimRequest')
}

socket.on('updateGrid', grid => {
  gridDiv.innerHTML = ''
  const selected = []
  for (let i = 0; i < grid.length; i++) {
    const card = grid[i]
    const div = fragment.appendChild(document.createElement('div'))
    div.classList.add('card')
    if (!card) continue
    div.classList.add(card.style)
    div.classList.add(card.colour)
    const a = div.appendChild(document.createElement(spectateInput.checked ? 'span' : 'a'))
    a.textContent = card.symbol.repeat(card.number)
    if (!spectateInput.checked) {
      a.onclick = function () {
        infoMsg.innerHTML = ''
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
  gridDiv.appendChild(fragment)
  infoMsg.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('updateCardsLeft', n => {
  cardsLeftDiv.innerHTML = `${n} cards left`
})

socket.on('gameOver', () => {
  gridDiv.querySelectorAll('a').forEach(a => {
    a.parentElement.textContent = a.textContent
    a.parentElement.removeChild(a)
  })
  noMatchesButton.hidden = true
  infoMsg.innerHTML = 'Game over.'
  errorMsg.innerHTML = ''
})

socket.on('infoMsg', msg => {
  infoMsg.innerHTML = msg
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
