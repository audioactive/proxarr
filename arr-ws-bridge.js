'use strict';
// arr-ws-bridge.js – WebSocket → SSH Bridge
// Auf Proxmox ausführen: node arr-ws-bridge.js
// Installation:          npm install ws ssh2

const { WebSocketServer } = require('ws');
const { Client }          = require('ssh2');

const WS_PORT  = 2222;
const SSH_HOST = '127.0.0.1';
const SSH_PORT = 22;
const SSH_USER = 'root';

const wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
console.log('WS-Bridge laeuft auf ws://127.0.0.1:' + WS_PORT);
console.log('SSH-Ziel: ' + SSH_USER + '@' + SSH_HOST + ':' + SSH_PORT);

wss.on('connection', function(ws) {
  var conn = new Client();

  conn.on('ready', function() {
    ws.send(JSON.stringify({ type: 'status', msg: 'ssh_connected' }));

    ws.on('message', function(raw) {
      var data;
      try { data = JSON.parse(raw); } catch(e) { return; }
      if (!data.cmd) return;

      conn.exec(data.cmd, function(err, stream) {
        if (err) {
          ws.send(JSON.stringify({ type: 'stderr', data: err.message }));
          ws.send(JSON.stringify({ type: 'done', code: 1 }));
          return;
        }
        stream.on('data', function(d) {
          ws.send(JSON.stringify({ type: 'stdout', data: d.toString() }));
        });
        stream.stderr.on('data', function(d) {
          ws.send(JSON.stringify({ type: 'stderr', data: d.toString() }));
        });
        stream.on('close', function(code) {
          ws.send(JSON.stringify({ type: 'done', code: code }));
        });
      });
    });
  });

  conn.on('error', function(e) {
    ws.send(JSON.stringify({ type: 'error', msg: e.message }));
  });

  conn.connect({
    host:       SSH_HOST,
    port:       SSH_PORT,
    username:   SSH_USER,
    privateKey: require('fs').readFileSync('/root/.ssh/id_rsa'),
  });

  ws.on('close', function() { conn.end(); });
});
