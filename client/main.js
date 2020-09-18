var socket = io("https://xrchz.net:2009");

socket.on('updatePlayers', players => {
  document.getElementById('players').innerHTML = players;
});

socket.on('updateGame', data => {
  document.getElementById('game').value = data.gameName;
  document.getElementById('name').value = data.playerName;
  document.getElementById('game').disabled = true;
  document.getElementById('name').disabled = true;
  document.getElementById('joinGame').remove();
  document.getElementById('errorMsg').innerHTML = "";
});

socket.on('errorMsg', msg => {
  document.getElementById('errorMsg').innerHTML = msg;
});

function playerName() { return document.getElementById('name').value; }
function gameName() { return document.getElementById('game').value.toUpperCase().substring(0, 2); }
document.getElementById('joinGame').onclick = () => { socket.emit('joinGame', {gameName: gameName(), playerName: playerName()})};
