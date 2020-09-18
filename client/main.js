var socket = io("https://xrchz.net:2009");

const handDiv = document.getElementById('hand');
const moveDiv = document.getElementById('move');
const settingsButton = document.getElementById('joinGame');
const moveButton = document.getElementById('submit');
const bluffButton = document.getElementById('bluff');
const sayInput = document.getElementById('say');
const playInput = document.getElementById('play');
const playerList = document.getElementById('players');
const gameInput = document.getElementById('game');
const nameInput = document.getElementById('name');
const errorMsg = document.getElementById('errorMsg');
const log = document.getElementById('log');

socket.on('updatePlayers', players => {
  playerList.innerHTML = players;
});

socket.on('updateHand', hand => {
  handDiv.innerHTML = 'Hand: ' + hand.join('');
});

socket.on('showMove', () => {
  moveDiv.hidden = false;
});

socket.on('hideMove', () => {
  moveDiv.hidden = true;
});

socket.on('showBluff', () => {
  bluffButton.hidden = false;
});

const gameName = () => gameInput.value.toUpperCase().substring(0, 2);
settingsButton.onclick = () => { socket.emit('joinGame', {gameName: gameName(), playerName: nameInput.value}); };

moveButton.onclick = () => {
  errorMsg.innerHTML = "";
  socket.emit('move', {say: sayInput.value.toUpperCase(), play: playInput.value.toUpperCase()});
};

socket.on('rejoinGame', () => {
  gameInput.disabled = true;
  nameInput.disabled = true;
  settingsButton.remove();
  errorMsg.innerHTML = "";
});

socket.on('joinGame', data => {
  gameInput.value = data.gameName;
  nameInput.value = data.playerName;
  gameInput.disabled = true;
  nameInput.disabled = true;
  settingsButton.value = "Start!";
  settingsButton.onclick = () => { socket.emit('startGame'); };
  errorMsg.innerHTML = "";
});

socket.on('startGame', () => {
  settingsButton.remove();
  errorMsg.innerHTML = "";
});

socket.on('appendLog', text => {
  const li = document.createElement('li');
  const tx = document.createTextNode(text);
  li.appendChild(tx);
  log.appendChild(li);
  li.scrollIntoView(false);
});

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg;
});
