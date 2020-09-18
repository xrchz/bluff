var socket = io("https://xrchz.net:2009");

const settingsButton = document.getElementById('joinGame');
const playerList = document.getElementById('players');
const gameInput = document.getElementById('game');
const nameInput = document.getElementById('name');
const errorMsg = document.getElementById('errorMsg');
const log = document.getElementById('log');

socket.on('updatePlayers', players => {
  playerList.innerHTML = players;
});

const gameName = () => gameInput.value.toUpperCase().substring(0, 2);
settingsButton.onclick = () => { socket.emit('joinGame', {gameName: gameName(), playerName: nameInput.value}); };

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
});

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg;
});
