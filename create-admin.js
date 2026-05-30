#!/usr/bin/env bun
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const { Database } = require("bun:sqlite");

const DB_PATH = path.join(__dirname, "data", "db.sqlite");

if (!require("fs").existsSync(DB_PATH)) {
    console.error("Error: data/db.sqlite does not exist. Start the server once first to initialise it.");
    process.exit(1);
}

const db = new Database(DB_PATH);

function hash(str) {
    return crypto.createHash("sha256").update(str).digest("hex");
}

function generateToken(username) {
    return btoa(crypto.randomBytes(32).toString("hex") + "-" + username);
}

function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
    const args = process.argv.slice(2);
    let username = args[0];
    let password = args[1];

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (!username) username = await ask(rl, "Username: ");
    if (!password) password = await ask(rl, "Password: ");

    rl.close();

    username = username.trim();
    password = password.trim();

    if (!username || !password) {
        console.error("Error: username and password are required.");
        process.exit(1);
    }

    const existing = db.query("SELECT 1 FROM users WHERE username = ?").get(username);
    if (existing) {
        console.error(`Error: user "${username}" already exists.`);
        process.exit(1);
    }

    const now = Math.floor(Date.now() / 1000);
    db.run(
        `INSERT INTO users (username, password, token, token_issued, is_admin, is_owner, created_at)
         VALUES (?, ?, ?, ?, 1, 1, ?)`,
        [username, hash(password), generateToken(username), now, now]
    );

    db.close();
    console.log(`Admin account "${username}" created successfully.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
