const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || "development";
const SESSION_TTL_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const MAX_BODY_BYTES = 100 * 1024;
const ROOT_DIR = __dirname;
const STORE_PATH = path.join(ROOT_DIR, "learning-log-store.json");
const DEFAULT_PATH = path.join(ROOT_DIR, "learning-log-default.json");
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const ADMIN_PASSWORD_RECORD = process.env.ADMIN_PASSWORD_RECORD || "";
const COOKIE_NAME = NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be set and at least 32 characters.");
}

if (!ADMIN_PASSWORD_RECORD) {
  throw new Error("ADMIN_PASSWORD_RECORD must be set.");
}

const sessions = new Map();
const loginAttempts = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon"
};

setInterval(cleanExpiredData, 60 * 1000).unref();

const server = http.createServer(async (req, res) => {
  try {
    applySecurityHeaders(res);
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api/learning-log" && req.method === "GET") {
      const entries = readJsonFile(STORE_PATH);
      return sendJson(res, 200, { entries });
    }

    if (pathname === "/api/admin/login" && req.method === "POST") {
      const ip = getIp(req);
      if (isRateLimited(ip)) {
        return sendJson(res, 429, { error: "Too many login attempts. Try again later." });
      }

      const body = await readJsonBody(req);
      const password = typeof body.password === "string" ? body.password : "";
      const ok = verifyPassword(password, ADMIN_PASSWORD_RECORD);
      recordLoginAttempt(ip, ok);
      if (!ok) {
        return sendJson(res, 401, { error: "Invalid credentials." });
      }

      const session = createSession(req);
      setSessionCookie(res, session.id);
      return sendJson(res, 200, { ok: true, csrfToken: session.csrfToken });
    }

    if (pathname === "/api/admin/logout" && req.method === "POST") {
      const session = requireSession(req);
      if (session) {
        sessions.delete(session.id);
      }
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/session" && req.method === "GET") {
      const session = requireSession(req);
      if (!session) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      session.data.expiresAt = Date.now() + SESSION_TTL_MS;
      return sendJson(res, 200, { ok: true, csrfToken: session.data.csrfToken });
    }

    if (pathname === "/api/admin/learning-log" && req.method === "PUT") {
      const session = requireSession(req);
      if (!session || !isValidCsrf(req, session.data.csrfToken)) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }

      const body = await readJsonBody(req);
      const entries = sanitizeEntries(body);
      if (!entries) {
        return sendJson(res, 400, { error: "Invalid learning log payload." });
      }

      writeJsonAtomic(STORE_PATH, entries);
      session.data.expiresAt = Date.now() + SESSION_TTL_MS;
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/learning-log/reset" && req.method === "POST") {
      const session = requireSession(req);
      if (!session || !isValidCsrf(req, session.data.csrfToken)) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      const defaults = readJsonFile(DEFAULT_PATH);
      writeJsonAtomic(STORE_PATH, defaults);
      session.data.expiresAt = Date.now() + SESSION_TTL_MS;
      return sendJson(res, 200, { ok: true, entries: defaults });
    }

    if (pathname === "/") {
      return sendStaticFile(res, "/index.html");
    }

    return sendStaticFile(res, pathname);
  } catch (error) {
    if (error && error.code === "PAYLOAD_TOO_LARGE") {
      return sendJson(res, 413, { error: "Payload too large." });
    }
    if (error && error.code === "BAD_JSON") {
      return sendJson(res, 400, { error: "Invalid JSON." });
    }
    return sendJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Secure portfolio server running at http://${HOST}:${PORT}\n`);
});

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  );
  if (NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}

function sendStaticFile(res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const requestedPath = path
    .normalize(decoded)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(ROOT_DIR, requestedPath);
  if (!filePath.startsWith(ROOT_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_error) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  if (stat.isDirectory()) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
}

function readJsonFile(filePath) {
  const value = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  if (!raw) {
    return {};
  }

  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) {
      return acc;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    acc[key] = value;
    return acc;
  }, {});
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = loginAttempts.get(ip) || [];
  const recent = timestamps.filter((ts) => now - ts <= LOGIN_WINDOW_MS);
  loginAttempts.set(ip, recent);
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginAttempt(ip, isSuccess) {
  if (isSuccess) {
    loginAttempts.delete(ip);
    return;
  }
  const now = Date.now();
  const timestamps = loginAttempts.get(ip) || [];
  timestamps.push(now);
  loginAttempts.set(
    ip,
    timestamps.filter((ts) => now - ts <= LOGIN_WINDOW_MS)
  );
}

