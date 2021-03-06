/* global io */
var socket = io(ServerURI('words'), SocketOptions('words'))

const Blue = 0, Red = 1, Assassin = 2
const colourName = i =>
  i === Blue ? 'blue' :
  i === Red ? 'red' :
  i === Assassin ? 'assassin' : 'neutral'
const typeIcon = t =>
  t === 'friend' ? '✓' :
  t === 'foe' ? '✗' :
  t === 'assassin' ? '☠' :
  t === 'neutral' ? '–' : null
const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const wordLists = document.getElementById('wordLists')
const wordsList = document.getElementById('words')
const playArea = document.getElementById('playArea')
const clueArea = document.getElementById('clueArea')
const clueWord = document.getElementById('clueWord')
const clueNumber = document.getElementById('clueNumber')
const clueSubmit = document.getElementById('clueSubmit')
const passButton = document.getElementById('pass')
const timeLimit = document.getElementById('timeLimit')
const whoseTurn = document.getElementById('whoseTurn')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const pauseButton = document.getElementById('pause')
const joinBlueButton = document.getElementById('joinBlue')
const joinRedButton = document.getElementById('joinRed')
const blueHeading = document.getElementById('blueHeading')
const redHeading = document.getElementById('redHeading')
const blueTeamList = document.getElementById('blueTeam')
const redTeamList = document.getElementById('redTeam')
const blueClues = document.getElementById('blueClues')
const redClues = document.getElementById('redClues')
const startButton = document.getElementById('start')
const spectateInput = document.getElementById('spectate')
const spectatorsDiv = document.getElementById('spectators')
const unseated = document.getElementById('unseated')
const setupDiv = document.getElementById('setupArea')
const settingsDiv = document.getElementById('settings')
const assassinsInput = document.getElementById('assassins')
const firstGivingSeconds = document.getElementById('firstGivingSeconds')
const givingSeconds = document.getElementById('givingSeconds')
const guessingSeconds = document.getElementById('guessingSeconds')

const fragment = document.createDocumentFragment()
const Headings = [blueHeading, redHeading]
const TeamLists = [blueTeamList, redTeamList]
const ClueLogs = [blueClues, redClues]
const TimeLimits = [firstGivingSeconds, givingSeconds, guessingSeconds]
const TimeLimitDefaults = ['5m', '3m', '4m']
const leaders = []
const teamNames = [[], []]

for (let i = 0; i < TimeLimits.length; i++) {
  const input = TimeLimits[i]
  input.classList.add('timelimit')
  input.type = 'text'
  input.pattern = '\\d+m\\d+s|\\d+m|\\d+s|∞'
  input.value = TimeLimitDefaults[i]
}

function timeLimitOnChange(input) {
  const regex = /(?:(?<m>\d+)m)?(?:(?<s>\d+)s)?/
  const found = input.value.match(regex)
  if (found.groups.m && found.groups.s) {
    socket.emit('setLimit', { id: input.id, secs: parseInt(found.groups.m) * 60 + parseInt(found.groups.s) })
  }
  else if (found.groups.m) {
    socket.emit('setLimit', { id: input.id, secs: parseInt(found.groups.m) * 60 })
  }
  else if (found.groups.s) {
    socket.emit('setLimit', { id: input.id, secs: parseInt(found.groups.s) })
  }
  else {
    input.value = '∞'
    socket.emit('setLimit', { id: input.id, secs: false })
  }
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

socket.on('showPause', data => {
  if (!spectateInput.checked) {
    pauseButton.hidden = !data.show
    if (data.text) pauseButton.value = data.text
  }
})

joinBlueButton.onclick = () => socket.emit('joinTeam', Blue)
joinRedButton.onclick = () => socket.emit('joinTeam', Red)
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
  unseated.innerHTML = ''
  startButton.hidden = true
  spectatorsDiv.innerHTML = ''
  playArea.hidden = true
  wordLists.innerHTML = ''
  passButton.hidden = true
  timeLimit.innerHTML = ''
  whoseTurn.innerHTML = ''
  for (const teamList of TeamLists) {
    teamList.previousElementSibling.hidden = true
    teamList.innerHTML = ''
  }
  for (const clueLog of ClueLogs) {
    clueLog.hidden = true
    clueLog.innerHTML = ''
  }
  for (const index of [Blue, Red]) teamNames[index] = []
  Headings.forEach(h => {
    h.nextElementSibling.innerHTML = ''
    h.classList.remove('winner')
  })
  clueWord.value = ''
  setupDiv.hidden = true
  settingsDiv.hidden = true
  settingsDiv.previousElementSibling.hidden = true
  assassinsInput.disabled = false
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
    assassinsInput.onchange = () =>
      socket.emit('setAssassins', assassinsInput.valueAsNumber)
    TimeLimits.forEach(input =>
      input.onchange = () => timeLimitOnChange(input))
  }
  else {
    assassinsInput.disabled = true
    TimeLimits.forEach(input => input.disabled = true)
  }
  joinButton.hidden = true
  setupDiv.hidden = false
  settingsDiv.hidden = false
  settingsDiv.previousElementSibling.hidden = false
  errorMsg.innerHTML = ''
  if (history.state === 'lobby')
    history.pushState(data, `Game ${data.gameName}`)
})

