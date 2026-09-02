/*
 * @fos.gus.praktikum – Instagram-Carousel mit gemeinsamer Kommentarspalte
 *
 * Läuft auf Deno Deploy. Die Kommentare liegen in Deno KV und überleben
 * damit auch einen Neustart oder ein neues Deployment.
 */

const LEHRER_TOKEN = Deno.env.get("LEHRER_TOKEN") ?? "";

const MAX_TEXT = 280;
const MAX_NAME = 24;
const MAX_TOTAL = 400; // Obergrenze für die ganze Klasse
const MAX_PRO_GERAET = 10; // Obergrenze pro Gerät
const MIN_ABSTAND = 2000; // ms zwischen zwei Beiträgen desselben Geräts

/* Bewusst pro Gerät (clientId), nicht pro IP: im Schul-WLAN teilen sich
   alle Schüler*innen dieselbe öffentliche IP. */

type Kommentar = {
  id: string;
  user: string;
  text: string;
  ts: number;
  clientId: string;
};

const kv = await Deno.openKv();

/* ---------- Helfer ---------- */
function clean(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function istLehrer(url: URL): boolean {
  if (!LEHRER_TOKEN) return false;
  return url.searchParams.get("lehrer") === LEHRER_TOKEN;
}

/* öffentliche Sicht: die clientId nie nach außen geben, stattdessen nur
   die Info, ob der Beitrag dem Fragenden gehört */
function publicView(c: Kommentar, fragenderId: string) {
  return {
    id: c.id,
    user: c.user,
    text: c.text,
    ts: c.ts,
    mine: !!fragenderId && c.clientId === fragenderId,
  };
}

async function alleKommentare(): Promise<Kommentar[]> {
  const liste: Kommentar[] = [];
  for await (const e of kv.list<Kommentar>({ prefix: ["comments"] })) {
    if (e.value) liste.push(e.value);
  }
  liste.sort((a, b) => a.ts - b.ts);
  return liste;
}

/* ---------- Statische Dateien ---------- */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function statisch(pathname: string): Promise<Response> {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (rel.includes("..")) return new Response("Verboten", { status: 403 });

  const endung = rel.slice(rel.lastIndexOf("."));
  try {
    const datei = await Deno.readFile(new URL(`./public/${rel}`, import.meta.url));
    return new Response(datei, {
      headers: {
        "content-type": TYPES[endung] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response("Nicht gefunden", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

/* ---------- Server ---------- */
/* Auf Deno Deploy wird der Port vorgegeben; lokal ist PORT nützlich. */
const PORT = Number(Deno.env.get("PORT") ?? 8000);

Deno.serve({ port: PORT }, async (req: Request) => {
  const url = new URL(req.url);
  const pfad = url.pathname;

  /* Kommentare lesen */
  if (pfad === "/api/comments" && req.method === "GET") {
    const fragenderId = clean(url.searchParams.get("clientId"), 64);
    const liste = await alleKommentare();
    return json({
      comments: liste.map((c) => publicView(c, fragenderId)),
      lehrer: istLehrer(url),
    });
  }

  /* Kommentar schreiben */
  if (pfad === "/api/comments" && req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Konnte den Beitrag nicht lesen." }, 400);
    }

    const text = clean(body.text, MAX_TEXT);
    const user = clean(body.user, MAX_NAME) || "anonym";
    const clientId = clean(body.clientId, 64) || "ohne-kennung";

    if (!text) return json({ error: "Der Kommentar ist leer." }, 400);

    /* Bremse pro Gerät. Der Zeitstempel wird selbst verglichen – auf das
       Ablaufen per expireIn ist kein Verlass, das räumt der lokale
       KV-Speicher nur träge auf. expireIn hält den Speicher trotzdem sauber. */
    const bremse = await kv.get<number>(["lastpost", clientId]);
    if (bremse.value && Date.now() - bremse.value < MIN_ABSTAND) {
      return json({ error: "Einen Moment noch." }, 429);
    }

    const liste = await alleKommentare();
    if (liste.length >= MAX_TOTAL) {
      return json({ error: "Die Kommentarspalte ist voll." }, 429);
    }
    const eigene = liste.filter((c) => c.clientId === clientId).length;
    if (eigene >= MAX_PRO_GERAET) {
      return json(
        { error: `Du hast schon ${MAX_PRO_GERAET} Kommentare geschrieben.` },
        429,
      );
    }

    await kv.set(["lastpost", clientId], Date.now(), { expireIn: MIN_ABSTAND * 30 });

    const ts = Date.now();
    const c: Kommentar = {
      id: `${ts}-${crypto.randomUUID().slice(0, 8)}`,
      user,
      text,
      ts,
      clientId,
    };
    await kv.set(["comments", c.id], c);
    return json({ comment: publicView(c, clientId) }, 201);
  }

  /* Einzelnen Kommentar löschen */
  const treffer = pfad.match(/^\/api\/comments\/([\w.-]+)$/);
  if (treffer && req.method === "DELETE") {
    const id = treffer[1];
    const eintrag = await kv.get<Kommentar>(["comments", id]);
    if (!eintrag.value) return json({ error: "Nicht gefunden." }, 404);

    let darf = istLehrer(url);
    const cid = clean(url.searchParams.get("clientId"), 64);
    if (!darf && cid && eintrag.value.clientId === cid) darf = true;
    if (!darf) return json({ error: "Das darfst du nicht löschen." }, 403);

    await kv.delete(["comments", id]);
    return json({ ok: true });
  }

  /* Alles zurücksetzen – nur mit Lehrer-Link */
  if (pfad === "/api/comments" && req.method === "DELETE") {
    if (!istLehrer(url)) return json({ error: "Nur mit Lehrer-Link." }, 403);
    for await (const e of kv.list({ prefix: ["comments"] })) {
      await kv.delete(e.key);
    }
    return json({ ok: true });
  }

  if (req.method !== "GET") {
    return new Response("Nicht erlaubt", { status: 405 });
  }
  return await statisch(pfad);
});
