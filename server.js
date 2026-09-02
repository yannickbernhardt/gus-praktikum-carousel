/*
 * @fos.gus.praktikum – Instagram-Carousel mit gemeinsamer Kommentarspalte
 *
 * Kein npm-Paket nötig: nur Node-Standardbibliothek.
 * Kommentare liegen im Arbeitsspeicher und – falls DATA_DIR gesetzt ist –
 * zusätzlich als JSON-Datei, damit sie einen Neustart überleben.
 */
'use strict';

var http = require('http');
var fs   = require('fs');
var path = require('path');

var PORT         = process.env.PORT || 3000;
var DATA_DIR     = process.env.DATA_DIR || '';
var LEHRER_TOKEN = process.env.LEHRER_TOKEN || '';
var PUBLIC_DIR   = path.join(__dirname, 'public');
var DATA_FILE    = DATA_DIR ? path.join(DATA_DIR, 'kommentare.json') : '';

var MAX_TEXT    = 280;
var MAX_NAME    = 24;
var MAX_TOTAL     = 400;   // Obergrenze für die ganze Klasse
var MAX_PRO_GERAET = 10;   // Obergrenze pro Gerät
var MIN_ABSTAND    = 2000; // ms zwischen zwei Beiträgen desselben Geräts

/* Bewusst pro Gerät (clientId), nicht pro IP: im Schul-WLAN teilen sich
   alle Schüler*innen dieselbe öffentliche IP. */

var comments = [];
var seq = 0;
var lastPost = Object.create(null);

/* ---------- Speicher ---------- */
function load() {
  if (!DATA_FILE) return;
  try {
    var parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(parsed)) {
      comments = parsed;
      parsed.forEach(function (c) {
        var n = parseInt(String(c.id).split('-')[1], 10);
        if (n > seq) seq = n;
      });
      console.log('Kommentare geladen:', comments.length);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Laden fehlgeschlagen:', e.message);
  }
}

var saveTimer = null;
function save() {
  if (!DATA_FILE) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(comments), 'utf8');
    } catch (e) {
      console.error('Speichern fehlgeschlagen:', e.message);
    }
  }, 250);
}

/* ---------- Helfer ---------- */
function clean(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function readBody(req, cb) {
  var buf = '';
  var tooBig = false;
  req.on('data', function (d) {
    buf += d;
    if (buf.length > 8192) { tooBig = true; req.destroy(); }
  });
  req.on('end', function () {
    if (tooBig) return cb(new Error('zu gross'));
    try { cb(null, buf ? JSON.parse(buf) : {}); }
    catch (e) { cb(e); }
  });
  req.on('error', function (e) { cb(e); });
}

function isLehrer(url) {
  if (!LEHRER_TOKEN) return false;
  return url.searchParams.get('lehrer') === LEHRER_TOKEN;
}

/* öffentliche Sicht: die clientId nie nach außen geben,
   stattdessen nur die Info, ob der Beitrag dem Fragenden gehört */
function publicView(c, fragenderId) {
  return {
    id: c.id,
    user: c.user,
    text: c.text,
    ts: c.ts,
    mine: !!fragenderId && c.clientId === fragenderId
  };
}

/* ---------- Statische Dateien ---------- */
var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

function serveStatic(req, res, pathname) {
  var rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  var file = path.join(PUBLIC_DIR, rel);
  if (path.relative(PUBLIC_DIR, file).startsWith('..')) {
    res.writeHead(403);
    return res.end('Verboten');
  }
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nicht gefunden');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

/* ---------- Server ---------- */
var server = http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  var pathname = url.pathname;

  /* Kommentare lesen */
  if (pathname === '/api/comments' && req.method === 'GET') {
    var fragenderId = clean(url.searchParams.get('clientId'), 64);
    return json(res, 200, {
      comments: comments.map(function (c) { return publicView(c, fragenderId); }),
      lehrer: isLehrer(url)
    });
  }

  /* Kommentar schreiben */
  if (pathname === '/api/comments' && req.method === 'POST') {
    return readBody(req, function (err, body) {
      if (err) return json(res, 400, { error: 'Konnte den Beitrag nicht lesen.' });

      var text = clean(body.text, MAX_TEXT);
      var user = clean(body.user, MAX_NAME) || 'anonym';
      var clientId = clean(body.clientId, 64);

      if (!text) return json(res, 400, { error: 'Der Kommentar ist leer.' });
      if (comments.length >= MAX_TOTAL) return json(res, 429, { error: 'Die Kommentarspalte ist voll.' });

      var schluessel = clientId || 'ohne-kennung';
      var now = Date.now();
      if (lastPost[schluessel] && now - lastPost[schluessel] < MIN_ABSTAND) {
        return json(res, 429, { error: 'Einen Moment noch.' });
      }
      var eigene = comments.filter(function (c) { return c.clientId === schluessel; }).length;
      if (eigene >= MAX_PRO_GERAET) {
        return json(res, 429, { error: 'Du hast schon ' + MAX_PRO_GERAET + ' Kommentare geschrieben.' });
      }
      lastPost[schluessel] = now;

      seq++;
      var c = { id: now + '-' + seq, user: user, text: text, ts: now, clientId: schluessel };
      comments.push(c);
      save();
      return json(res, 201, { comment: publicView(c, clientId) });
    });
  }

  /* Einzelnen Kommentar löschen */
  var m = pathname.match(/^\/api\/comments\/([\w.-]+)$/);
  if (m && req.method === 'DELETE') {
    var idx = comments.findIndex(function (c) { return c.id === m[1]; });
    if (idx === -1) return json(res, 404, { error: 'Nicht gefunden.' });

    var darf = isLehrer(url);
    var cid = clean(url.searchParams.get('clientId'), 64);
    if (!darf && cid && comments[idx].clientId === cid) darf = true;
    if (!darf) return json(res, 403, { error: 'Das darfst du nicht löschen.' });

    comments.splice(idx, 1);
    save();
    return json(res, 200, { ok: true });
  }

  /* Alles zurücksetzen – nur mit Lehrer-Link */
  if (pathname === '/api/comments' && req.method === 'DELETE') {
    if (!isLehrer(url)) return json(res, 403, { error: 'Nur mit Lehrer-Link.' });
    comments = [];
    save();
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end('Nicht erlaubt');
  }
  return serveStatic(req, res, pathname);
});

load();
server.listen(PORT, function () {
  console.log('Laeuft auf Port ' + PORT);
  console.log('Lehrer-Moderation: ' + (LEHRER_TOKEN ? 'aktiv (?lehrer=...)' : 'aus (LEHRER_TOKEN nicht gesetzt)'));
  console.log('Speicher: ' + (DATA_FILE || 'nur Arbeitsspeicher'));
});
