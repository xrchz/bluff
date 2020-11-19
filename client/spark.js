/* global io */
var socket = io("https://xrchz.net", {path: '/games/spark/socket.io'})

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
const infoDiv = document.getElementById('info')
const playtable = document.getElementById('playtable')
const playbody = document.getElementById('playbody')
const playersDiv = document.getElementById('players')

const colourCls = [null, 'red', 'yellow', 'green', 'blue', 'white']

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
  infoDiv.innerHTML = ''
  infoDiv.hidden = true
  playtable.hidden = true
  playersDiv.innerHTML = ''
  playersDiv.hidden = true
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
    if (player.seated) { continue }
    elem = document.createElement('li')
    elem.textContent = player.name
    unseated.appendChild(elem)
  }
  startButton.hidden = players.length < 2
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
})

socket.on('gameStarted', () => {
  startButton.hidden = true
  log.hidden = false
  infoDiv.hidden = false
  playtable.hidden = false
  playersDiv.hidden = false
  unseated.innerHTML = ''
  errorMsg.innerHTML = ''
})

socket.on('updatePlayers', data => {
  playersDiv.innerHTML = ''
  const current = !spectateInput.checked &&
    data.players.find(player => player.name === nameInput.value && player.current)
  for (let playerIndex = 0; playerIndex < data.players.length; playerIndex++) {
    const player = data.players[playerIndex]
    const div = fragment.appendChild(document.createElement('div'))
    const name = div.appendChild(document.createElement('h3'))
    name.textContent = player.name
    if (player.current) {
      name.textContent += ' (*)'
      name.classList.add('current')
    }
    if (player.disconnected) {
      name.textContent += ' (d/c)'
      name.classList.add('disconnected')
    }
    const ol = div.appendChild(document.createElement('ol'))
    const clueButton = current ? div.appendChild(document.createElement('input')) : {}
    clueButton.type = 'button'
    clueButton.hidden = true
    if (current) clueButton.classList.add('clue')
    for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex++) {
      const card = player.hand[cardIndex]
      const cls = colourCls[card.colour]
      const colour = cls[0].toUpperCase()
      const number = card.number.toString()
      const hiddenColour = card.colourClue ? colour : '?'
      const hiddenNumber = card.numberClue ? number : '?'
      const li = ol.appendChild(document.createElement('li'))
      function addHidden(parens) {
        if (parens) li.appendChild(document.createElement('span')).textContent = ' ('
        const span = li.appendChild(document.createElement('span'))
        span.textContent = `${hiddenColour}${hiddenNumber}`
        if (card.colourClue) span.classList.add(cls)
        if (parens) li.appendChild(document.createElement('span')).textContent = ')'
      }
      if (current && player.name === nameInput.value) {
        addHidden()
        const playButton = li.appendChild(document.createElement('input'))
        const dropButton = li.appendChild(document.createElement('input'))
        playButton.type = 'button'
        dropButton.type = 'button'
        playButton.value = 'Play'
        dropButton.value = 'Drop'
        playButton.onclick = function () { socket.emit('playRequest', { index: cardIndex }) }
        dropButton.onclick = function () { socket.emit('playRequest', { index: cardIndex, drop: true }) }
      }
      else if (current && data.clues) {
        li.card = card
        const coloura = li.appendChild(document.createElement('a'))
        const numbera = li.appendChild(document.createElement('a'))
        const values = { colour: colour, number: number }
        coloura.textContent = colour
        numbera.textContent = number
        coloura.classList.add(cls)
        numbera.classList.add(cls)
        addHidden(true)
        function makeOnclick(key) {
          return function () {
            const value = `Clue ${values[key]}`
            for (const liClue of playersDiv.querySelectorAll('li.clue'))
              liClue.classList.remove('clue')
            if (!clueButton.hidden && clueButton.value === value)
              clueButton.hidden = true
            else {
              for (const inputClue of playersDiv.querySelectorAll('input.clue'))
                inputClue.hidden = true
              clueButton.hidden = false
              clueButton.value = value
              const data = { index: playerIndex }
              data[key] = card[key]
              clueButton.onclick = function () { socket.emit('clueRequest', data) }
              for (const ch of ol.children)
                if (ch.card[key] === card[key]) ch.classList.add('clue')
            }
          }
        }
        coloura.onclick = makeOnclick('colour')
        numbera.onclick = makeOnclick('number')
      }
      else if (player.name === nameInput.value && !data.ended) {
        addHidden()
      }
      else {
        const span = li.appendChild(document.createElement('span'))
        span.textContent = `${colour}${number}`
        span.classList.add(cls)
        addHidden(true)
      }
    }
  }
  playersDiv.appendChild(fragment)
  errorMsg.innerHTML = ''
})

socket.on('updateTable', data => {
  infoDiv.innerHTML = ''
  fragment.appendChild(document.createElement('p')).textContent = `Cards: ${data.cards}`
  fragment.appendChild(document.createElement('p')).textContent = `Clues: ${data.clues}`
  fragment.appendChild(document.createElement('p')).textContent = `Lives: ${data.lives}`
  infoDiv.appendChild(fragment)
  for (let c = 1; c <= 5; c++) {
    const tr = playbody.children[c - 1]
    const numbers = []
    for (let n = 1; n <= data.played[c]; n++)
      numbers.push(n)
    tr.children[1].textContent = numbers.join(' ')
    numbers.length = 0
    for (let n = 1; n <= 5; n++)
      for (let i = 0; i < data.dropped[c][n]; i++)
        numbers.push(n)
    tr.children[2].textContent = numbers.join(' ')
  }
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
