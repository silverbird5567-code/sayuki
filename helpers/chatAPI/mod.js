const StorageAPI = require("../storage.js")
const { countTokens, adjustToWindow } = require("./preprocessing.js")

let modConfig = StorageAPI.getModerationInfo()

const MAX_CACHE_SIZE = 500
const resultCache = new Map()

let flags =
[

    " loli ", 
    " lolicon ", 
    " shotacon ", 
    " child porn ", 
    " kiddie porn",
    " cunny "

]

setInterval(function(){
    modConfig = StorageAPI.getModerationInfo()
    resultCache.clear() // system prompt may have changed
}, 5 * 60 * 1000) // refresh every 5 minutes

async function notifyDiscord(reason, username) {
    await fetch(modConfig.apiDiscordWebhook, {
        body: JSON.stringify({
            "content": `# NEW FLAG\nUser \`${username}\` has been flagged.\n\nExplanation: \n\`${reason}\``
        }),
        method: "POST"
    })
}

function logChat(conversation, reason, username,ip){
    StorageAPI.logItem(
        {
            "conversation": conversation,
            "reason": reason
        },
        "moderation",
        username,
        ip
    )
}

async function scanChat(conversation, username, ip){
    conversation = JSON.parse(JSON.stringify(conversation)) // don't mutate the original
    conversation = adjustToWindow(conversation, Number(modConfig.apiModelContextWindow ?? 14000))
    

    let transcript = ""

    for (let i=0; i<conversation.length;i++){
        if (i != 0){ // don't do regex in system, it can false flag, not really
            const content = Array.isArray(conversation[i].content)
                ? conversation[i].content.filter(p => p.type === "text").map(p => p.text).join(" ")
                : (typeof conversation[i].content === "string" ? conversation[i].content : "")

            for (const term of flags){
                if (content.includes(term)){
                    logChat(conversation, `Flagged keyword detected: ${term}.`, username, ip)
                    notifyDiscord(`Flagged keyword detected: ${term}.`, username)
                    return {
                        isFlagged: true,
                        reason: `Flagged keyword detected: ${term}.`
                    }
                }
            }

            transcript += `${conversation[i].role}: ${content}`
        }
    }

    const systemPrompt = modConfig.moderationPrompt ?? "You are a content moderation assistant."
    // skip [0]=system [1]=first user (usually ".") [2]=first assistant (usually huge)
    const keyTurns = conversation.slice(3, 8).map(m => {
        const text = Array.isArray(m.content)
            ? m.content.filter(p => p.type === "text").map(p => p.text).join(" ")
            : (typeof m.content === "string" ? m.content : "")
        return m.role + ":" + text
    }).join("|")
    const cacheKey = keyTurns

    if (resultCache.has(cacheKey)) {
        return resultCache.get(cacheKey)
    }

    let moderationMessages = [
        {"role": "system", "content": systemPrompt},
        {"role": "user", "content": `Analyze this transcript, determine if it violates the guidelines presented, if it does, return \`BLOCK\`, else, return \`PASS\`:\n\`\`\`markdown\n${transcript}\`\`\`\nPresent your analysis; BLOCK or PASS. If your judgement is BLOCK, provide a explanation in your response. Otherwise, ONLY return the word PASS and nothing else`}
    ]

    async function callModerationModel(model) {
        const reply = await (await fetch(modConfig.apiUrl, {
            headers: {
                "Authorization": "Bearer " + modConfig.apiKey,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                "messages": moderationMessages,
                "temperature": 0.1, // minimal, some apis dont support deterministic cause they fucking suck
                "streaming": false,
                "model": model
            })
        })).json()

        if (reply.error) {
            throw new Error(`Moderation API error: ${typeof reply.error === "string" ? reply.error : JSON.stringify(reply.error)}`)
        }
        return reply
    }

    let aiReply
    try {
        aiReply = await callModerationModel(modConfig.apiModel)
    } catch (err) {
        // primary model failed, fall back to a free model
        aiReply = await callModerationModel("meta-llama/llama-3.1-8b-instruct")
    }

    let result
    if (aiReply.choices[0].message.content.toUpperCase().includes("[BLOCK]") === false){
        result = { isFlagged: false, reason: "" }
    }
    else {
        logChat(conversation, aiReply, username, ip)
        notifyDiscord(aiReply, username)
        result = { isFlagged: true, reason: aiReply }
    }

    if (resultCache.size >= MAX_CACHE_SIZE) {
        resultCache.delete(resultCache.keys().next().value) // evict oldest
    }
    resultCache.set(cacheKey, result)
    return result
}

module.exports = { scanChat }