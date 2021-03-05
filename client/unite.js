/* global io */
var socket = io(ServerURI('unite'), SocketOptions('unite'))

const gameInput = document.getElementById('game')
const nameInput = document.getElementById('name')
const errorMsg = document.getElementById('errorMsg')
const log = document.getElementById('log')
const gamesList = document.getElementById('games')
const joinButton = document.getElementById('join')
const startButton = document.getElementById('start')
const undoButton = document.getElementById('undo')
const playersList = document.getElementById('players')
const spectateInput = document.getElementById('spectate')
const spectatorsList = document.getElementById('spectators')
const playArea = document.getElementById('playArea')
const deckDiv = document.getElementById('deck')
const boardDiv = document.getElementById('board')
const holdingDiv = document.getElementById('holding')
const opHandDiv = document.getElementById('opHand')
const myHandDiv = document.getElementById('myHand')

const suitNames = ['spades', 'diamonds', 'clubs', 'hearts']
const suitChar = ['♤', '♢',	'♧', '♡']
const cardChar = (suit, rank) =>
  String.fromCodePoint(0x1F001 + [0xA0, 0xC0, 0xD0, 0xB0][suit] + rank)

const fragment = document.createDocumentFragment()

joinButton.parentElement.onsubmit = () => {
  socket.emit('joinRequest', {
    gameName:  gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  })
  return false
}

startButton.onclick = () => { socket.emit('startGame') }

undoButton.onclick = () => {
  socket.emit('undoRequest')
  errorMsg.innerHTML = ''
}

