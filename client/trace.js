/* global io */
var socket = io("https://xrchz.net", {path: '/games/trace/socket.io'})

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
const rotateDiv = document.getElementById('rotate')
const rotateClockwise = document.getElementById('rotateClockwise')
const rotateAnticlockwise = document.getElementById('rotateAnticlockwise')
const timeLimit = document.getElementById('timeLimit')
const letterGrid = document.getElementById('letterGrid')
const playForm = document.getElementById('playForm')
const playWord = document.getElementById('playWord')
const playSubmit = document.getElementById('playSubmit')
const resultsArea = document.getElementById('resultsArea')
const settingsDiv = document.getElementById('settings')
const timeSetting = document.getElementById('timeSetting')
const approveSetting = document.getElementById('approveSetting')
const notWordPenalty = document.getElementById('notWordPenalty')
const invalidWordPenalty = document.getElementById('invalidWordPenalty')
const godWords = document.getElementById('godWords')

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

pauseButton.onclick = () => {
  socket.emit('pauseRequest')
  errorMsg.innerHTML = ''
}

socket.on('showPause', data => {
  if (!spectateInput.checked) {
    pauseButton.hidden = !data.show
    if (data.text) pauseButton.value = data.text
    if (data.text === 'Resume')
      letterGrid.classList.add('obscured')
    else {
      letterGrid.classList.remove('obscured')
      if (!playWord.disabled) playWord.focus()
    }
  }
})

const clockwiseIndices = []
const anticlockwiseIndices = []
for (let i = 3; i >= 0; i--) {
  for (let j = 0; j < 4; j++) {
    anticlockwiseIndices.push(i + 4 * j)
    clockwiseIndices.push((3 - i) + 4 * (3 - j))
  }
}

rotateClockwise.onclick = () => {
  letterGrid.replaceChildren(...clockwiseIndices.map(i => letterGrid.children[i]))
  if (!playWord.disabled) playWord.focus()
}

rotateAnticlockwise.onclick = () => {
  letterGrid.replaceChildren(...anticlockwiseIndices.map(i => letterGrid.children[i]))
  if (!playWord.disabled) playWord.focus()
}

playWord.oninput = () => {
  if (playWord.value.length) {
    const lastLetter = playWord.value.slice(-1)
    if ('[]='.includes(lastLetter)) {
      (lastLetter === ']' ? rotateClockwise :
       lastLetter === '[' ? rotateAnticlockwise :
       pauseButton).onclick()
      playWord.value = playWord.value.slice(0, -1)
    }
  }
}

timeSetting.onchange = function () {
  if (timeSetting.checkValidity()) {
    const regex = /(?<m>\d*):(?<s>\d\d)/
    const found = timeSetting.value.match(regex)
    const mins = found.groups.m.length ? parseInt(found.groups.m) : 0
    socket.emit('setTimeSetting', mins * 60 + parseInt(found.groups.s))
  }
}

approveSetting.onchange = () => {
  socket.emit('setApprove', approveSetting.checked)
  errorMsg.innerHTML = ''
}

socket.on('clearApproval', () => {
  approveSetting.checked = false
})

const penaltySettingOnchange = function (input) {
  return function () {
    if (input.checkValidity())
      socket.emit('setPenalty', { id: input.id, n: parseInt(input.value) })
  }
}
notWordPenalty.onchange = penaltySettingOnchange(notWordPenalty)
invalidWordPenalty.onchange = penaltySettingOnchange(invalidWordPenalty)

socket.on('updateTimeSetting', s => {
  timeSetting.value = s
})