function createSession(req) {
  const idRaw = crypto.randomBytes(32).toString("hex");
  const id = signToken(idRaw);
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const userAgent = String(req.headers["user-agent"] || "");
  const ip = getIp(req);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(id, { csrfToken, userAgent, ip, expiresAt });
  return { id, csrfToken };
}

function signToken(value) {
  const mac = crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
  return `${value}.${mac}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    return false;
  }
  const signed = signToken(parts[0]);
  return timingSafeEqualUtf8(token, signed);
}

function requireSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token || !verifyToken(token)) {
    return null;
  }

  const data = sessions.get(token);
  if (!data) {
    return null;
  }

  if (Date.now() > data.expiresAt) {
    sessions.delete(token);
    return null;
  }

  const userAgent = String(req.headers["user-agent"] || "");
  const ip = getIp(req);
  if (data.userAgent !== userAgent || data.ip !== ip) {
    sessions.delete(token);
    return null;
  }

  return { id: token, data };
}

function setSessionCookie(res, token) {
  const secure = NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (secure) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const parts = [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0"
  ];
  if (NODE_ENV === "production") {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function isValidCsrf(req, expectedToken) {
  const token = req.headers["x-csrf-token"];
  return typeof token === "string" && timingSafeEqualUtf8(token, expectedToken);
}

function verifyPassword(password, record) {
  const parts = String(record).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha512") {
    return false;
  }
  const iterations = Number(parts[1]);
  const saltHex = parts[2];
  const expectedHex = parts[3];
  if (!Number.isFinite(iterations) || iterations < 100000) {
    return false;
  }
  const derived = crypto.pbkdf2Sync(String(password), Buffer.from(saltHex, "hex"), iterations, 64, "sha512");
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

function timingSafeEqualUtf8(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(aa, bb);
}

function sanitizeEntries(raw) {
  if (!Array.isArray(raw) || raw.length > 120) {
    return null;
  }
  const next = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const month = cleanText(entry.month, 80);
    if (!month) {
      return null;
    }
    const books = sanitizeBooks(entry.books);
    const articles = sanitizeArticles(entry.articles);
    const learned = sanitizeStrings(entry.learned, 40, 600);
    const built = sanitizeStrings(entry.built, 40, 600);
    if (!books || !articles || !learned || !built) {
      return null;
    }
    next.push({ month, books, articles, learned, built });
  }
  return next;
}

function sanitizeBooks(raw) {
  if (!Array.isArray(raw) || raw.length > 40) {
    return null;
  }
  const books = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const title = cleanText(item.title, 200);
    const author = cleanText(item.author, 200);
    const note = cleanText(item.note, 600, true);
    if (!title || !author) {
      return null;
    }
    books.push({ title, author, note: note || "" });
  }
  return books;
}

function sanitizeArticles(raw) {
  if (!Array.isArray(raw) || raw.length > 60) {
    return null;
  }
  const articles = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const title = cleanText(item.title, 200);
    const url = cleanUrl(item.url);
    const note = cleanText(item.note, 600, true);
    if (!title || !url) {
      return null;
    }
    articles.push({ title, url, note: note || "" });
  }
  return articles;
}

function sanitizeStrings(raw, maxItems, maxLen) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    return null;
  }
  const result = [];
  for (const item of raw) {
    const cleaned = cleanText(item, maxLen);
    if (!cleaned) {
      return null;
    }
    result.push(cleaned);
  }
  return result;
}

function cleanText(value, maxLen, allowEmpty) {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned && !allowEmpty) {
    return null;
  }
  if (cleaned.length > maxLen) {
    return null;
  }
  return cleaned;
}

function cleanUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.toString();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("Payload too large");
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        const error = new Error("Invalid JSON");
        error.code = "BAD_JSON";
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function cleanExpiredData() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(sessionId);
    }
  }
  for (const [ip, timestamps] of loginAttempts.entries()) {
    const recent = timestamps.filter((ts) => now - ts <= LOGIN_WINDOW_MS);
    if (recent.length === 0) {
      loginAttempts.delete(ip);
    } else {
      loginAttempts.set(ip, recent);
    }
  }
}
