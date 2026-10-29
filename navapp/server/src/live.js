// Live report updates. Phones keep one WebSocket open on /live and receive each
// new or changed report as it happens, so a report posted on one phone shows up
// on the others without a refresh. Nothing is sent back over this channel.

const { WebSocketServer } = require('ws');

function attachLive(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/live' });

  function broadcast(report) {
    const message = JSON.stringify({ type: 'report', report });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(message);
    }
  }

  return { broadcast, close: () => wss.close() };
}

module.exports = { attachLive };
