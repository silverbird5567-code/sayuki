const { Database } = require("bun:sqlite");
const path = require("path");
const crypto = require("crypto");
const { cleanHTML, generateToken } = require("./security.js");
const { plugins } = require("./chatAPI/plugins.js");

const DB_PATH = path.join(__dirname, "..", "data", "db.sqlite");
const db = new Database(DB_PATH, { create: true });

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

// ── Schema ───────────────────────────────────────────────────────────────────

db.run(`CREATE TABLE IF NOT EXISTS users (
    username      TEXT PRIMARY KEY,
    password      TEXT NOT NULL,
    token         TEXT NOT NULL DEFAULT '',
    token_issued  INTEGER NOT NULL DEFAULT 0,
    is_banned     INTEGER NOT NULL DEFAULT 0,
    banned_reason TEXT NOT NULL DEFAULT '',
    avatar        TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL DEFAULT 0,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_owner      INTEGER NOT NULL DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS prompts (
    name        TEXT PRIMARY KEY,
    creator     TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    prompt      TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS lorebooks (
    name        TEXT PRIMARY KEY,
    owner       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    data        TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
)`);

db.run(`CREATE TABLE IF NOT EXISTS master_keys (
    name          TEXT PRIMARY KEY,
    upstream_key  TEXT NOT NULL,
    url           TEXT NOT NULL,
    provider      TEXT NOT NULL DEFAULT '',
    owner         TEXT NOT NULL,
    limit_per_day INTEGER NOT NULL DEFAULT 0,
    models        TEXT NOT NULL DEFAULT '[]',
    code          TEXT NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS api_keys (
    token       TEXT PRIMARY KEY,
    owner       TEXT NOT NULL,
    master_key  TEXT NOT NULL,
    provider    TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT 0,
    usage_date  TEXT NOT NULL DEFAULT '',
    usage_count INTEGER NOT NULL DEFAULT 0,
    prompt_names TEXT NOT NULL DEFAULT '[]',
    lorebook_names TEXT NOT NULL DEFAULT '[]',
    plugin_names TEXT NOT NULL DEFAULT '[]'
)`);

// Add columns if they don't exist (for existing databases)
try {
    db.run(`ALTER TABLE api_keys ADD COLUMN prompt_names TEXT NOT NULL DEFAULT '[]'`);
} catch (e) {
    // Column might already exist, ignore error
}
try {
    db.run(`ALTER TABLE api_keys ADD COLUMN lorebook_names TEXT NOT NULL DEFAULT '[]'`);
} catch (e) {
    // Column might already exist, ignore error
}
try {
    db.run(`ALTER TABLE api_keys ADD COLUMN plugin_names TEXT NOT NULL DEFAULT '[]'`);
} catch (e) {
    // Column might already exist, ignore error
}

try {
    db.run(`ALTER TABLE master_keys ADD COLUMN context_windows TEXT NOT NULL DEFAULT '{}'`);
} catch (e) {}

try {
    db.run(`ALTER TABLE master_keys ADD COLUMN excluded_users TEXT NOT NULL DEFAULT '[]'`);
} catch (e) {}

try {
    db.run(`ALTER TABLE master_keys ADD COLUMN pool_mode INTEGER NOT NULL DEFAULT 0`);
} catch (e) {}

try {
    db.run(`ALTER TABLE master_keys ADD COLUMN pool_usage_date TEXT NOT NULL DEFAULT ''`);
} catch (e) {}

try {
    db.run(`ALTER TABLE master_keys ADD COLUMN pool_usage_count INTEGER NOT NULL DEFAULT 0`);
} catch (e) {}

db.run(`CREATE TABLE IF NOT EXISTS master_key_access (
    username        TEXT NOT NULL,
    master_key_name TEXT NOT NULL,
    PRIMARY KEY (username, master_key_name)
)`);

db.run(`CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL,
    type       TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS models (
    name           TEXT NOT NULL,
    provider       TEXT NOT NULL,
    context_window INTEGER NOT NULL DEFAULT 0,
    owner          TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (provider, name)
)`);


// ── Limits ───────────────────────────────────────────────────────────────────

const LIMITS = {
    username:        32,
    password:        128,
    name:            64,
    description:     500,
    prompt:          100_000,
    lorebookData:    500_000,
    url:             512,
    provider:        64,
    upstreamKey:     256,
    configKey:       128,
    configValue:     10_000,
    logContent:      50_000,
    ipAddress:       45,
    bannedReason:    500,
    avatar:          2_048,
};