socket.on('ensureLobby', () => {
  errorMsg.innerHTML = ''
  gameInput.disabled = false
  nameInput.disabled = false
  joinButton.hidden = false
  spectateInput.hidden = false
  spectateInput.disabled = false
  spectateInput.previousElementSibling.hidden = false
  undoButton.hidden = true
  startButton.hidden = true
  startButton.disabled = false
  playersList.innerHTML = ''
  spectatorsList.innerHTML = ''
  log.innerHTML = ''
  log.hidden = true
  playArea.hidden = true
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

socket.on('updateSpectators', spectators => {
  spectatorsList.innerHTML = ''
  let elem
  if (spectators.length) {
    spectators.unshift({ name: 'Spectators:' })
  }
  for (spectator of spectators) {
    elem = document.createElement('li')
    elem.textContent = spectator.name
    spectatorsList.appendChild(elem)
  }
})

socket.on('updatePlayers', players => {
  playersList.innerHTML = ''
  if (!startButton.disabled)
    startButton.hidden = players.length != 2
  for (const player of players) {
    const li = fragment.appendChild(document.createElement('li'))
    li.textContent = player.name
    if (player.disconnected)
      li.classList.add('disconnected')
    if (player.current)
      li.classList.add('current')
    if (player.winner)
      li.classList.add('winner')
    if (player.hand) {
      const isMine = spectateInput.checked ?
        (player.current || player.winner) :
        (nameInput.value === player.name)
      const handDiv = document.getElementById(isMine ? 'myHand' : 'opHand')
      handDiv.innerHTML = ''
      for (let suit = 0; suit < 4; suit++) {
        const rank = player.hand[suit]
        const span = handDiv.appendChild(document.createElement('span'))
        span.classList.add(suitNames[suit])
        if (rank === null) {
          span.classList.add('empty')
          span.textContent = suitChar[suit]
        }
        else {
          span.textContent = cardChar(suit, rank)
        }
      }
    }
  }
  playersList.appendChild(fragment)
  errorMsg.innerHTML = ''
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
  startButton.disabled = true
  log.hidden = false
  playArea.hidden = false
  errorMsg.innerHTML = ''
})

socket.on('updateBoard', data => {
  deckDiv.innerHTML = ''
  holdingDiv.innerHTML = ''
  const deck = data.deck
  const board = data.board
  const players = Array.from(playersList.children)
  const currentIndex = players.findIndex(li => li.classList.contains('current') || li.classList.contains('winner'))
  const playerIndex = spectateInput.checked ? currentIndex : players.findIndex(li => nameInput.value === li.textContent)
  const current = !spectateInput.checked && currentIndex === playerIndex
  for (let suit = 0; suit < deck.length; suit++) {
    const div = fragment.appendChild(document.createElement('div'))
    div.classList.add(suitNames[suit])
    const span = div.appendChild(document.createElement('span'))
    span.classList.add(suitNames[suit])
    const rem = deck[suit].length
    div.appendChild(document.createElement('span')).textContent = ` (${rem})`
    if (!rem)
      span.textContent = suitChar[suit]
    else {
      const rank = deck[suit][rem - 1]
      span.textContent = cardChar(suit, rank)
      if (current) {
        span.classList.add('clickable')
        const hand = myHandDiv.children[suit]
        if (hand.classList.contains('empty'))
          span.onclick = () => socket.emit('claimRequest', {suit: suit})
        else {
          const hold = holdingDiv.appendChild(document.createElement('span'))
          span.onclick = () => {
            if (span.classList.contains('removed')) {
              span.classList.remove('removed')
              hand.classList.remove('clickable')
              hand.onclick = null
              if (hold.classList.contains('fromHand')) {
                hand.textContent = hold.textContent
                hold.classList.remove('fromHand')
              }
              hold.classList.remove(suitNames[suit])
              hold.textContent = ''
              boardDiv.querySelectorAll('span.clickable').forEach(span =>
                span.parentElement.removeChild(span))
            }
            else if (hold.textContent === '') {
              hold.textContent = span.textContent
              hold.classList.add(suitNames[suit])
              span.classList.add('removed')
              hand.classList.add('clickable')
              hand.onclick = () => {
                const temp = hand.textContent
                hand.textContent = hold.textContent
                hold.textContent = temp
                if (hold.classList.contains('fromHand'))
                  hold.classList.remove('fromHand')
                else
                  hold.classList.add('fromHand')
              }
              for (let side = 0; side < 2; side++) {
                const relSide = playerIndex ? 1 - side : side
                const sideId = ['L','R'][relSide]
                for (const row of board.validColumns[side]) {
                  const relRow = playerIndex ? 2 - row : row
                  const parentId = `${['my','md','op'][relRow]}${sideId}`
                  const move = document.getElementById(parentId).appendChild(document.createElement('span'))
                  move.classList.add(suitNames[suit])
                  move.classList.add('clickable')
                  move.textContent = '🃟'
                  move.onclick = () =>
                    socket.emit('claimRequest', { suit: suit, pos: {side: side, row: row},
                                                  keepHand: !hold.classList.contains('fromHand') })
                }
              }
            }
            else {
              deckDiv.querySelector('span.removed').onclick()
              span.onclick()
            }
          }
        }
      }
    }
  }
  deckDiv.appendChild(fragment)
  boardDiv.querySelectorAll('#board > div > div').forEach(div => div.innerHTML = '')
  const L = playerIndex
  const R = 1 - playerIndex
  for (let relRow = 0; relRow < 3; relRow++) {
    const row = playerIndex ? 2 - relRow : relRow
    const rowCards = playerIndex ? board.b[row].slice().reverse() : board.b[row]
    const rowId = ['my','md','op'][relRow]
    const ZtoN = z => Math.floor((z - 1) / 2)
    const zs = [ZtoN(board.z[row][L]), [1,2,1][row], ZtoN(board.z[row][R])]
    const sideIds = ['L', 'M', 'R']
    let sideId, rowDiv
    let c = 0, n = 0
    for (const card of rowCards) {
      while (n === 0) {
        n = zs[c]
        sideId = sideIds[c]
        rowDiv = document.getElementById(`${rowId}${sideId}`)
        c++
      }
      const span = rowDiv.appendChild(document.createElement('span'))
      span.textContent = cardChar(card.s, card.r)
      span.classList.add(suitNames[card.s])
      n--
    }
  }
  // TODO: add functionality for hatching
  errorMsg.innerHTML = ''
})

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else {
    const a = li.appendChild(document.createElement('a'))
    a.textContent = 'TODO: log entry'
  }
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
