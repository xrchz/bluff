/* global io */
var socket = io(ServerURI('cross'), SocketOptions('cross'))

const fragment = document.createDocumentFragment()

const boardDiv = document.getElementById('board')

socket.on('ensureLobby', () => {
  boardDiv.innerHTML = ''
})

socket.on('updateBoard', board => {
  boardDiv.innerHTML = ''
  for (let i = 0; i < board.length; i++) {
    const row = board[i]
    for (let j = 0; j < row.length; j++) {
      const tile = row[j]
      const tileDiv = fragment.appendChild(document.createElement('div'))
      tileDiv.classList.add('tile')
      if (tile.dl) tileDiv.classList.add('dl')
      if (tile.tl) tileDiv.classList.add('tl')
      if (tile.dw) tileDiv.classList.add('dw')
      if (tile.tw) tileDiv.classList.add('tw')
    }
  }
  boardDiv.appendChild(fragment)
})