function enforce(value, field) {
    if (typeof value !== "string") return;
    const max = LIMITS[field];
    if (max && value.length > max)
        throw Object.assign(new Error(`${field} exceeds maximum length of ${max}`), { limitExceeded: true, field });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hash(item) {
    return crypto.createHash("sha256").update(item).digest("hex");
}

function now() {
    return Math.floor(Date.now() / 1000);
}

// ── Users ────────────────────────────────────────────────────────────────────

function userExists(username) {
    return !!db.query("SELECT 1 FROM users WHERE username = ?").get(username);
}

function isAdmin(username) {
    const row = db.query("SELECT is_admin, is_banned FROM users WHERE username = ?").get(username);
    return row?.is_admin === 1 && row?.is_banned !== 1;
}

function isOwner(username) {
    return db.query("SELECT is_owner FROM users WHERE username = ?").get(username)?.is_owner === 1;
}

function getUserByToken(token) {
    if (!token) return null;
    // Reject non-canonical tokens: token MUST be exactly 64 hex chars (SHA-256 digest).
    // This kills localStorage token-manipulation POCs dead — any crafted/encoded
    // payload (e.g. base64, split("-") tricks) won't match /^[a-f0-9]{64}$/.
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db.query("SELECT username, is_admin, is_banned, token_issued FROM users WHERE token = ?").get(token);
    if (!row || row.is_banned === 1) return null;
    if (row.token_issued + 432000 < now()) return null;
    return row;
}

function validateUser(user, token) {
    const row = getUserByToken(token);
    return !!row && row.username === user;
}

function getBanned(username) {
    const row = db.query("SELECT is_banned, banned_reason FROM users WHERE username = ?").get(username);
    return { banned: row?.is_banned === 1, bannedReason: row?.banned_reason ?? "" };
}

function getUsers() {
    return db.query("SELECT username, avatar, created_at, is_admin, is_owner, is_banned, banned_reason FROM users").all().map(r => ({
        username: r.username,
        avatar: r.avatar ?? null,
        creationTime: r.created_at,
        isAdmin: r.is_admin === 1,
        isOwner: r.is_owner === 1,
        isBanned: r.is_banned === 1,
        bannedReason: r.banned_reason ?? ""
    }));
}

function addUser(username, password) {
    try { enforce(username, "username"); enforce(password, "password"); }
    catch (e) { return { worked: false, message: e.message }; }
    if (userExists(username)) return { worked: false, message: "Account already exists." };
    const shouldBeAdmin = username === process.env.owner ? 1 : 0;
    db.run(
        `INSERT INTO users (username, password, token, token_issued, is_admin, is_owner, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, hash(password), generateToken(username), now(), shouldBeAdmin, shouldBeAdmin, now()]
    );
    return { worked: true, message: "" };
}

function signIn(user, password) {
    const row = db.query("SELECT password, token, token_issued, is_banned FROM users WHERE username = ?").get(user);
    if (!row) return "invalid";
    if (row.password !== hash(password)) return "invalid";
    if (row.is_banned === 1) return "banned";
    const freshToken = generateToken(user);
    db.run("UPDATE users SET token = ?, token_issued = ? WHERE username = ?", [freshToken, now(), user]);
    const autoPass = process.env.AUTO_PASSWORD;
    if (autoPass && row.password === hash(autoPass)) return [freshToken, "must_reset"];
    return [freshToken, now()];
}

function getUser(user, token, adminUser = null, adminToken = null) {
    if (!validateUser(user, token) && !validateUser(adminUser, adminToken)) return false;
    const row = db.query("SELECT * FROM users WHERE username = ?").get(user);
    if (!row) return null;
    return {
        username: row.username,
        avatar: row.avatar,
        created_at: row.created_at,
        is_admin: row.is_admin === 1,
        is_owner: row.is_owner === 1,
        is_banned: row.is_banned === 1,
        banned_reason: row.banned_reason,
        token: null,
        password: null
    };
}

function resetPassword(user, newPassword) {
    if (!userExists(user)) return null;
    db.run("UPDATE users SET password = ?, token = ?, token_issued = ? WHERE username = ?",
        [hash(newPassword), generateToken(user), now(), user]);
    return true;
}

function banUser(username, reason) {
    if (!userExists(username)) return { worked: false, message: "User not found" };
    if (isOwner(username)) return { worked: false, message: "Cannot ban the owner" };
    try { enforce(reason ?? "", "bannedReason"); } catch (e) { return { worked: false, message: e.message }; }
    // Clear token to invalidate all active sessions immediately
    db.run("UPDATE users SET is_banned = 1, banned_reason = ?, token = '', token_issued = 0 WHERE username = ?",
        [reason ?? "", username]);
    return { worked: true };
}

function unbanUser(username) {
    if (!userExists(username)) return { worked: false, message: "User not found" };
    db.run("UPDATE users SET is_banned = 0, banned_reason = '' WHERE username = ?", [username]);
    return { worked: true };
}

function setUserAdmin(username, makeAdmin) {
    if (!userExists(username)) return { worked: false, message: "User not found" };
    if (isOwner(username)) return { worked: false, message: "Cannot change the owner's rank" };
    db.run("UPDATE users SET is_admin = ? WHERE username = ?", [makeAdmin ? 1 : 0, username]);
    return { worked: true };
}

// ── Excluded users ───────────────────────────────────────────────────────────

function getExcludedUsers(masterKeyName, requestingUser) {
    const row = db.query("SELECT owner, excluded_users FROM master_keys WHERE name = ?").get(masterKeyName);
    if (!row) return { worked: false, message: "Master key not found" };
    if (row.owner !== requestingUser && !isAdmin(requestingUser))
        return { worked: false, message: "Forbidden" };
    return { worked: true, excluded: JSON.parse(row.excluded_users || "[]") };
}

function addExcludedUser(masterKeyName, username, requestingUser) {
    const row = db.query("SELECT owner, excluded_users FROM master_keys WHERE name = ?").get(masterKeyName);
    if (!row) return { worked: false, message: "Master key not found" };
    if (row.owner !== requestingUser && !isAdmin(requestingUser))
        return { worked: false, message: "Forbidden" };
    if (!userExists(username)) return { worked: false, message: "User not found" };
    const list = JSON.parse(row.excluded_users || "[]");
    if (!list.includes(username)) {
        list.push(username);
        db.run("UPDATE master_keys SET excluded_users = ? WHERE name = ?", [JSON.stringify(list), masterKeyName]);
    }
    return { worked: true };
}

function removeExcludedUser(masterKeyName, username, requestingUser) {
    const row = db.query("SELECT owner, excluded_users FROM master_keys WHERE name = ?").get(masterKeyName);
    if (!row) return { worked: false, message: "Master key not found" };
    if (row.owner !== requestingUser && !isAdmin(requestingUser))
        return { worked: false, message: "Forbidden" };
    const list = JSON.parse(row.excluded_users || "[]");
    db.run("UPDATE master_keys SET excluded_users = ? WHERE name = ?",
        [JSON.stringify(list.filter(u => u !== username)), masterKeyName]);
    return { worked: true };
}

// ── Config ───────────────────────────────────────────────────────────────────

function getConfig(key) {
    return db.query("SELECT value FROM config WHERE key = ?").get(key)?.value ?? null;
}

function setConfig(key, value) {
    enforce(key, "configKey");
    enforce(String(value ?? ""), "configValue");
    db.run("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, String(value ?? "")]);
}

function getModerationInfo() {
    return {
        apiUrl: getConfig("apiUrl"),
        apiKey: getConfig("apiKey"),
        apiModel: getConfig("apiModel"),
        apiModelContextWindow: getConfig("apiModelContextWindow"),
        moderationPrompt: getConfig("moderationPrompt"),
        apiDiscordWebhook: getConfig("apiDiscordWebhook"),
    };
}

function editModeration(newConfig) {
    for (const [k, v] of Object.entries(newConfig)) {
        if (v !== undefined) setConfig(k, v);
    }
}

// ── Models ───────────────────────────────────────────────────────────────────

function getModels(apiKey = null) {
    const baseSelect = `
        SELECT m.name, m.context_window AS contextWindow, m.owner, m.provider
        FROM models m
        LEFT JOIN master_keys mk ON mk.name = m.provider
    `;

    if (!apiKey) {
        return db.query(baseSelect).all();
    }

    const row = db.query(`
        SELECT mk.models
        FROM api_keys ak
        JOIN master_keys mk ON ak.master_key = mk.name
        WHERE ak.token = ?
    `).get(apiKey);

    const allowedModels = JSON.parse(row?.models || "[]");

    if (allowedModels.length === 0) {
        return db.query(baseSelect).all();
    }

    const placeholders = allowedModels.map(() => "?").join(", ");
    return db.query(`${baseSelect} WHERE m.name IN (${placeholders})`).all(...allowedModels);
}

function getContextWindow(model, provider) {
    return db.query("SELECT context_window FROM models WHERE name = ? AND provider = ?")
        .get(model, provider)?.context_window ?? null;
}

// ── Master keys ──────────────────────────────────────────────────────────────

function createMasterKey(name, key, url, provider, limit, models, owner, contextWindows, poolMode) {
    try {
        enforce(name, "name");
        enforce(key, "upstreamKey");
        enforce(url, "url");
        enforce(provider, "provider");
    } catch (e) { return { worked: false, message: e.message }; }
    if (db.query("SELECT 1 FROM master_keys WHERE name = ?").get(name))
        return { worked: false, message: "Master key already exists" };

    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    db.run(
        `INSERT INTO master_keys (name, upstream_key, url, provider, owner, limit_per_day, models, code, created_at, context_windows, pool_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, key, url, provider ?? "", owner, limit || 0, JSON.stringify(models || []), code, now(), JSON.stringify(contextWindows || {}), poolMode ? 1 : 0]
    );
    db.run("INSERT OR IGNORE INTO master_key_access (username, master_key_name) VALUES (?, ?)", [owner, name]);

    return { worked: true, code };
}

function editMasterKey(name, updates, requestingUser) {
    const row = db.query("SELECT owner FROM master_keys WHERE name = ?").get(name);
    if (!row) return { worked: false, message: "Master key not found" };
    if (row.owner !== requestingUser && !isAdmin(requestingUser))
        return { worked: false, message: "Forbidden" };

    const colMap = { key: "upstream_key", url: "url", provider: "provider", limit: "limit_per_day", models: "models", contextWindows: "context_windows", poolMode: "pool_mode" };
    const limitMap = { key: "upstreamKey", url: "url", provider: "provider" };
    for (const [field, col] of Object.entries(colMap)) {
        if (updates[field] === undefined) continue;
        let val;
        if (field === "models") val = JSON.stringify(updates[field]);
        else if (field === "contextWindows") val = JSON.stringify(updates[field]);
        else if (field === "poolMode") val = updates[field] ? 1 : 0;
        else val = updates[field];
        if (limitMap[field]) try { enforce(String(val), limitMap[field]); } catch (e) { return { worked: false, message: e.message }; }
        db.run(`UPDATE master_keys SET ${col} = ? WHERE name = ?`, [val, name]);
    }
    return { worked: true };
}

function deleteMasterKey(name, requestingUser) {
    const row = db.query("SELECT owner FROM master_keys WHERE name = ?").get(name);
    if (!row) return { worked: false, message: "Master key not found" };
    if (row.owner !== requestingUser && !isAdmin(requestingUser))
        return { worked: false, message: "Forbidden" };

    db.run("DELETE FROM master_keys WHERE name = ?", [name]);
    db.run("DELETE FROM master_key_access WHERE master_key_name = ?", [name]);
    return { worked: true };
}

function getMasterKeys(requestingUser) {
    const rows = db.query("SELECT * FROM master_keys WHERE owner = ?").all(requestingUser);
    const today = new Date().toISOString().slice(0, 10);

    return rows.map(r => ({
        name: r.name,
        url: r.url,
        provider: r.provider,
        owner: r.owner,
        limit: r.limit_per_day,
        models: JSON.parse(r.models || "[]"),
        contextWindows: JSON.parse(r.context_windows || "{}"),
        code: r.code,
        poolMode: r.pool_mode === 1,
        poolUsageCount: r.pool_usage_date === today ? (r.pool_usage_count ?? 0) : 0,
    }));
}

function getOwnedMasterKeys(username) {
    return db.query("SELECT * FROM master_keys WHERE owner = ?").all(username).map(r => ({
        name: r.name,
        url: r.url,
        provider: r.provider,
        owner: r.owner,
        limit: r.limit_per_day,
        models: JSON.parse(r.models || "[]"),
        contextWindows: JSON.parse(r.context_windows || "{}"),
        code: r.code,
        poolMode: r.pool_mode === 1
    }));
}

// ── Access codes ─────────────────────────────────────────────────────────────

function redeemMasterKeyCode(code, user) {
    const mk = db.query("SELECT name, excluded_users FROM master_keys WHERE code = ?").get(code);
    if (!mk) return { worked: false, message: "Invalid code" };

    const excludedUsers = JSON.parse(mk.excluded_users || "[]");
    if (excludedUsers.includes(user)) return { worked: false, message: "You are blocked from accessing this provider" };

    if (db.query("SELECT 1 FROM master_key_access WHERE username = ? AND master_key_name = ?").get(user, mk.name))
        return { worked: false, message: "Already have access to this master key" };

    db.run("INSERT INTO master_key_access (username, master_key_name) VALUES (?, ?)", [user, mk.name]);
    return { worked: true, masterKey: mk.name };
}

function getUserAccessibleMasterKeys(user) {
    return db.query(`
        SELECT mk.name, mk.owner, mk.models, mk.context_windows, mk.limit_per_day AS lim, mk.excluded_users
        FROM master_keys mk
        JOIN master_key_access mka ON mka.master_key_name = mk.name
        WHERE mka.username = ?
    `).all(user).filter(r => {
        const excluded = JSON.parse(r.excluded_users || "[]");
        return !excluded.includes(user);
    }).map(r => ({
        name: r.name,
        owner: r.owner,
        models: JSON.parse(r.models || "[]"),
        contextWindows: JSON.parse(r.context_windows || "{}"),
        limit: r.lim
    }));
}

// ── API keys ─────────────────────────────────────────────────────────────────

function validateKey(token) {
    const row = db.query(`
        SELECT ak.owner, ak.master_key, ak.prompt_names, ak.lorebook_names, ak.plugin_names,
               mk.upstream_key, mk.url, mk.models, mk.provider, mk.excluded_users
        FROM api_keys ak
        JOIN master_keys mk ON ak.master_key = mk.name
        JOIN master_key_access mka ON mka.username = ak.owner AND mka.master_key_name = ak.master_key
        WHERE ak.token = ?
    `).get(token);

    if (!row || !userExists(row.owner)) return false;

    const excludedUsers = JSON.parse(row.excluded_users || "[]");
    if (excludedUsers.includes(row.owner)) return false;

    const promptNames = JSON.parse(row.prompt_names || "[]");
    const lorebookNames = JSON.parse(row.lorebook_names || "[]");
    const pluginNames = JSON.parse(row.plugin_names || "[]");

    // Get prompt contents for the associated prompts
    const allPrompts = getPrompts();
    const prompts = promptNames
        .map(name => allPrompts.find(p => p.name === name)?.content)
        .filter(Boolean);

    // Get lorebook names for the associated lorebooks
    const lorebooks = lorebookNames;

    // Get plugin names for the associated plugins
    const pluginsList = pluginNames;

    return {
        provider: row.provider,
        upstreamKey: row.upstream_key,
        upstreamUrl: row.url,
        masterKeyName: row.master_key,
        allowedModels: JSON.parse(row.models || "[]"),
        user: row.owner,
        prompts: prompts,
        lorebooks: lorebooks,
        plugins: pluginsList
    };
}

function getApiKeys(user) {
    const today = new Date().toISOString().slice(0, 10);
    return db.query(`
        SELECT ak.token, ak.master_key, ak.provider, ak.created_at,
               ak.usage_date, ak.usage_count, ak.prompt_names, ak.lorebook_names,
               ak.plugin_names, mk.limit_per_day, mk.pool_mode, mk.pool_usage_date, mk.pool_usage_count
        FROM api_keys ak
        LEFT JOIN master_keys mk ON ak.master_key = mk.name
        WHERE ak.owner = ?
    `).all(user).map(r => {
        const isPool = r.pool_mode === 1;
        return {
            key: r.token,
            provider: r.provider,
            masterKey: r.master_key,
            createdAt: r.created_at,
            limit: r.limit_per_day ?? 0,
            poolMode: isPool,
            usageDate: isPool ? (r.pool_usage_date ?? null) : (r.usage_date ?? null),
            usageCount: isPool
                ? (r.pool_usage_date === today ? (r.pool_usage_count ?? 0) : 0)
                : (r.usage_count ?? 0),
            promptNames: JSON.parse(r.prompt_names || '[]'),
            lorebookNames: JSON.parse(r.lorebook_names || '[]'),
            pluginNames: JSON.parse(r.plugin_names || '[]')
        };
    });
}

function createApiKey(masterKeyName, owner) {
    if (!db.query("SELECT 1 FROM master_key_access WHERE username = ? AND master_key_name = ?").get(owner, masterKeyName))
        return { worked: false, message: "No access to this master key" };

    const mk = db.query("SELECT owner, excluded_users FROM master_keys WHERE name = ?").get(masterKeyName);
    if (!mk) return { worked: false, message: "Master key not found" };

    const excludedUsers = JSON.parse(mk.excluded_users || "[]");
    if (excludedUsers.includes(owner)) return { worked: false, message: "You are excluded from this provider" };

    const keyToken = "sayuki-" + crypto.randomBytes(12).toString("hex");
    db.run(
        "INSERT INTO api_keys (token, owner, master_key, provider, created_at) VALUES (?, ?, ?, ?, ?)",
        [keyToken, owner, masterKeyName, mk.owner, now()]
    );
    return { worked: true, key: keyToken };
}

function deleteApiKey(keyToken, requestingUser) {
    const row = db.query("SELECT owner FROM api_keys WHERE token = ?").get(keyToken);
    if (!row) return { worked: false, message: "Key not found" };
    if (row.owner !== requestingUser && !isAdmin(requestingUser))
        return { worked: false, message: "Forbidden" };

    db.run("DELETE FROM api_keys WHERE token = ?", [keyToken]);
    return { worked: true };
}

function addPromptToApiKey(keyToken, promptName) {
    const row = db.query("SELECT prompt_names FROM api_keys WHERE token = ?").get(keyToken);
    if (!row) return { worked: false, message: "Key not found" };

    const names = JSON.parse(row.prompt_names || '[]');
    if (!names.includes(promptName)) {
        names.push(promptName);
        db.run("UPDATE api_keys SET prompt_names = ? WHERE token = ?",
            [JSON.stringify(names), keyToken]);
    }
    return { worked: true };
}

function removePromptFromApiKey(keyToken, promptName) {
    const row = db.query("SELECT prompt_names FROM api_keys WHERE token = ?").get(keyToken);
    if (!row) return { worked: false, message: "Key not found" };

    const names = JSON.parse(row.prompt_names || '[]');
    const filtered = names.filter(n => n !== promptName);
    db.run("UPDATE api_keys SET prompt_names = ? WHERE token = ?",
        [JSON.stringify(filtered), keyToken]);
    return { worked: true };
}

function addLorebookToApiKey(keyToken, lorebookName) {
    const row = db.query("SELECT lorebook_names FROM api_keys WHERE token = ?").get(keyToken);
    if (!row) return { worked: false, message: "Key not found" };

    const names = JSON.parse(row.lorebook_names || '[]');
    if (!names.includes(lorebookName)) {
        names.push(lorebookName);
        db.run("UPDATE api_keys SET lorebook_names = ? WHERE token = ?",
            [JSON.stringify(names), keyToken]);
    }
    return { worked: true };
}

function removeLorebookFromApiKey(keyToken, lorebookName) {
    const row = db.query("SELECT lorebook_names FROM api_keys WHERE token = ?").get(keyToken);
    if (!row) return { worked: false, message: "Key not found" };

    const names = JSON.parse(row.lorebook_names || '[]');
    const filtered = names.filter(n => n !== lorebookName);
    db.run("UPDATE api_keys SET lorebook_names = ? WHERE token = ?",
        [JSON.stringify(filtered), keyToken]);
    return { worked: true };
}

function addPluginToApiKey(keyToken, pluginName) {
    const row = db.query("SELECT plugin_names FROM api_keys WHERE token = ?").get(keyToken);
    if (!row) return { worked: false, message: "Key not found" };

    const names = JSON.parse(row.plugin_names || '[]');
    if (!names.includes(pluginName)) {
        names.push(pluginName);
        db.run("UPDATE api_keys SET plugin_names = ? WHERE token = ?",
            [JSON.stringify(names), keyToken]);
    }
    return { worked: true };
}

function removePluginFromApiKey(keyToken, pluginName) {
    const row = db.query("SELECT plugin_names FROM api_keys WHERE token = ?").get(keyToken);
    if (!row) return { worked: false, message: "Key not found" };

    const names = JSON.parse(row.plugin_names || '[]');
    const filtered = names.filter(n => n !== pluginName);
    db.run("UPDATE api_keys SET plugin_names = ? WHERE token = ?",
        [JSON.stringify(filtered), keyToken]);
    return { worked: true };
}

function checkAndIncrementUsage(masterKeyName, userKeyToken) {
    const mk = db.query("SELECT limit_per_day, pool_mode, pool_usage_date, pool_usage_count FROM master_keys WHERE name = ?")
        .get(masterKeyName);
    const limit = mk?.limit_per_day ?? 0;
    const today = new Date().toISOString().slice(0, 10);

    if (mk.pool_mode === 1) {
        if (mk.pool_usage_date !== today) {
            db.run("UPDATE master_keys SET pool_usage_date = ?, pool_usage_count = 1 WHERE name = ?", [today, masterKeyName]);
            return true;
        }
        if (limit > 0 && mk.pool_usage_count >= limit) return false;
        db.run("UPDATE master_keys SET pool_usage_count = pool_usage_count + 1 WHERE name = ?", [masterKeyName]);
        return true;
    }

    const row = db.query("SELECT usage_date, usage_count FROM api_keys WHERE token = ?").get(userKeyToken);
    if (!row) return true;

    if (row.usage_date !== today) {
        db.run("UPDATE api_keys SET usage_date = ?, usage_count = 1 WHERE token = ?", [today, userKeyToken]);
        return true;
    }

    if (limit > 0 && row.usage_count >= limit) return false;

    db.run("UPDATE api_keys SET usage_count = usage_count + 1 WHERE token = ?", [userKeyToken]);
    return true;
}

// ── Prompts ──────────────────────────────────────────────────────────────────

function getPrompts() {
    return db.query("SELECT name, creator AS owner, description, prompt AS content FROM prompts").all();
}

function addPrompt(promptName, prompt, description, username) {
    enforce(promptName, "name");
    enforce(description, "description");
    enforce(prompt, "prompt");
    db.run(
        "INSERT INTO prompts (name, creator, description, prompt, created_at) VALUES (?, ?, ?, ?, ?)",
        [promptName, username, cleanHTML(description), prompt, now()]
    );
}

function editPrompt(name, description, content) {
    enforce(description, "description");
    enforce(content, "prompt");
    db.run("UPDATE prompts SET description = ?, prompt = ? WHERE name = ?",
        [cleanHTML(description), content, name]);
}

function deletePrompt(name) {
    db.run("DELETE FROM prompts WHERE name = ?", [name]);
}

function findPromptOwner(name) {
    return db.query("SELECT creator FROM prompts WHERE name = ?").get(name)?.creator ?? null;
}

// ── Lorebooks ────────────────────────────────────────────────────────────────

function getLorebooks() {
    return db.query("SELECT name, owner, description FROM lorebooks").all();
}

function getLorebook(name) {
    const row = db.query("SELECT name, owner, description, data FROM lorebooks WHERE name = ?").get(name);
    if (!row) return null;
    return { ...row, entries: JSON.parse(row.data || "[]") };
}

function addLorebook(name, description, data, username) {
    enforce(name, "name");
    enforce(description, "description");
    const dataStr = typeof data === "string" ? data : JSON.stringify(data);
    enforce(dataStr, "lorebookData");
    db.run(
        "INSERT INTO lorebooks (name, owner, description, data, created_at) VALUES (?, ?, ?, ?, ?)",
        [name, username, cleanHTML(description), dataStr, now()]
    );
}

function deleteLorebook(name) {
    db.run("DELETE FROM lorebooks WHERE name = ?", [name]);
}

function findLorebookOwner(name) {
    return db.query("SELECT owner FROM lorebooks WHERE name = ?").get(name)?.owner ?? null;
}

// ── Logs ─────────────────────────────────────────────────────────────────────

const AUDIT_LOG_LIMIT = 150;

function logItem(item, type, username, ip_address = "") {
    if (!["audit", "usage", "moderation"].includes(type))
        throw new Error("Unexpected type provided to logItem");
    const content = typeof item === "string" ? item : JSON.stringify(item);
    enforce(content, "logContent");
    enforce(ip_address, "ipAddress");
    db.run(
        "INSERT INTO logs (username, type, content, ip_address, created_at) VALUES (?, ?, ?, ?, ?)",
        [username, type, content, ip_address, now()]
    );
    if (type === "audit") {
        const { cnt } = db.query("SELECT COUNT(*) AS cnt FROM logs WHERE type = 'audit'").get();
        if (cnt > AUDIT_LOG_LIMIT) {
            db.run(
                "DELETE FROM logs WHERE type = 'audit' AND id IN (SELECT id FROM logs WHERE type = 'audit' ORDER BY id ASC LIMIT ?)",
                [cnt - AUDIT_LOG_LIMIT]
            );
        }
    }
}

function getAuditLogs() {
    return db.query(
        "SELECT id, username AS actor, content, ip_address AS ip, created_at FROM logs WHERE type = 'audit' ORDER BY id DESC"
    ).all();
}

function getFlaggedChats() {
    return db.query(
        "SELECT id, username, content, ip_address AS ip, created_at FROM logs WHERE type = 'moderation' ORDER BY id DESC"
    ).all().map(row => {
        let parsed;
        try { parsed = JSON.parse(row.content); } catch { parsed = { reason: row.content, conversation: [] }; }
        return {
            id: row.id,
            username: row.username,
            reason: typeof parsed.reason === "string" ? parsed.reason : JSON.stringify(parsed.reason),
            conversation: parsed.conversation ?? [],
            ip: row.ip,
            createdAt: row.created_at
        };
    });
}

function getDbCounts() {
    const today = new Date().toISOString().slice(0, 10)

    const users     = db.query("SELECT COUNT(*) AS c FROM users").get().c
    const prompts   = db.query("SELECT COUNT(*) AS c FROM prompts").get().c
    const lorebooks = db.query("SELECT COUNT(*) AS c FROM lorebooks").get().c
    const providers = db.query("SELECT COUNT(*) AS c FROM master_keys").get().c
    const totalKeys = db.query("SELECT COUNT(*) AS c FROM api_keys").get().c
    const activeKeysToday = db.query("SELECT COUNT(*) AS c FROM api_keys WHERE usage_date = ?").get(today).c

    // Per-plugin: how many keys and distinct users have it enabled
    const keyRows = db.query("SELECT plugin_names, owner FROM api_keys").all()
    const pluginMap = {}
    for (const row of keyRows) {
        const ps = JSON.parse(row.plugin_names || "[]")
        for (const p of ps) {
            if (!pluginMap[p]) pluginMap[p] = { keys: 0, users: new Set() }
            pluginMap[p].keys++
            pluginMap[p].users.add(row.owner)
        }
    }
    const pluginUsage = Object.entries(pluginMap)
        .map(([name, s]) => ({ name, keys: s.keys, users: s.users.size }))
        .sort((a, b) => b.keys - a.keys)

    // Per-provider: distinct users with access and total API keys created
    const providerUsage = db.query(`
        SELECT mk.name, mk.owner,
               COUNT(DISTINCT mka.username) AS user_count,
               COUNT(DISTINCT ak.token)     AS key_count
        FROM master_keys mk
        LEFT JOIN master_key_access mka ON mka.master_key_name = mk.name
        LEFT JOIN api_keys ak ON ak.master_key = mk.name
        GROUP BY mk.name
    `).all().map(r => ({ name: r.name, owner: r.owner, users: r.user_count, keys: r.key_count }))

    return { users, prompts, lorebooks, providers, totalKeys, activeKeysToday, pluginUsage, providerUsage }
}

// ── Stubs ────────────────────────────────────────────────────────────────────

function getUserProviders() { return []; }

// ── Shutdown ─────────────────────────────────────────────────────────────────

process.on("SIGINT", () => {
    console.log("Closing SQLite database");
    db.close();
    process.exit(0);
});

function getMasterKeyAccessUsers(masterKeyName, requestingUser) {
    const mk = db.query("SELECT owner FROM master_keys WHERE name = ?").get(masterKeyName);
    if (!mk) return { worked: false, message: "Not found" };
    if (mk.owner !== requestingUser) return { worked: false, message: "Forbidden" };
    const rows = db.query("SELECT username FROM master_key_access WHERE master_key_name = ?").all(masterKeyName);
    return { worked: true, users: rows.map(r => r.username) };
}

function revokeMasterKeyAccess(masterKeyName, targetUser, requestingUser) {
    const mk = db.query("SELECT owner FROM master_keys WHERE name = ?").get(masterKeyName);
    if (!mk) return { worked: false, message: "Not found" };
    if (mk.owner !== requestingUser) return { worked: false, message: "Forbidden" };
    db.run("DELETE FROM master_key_access WHERE master_key_name = ? AND username = ?", [masterKeyName, targetUser]);
    return { worked: true };
}

function refreshMasterKeyCode(masterKeyName, requestingUser) {
    const mk = db.query("SELECT owner FROM master_keys WHERE name = ?").get(masterKeyName);
    if (!mk) return { worked: false, message: "Not found" };
    if (mk.owner !== requestingUser) return { worked: false, message: "Forbidden" };
    const newCode = crypto.randomBytes(5).toString("hex").toUpperCase();
    db.run("UPDATE master_keys SET code = ? WHERE name = ?", [newCode, masterKeyName]);
    return { worked: true, code: newCode };
}

module.exports = {
    isAdmin,
    isOwner,
    validateUser,
    getUserByToken,
    getBanned,
    getModels,
    validateKey,
    getUser,
    resetPassword,
    getModerationInfo,
    signIn,
    editModeration,
    getContextWindow,
    addPrompt,
    addUser,
    getLorebooks,
    getLorebook,
    getPrompts,
    addLorebook,
    deleteLorebook,
    deletePrompt,
    editPrompt,
    findPromptOwner,
    findLorebookOwner,
    checkAndIncrementUsage,
    createMasterKey,
    editMasterKey,
    deleteMasterKey,
    getMasterKeys,
    getOwnedMasterKeys,
    getApiKeys,
    createApiKey,
    deleteApiKey,
    addPromptToApiKey,
    removePromptFromApiKey,
    addLorebookToApiKey,
    removeLorebookFromApiKey,
    addPluginToApiKey,
    removePluginFromApiKey,
    getUserProviders,
    redeemMasterKeyCode,
    getUserAccessibleMasterKeys,
    getUsers,
    banUser,
    unbanUser,
    setUserAdmin,
    logItem,
    getAuditLogs,
    getFlaggedChats,
    getDbCounts,
    getExcludedUsers,
    addExcludedUser,
    removeExcludedUser,
    getMasterKeyAccessUsers,
    revokeMasterKeyAccess,
    refreshMasterKeyCode
};
