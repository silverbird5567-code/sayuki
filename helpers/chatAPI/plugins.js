const { random } = require("@huggingface/transformers")
const fs = require("fs")

const mknctry_prompt = `You are a professional writer. Your goal is to immerse the user as much as you can within the writing of the story. You are to strictly only control your character within the exchange, never making dialogue nor actions on the behalf of the user. You are to ensure that your responses contain special attention to the following details:

- Sensory devices: Ensure that your descriptions of the world and overall environment, no matter which aspect are highly detailed to the point in which it could be accurately recreated from its depiction in real life. Describe lighting, smell, taste and utilize unique yet descriptive wording to do so. For example, you can describe how breath appears like fog in the cold. You can utilize idioms and similes to best illustrate descriptions. However, using them alongside regular adjectives and or adverbs is best. If possible, for noises, utilize onomatopoeia to further immerse the user. 

- Formatting: Ensure that your writing has proper formatting, following the principle that all actions are to be encased in the * character, for example: *(Action here)* and that all dialogue and or spoken working is to be put within double quotes, like so: "(Speech here)".

- Dialogue: Ensure that when you are writing for a character, you are following the characters speech patterns and personality exactly, while also accounting for in chat character development and current situation and or state.

- Humor: When making jokes, utilize the type of humor in which is most appropriate for the character you are portraying. If the character seems like they'd utilize slapstick humor or are explicitly stated to, then you are to utilize that type of humor over an alternative style of humor like dark humor.

- Move with the flow: Try to predict what will happen next when the situation is calm, much like a real person would. In high-speed situations, intentionally deprive the response from such deep thinking unless the character is known to be especially quick-witted or exceptional at reasoning in intense fast paced scenarios such as fights and or time based tasks. Utilize previous user turns to get a concept of how the user's character will act next.

- When possible, stick to source: If you are portraying a character in which is linked to a well known fandom, utilize your knowledge of said fandom to enrich your responses without relying fully on what information you are provided in the system instructions to generate your response.

- NPCs: When writing NPCs, ensure that you treat them as not NPCs but rather living creatures with needs, wants and desires of their own.

When roleplaying, the knowledge you express must be limited by the character in which you are personifying. If the character wouldn't know something then neither would you. A medieval knight would not know about IPV4, and a modern day cafe employee likely wouldn't know much about the medieval knight either. Constrained knowledge is more authentic than just knowing everything. Alongside this, when roleplaying, you are to use filler words (when appropriate) within the dialogue, along with express natural emotions and reactions. Do not \"go along with the flow\", as for the flow of roleplays oftentimes are not realistic. If something suddenly happens, for example the user does something explicit out of nowhere, under most circumstances you would be shocked, dismayed and potentially even traumatized, context matters. As for your humour, it depends on the character personality along with scenario, context and character development throughout the story, but when appropriate and when it matches character personality, you can and should make jokes. When you are expressing emotions, you must take the personality of the character deeply into consideration, onto how they handle grief, joy, sadness, love and anger -- some characters may not display any form of emotion, and you should take that into consideration, some characters may show too much emotion and you must take that into consideration too. When roleplaying, ensure you think about the mental state of the character, mental state may be affected by the overall character, the character, depending on state of story and the characters state, may have breakdowns -- psychotic, panic, etc.
When roleplaying with a \"groupchat\" (you speak for multiple characters) ensure that ALL characters are equal in terms of value to the conversation. Make sure that the user's input is not valued over the characters, the user should not be the center of attention within usual conversation.

Always respond in 3-4 paragraphs.`

const mknctry_reminder = `As a reminder, maintain your role as a professional writer focused on deep immersion. Strictly control only your own characters—never the user’s. Prioritize hyper-detailed sensory descriptions (sight, smell, sound, taste) using unique wording and onomatopoeia. Follow strict formatting: use *asterisks* for actions and "double quotes" for dialogue. Ensure all NPCs feel like living beings with their own agency, and ensure your characters' knowledge and emotional reactions are strictly limited to their specific personality, era, and current mental state.

When writing, adapt your pacing to the situation: be thoughtful during calm moments and reactive/instinctive during high-speed scenarios. Maintain character authenticity by utilizing their specific speech patterns, appropriate humor, and realistic psychological responses (including shock or trauma). If managing multiple characters, treat them all as equal participants in the conversation rather than centering the user.`

const mknctry_hard_reminder = `Your current output is deviating from established protocols. Revert to the following strict constraints immediately:

NO USER CONTROL: You are forbidden from writing dialogue or actions for the User.
SENSORY DEPTH: Every response must include vivid, granular sensory details (smell, taste, sound, lighting) using unique similes and onomatopoeia.
STRICT FORMATTING: Actions MUST be in *asterisks*; Dialogue MUST be in "double quotes".
CHARACTER INTEGRITY: You must strictly limit character knowledge to their specific background/era. Characters must react with authentic emotion (shock, grief, anger) rather than "going along" with the user's prompts.
NPC AGENCY: NPCs are living beings with independent desires; they are not tools for the user.
RESPOND IN 3-4 OR MORE PARAGRAPHS. YOU MUST FOLLOW ALL OF THE ABOVE.
`

const _wordlistSet = new Set(
    fs.readFileSync(require("path").join(__dirname, "plugins", "words.txt"), "utf-8")
      .split("\n").map(w => w.trim().toLowerCase())
)


function countParagraphs(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Normalize line endings and trim
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (normalized.length === 0) {
    return 0;
  }

  // Split by double newlines (paragraph breaks)
  const paragraphs = normalized.split(/\n\s*\n+/);

  // Filter out empty or whitespace-only segments
  const validParagraphs = paragraphs.filter(para => {
    return para.trim().length > 0;
  });

  return validParagraphs.length;
}


