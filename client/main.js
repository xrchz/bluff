var socket = io("https://xrchz.net:1909");

const pileDiv = document.getElementById('pile');
const handDiv = document.getElementById('hand');
const moveDiv = document.getElementById('move');
const currentDiv = document.getElementById('current');
const startButton = document.getElementById('start');
const moveButton = document.getElementById('submit');
const bluffButton = document.getElementById('bluff');
const sayInput = document.getElementById('say');
const sayControl = document.getElementById('sayControl');
const playInput = document.getElementById('play');
const playerList = document.getElementById('players');
const gameInput = document.getElementById('game');
const nameInput = document.getElementById('name');
const spectateInput = document.getElementById('spectate');
const errorMsg = document.getElementById('errorMsg');
const log = document.getElementById('log');

socket.on('updatePlayers', players => {
  playerList.innerHTML = players;
});

function makeAddPlayCards(c, n) {
  return () => {
    const removed = playInput.value.replaceAll(c, '');
    if (removed.length == playInput.value.length - n) {
      playInput.value = removed;
    }
    else {
      playInput.value = removed.concat(c.repeat(n));
    }
  }
}

function makeAddSayCard(c) {
  const allMatch = new RegExp('^['+c+']*$');
  return () => {
    if (allMatch.test(sayInput.value)) {
      sayInput.value += c;
    }
    else {
      sayInput.value = sayInput.value.replaceAll(/./g, c);
    }
  }
}

(() => {
  let elem = document.createElement('a');
  elem.textContent = '-';
  elem.onclick = () => { sayInput.value = sayInput.value.slice(0, -1); };
  sayControl.appendChild(elem);
  elem = document.createElement('a');
  elem.textContent = '+';
  elem.onclick = () => { sayInput.value += sayInput.value.charAt(0); };
  sayControl.appendChild(elem);
  elem = document.createElement('a');
  elem.textContent = '⇨';
  elem.onclick = () => { playInput.value = sayInput.value; };
  sayControl.appendChild(elem);
  elem = document.createElement('a');
  elem.textContent = '⇦';
  elem.onclick = () => { sayInput.value = playInput.value; };
  sayControl.appendChild(elem);
})();

function makeSayControl(cards) {
  let elem = sayControl.lastChild.previousSibling.previousSibling.previousSibling;
  while (elem.previousSibling) {
    elem = elem.previousSibling;
    sayControl.removeChild(elem.nextSibling);
  }
  const end = elem.nextSibling;
  for (const c of cards) {
    elem = document.createElement('a');
    elem.textContent = c;
    elem.onclick = makeAddSayCard(c);
    sayControl.insertBefore(elem, end);
  }
}

makeSayControl('23456789TJQKA');

socket.on('updatePile', n => {
  pileDiv.textContent = 'Pile: ' + "🂠".repeat(n);
});

socket.on('updatePileSpectator', pile => {
  pileDiv.innerHTML = 'Pile: <span class=cards>' + pile + '</span>';
});

socket.on('updateHand', hand => {
  while (handDiv.firstChild) {
    handDiv.removeChild(handDiv.firstChild);
  }
  let elem = document.createElement('span');
  elem.textContent = 'Hand: ';
  handDiv.appendChild(elem);
  let lastChar;
  let count;
  for (const c of hand) {
    elem = document.createElement('a');
    elem.textContent = c;
    if (c == lastChar) { count++; } else { count = 1; }
    lastChar = c;
    elem.onclick = makeAddPlayCards(c, count);
    handDiv.appendChild(elem);
  }
});

socket.on('setCurrent', player => {
  if (player) {
    currentDiv.textContent = 'Waiting for ' + player + '...';
  }
  else {
    currentDiv.innerHTML = '';
  }
});

socket.on('showMove', () => {
  moveDiv.hidden = false;
  sayInput.value = '';
  playInput.value = '';
});

socket.on('hideMove', () => {
  moveDiv.hidden = true;
});

socket.on('showBluff', () => {
  if (!spectateInput.checked) {
    bluffButton.hidden = false;
  }
});

socket.on('hideBluff', () => {
  bluffButton.hidden = true;
});

const gameName = () => gameInput.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2);
startButton.onclick = () => {
  socket.emit('joinGame', {
    gameName: gameName(),
    playerName: nameInput.value.replace(/\W/g, ''),
    spectate: spectateInput.checked
  });
};

playInput.onchange = () => {
  playInput.value = playInput.value.toUpperCase();
}

moveButton.onclick = () => {
  errorMsg.innerHTML = "";
  socket.emit('move', {say: sayInput.value.replace(/\s/g, '').toUpperCase(),
                       play: playInput.value.replace(/\s/g, '').toUpperCase()});
};

bluffButton.onclick = () => { socket.emit('bluff'); };

socket.on('rejoinGame', (name, spectating) => {
  gameInput.disabled = true;
  nameInput.disabled = true;
  nameInput.value = name;
  spectateInput.disabled = true;
  spectateInput.checked = spectating;
  startButton.remove();
  errorMsg.innerHTML = "";
});

socket.on('joinGame', data => {
  gameInput.value = data.gameName;
  nameInput.value = data.playerName;
  gameInput.disabled = true;
  nameInput.disabled = true;
  spectateInput.disabled = true;
  startButton.value = "Start!";
  startButton.onclick = () => { socket.emit('startGame'); };
  errorMsg.innerHTML = "";
});

socket.on('startGame', () => {
  startButton.remove();
  errorMsg.innerHTML = "";
});

socket.on('appendLog', markup => {
  const li = document.createElement('li');
  li.innerHTML = markup;
  log.appendChild(li);
  li.scrollIntoView(false);
  errorMsg.innerHTML = "";
});

socket.on('errorMsg', msg => {
  errorMsg.innerHTML = msg;
});
