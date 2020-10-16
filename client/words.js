/* global io */
var socket = io("https://xrchz.net:4321")

const Blue = 0
const Red = 1
const colourName = index => index === Blue ? 'blue' : index === Red ? 'red' : null
const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const log = document.getElementById('log')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const joinBlueButton = document.getElementById('joinBlue')
const joinRedButton = document.getElementById('joinRed')
const blueTeamList = document.getElementById('blueTeam')
const redTeamList = document.getElementById('redTeam')
const startButton = document.getElementById('start')
const spectateInput = document.getElementById('spectate')
const spectatorsDiv = document.getElementById('spectators')
const unseated = document.getElementById('unseated')
const setupDiv = document.getElementById('setupArea')

const fragment = document.createDocumentFragment()

joinButton.onclick = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
}

joinBlueButton.onclick = () => socket.emit('joinTeam', Blue)
joinRedButton.onclick = () => socket.emit('joinTeam', Red)
startButton.onclick = () => socket.emit('startGame')

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.disabled = false
  unseated.innerHTML = ''
  startButton.hidden = true
  spectatorsDiv.innerHTML = ''
  log.hidden = true
  setupDiv.hidden = true
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

socket.on('updateUnseated', players => {
  unseated.innerHTML = ''
  let elem
  for (player of players) {
    if (player.team !== undefined) continue
    if (player.name === nameInput.value && !spectateInput.checked) {
      joinBlueButton.hidden = false
      joinRedButton.hidden = false
    }
    elem = document.createElement('li')
    elem.textContent = player.name
    unseated.appendChild(elem)
  }
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
  setupDiv.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updateTeams', teams => {
  for(const index of [Blue, Red]) {
    const colour = colourName(index)
    const teamList = [blueTeamList, redTeamList][index]
    teamList.innerHTML = ''
    for (const player of teams[index]) {
      const li = fragment.appendChild(document.createElement('li'))
      const ra = li.appendChild(document.createElement('input'))
      ra.name = `${colour}Leader`
      ra.type = 'radio'
      ra.value = player.name
      if (spectateInput.checked)
        ra.disabled = true
      else
        ra.onchange = () => socket.emit('setLeader', player.name)
      if (player.leader) ra.checked = true
      li.appendChild(document.createTextNode(player.name))
      if (player.name === nameInput.value && !spectateInput.checked) {
        const bu = li.appendChild(document.createElement('input'))
        bu.type = 'button'
        bu.value = 'Leave'
        bu.onclick = () => socket.emit('leaveTeam')
        joinBlueButton.hidden = true
        joinRedButton.hidden = true
      }
    }
    teamList.appendChild(fragment)
  }
})

socket.on('showStart', show => {
  if (!spectateInput.checked)
    startButton.hidden = !show
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  log.hidden = false
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

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