socket.on('updatePenalty', data => {
  document.getElementById(data.id).value = data.n
})

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
  pauseButton.hidden = true
  spectateInput.hidden = false
  spectateInput.previousElementSibling.hidden = false
  spectateInput.disabled = false
  playersDiv.innerHTML = ''
  startButton.hidden = true
  spectatorsDiv.innerHTML = ''
  playArea.hidden = true
  letterGrid.innerHTML = ''
  resultsArea.innerHTML = ''
  resultsArea.hidden = true
  settingsDiv.hidden = true
  settingsDiv.previousElementSibling.hidden = true
  godWords.innerHTML = ''
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
  let elem
  elem = document.createElement('li')
  elem.textContent = 'Players:'
  playersDiv.appendChild(elem)
  for (player of players) {
    elem = document.createElement('li')
    elem.textContent = player.name
    if (!player.socketId) {
      elem.classList.add('disconnected')
      elem.textContent += ' (d/c)'
    }
    playersDiv.appendChild(elem)
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
  spectateInput.checked = data.spectate
  gameInput.disabled = true
  nameInput.disabled = true
  spectateInput.disabled = true
  settingsDiv.hidden = false
  settingsDiv.previousElementSibling.hidden = false
  joinButton.hidden = true
  if (!spectateInput.checked) {
    spectateInput.previousElementSibling.hidden = true
    spectateInput.hidden = true
    startButton.hidden = false
    for (const label of settingsDiv.children)
      label.firstElementChild.disabled = false
  }
  else {
    for (const label of settingsDiv.children)
      label.firstElementChild.disabled = true
  }
  if (typeof data.godWords !== 'undefined')
    godWords.innerHTML = `God anticipates ${Math.random() * 10 + data.godWords} words.`
  errorMsg.innerHTML = ''
  if (history.state === 'lobby')
    history.pushState(data, `Game ${data.gameName}`)
})

socket.on('gameStarted', grid => {
  startButton.hidden = true
  let i = 0
  while (i < grid.length) {
    const div = fragment.appendChild(document.createElement('div'))
    div.id = `g${i}`
    div.textContent = grid[i++]
  }
  letterGrid.appendChild(fragment)
  playArea.hidden = false
  resultsArea.hidden = false
  for (const label of settingsDiv.children)
    label.firstElementChild.disabled = true
  if (spectateInput.checked) {
    playForm.hidden = true
    playWord.disabled = true
    playSubmit.disabled = true
  }
  else {
    resultsArea.appendChild(document.createElement('div')).appendChild(document.createElement('ul')).classList.add('reversed')
    playForm.hidden = false
    playWord.disabled = false
    playSubmit.disabled = false
    playWord.value = ''
    playWord.focus()
  }
  errorMsg.innerHTML = ''
})

