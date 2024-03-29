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
const myHandDiv = document.getElementById('myHand')
const doneButton = document.getElementById('done')
const rowIds = ['myBase', 'middle', 'opBase']

const suitNames = ['spades', 'diamonds', 'clubs', 'hearts']
const suitChar = ['♤', '♢', '♧', '♡']
const suitCharBold = ['♠', '♦', '♣', '♥']
const cardChar = (suit, rank) =>
  String.fromCodePoint(0x1F001 + [0xA0, 0xC0, 0xD0, 0xB0][suit] + rank)
const rankName = r => r ? r + 1 : 'A'
const charRank = c => (c.codePointAt(0) - 1) % 16

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
  doneButton.hidden = true
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
      if (!player.socketId) {
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
      if (player.winner)
        a.classList.add('winner')
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
    if (!player.socketId)
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

doneButton.onclick = () => {
  const hand = Array.from(myHandDiv.children).map(span =>
    span.classList.contains('empty') ? null : charRank(span.textContent))
  const board = []
  const cols = 'activePlots' in holdingDiv ? holdingDiv.activePlots[0] : holdingDiv.defaultPlot
  for (let i = 0; i < 3; i++) {
    const span = Array.from(boardDiv.querySelectorAll(`#${rowIds[i]} > div > span`)).find(span =>
      span.spanColumn === cols[i])
    board.push({
      r: charRank(span.textContent),
      s: suitNames.findIndex(v => span.classList.contains(v))
    })
  }
  doneButton.hidden = true
  socket.emit('reorderRequest', {hand: hand, board: board, cols: cols})
}

socket.on('updateBoard', data => {
  deckDiv.innerHTML = ''
  holdingDiv.innerHTML = ''
  const deck = data.deck
  const board = data.board
  const players = Array.from(playersList.children)
  const currentIndex = players.findIndex(li => li.classList.contains('current') || li.classList.contains('winner'))
  const playerIndex = spectateInput.checked ? currentIndex : players.findIndex(li => nameInput.value === li.textContent)
  const current = !spectateInput.checked && currentIndex === playerIndex && players[currentIndex].classList.contains('current')
  function undoPlot() {
    myHandDiv.childNodes.forEach(span => {
      if (span.validPlots) span.onclick()
    })
    for (let i = 0; i < 3; i++) {
      boardDiv.querySelectorAll(`#${rowIds[i]} > div > span.clickable`).forEach(span => {
        if (span.homeRow !== i || span.homeColumn !== span.spanColumn) span.onclick()
      })
    }
    while (holdingDiv.lastElementChild) {
      if ('homeRow' in holdingDiv.lastElementChild) {
        const rowId = rowIds[holdingDiv.lastElementChild.homeRow]
        Array.from(
          boardDiv.querySelectorAll(`#${rowId} > div > span.clickable`)).find(span =>
            span.spanColumn === holdingDiv.lastElementChild.homeColumn).onclick()
      }
      else
        holdingDiv.lastElementChild.onclick()
    }
    doneButton.hidden = true
  }
  for (let suit = 0; suit < deck.length; suit++) {
    const div = fragment.appendChild(document.createElement('div'))
    div.classList.add(suitNames[suit])
    const rem = deck[suit].length
    div.appendChild(document.createElement('span')).textContent = `(${rem === 10 ? 'X' : rem}) `
    const span = div.appendChild(document.createElement('span'))
    span.classList.add(suitNames[suit])
    if (!rem)
      span.textContent = suitChar[suit]
    else {
      const rank = deck[suit][rem - 1]
      span.textContent = cardChar(suit, rank)
      if (current) {
        span.classList.add('clickable', 'claiming')
        const hand = myHandDiv.children[suit]
        if (hand.classList.contains('empty'))
          span.onclick = () => {
            if ('activePlots' in holdingDiv || !doneButton.hidden)
              undoPlot()
            else
              socket.emit('takeRequest', {suit: suit})
          }
        else {
          span.onclick = () => {
            const removed = deckDiv.querySelector('span.removed')
            if (removed) {
              const hold = holdingDiv.lastElementChild
              removed.classList.remove('removed')
              if (hold.classList.contains('fromHand'))
                hand.textContent = hold.textContent
              hold.parentElement.removeChild(hold)
              boardDiv.querySelectorAll('span.clickable').forEach(span => {
                if (span.textContent === '🃟')
                  span.parentElement.removeChild(span)
              })
              if (span !== removed) span.onclick()
            }
            else if ('activePlots' in holdingDiv || !doneButton.hidden) {
              undoPlot()
              span.onclick()
            }
            else {
              const hold = holdingDiv.appendChild(document.createElement('span'))
              hold.textContent = span.textContent
              hold.classList.add(suitNames[suit])
              span.classList.add('removed')
              hold.classList.add('clickable', 'claiming')
              hold.onclick = () => {
                const temp = hand.textContent
                hand.textContent = hold.textContent
                hold.textContent = temp
                hold.classList.toggle('fromHand')
              }
              for (let side = 0; side < 2; side++) {
                const relSide = playerIndex ? 1 - side : side
                const sideId = ['L','R'][relSide]
                const addChild = ['prepend','appendChild'][relSide]
                for (const row of board.validColumns[side]) {
                  const relRow = playerIndex ? 2 - row : row
                  const parentId = `${['my','md','op'][relRow]}${sideId}`
                  const move = document.createElement('span')
                  document.getElementById(parentId)[addChild](move)
                  move.classList.add(suitNames[suit])
                  move.classList.add('clickable', 'claiming')
                  move.textContent = '🃟'
                  move.onclick = () =>
                    socket.emit('takeRequest', { suit: suit, pos: {side: side, row: row},
                                                 keepHand: !hold.classList.contains('fromHand') })
                }
              }
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
    const colSign = playerIndex ? -1 : 1
    const rowId = ['my','md','op'][relRow]
    const ZtoN = z => Math.floor((z - 1) / 2)
    const zs = [ZtoN(board.z[row][L]), [1,2,1][row], ZtoN(board.z[row][R])]
    const rowDivs = ['L','M','R'].map(sideId => document.getElementById(`${rowId}${sideId}`))
    let n = zs.shift()
    for (const card of rowCards) {
      while (!n) { n = zs.shift(); rowDivs.shift() }
      const span = fragment.appendChild(document.createElement('span'))
      span.textContent = cardChar(card.s, card.r)
      span.homeColumn = colSign * card.c
      span.spanColumn = span.homeColumn
      span.classList.add(suitNames[card.s])
      if (!--n) rowDivs[0].appendChild(fragment)
    }
  }
  if (current) {
    for (const v of board.validPlots) {
      for (let i = 0; i < 3; i++) {
        const rowId = rowIds[i]
        const col = v[i]
        const span = Array.from(
          boardDiv.querySelectorAll(`#${rowId} > div > span`)).find(
            span => span.homeColumn === col)
        span.homeRow = i
        if (!('validPlots' in span))
          span.validPlots = []
        span.validPlots.push(v)
      }
    }
    if (board.validPlots.length)
      holdingDiv.defaultPlot = board.validPlots[0]
    myHandDiv.childNodes.forEach(span => {
      if (!span.classList.contains('empty'))
        span.fromHand = true
    })
    function updateActivePlots() {
      const onPlot = []
      for (let i = 0; i < 3; i++) {
        const rowId = rowIds[i]
        const span =
          Array.from(boardDiv.querySelectorAll(`#${rowId} > div > span`)).find(
            span => 'fromHand' in span || 'homeRow' in span && span.homeRow !== i)
        if (span) onPlot.push(span)
      }
      holdingDiv.childNodes.forEach(span => {
        if (span.textContent) onPlot.push(span)
      })
      myHandDiv.childNodes.forEach(span => {
        if ('homeRow' in span) onPlot.push(span)
      })
      if (onPlot.length) {
        const cols = [null, null, null]
        for (let i = 0; i < 3; i++) {
          const span = onPlot.find(span => span.homeRow === i)
          if (span) cols[i] = span.homeColumn
        }
        holdingDiv.activePlots = board.validPlots.filter(v =>
          v.every((c, i) => cols[i] === null || cols[i] === c))
      }
      else {
        delete holdingDiv.activePlots
      }
      if ('activePlots' in holdingDiv) {
        boardDiv.querySelectorAll('span').forEach(span => {
          if (span.fromHand || span.validPlots && span.validPlots.some(v => holdingDiv.activePlots.includes(v))) {
            span.classList.add('clickable', 'reordering')
            span.onclick = plotOnClick
          }
          else if (span.validPlots) {
            span.classList.remove('clickable', 'reordering')
            span.onclick = null
          }
        })
        myHandDiv.childNodes.forEach(span => {
          if (!span.classList.contains('empty')) {
            span.classList.add('clickable', 'reordering')
            span.onclick = plotOnClick
          }
        })
      }
      else {
        boardDiv.querySelectorAll('span').forEach(span => {
          if (span.validPlots) {
            span.classList.remove('clickable', 'reordering')
            span.onclick = null
          }
        })
        myHandDiv.childNodes.forEach(span => {
          span.classList.remove('clickable', 'reordering')
          span.onclick = null
        })
        boardDiv.querySelectorAll('#myBase > div > span').forEach(span => {
          if (span.validPlots) {
            span.classList.add('clickable', 'reordering')
            span.onclick = plotOnClick
          }
        })
      }
    }
    function moveCard(toSpan, fromSpan) {
      toSpan.textContent = fromSpan.textContent
      if ('homeRow' in fromSpan) {
        toSpan.homeRow = fromSpan.homeRow
        delete fromSpan.homeRow
        toSpan.homeColumn = fromSpan.homeColumn
        delete fromSpan.homeColumn
        toSpan.validPlots = fromSpan.validPlots
        delete fromSpan.validPlots
      }
      if ('fromHand' in fromSpan) {
        toSpan.fromHand = fromSpan.fromHand
        delete fromSpan.fromHand
      }
    }
    function plotOnClick() {
      const removed = deckDiv.querySelector('span.removed')
      if (removed) {
        removed.onclick()
        return this.onclick()
      }
      const last = holdingDiv.appendChild(document.createElement('span'))
      moveCard(last, this)
      const thisSuitName = Array.from(this.classList.values()).find(v => suitNames.includes(v))
      last.classList.add(thisSuitName)
      last.suitIndex = suitNames.findIndex(v => v === thisSuitName)
      this.classList.add('empty')
      if (this.parentElement.id === 'myHand') {
        this.textContent = suitChar[last.suitIndex]
        this.classList.remove('clickable', 'reordering')
        this.onclick = null
      }
      else {
        this.textContent = '🃟'
      }
      const hand = myHandDiv.children[last.suitIndex]
      last.classList.add('clickable', 'reordering')
      last.onclick = () => {
        if (hand.classList.contains('empty'))
          receiveHold(hand, last)
        else {
          const temp = {}
          moveCard(temp, last)
          moveCard(last, hand)
          moveCard(hand, temp)
        }
      }
      updateAfterChangingLast()
    }
    function updateAfterChangingLast() {
      const last = holdingDiv.lastElementChild
      if (last) {
        boardDiv.querySelectorAll('span.empty').forEach(span => {
          span.classList.remove(...suitNames)
          span.classList.add(suitNames[last.suitIndex], 'clickable', 'reordering')
          span.onclick = () => receiveHold(span, last)
        })
        doneButton.hidden = true
      }
      else {
        const empties = boardDiv.querySelectorAll('span.empty')
        empties.forEach(span => {
          span.classList.remove(...suitNames, 'clickable', 'reordering')
          span.onclick = null
        })
        if (!empties.length)
          doneButton.hidden = false
      }
      updateActivePlots()
    }
    function receiveHold(target, hold) {
      moveCard(target, hold)
      target.classList.remove('empty')
      const wasLast = hold === holdingDiv.lastElementChild
      holdingDiv.removeChild(hold)
      if (wasLast) updateAfterChangingLast()
    }
    updateActivePlots()
  }
  errorMsg.innerHTML = ''
})

socket.on('appendLog', entry => {
  const li = document.createElement('li')
  if (typeof entry ===  'string')
    li.textContent = entry
  else {
    const span = li.appendChild(document.createElement('span'))
    if (entry.oldCards) {
      const render = a => a.map(c => `${rankName(c.r)}${suitCharBold[c.s]}`).join(' ')
      span.textContent = `${entry.name} reorders ${render(entry.oldCards)} to ${render(entry.newCards)}.`
    }
    else {
      const suit = suitCharBold[entry.suit]
      const deckCard = `${rankName(entry.rank)}${suit}`
      const dest = entry.handRank === null ? 'hand' :
        `${entry.keepHand ? `the board (keeping ` : `hand (replacing `} ${rankName(entry.handRank)})`
      span.textContent = `${entry.name} ${dest[0] === 't' ? 'moves' : 'takes'} ${deckCard} to ${dest}.`
    }
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
