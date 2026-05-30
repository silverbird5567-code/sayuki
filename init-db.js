const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("Created data/");
} else {
    console.log("data/ already exists, skipping mkdir");
}

// The database file itself is created automatically by bun:sqlite on first run.
// This script just ensures the data directory exists.

console.log("Done. Run the server to initialise data/db.sqlite.");
