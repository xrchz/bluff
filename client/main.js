var socket = io("https://xrchz.net:2009");

socket.on('updatePlayers', players => {
  document.getElementById('players').innerHTML = players;
});

socket.on('updateGame', game => {
  document.getElementById('game').value = game;
  document.getElementById('game').disabled = true;
  document.getElementById('name').disabled = true;
  document.getElementById('joinGame').remove();
  document.getElementById('newGame').remove();
  document.getElementById('errorMsg').innerHTML = "";
});

socket.on('updateName', name => {
  document.getElementById('name').value = name;
  document.getElementById('errorMsg').innerHTML = "";
});

socket.on('errorMsg', msg => {
  document.getElementById('errorMsg').innerHTML = msg;
});

document.getElementById('name').onchange = () => { socket.emit('changeName', document.getElementById('name').value); };
document.getElementById('newGame').onclick = () => { socket.emit('newGame'); };
document.getElementById('joinGame').onclick = () => { socket.emit('joinGame', document.getElementById('game').value.toUpperCase().substring(0, 2)); };
