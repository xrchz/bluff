/* global io */
var socket = io("https://xrchz.net", {path: '/games/trace/socket.io'})

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const spectateInput = document.getElementById('spectate')
const spectatorsDiv = document.getElementById('spectators')
const unseated = document.getElementById('unseated')
const playArea = document.getElementById('playArea')
const letterGrid = document.getElementById('letterGrid')
const playForm = document.getElementById('playForm')
const playWord = document.getElementById('playWord')
const playSubmit = document.getElementById('playSubmit')
const resultsArea = document.getElementById('resultsArea')

const Colours = [
'#e53935',
'#d81b60',
'#8e24aa',
'#5e35b1',
'#3949ab',
'#1e88e5',
'#039be5',
'#00acc1',
'#00897b',
'#43a047',
'#7cb342',
'#c0ca33',
'#fdd835',
'#ffb300',
'#fb8c00',
'#f4511e',
'white']

const fragment = document.createDocumentFragment()

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

playSubmit.parentElement.onsubmit = () => {
  socket.emit('wordRequest', playWord.value.toLowerCase())
  playWord.value = ''
  playWord.focus()
  return false
}

startButton.onclick = () => socket.emit('startGame')

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.previousElementSibling.hidden = false
  spectateInput.disabled = false
  unseated.innerHTML = ''
  startButton.hidden = true
  spectatorsDiv.innerHTML = ''
  playArea.hidden = true
  letterGrid.innerHTML = ''
  resultsArea.innerHTML = ''
  resultsArea.hidden = true
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
  if (!spectateInput.checked)
    startButton.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('gameStarted', data => {
  startButton.hidden = true
  let i = 0
  while (i < data.grid.length) {
    const div = fragment.appendChild(document.createElement('div'))
    div.id = `g${i}`
    div.textContent = data.grid[i++]
  }
  letterGrid.appendChild(fragment)
  playArea.hidden = false
  resultsArea.hidden = false
  for (const name of data.players) {
    const div = fragment.appendChild(document.createElement('div'))
    div.appendChild(document.createElement('h3')).textContent = name
    div.appendChild(document.createElement('ul'))
    if (!(spectateInput.checked || nameInput.value === name))
      div.hidden = true
  }
  resultsArea.appendChild(fragment)
  if (spectateInput.checked) {
    playForm.hidden = true
    playWord.disabled = true
    playSubmit.disabled = true
  }
  else {
    playForm.hidden = false
    playWord.disabled = false
    playSubmit.disabled = false
    playWord.value = ''
    playWord.focus()
  }
  errorMsg.innerHTML = ''
})

socket.on('appendWord', data => {
  resultsArea.children[data.player].firstElementChild.nextElementSibling.appendChild(document.createElement('li')).textContent = data.word
  errorMsg.innerHTML = ''
})

socket.on('listWords', words => {
  resultsArea.hidden = false
  const ul = fragment.appendChild(document.createElement('ul'))
  for (const wp of words) {
    const li = ul.appendChild(document.createElement('li'))
    const a = li.appendChild(document.createElement('a'))
    a.textContent = wp[0]
    a.onclick = function () {
      for (const c of letterGrid.children) {
        c.style.background = ''
        c.style.color = ''
        /*
        for (const x of ['patht', 'pathb', 'pathl', 'pathr', 'pathtl', 'pathtr', 'pathbl', 'pathbr', 'path'])
          c.classList.remove(x)
        */
      }
      if (a.showing) delete a.showing
      else {
        const path = wp[1].map(pos => {
          const col = pos % 4
          const row = (pos - col) / 4
          return [row, col, pos]
        })
        a.showing = true
        let i = 0, dir
        while (i+1 < path.length) {
          const here = path[i]
          const next = path[i+1]
          dir = ['to']
          if (here[0] < next[0]) dir.push('bottom')
          if (here[0] > next[0]) dir.push('top')
          if (here[1] < next[1]) dir.push('right')
          if (here[1] > next[1]) dir.push('left')
          document.getElementById(`g${here[2]}`).style.color = 'black'
          document.getElementById(`g${here[2]}`).style.backgroundImage = `linear-gradient(${dir.join(' ')}, ${Colours[i]}, ${Colours[i+1]})`
          i++
          /*
          let dir = here[0] < next[0] ? 'b' : here[0] > next[0] ? 't' : ''
          dir += here[1] < next[1] ? 'r' : here[1] > next[1] ? 'l' : ''
          document.getElementById(`g${here[2]}`).classList.add(`path${dir}`)
          */
        }
        document.getElementById(`g${path[i][2]}`).style.color = 'black'
        document.getElementById(`g${path[i][2]}`).style.backgroundImage = `linear-gradient(${dir.join(' ')}, ${Colours[i]}, ${Colours[i+1]})`
        /*
        document.getElementById(`g${path[i][2]}`).classList.add('path')
        */
      }
    }
  }
  resultsArea.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