socket.on('setupLists', names => {
  for (const name of names) {
    const div = fragment.appendChild(document.createElement('div'))
    div.appendChild(document.createElement('h3')).textContent = name
    const ul = div.appendChild(document.createElement('ul'))
    ul.classList.add('reversed')
  }
  resultsArea.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateTimeLimit',
  text => timeLimit.textContent = text)

socket.on('appendWord', data => {
  const ul = spectateInput.checked ?
    resultsArea.children[data.player].firstElementChild.nextElementSibling :
    resultsArea.firstElementChild.firstElementChild
  const li = ul.appendChild(document.createElement('li'))
  if (spectateInput.checked)
    li.textContent = data.word
  else {
    const a = li.appendChild(document.createElement('a'))
    a.classList.add('remove')
    a.textContent = data.word
    a.onclick = () => socket.emit('undoRequest', data.word)
  }
  errorMsg.innerHTML = ''
})

socket.on('scratchWord', data => {
  const ul = spectateInput.checked ?
    resultsArea.children[data.player].firstElementChild.nextElementSibling :
    resultsArea.firstElementChild.firstElementChild
  ul.removeChild(ul.children[data.index])
  if (!playWord.disabled) playWord.focus()
  errorMsg.innerHTML = ''
})

socket.on('showScores', scores => {
  playForm.hidden = true
  playWord.disabled = true
  playSubmit.disabled = true
  resultsArea.hidden = false
  resultsArea.innerHTML = ''
  const missers = new Map()
  const showing = []
  for (const result of scores) {
    const div = fragment.appendChild(document.createElement('div'))
    div.appendChild(document.createElement('h3')).textContent = result.name
    const totalDiv = div.appendChild(document.createElement('div'))
    const controls = div.appendChild(document.createElement('div'))
    const ul = div.appendChild(document.createElement('ul'))
    let time = 0
    let penalties = 0
    for (const data of result.words) {
      const li = ul.appendChild(document.createElement('li'))
      li.keys = {
        time: time++,
        word: data.word,
        misses: Number.isInteger(data.missedBy) ? data.missedBy : -1,
        score: data.points
      }
      if (!missers.has(data.word))
        missers.set(data.word, new Set(scores.map(result => result.name)))
      missers.get(data.word).delete(result.name)
      const wordUl = li.appendChild(document.createElement('ul'))
      wordUl.classList.add('inline', 'word')
      const wordLi = wordUl.appendChild(document.createElement('li'))
      const wordA = wordLi.appendChild(document.createElement(data.path ? 'a' : 'span'))
      wordA.textContent = `${data.word} (${data.points})`
      if (data.missedBy !== undefined) {
        const missedBy = document.createElement(data.missedBy ? 'a' : 'span')
        wordUl.appendChild(document.createElement('li')).appendChild(missedBy)
        missedBy.textContent = `missed by ${data.missedBy}`
        if (data.missedBy) {
          missedBy.onclick = () => {
            oldMissing = resultsArea.querySelector('a.missing')
            if (oldMissing) oldMissing.classList.remove('missing')
            resultsArea.querySelectorAll('h3.misser').forEach(h3 => h3.classList.remove('misser'))
            if (oldMissing !== missedBy) {
              missedBy.classList.add('missing')
              misserNames = missers.get(data.word)
              resultsArea.querySelectorAll('h3').forEach(h3 => {
                if (misserNames.has(h3.textContent))
                  h3.classList.add('misser')
              })
            }
          }
        }
      }
      if (data.invalidWord) wordUl.appendChild(document.createElement('li')).textContent = 'invalid'
      if (data.notWord) wordUl.appendChild(document.createElement('li')).textContent = 'nonword'
      if (data.invalidWord || data.notWord) penalties++
      if (data.path) {
        wordA.classList.add('showPath')
        wordA.onclick = function () {
          for (const c of letterGrid.children) {
            c.style.background = ''
            c.style.color = ''
          }
          if (showing[0] === data.word) showing.pop()
          else {
            showing.pop()
            showing.push(data.word)
            const path = data.path.map(pos => {
              const col = pos % 4
              const row = (pos - col) / 4
              return [row, col, pos]
            })
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
            }
            document.getElementById(`g${path[i][2]}`).style.color = 'black'
            document.getElementById(`g${path[i][2]}`).style.backgroundImage = `linear-gradient(${dir.join(' ')}, ${Colours[i]}, ${Colours[i+1]})`
          }
        }
      }
    }
    totalDiv.textContent = `Total: ${result.score} (${penalties}:${result.words.length})`
    controls.classList.add('sort')
    const byTime = controls.appendChild(document.createElement('a'))
    const byMisses = controls.appendChild(document.createElement('a'))
    const byScore = controls.appendChild(document.createElement('a'))
    const byAlpha = controls.appendChild(document.createElement('a'))
    byTime.textContent = 'time'
    byTime.classList.add('asc')
    byMisses.textContent = 'misses'
    byScore.textContent = 'score'
    byAlpha.textContent = 'αβ'
    controls.querySelectorAll('a').forEach(a => {
      a.onclick = () => {
        dir = ['misses', 'score'].includes(a.textContent) ?
          (a.classList.contains('des') ? +1 : -1) :
          (a.classList.contains('asc') ? -1 : +1)
        sorter = (x, y) => dir * (x.keys[a.textContent] - y.keys[a.textContent])
        if (a.textContent === 'αβ') {
          if (dir < 0)
            sorter = (y, x) => x.keys['word'].localeCompare(y.keys['word'])
          else
            sorter = (x, y) => x.keys['word'].localeCompare(y.keys['word'])
        }
        ul.replaceChildren(... Array.from(ul.children).sort(sorter))
        controls.querySelectorAll('a').forEach(a => a.classList.remove('asc', 'des'))
        a.classList.add(dir < 0 ? 'des' : 'asc')
      }
    })
  }
  resultsArea.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
