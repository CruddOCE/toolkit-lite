'use strict';

// Stratum v1 client. Plain TCP with newline-delimited JSON, not WebSocket and
// not HTTP, which is the first thing people get wrong about the protocol.
//
// Reconnects with backoff rather than exiting, because a link that drops for a
// few seconds is normal here and should not end an overnight run.

const net = require('net');
const EventEmitter = require('events');

const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 60000;

function createClient(options) {
  const emitter = new EventEmitter();

  let socket = null;
  let buffer = '';
  let nextId = 1;
  let pending = new Map();
  let reconnectDelay = RECONNECT_MIN_MS;
  let reconnectTimer = null;
  let stopped = false;

  let extranonce1 = null;
  let extranonce2Size = 4;
  let difficulty = 1;

  function send(method, params) {
    if (!socket || socket.destroyed) return null;
    const id = nextId;
    nextId += 1;
    socket.write(JSON.stringify({ id: id, method: method, params: params }) + '\n');
    return id;
  }

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      const id = send(method, params);
      if (id === null) {
        reject(new Error('not connected'));
        return;
      }
      pending.set(id, { resolve: resolve, reject: reject });
      setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(method + ' timed out'));
        }
      }, 30000);
    });
  }

  function handleMessage(msg) {
    if (msg.id !== undefined && msg.id !== null && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
      return;
    }

    if (msg.method === 'mining.set_difficulty') {
      difficulty = Array.isArray(msg.params) ? msg.params[0] : difficulty;
      emitter.emit('difficulty', difficulty);
      return;
    }

    if (msg.method === 'mining.notify') {
      const p = msg.params || [];
      emitter.emit('job', {
        jobId: p[0],
        prevhash: p[1],
        coinb1: p[2],
        coinb2: p[3],
        merkleBranch: p[4] || [],
        version: p[5],
        nbits: p[6],
        ntime: p[7],
        cleanJobs: Boolean(p[8]),
        extranonce1: extranonce1,
        extranonce2Size: extranonce2Size,
        difficulty: difficulty,
      });
      return;
    }

    if (msg.method === 'client.reconnect') {
      emitter.emit('log', 'pool asked us to reconnect');
      if (socket) socket.destroy();
    }
  }

  function onData(chunk) {
    buffer += chunk;
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          handleMessage(JSON.parse(line));
        } catch (err) {
          emitter.emit('log', 'unparseable line from pool: ' + line.slice(0, 120));
        }
      }
      index = buffer.indexOf('\n');
    }
  }

  async function handshake() {
    const subscribed = await call('mining.subscribe', ['lottery-miner/0.1']);
    // Response shape is [subscriptions, extranonce1, extranonce2_size]. The
    // subscriptions array is ignored; nothing here needs the subscription ids.
    extranonce1 = subscribed[1];
    extranonce2Size = subscribed[2];
    emitter.emit(
      'log',
      'subscribed, extranonce1=' + extranonce1 + ' extranonce2 size=' + extranonce2Size
    );

    const username = options.address + '.' + options.workerName;
    const authorized = await call('mining.authorize', [username, 'x']);
    if (authorized !== true) {
      throw new Error('pool refused to authorize ' + username);
    }
    emitter.emit('log', 'authorized as ' + username);

    // ckpool opens at difficulty 10000, which at this hashrate is one share
    // every twelve hours and a dashboard that looks broken. Asking for less
    // makes the miner visibly alive without changing the odds at all: a share is
    // a statistic, and only the network target pays. Sent after authorize
    // because a pool will generally ignore it before. Fire and forget, since a
    // pool that does not implement it just answers with an error we discard.
    if (options.suggestDifficulty > 0) {
      send('mining.suggest_difficulty', [options.suggestDifficulty]);
      emitter.emit('log', 'asked pool for difficulty ' + options.suggestDifficulty);
    }

    emitter.emit('ready', { extranonce1: extranonce1, extranonce2Size: extranonce2Size });
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    emitter.emit('log', 'reconnecting in ' + Math.round(reconnectDelay / 1000) + 's');
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
  }

  function connect() {
    if (stopped) return;
    buffer = '';
    pending = new Map();

    socket = net.connect({ host: options.host, port: options.port }, function () {
      emitter.emit('log', 'connected to ' + options.host + ':' + options.port);
      emitter.emit('connected');
      reconnectDelay = RECONNECT_MIN_MS;
      handshake().catch(function (err) {
        emitter.emit('log', 'handshake failed: ' + err.message);
        if (socket) socket.destroy();
      });
    });

    socket.setEncoding('utf8');
    socket.setKeepAlive(true, 30000);
    socket.on('data', onData);
    socket.on('error', function (err) {
      emitter.emit('log', 'socket error: ' + err.message);
    });
    socket.on('close', function () {
      emitter.emit('disconnected');
      scheduleReconnect();
    });
  }

  // ntime and the nonce go up as big-endian hex, which is the reverse of how
  // they sit in the header. extranonce2 goes up exactly as it went into the
  // coinbase. See job.js for why.
  async function submit(share) {
    const nonceHex = (share.nonce >>> 0).toString(16).padStart(8, '0');
    return call('mining.submit', [
      options.address + '.' + options.workerName,
      share.jobId,
      share.extranonce2Hex,
      share.ntime,
      nonceHex,
    ]);
  }

  function start() {
    stopped = false;
    connect();
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket) socket.destroy();
  }

  emitter.start = start;
  emitter.stop = stop;
  emitter.submit = submit;
  emitter.getDifficulty = function () { return difficulty; };
  return emitter;
}

module.exports = { createClient };
