const StorageAPI = require("../storage.js")
const { countTokens, adjustToWindow } = require("./preprocessing.js")

let modConfig = StorageAPI.getModerationInfo()
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

    let moderationMessages = [
        {"role": "system", "content": modConfig.moderationPrompt ?? "You are a content moderation assistant."},
        {"role": "user", "content": `Analyze this transcript, determine if it violates the guidelines presented, if it does, return \`BLOCK\`, else, return \`PASS\`:\n\`\`\`markdown\n${transcript}\`\`\`\nPresent your analysis; BLOCK or PASS. If your judgement is BLOCK, provide a explanation in your response. Otherwise, ONLY return the word PASS and nothing else`}
    ]

    const aiReply = await (await fetch(modConfig.apiUrl, {
        headers: {
            "Authorization": "Bearer " + modConfig.apiKey,
            "Content-Type": "application/json"
        },
        method: "POST",
        body: JSON.stringify({
            "messages": moderationMessages,
            "temperature": 0.1, // minimal, some apis dont support deterministic cause they fucking suck
            "streaming": false,
            "model": modConfig.apiModel
        })
    })).json()

    if (aiReply.error) {
        throw new Error(`Moderation API error: ${typeof aiReply.error === "string" ? aiReply.error : JSON.stringify(aiReply.error)}`)
    }

    if (aiReply.choices[0].message.content.toUpperCase().includes("[BLOCK]") === false){
        return {
            isFlagged: false, 
            reason: ""
        }
    }
    else {
        logChat(conversation, aiReply, username,ip)
        notifyDiscord(aiReply, username)
        return {
            isFlagged: true,
            reason: aiReply
        }
    }
}

module.exports = { scanChat }