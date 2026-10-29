// Crowd reports: police, crashes, hazards, jams and closures that drivers post
// from the road. Stored in SQLite (node:sqlite, built into Node 22.13+). Each
// device can vote once per report, a report expires on its own, and a report
// that enough drivers dismiss is hidden. Posting is rate limited per device so
// one phone cannot flood the map.

const { DatabaseSync } = require('node:sqlite');

const TYPES = ['police', 'crash', 'hazard', 'jam', 'closed'];
const TTL_MS = 30 * 60 * 1000;
const HIDE_AFTER_DISMISSES = 2;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

function createReportStore(options) {
  const db = new DatabaseSync(options.path || ':memory:');
  const now = options.now || (() => Date.now());

  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      confirms INTEGER NOT NULL DEFAULT 0,
      dismisses INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS votes (
      report_id INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      vote TEXT NOT NULL,
      PRIMARY KEY (report_id, device_id)
    );
    CREATE TABLE IF NOT EXISTS post_log (
      device_id TEXT NOT NULL,
      at INTEGER NOT NULL
    );
  `);

  const insert = db.prepare(
    'INSERT INTO reports (type, lat, lng, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  );
  const selectOne = db.prepare('SELECT * FROM reports WHERE id = ?');
  const selectVisibleInBounds = db.prepare(`
    SELECT * FROM reports
    WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
      AND expires_at > ? AND dismisses < ?
  `);
  const insertVote = db.prepare('INSERT INTO votes (report_id, device_id, vote) VALUES (?, ?, ?)');
  const bumpConfirms = db.prepare('UPDATE reports SET confirms = confirms + 1 WHERE id = ?');
  const bumpDismisses = db.prepare('UPDATE reports SET dismisses = dismisses + 1 WHERE id = ?');
  const logPost = db.prepare('INSERT INTO post_log (device_id, at) VALUES (?, ?)');
  const countRecentPosts = db.prepare('SELECT COUNT(*) AS n FROM post_log WHERE device_id = ? AND at > ?');
  const prunePosts = db.prepare('DELETE FROM post_log WHERE at <= ?');
  const pruneExpired = db.prepare('DELETE FROM reports WHERE expires_at <= ?');

  function toReport(row) {
    return {
      id: row.id,
      type: row.type,
      lat: row.lat,
      lng: row.lng,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      confirms: row.confirms,
      dismisses: row.dismisses,
    };
  }

  function requireDevice(deviceId) {
    if (typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 64) {
      throw new Error('device id is required');
    }
  }

  function create({ type, lat, lng, reporterId }) {
    if (!TYPES.includes(type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('lat and lng must be numbers');
    requireDevice(reporterId);

    const t = now();
    prunePosts.run(t - RATE_WINDOW_MS);
    const recent = countRecentPosts.get(reporterId, t - RATE_WINDOW_MS).n;
    if (recent >= RATE_MAX) throw new Error('too many reports, try again in a few minutes');
    logPost.run(reporterId, t);

    const info = insert.run(type, lat, lng, t, t + TTL_MS);
    return toReport(selectOne.get(Number(info.lastInsertRowid)));
  }

  // Confirm and dismiss share one rule: a device votes once per report.
  function vote(id, deviceId, kind) {
    requireDevice(deviceId);
    const row = selectOne.get(id);
    if (!row || row.expires_at <= now()) throw new Error('report not found');
    try {
      insertVote.run(id, deviceId, kind);
    } catch (err) {
      throw new Error('you have already voted on this report');
    }
    if (kind === 'confirm') bumpConfirms.run(id);
    else bumpDismisses.run(id);
    return toReport(selectOne.get(id));
  }

  function confirm(id, deviceId) {
    return vote(id, deviceId, 'confirm');
  }

  function dismiss(id, deviceId) {
    return vote(id, deviceId, 'dismiss');
  }

  // Reports whose point is inside the box and that are still visible.
  function inBounds({ south, west, north, east }) {
    return selectVisibleInBounds
      .all(south, north, west, east, now(), HIDE_AFTER_DISMISSES)
      .map(toReport);
  }

  function expire() {
    return pruneExpired.run(now()).changes;
  }

  return { create, confirm, dismiss, inBounds, expire, TYPES };
}

module.exports = { createReportStore, TYPES, TTL_MS, HIDE_AFTER_DISMISSES, RATE_MAX, RATE_WINDOW_MS };
