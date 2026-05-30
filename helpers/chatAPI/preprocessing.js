const storageAPI = require("../storage.js")
const { pluginMap } = require("./plugins.js")

function countTokens(conversation){
    let estimate = 0 // 0 tokens as baseline

    for (turn of conversation){
        estimate += (turn.content).length / 3
    }

    return estimate
}

function adjustToWindow(conversation, contextWindow){
    if (!contextWindow) return conversation

    // i know this is shit rn, will be more sophisticated later
    // get system / first user message
    let firstMessage = conversation[0].content

    while (conversation[0].content.length / 3 > contextWindow / 5){
        conversation[0].content = conversation[0].content.slice(0,Math.floor((conversation[0].content).length / 2))
    }

    while (countTokens(conversation) > contextWindow){
        conversation.splice(1,1)
    }

    return conversation
}

function preprocess(conversation, lorebooks, prompts, plugins, contextWindow){
    
    if (prompts.length > 0){
        for (prompt of prompts){
            conversation[0].content += "\n" + prompt + "\n"
        }
    }

    if (lorebooks.length > 0){
        for (lorebook of lorebooks){
            lorebook = storageAPI.getLorebook(lorebook)

            // SillyTavern exports entries as a UID-keyed object; normalize to array
            let entries = lorebook["entries"]
            if (!Array.isArray(entries)) entries = Object.values(entries)

            for (entry of entries){
                if (entry["disable"] || entry["disabled"]) continue

                // Always-inject constant entries skip keyword scanning
                if (entry["constant"]) {
                    conversation[0].content += "\n" + entry["content"] + "\n"
                    continue
                }

                // Probabilistic injection
                if (entry["useProbability"] && entry["probability"] != null){
                    if (Math.random() * 100 > entry["probability"]) continue
                }

                // Keys: SillyTavern uses key[] array, legacy uses triggers string
                const keys = Array.isArray(entry["key"])
                    ? entry["key"]
                    : (entry["triggers"] ?? "").split(",").map(s => s.trim()).filter(Boolean)

                if (keys.length === 0) continue

                // Scan depth: how many recent messages to check (SillyTavern: scanDepth; fallback: 1)
                const depth = entry["scanDepth"] ?? entry["depth"] ?? 1
                const scanMessages = conversation.slice(-depth).map(m => m.content)
                const haystack = scanMessages.join("\n")

                const caseSensitive = entry["caseSensitive"] ?? false
                const normalize = s => caseSensitive ? s : s.toLowerCase()
                const normalizedHaystack = normalize(haystack)

                const primaryMatch = keys.some(k => normalizedHaystack.includes(normalize(k.trim())))
                if (!primaryMatch) continue

                // Selective mode: secondary keys must also match
                if (entry["selective"]){
                    const secondary = Array.isArray(entry["keysecondary"]) ? entry["keysecondary"] : []
                    if (secondary.length > 0){
                        const secondaryMatch = secondary.some(k => normalizedHaystack.includes(normalize(k.trim())))
                        if (!secondaryMatch) continue
                    }
                }

                conversation[0].content += "\n" + entry["content"] + "\n"
            }
        }
    }

    if (plugins.length > 0){
        for (plugin of plugins){
            conversation = pluginMap[plugin](conversation)
        }
    }

    return adjustToWindow(conversation, contextWindow)
}

module.exports = { preprocess, countTokens, adjustToWindow}