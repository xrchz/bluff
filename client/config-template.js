const ServerPort = name => 12345
const ServerURI = name => `http://localhost:${ServerPort(name)}`
const SocketOptions = name => ({})
/*
const ServerPort = name => `/run/games/${name}.socket`
const ServerURI = name => 'https://xrchz.net'
const SocketOptions = name => ({path: `/games/${name}/socket.io`})
*/
if (typeof exports !== 'undefined') {
  exports.ServerPort = ServerPort
}