socket.on('updateAssassins', n => assassinsInput.value = n)

socket.on('updateLimit', data =>
  document.getElementById(data.id).value = data.text)

socket.on('updateTeams', data => {
  for(const index of [Blue, Red]) {
    const colour = colourName(index)
    const teamList = TeamLists[index]
    if (data.wordsLeft !== undefined)
      Headings[index].nextElementSibling.innerHTML = `Words Left: ${data.wordsLeft[index]}`
    teamList.innerHTML = ''
    teamList.previousElementSibling.hidden = !data.teams[index].length
    let first = true
    for (const player of data.teams[index]) {
      const li = fragment.appendChild(document.createElement('li'))
      const la = li.appendChild(document.createElement('label'))
      const ra = la.appendChild(document.createElement('input'))
      la.appendChild(document.createElement('span'))
      la.classList.add(colour)
      ra.name = `${colour}Leader`
      ra.type = 'radio'
      ra.value = player.name
      if (spectateInput.checked || data.started)
        ra.disabled = true
      else
        ra.onchange = () => socket.emit('setLeader', player.name)
      if (player.leader) ra.checked = true
      const span = li.appendChild(document.createElement('span'))
      span.textContent = player.name
      if (!first && data.guessing)
        whoseTurn.textContent = `${colourName(index)} team`
      if (data.whoseTurn === index) {
        if (!first !== !data.guessing) {
          span.classList.add('current')
          span.textContent += ' (*)'
          if (first)
            whoseTurn.textContent = player.name
        }
        first = false
      }
      if (!player.socketId) {
        span.classList.add('disconnected')
        span.textContent += ' (d/c)'
      }
      if (!data.started && player.name === nameInput.value && !spectateInput.checked) {
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
  if (data.winner !== undefined) {
    Headings[data.winner].classList.add('winner')
    whoseTurn.innerHTML = ''
  }
})

socket.on('showStart', show => {
  if (!spectateInput.checked)
    startButton.hidden = !show
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  joinRedButton.hidden = true
  joinBlueButton.hidden = true
  for (const clueLog of ClueLogs) clueLog.hidden = false
  for (const index of [Blue, Red]) {
    const teamList = TeamLists[index]
    for (const el of teamList.getElementsByTagName('input')) {
      if (el.type === 'button')
        el.hidden = true
      else if (el.type === 'radio') {
        el.disabled = true
        if (el.checked)
          leaders[index] = el.value
        teamNames[index].push(el.value)
      }
    }
  }
  playArea.hidden = false
  assassinsInput.disabled = true
  errorMsg.innerHTML = ''
})

socket.on('showClue', wordsLeft => {
  if (wordsLeft) {
    clueArea.hidden = false
    clueWord.value = ''
    clueNumber.innerHTML = ''
    for(let i = 0; i <= wordsLeft; i++)
      fragment.appendChild(document.createElement('option')).textContent = i.toString()
    fragment.appendChild(document.createElement('option')).textContent = '∞'
    if (1 <= wordsLeft) fragment.children[1].selected = true
    clueNumber.appendChild(fragment)
  }
  else
    clueArea.hidden = true
})

clueSubmit.parentElement.onsubmit = () => {
  socket.emit('clueRequest',
    { clue: clueWord.value,
      n: Array.from(clueNumber.children).findIndex(x => x.selected)
    })
  return false
}

passButton.onclick = () => socket.emit('guessRequest', false)

socket.on('updateWords', data => {
  wordsList.innerHTML = ''
  const isLeader = leaders.includes(nameInput.value)
  const isPlayer = !(spectateInput.checked || isLeader)
  const isPlaying = data.guessing && isPlayer && teamNames[data.whoseTurn].includes(nameInput.value)
  if (isLeader) {
    wordLists.innerHTML = ''
    const leaderTeam = teamNames.findIndex(team => team.includes(nameInput.value))
    const ul = fragment.appendChild(document.createElement('ul'))
    function addWords(label, colour) {
      const li = ul.appendChild(document.createElement('li'))
      li.appendChild(document.createElement('span')).textContent = label
      const il = li.appendChild(document.createElement('ul'))
      il.classList.add('inline')
      for (const word of data.words) {
        if (word.colour === colour && !word.guessed) {
          const ii = il.appendChild(document.createElement('li'))
          ii.textContent = word.word
          ii.classList.add(colourName(word.colour))
        }
      }
    }
    addWords('Friends (✓):', leaderTeam)
    addWords('Foes (✗):', 1 - leaderTeam)
    addWords('Neutral (–):', undefined)
    if (assassinsInput.valueAsNumber)
      addWords('Assassins (☠):', Assassin)
    wordLists.appendChild(fragment)
  }
  for (let i = 0; i < data.words.length; i++) {
    const word = data.words[i]
    const li = fragment.appendChild(document.createElement('li'))
    const isPlayable = isPlaying && !word.guessed
    const el = li.appendChild(document.createElement(isPlayable ? 'a' : 'span'))
    el.textContent = word.word
    if (isPlayable)
      el.onclick = () => socket.emit('guessRequest', i)
    if (!isPlayer || word.guessed || data.winner !== undefined)
      el.classList.add(colourName(word.colour))
    if (word.guessed)
      el.classList.add('guessed')
  }
  wordsList.appendChild(fragment)
  passButton.hidden = !isPlaying
  errorMsg.innerHTML = ''
})

socket.on('updateClues', data => {
  const clueLog = ClueLogs[data.team]
  clueLog.innerHTML = ''
  if (data.clues.length) {
    fragment.appendChild(document.createElement('h3')).textContent = 'Clues'
    const ul = fragment.appendChild(document.createElement('ul'))
    ul.classList.add('reversed')
    for (const clue of data.clues) {
      const li = ul.appendChild(document.createElement('li'))
      const sp = li.appendChild(document.createElement('span'))
      sp.textContent = clue.text
      sp.classList.add('clue')
      if (clue.guesses.length) {
        li.appendChild(document.createElement('h4')).textContent = 'Guesses'
        const dl = li.appendChild(document.createElement('ul'))
        for (const guess of clue.guesses) {
          const di = dl.appendChild(document.createElement('li'))
          di.appendChild(document.createElement('span')).textContent = `${guess.who}: `
          const dd = di.appendChild(document.createElement('span'))
          dd.textContent = guess.what
          const icon = typeIcon(guess.type)
          if (icon) dd.textContent += ` (${icon})`
          dd.classList.add(guess.type)
          if (guess.colour !== undefined) dd.classList.add(colourName(guess.colour))
        }
      }
    }
    clueLog.appendChild(fragment)
  }
})

socket.on('updateTimeLimit',
  text => timeLimit.textContent = text)

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg
})