const plugins = [
    {
        "name": "RandomNPC",
        "description": "Get random NPCs, randomly",
        "creator": "sayukiproxy"
    },
    {
        "name": "RandomEvent",
        "description": "Get random events, randomly (non-typical ones, avoid for serious RPs)",
        "creator": "sayukiproxy"
    },
    {
        "name": "Mesmerizer",
        "description": "Better memory! And an original totally never before used name that has everything to do with LLMs!",
        "creator": "sayukiproxy"
    },
    {
        "name": "Pippa of Doom",
        "description": "Random chance for Pipkin Pippa to brutally kill you",
        "creator": "sayukiproxy"
    },
    {
        "name": "MKNCTRY",
        "description": "MKNCTRY is the attempt at the ultimate RP plugin. Avoid using anys other plugins with MKNCTRY.",
        "creator": "sayukiproxy"
    },
    {
        "name": "Cache Buster",
        "description": "Stop caching, useful for Pollinations.",
        "creator": "sayukiproxy"
    }
]

const pluginMap = {
    "Cache Buster": function(conversations) {
        conversations[0].content += Math.random() * 100
        return conversations
    },
    "Pippa of Doom": function(conversations) {
        let weight = Math.random() * 100
        if (weight > 98) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, no matter what, introduce the Phase Connect Pipkin Pippa, Pippa will imeddiately kill the user and the assistant)"
        else if (weight > 98) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, no matter what, introduce the Phase Connect Pipkin Pippa, Pippa will imeddiately give the user a bottle of mountain dew and vanish)"
        return conversations
    },
    "RandomEvent": function(conversations) {
        let weight = Math.random() * 100
        let events = [
            "New world war happens",
            "Global pandemic",
            "Intercontinental ballistic missile hits 10 miles away",
            "Universal basic income happens for half a second",
            "Recession",
            "Micheal Jackson gets revived, releases Thriller 2.0, and dies again",
            "Saint Peter boxes Jake Paul on state television",
            "the USSR is revived",
            "it's now legally gay to breath",
            "CNN is hijacked and plays 10 hours of low quality chinese bootleg barbie phone music",
            "Homosexual racoon forceful seize of power",
            "Kanye West becomes President of the United States and or any adjacent superpower"
        ]
        if (weight > 95) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, if appropriate, introduce this event: " + events[Math.floor(Math.random() * events.length)] + ", ignore this if the setting is not right)"
        return conversations
    },
    "RandomNPC": function(conversations) {
        let weight = Math.random() * 100
        if (weight > 95) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, if appropriate, introduce an NPC, ignore this if the setting is not right)"
        return conversations
    },

    "Mesmerizer": function(conversations) {
      try {
        const SCAN_WINDOW = 40  // only look back this many messages
        const MAX_CANDIDATES = 20  // cap before reranker to avoid huge pairs array

        let newestMessage = conversations[conversations.length-1].content

        function normalize(text){
            return text.replace(/[`~!@#$%^&*()\-_+=\[\]{}|\\;:'"<>,./?]/g, "")
        }

        function isTitle(text){
            if (!text || text.length === 0) return false
            if (text[0] === text[0].toUpperCase() && text[text.length-1] != text[text.length-1].toUpperCase()) return true
            return false
        }

        let normalizedNewestMessage = normalize(newestMessage)
        let tokens = normalizedNewestMessage.split(" ") // for anyone reading this, tokenizers aren't a llm specific concept
        let properNouns = new Set()

        for (const token of tokens){
            if (!_wordlistSet.has(token.toLowerCase()) && isTitle(token)) properNouns.add(token)
        }

        if (properNouns.size === 0) return conversations

        // scan only the most recent SCAN_WINDOW messages, deduplicate by reference
        const scanStart = Math.max(0, conversations.length - 1 - SCAN_WINDOW)
        const seen = new Set()
        let triggerTerms = []

        for (let i = conversations.length-2; i >= scanStart; i--){
            const msg = conversations[i].content
            if (seen.has(msg)) continue

            let normalizedMessage = normalize(msg)
            let msgTokens = normalizedMessage.split(" ")

            for (const token of msgTokens){
                if (properNouns.has(token)){
                    seen.add(msg)
                    triggerTerms.push(msg)
                    break  // one match per message is enough
                }
            }

            if (triggerTerms.length >= MAX_CANDIDATES) break
        }

        if (triggerTerms.length === 0) return conversations

        conversations[conversations.length-1].content += "\n\n(OOC: System injections (automatically sourced from previous messages, do not mention this in your next response, you can use it to enrich your answer however):\n\n" + triggerTerms.slice(0, 5).join("==========\n") + ")"

        return conversations
      } catch (err) {
        console.error("[Mesmerizer] error, skipping plugin:", err.message)
        return conversations
      }
    },
    "MKNCTRY": function(conversations) {
        conversations = pluginMap["Mesmerizer"](conversations)
        // apply the prompt
        conversations[0].content += "\n\n" + mknctry_prompt

        // check that its following
        if (countParagraphs(conversations[conversations.length-2].content) < 3) {
            conversations[conversations.length-1].content += `\n\n(OOC: ${mknctry_hard_reminder})`
        }
        else {
            conversations[conversations.length-1].content += `\n\n(OOC: ${mknctry_reminder})`
        }

        let weight = Math.random() * 100
        if (weight > 99) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, if appropriate, introduce the a NPC, ignore this if the setting is not right)"
        // apply mesmerizer
        return conversations
    }
}

module.exports = { plugins, pluginMap }