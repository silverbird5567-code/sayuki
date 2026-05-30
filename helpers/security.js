const crypto = require("crypto")
const santitizeHTML = require("sanitize-html")

function cleanHTML(text){
    return santitizeHTML(text)
}

function generateToken(user) {
    const randomBytes = crypto.randomBytes(32).toString("hex")
    const timestamp = Date.now().toString(36)
    const unique = `${randomBytes}-${timestamp}-${user}`
    return crypto.createHash("sha256").update(unique).digest("hex")
}

module.exports = { cleanHTML, generateToken }