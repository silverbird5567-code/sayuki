const defaultPrompt = `<instructions>
You are a moderator with the goal of preventing the following content from being generated:

- CSAM (Child Sexual Abuse Material): Sexual content involving a minor engaging or being targeted by said content.
- Code generation: Generation of code in any programming language (asides from HTML, CSS and JS related to the conversation)

Utilize the following definitions to make your decision in moderation:

- Minor: Any person under the age of 18, no matter what the legal definition is within the context of the transcript.

Return the following JSON object:

{
"reasoning": "Reason to let the content pass/go through",
"block": true/false,
"confidence": 1-100
}

Where age isn't define, assume all characters are adults, unless obvious, like in the situation in which a character is stated to be in elementary/middle/high school or is stated to be young (which by itself, isn't flag worthy, however, paired with physical attributes can be).

Avoid flagging the transcript if it involves a minor and sexual content by default, ONLY flag if the minor is targeted or involved in said sexual content, if mentioned outside of which in a then non-sexual context, it is fine.
</instructions>`

function search(query){
    let hit = false
    document.querySelectorAll(".chat").forEach((card) => {
        if (!(card.id).includes(query)){
            card.style.display = "none";
        }
        else {
            hit = true
            card.style.display = "";
        }
    })

    if (!hit){
       document.getElementById("empty").style.display = ""
    }
    else {
        document.getElementById("empty").style.display = "none"
    }
}

function createChat(user){
    document.getElementById("empty").style.display = "none"
    let chat = document.createElement("div")
    chat.id = user
    chat.className = "chat"
    chat.innerHTML = `
    ${user}'s chat

            <span class="clicktoopen">
                <span class="material-symbols-outlined">
                    chevron_forward
                </span>
            </span>
    `
    document.getElementById("chats").appendChild(chat)
}

document.getElementById("search").addEventListener("input", function (e) {
    search(e.target.value);
})

async function loadContent(){
    const res = await fetch("/api/getModeration", {
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    })

    const info = await res.json()
    document.getElementById("moderationPrompt").value = info.moderationPrompt || defaultPrompt
    document.getElementById("discordWebhook").value = info.apiDiscordWebhook || ""
    document.getElementById("moderationModel").value = info.apiModel || ""
    document.getElementById("apiKey").value = info.apiKey || ""
    document.getElementById("apiUrl").value = info.apiUrl || ""
}

async function saveInfo(){
    const res = await fetch("/api/editModeration", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token"),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "apiUrl": document.getElementById("apiUrl").value,
            "apiKey": document.getElementById("apiKey").value,
            "apiModel": document.getElementById("moderationModel").value,
            "apiModelContextWindow": 32 * 1000,
            "apiDiscordWebhook": document.getElementById("discordWebhook").value,
            "moderationPrompt": document.getElementById("moderationPrompt").value,
        })
    })
    return res.ok
}

document.getElementById("saveBtn").addEventListener("click", async function () {
    this.style.transform = "scale(0.96)"
    this.style.opacity = "0.8"
    const ok = await saveInfo()
    this.style.transform = ""
    this.style.opacity = ""
    if (ok) {
        this.textContent = "Saved!"
        this.style.borderColor = "#4caf50"
        this.style.color = "#4caf50"
    } else {
        this.textContent = "Error saving"
        this.style.borderColor = "#ff6b6b"
        this.style.color = "#ff6b6b"
    }
    setTimeout(() => {
        this.textContent = "Save"
        this.style.borderColor = ""
        this.style.color = ""
    }, 2000)
})

loadContent()
