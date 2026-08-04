'use strict';

// The link between this process and the browser page doing the GPU hashing.
//
// The same WebSocket serves the dashboard, so a socket declares a role when it
// connects. A miner socket gets work units and reports rates and hits back; a
// dashboard socket only receives stats. One page can be both, which is what
// public/index.html is.
//
// Nothing that arrives here is trusted. A claimed hit is re-hashed in work.js
// before it goes anywhere near the pool.

const { WebSocketServer } = require('ws');

function createBridge(options) {
  let wss = null;
  const clients = new Set();
  let paused = false;

  function send(socket, payload) {
    if (socket.readyState === 1) socket.send(JSON.stringify(payload));
  }

  function broadcast(payload) {
    clients.forEach(function (client) { send(client.socket, payload); });
  }

  function sendUnit(client) {
    if (!client.isMiner || paused) return;
    const unit = options.nextUnit();
    if (!unit) {
      setTimeout(function () {
        if (clients.has(client)) sendUnit(client);
      }, 500);
      return;
    }
    send(client.socket, { type: 'unit', unit: unit });
  }

  function handleMessage(client, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return;
    }

    if (msg.type === 'hello') {
      client.isMiner = msg.role === 'miner';
      client.adapter = typeof msg.adapter === 'string' ? msg.adapter.slice(0, 120) : null;
      if (client.isMiner) {
        options.onLog('gpu miner connected: ' + (client.adapter || 'unknown adapter'));
        sendUnit(client);
      }
      return;
    }

    if (!client.isMiner) return;

    if (msg.type === 'rate') {
      options.onRate(Number(msg.hashes) || 0, Number(msg.ms) || 0);
      return;
    }

    if (msg.type === 'hit') {
      options.onHit(msg.unit, Number(msg.nonce) >>> 0);
      return;
    }

    if (msg.type === 'need-unit') {
      sendUnit(client);
      return;
    }

    if (msg.type === 'error') {
      options.onLog('gpu page reported: ' + String(msg.message).slice(0, 200));
    }
  }

  function start(server) {
    wss = new WebSocketServer({ server: server });
    wss.on('connection', function (socket) {
      const client = { socket: socket, isMiner: false, adapter: null };
      clients.add(client);
      send(socket, { type: 'paused', paused: paused });
      socket.on('message', function (raw) { handleMessage(client, raw); });
      socket.on('close', function () {
        clients.delete(client);
        if (client.isMiner) options.onLog('gpu miner disconnected');
      });
      socket.on('error', function () { clients.delete(client); });
    });
  }

  // A new job means every miner should be pulled onto it now rather than after
  // it finishes the range it is on.
  function refresh() {
    clients.forEach(function (client) {
      if (client.isMiner) sendUnit(client);
    });
  }

  function setPaused(next) {
    if (paused === next) return;
    paused = next;
    broadcast({ type: 'paused', paused: paused });
    if (!paused) refresh();
  }

  function getMinerCount() {
    let count = 0;
    clients.forEach(function (c) { if (c.isMiner) count += 1; });
    return count;
  }

  function getAdapter() {
    let name = null;
    clients.forEach(function (c) { if (c.isMiner && c.adapter) name = c.adapter; });
    return name;
  }

  return {
    start: start,
    refresh: refresh,
    setPaused: setPaused,
    broadcast: broadcast,
    getMinerCount: getMinerCount,
    getAdapter: getAdapter,
  };
}

module.exports = { createBridge };
