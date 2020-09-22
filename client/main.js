var socket = io("https://xrchz.net:1909");

const pileDiv = document.getElementById('pile');
const handDiv = document.getElementById('hand');
const moveDiv = document.getElementById('move');
const currentDiv = document.getElementById('current');
const startButton = document.getElementById('start');
const moveButton = document.getElementById('submit');
const passButton = document.getElementById('pass');
const bluffButton = document.getElementById('bluff');
const sayInput = document.getElementById('say');
const sayControl = document.getElementById('sayControl');
const playInput = document.getElementById('play');
const playerList = document.getElementById('players');
const gameInput = document.getElementById('game');
const nameInput = document.getElementById('name');
const gameSettings = document.getElementById('gameSettings');
const noiseInput = document.getElementById('noise');
const noiseOutput = noiseInput.nextSibling;
const jokersInput = document.getElementById('jokers');
const jokersOutput = jokersInput.nextSibling;
const decksInput = document.getElementById('decks');
const decksOutput = decksInput.nextSibling;
const sameLabel = document.getElementById('=');
const sameInput = sameLabel.lastChild;
const upLabel = document.getElementById('+1');
const upInput = upLabel.lastChild;
const downLabel = document.getElementById('-1');
const downInput = downLabel.lastChild;
const anyLabel = document.getElementById('any');
const anyInput = anyLabel.lastChild;
const wrapLabel = document.getElementById('wrap');
const wrapInput = wrapLabel.lastChild;
const spectateInput = document.getElementById('spectate');
const errorMsg = document.getElementById('errorMsg');
const log = document.getElementById('log');
const showHideSettings = document.getElementById('showHideSettings');

showHideSettings.onclick = () => {
  if (gameSettings.hidden) {
    gameSettings.hidden = false;
    showHideSettings.textContent = "less";
  }
  else {
    gameSettings.hidden = true;
    showHideSettings.textContent = "more";
  }
};

noiseInput.oninput = () => { noiseOutput.textContent = noiseInput.value; };
noiseInput.value = 2;
noiseInput.oninput();

jokersInput.oninput = () => { jokersOutput.textContent = jokersInput.value; };
jokersInput.value = 2;
jokersInput.oninput();

decksInput.oninput = () => {
  decksOutput.textContent = decksInput.value + ` (${decksInput.value * 4} card${decksInput.value > 0.25 ? 's' : ''} per rank)`;
};
decksInput.value = 1;
decksInput.oninput();

function checkboxConsistency() {
  if (!upInput.checked) { anyInput.checked = false; }
  if (!downInput.checked) { anyInput.checked = false; }
  if (!sameInput.checked) { anyInput.checked = false; }
  if (!wrapInput.checked) { anyInput.checked = false; }
  if (upInput.checked || downInput.checked) { wrapLabel.hidden = false; }
  if (!upInput.checked && !downInput.checked) { wrapLabel.hidden = true; }
  if (!sameInput.checked && upInput.checked != downInput.checked) { wrapInput.checked = true; }
  if (!sameInput.checked && !upInput.checked && !downInput.checked && !anyInput.checked) {
    sameInput.checked = true;
    upInput.checked = true;
    downInput.checked = true;
    checkboxConsistency();
  }
};

anyInput.onchange = () => {
  if (anyInput.checked) {
    upInput.checked = true;
    downInput.checked = true;
    sameInput.checked = true;
    wrapInput.checked = true;
  }
  checkboxConsistency();
};

upInput.onchange = checkboxConsistency;

downInput.onchange = checkboxConsistency;

sameInput.onchange = checkboxConsistency;

wrapInput.onchange = checkboxConsistency;

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
  elem.textContent = '⇦';
  elem.onclick = () => { playInput.value = sayInput.value; };
  sayControl.appendChild(elem);
  elem = document.createElement('a');
  elem.textContent = '⇨';
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
  sayInput.pattern = `([${cards}])\\1*`;
}

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

socket.on('showMove', cards => {
  if (moveDiv.hidden) {
    moveDiv.hidden = false;
    sayInput.value = '';
    playInput.value = '';
  }
  makeSayControl(cards);
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
  socket.emit('joinRequest', {
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

passButton.onclick = () => {
  errorMsg.innerHTML = "";
  socket.emit('move', false);
};

bluffButton.onclick = () => { socket.emit('bluff'); };

function disableSettings() {
  sameInput.disabled = true;
  upInput.disabled = true;
  downInput.disabled = true;
  anyInput.disabled = true;
  wrapInput.disabled = true;
  noiseInput.disabled = true;
  decksInput.disabled = true;
  jokersInput.disabled = true;
};

function receiveSettings(data) {
  sameInput.checked = data.allowSame;
  upInput.checked = data.allowUp;
  downInput.checked = data.allowDown;
  anyInput.checked = data.allowAny;
  wrapInput.checked = data.wrap;
  noiseInput.value = data.noise; noiseInput.oninput();
  decksInput.value = data.decks; decksInput.oninput();
  jokersInput.value = data.jokers; jokersInput.oninput();
}

socket.on('rejoinGame', (playerName, spectating, data) => {
  nameInput.value = playerName;
  spectateInput.checked = spectating;
  receiveSettings(data);
  gameInput.disabled = true;
  nameInput.disabled = true;
  spectateInput.disabled = true;
  disableSettings();
  startButton.remove();
  gameSettings.hidden = true;
  showHideSettings.onclick();
  errorMsg.innerHTML = "";
});

function settingsData() {
  return {
    allowSame: sameInput.checked,
    allowUp: upInput.checked,
    allowDown: downInput.checked,
    allowAny: anyInput.checked,
    wrap: wrapInput.checked,
    noise: noiseInput.value,
    decks: decksInput.value,
    jokers: jokersInput.value}
};

socket.on('joinGame', data => {
  gameInput.value = data.gameName;
  nameInput.value = data.playerName;
  gameInput.disabled = true;
  nameInput.disabled = true;
  spectateInput.disabled = true;
  showHideSettings.hidden = false;
  gameSettings.hidden = false; // will be flipped
  if (!spectateInput.checked) {
    gameSettings.hidden = true;
    startButton.value = "Start!";
    startButton.onclick = () => {
      socket.emit('startGame', settingsData());
    };
  }
  else {
    startButton.hidden = true;
  }
  showHideSettings.onclick();
  errorMsg.innerHTML = "";
});

socket.on('gameStarted', data => {
  startButton.remove();
  receiveSettings(data);
  disableSettings();
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
