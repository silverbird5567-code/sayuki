const {
    isAdmin,
    isOwner,
    validateUser,
    getUserByToken,
    getBanned,
    getUser,
    resetPassword,
    signIn,
    editModeration,
    getContextWindow,
    getPrompts,
    addPrompt,
    addUser,
    getLorebooks,
    addLorebook,
    deleteLorebook,
    deletePrompt,
    editPrompt,
    findPromptOwner,
    findLorebookOwner,
    getModerationInfo,
    getUsers,
    createMasterKey,
    editMasterKey,
    deleteMasterKey,
    getMasterKeys,
    getOwnedMasterKeys,
    getModels,
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
    banUser,
    unbanUser,
    setUserAdmin,
    logItem,
    getAuditLogs
} = require("./storage.js")

const { plugins } = require("./chatAPI/plugins.js")

function getUserFromRequest(request) {
    const rawToken = request.headers.authorization.split(" ")[1]
    return getUserByToken(rawToken)?.username
}

function isAuthed(request, mustBeAdmin=false){
    const bearer = request.headers.authorization
    if (bearer == null) return false

    const rawToken = bearer.split(" ")[1]
    const row = getUserByToken(rawToken)
    if (!row) return false
    if (mustBeAdmin) return row.is_admin === 1
    return true
}

module.exports = function (fastify, opts, done) {
    fastify.get("/masterkeys", async (request, reply) => {
        return reply.sendFile("masterkeys.html")
    })

    fastify.get("/admin", async (request, reply) => {
        return reply.sendFile("admin.html")
    })

    fastify.get("/service/docs", async (request, reply) => {
        return reply.sendFile("/service/docs.html")
    })

    fastify.get("/lorebooks", async (request, reply) => {
        return reply.sendFile("lorebooks.html")
    })

    fastify.get("/models", async (request, reply) => {
        return reply.sendFile("models.html")
    })

    fastify.get("/modelsmanager", async (request, reply) => {
        return reply.sendFile("modelmanager.html")
    })

    fastify.get("/dashboard", async (request, reply) => {
        return reply.sendFile("dashboard.html")
    })

    fastify.get("/prompts", async (request, reply) => {
        return reply.sendFile("prompts.html")
    })

    fastify.get("/apikeys", async (request, reply) => {
        return reply.sendFile("apikeys.html")
    })

    fastify.get("/plugins", async (request, reply) => {
        return reply.sendFile("plugins.html")
    })

    fastify.get("/api/users/isAdmin", async (request, reply) => {
        if (!isAuthed(request, true)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        return reply.send(isAdmin(username))
    })

    fastify.get("/api/getLorebooks", async (request, reply) => {
        if (!isAuthed(request)) return
        return reply.send(getLorebooks())
    })

    fastify.get("/api/users/isOwner/:username", async (request, reply) => {
        if (!isAuthed(request, true)) return
        return reply.send(isOwner(request.params.username))
    })

    fastify.get("/api/plugins", async (request, reply) => {
        return reply.send(plugins)
    })

    fastify.get("/api/users/getBanned/:username", async (request, reply) => {
        if (!isAuthed(request, true)) return
        return reply.send(getBanned(request.params.username))
    })

    fastify.get("/api/users/getUser/:username", async (request, reply) => {
        if (!isAuthed(request, true)) return
        return reply.send(getUser(request.params.username))
    })

    fastify.get(("/api/users/me"), async function(request, reply) {
        return isAuthed(request)        
    })

    fastify.get("/api/getPrompts", async (request, reply) => {
        if (!isAuthed(request)) return
        return reply.send(getPrompts())
    })

    fastify.get("/api/users/resetPassword", async (request, reply) => {
        if (!isAuthed(request)) return
        return reply.send(resetPassword(request.body.username, request.body.newPassword))
    })

    fastify.post("/api/users/signIn", async (request, reply) => {
        return reply.send(signIn(request.body.username, request.body.password))
    })

    fastify.get("/api/getModeration", async (request, reply) => {
        if (!isAuthed(request, true)) return
        return reply.send(getModerationInfo())
    })

    fastify.get("/api/users", async function(request, reply){
        if (!isAuthed(request, true)) return
        return reply.send(getUsers())
    })

    fastify.post("/api/editModeration", async (request, reply) => {
        if (!isAuthed(request, true)) return
        const username = getUserFromRequest(request)
        editModeration({
            "apiUrl": request.body.apiUrl,
            "apiKey": request.body.apiKey,
            "apiModel": request.body.apiModel,
            "apiModelContextWindow": request.body.apiModelContextWindow,
            "apiDiscordWebhook": request.body.apiDiscordWebhook
        })
        logItem("Edited moderation settings", "audit", username, request.ip)
        return reply.send({ ok: true })
    })

    fastify.get("/api/models", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)

        const ownedKeys = getOwnedMasterKeys(username)
        const accessibleKeys = getUserAccessibleMasterKeys(username)
        const seen = new Set()
        const allKeys = [...ownedKeys, ...accessibleKeys].filter(k => seen.has(k.name) ? false : seen.add(k.name))

        const models = []
        for (const key of allKeys) {
            for (const modelName of key.models) {
                models.push({ name: modelName, provider: key.name, owner: key.owner, contextWindow: key.contextWindows?.[modelName] || 0 })
            }
        }
        return reply.send(models)
    })

    fastify.get("/api/users/getContextWindow", async (request, reply) => {
        if (!isAuthed(request)) return
        return reply.send(getContextWindow(request.body.model, request.body.provider))
    })

    fastify.post("/api/createLorebook", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        let { name, description, data, apiKey } = request.body
        name = name.replace("\"","''")
        try {
            addLorebook(name, description, data, username)
            if (apiKey) {
                addLorebookToApiKey(apiKey, name)
            }
            return reply.send({ ok: true })
        } catch (e) {
            return reply.code(400).send({ error: e.message })
        }
    })

    fastify.delete("/api/deleteLorebook", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { name } = request.body
        const owner = findLorebookOwner(name)
        if (!owner) return reply.code(404).send({ error: "Lorebook not found" })
        if (owner !== username && !isAdmin(username)) return reply.code(403).send({ error: "Forbidden" })
        try {
            deleteLorebook(name, owner)
            if (owner !== username) logItem(`Deleted lorebook: ${name} (owner: ${owner})`, "audit", username, request.ip)
            return reply.send({ ok: true })
        } catch (e) {
            return reply.code(400).send({ error: e.message })
        }
    })

    fastify.post("/api/createPrompt", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        let { name, description, content, apiKey } = request.body
        name = name.replace("\"","''")
        try {
            addPrompt(name, content, description, username)
            if (apiKey) {
                addPromptToApiKey(apiKey, name)
            }
            return reply.send({ ok: true })
        } catch (e) {
            return reply.code(400).send({ error: e.message })
        }
    })

    fastify.delete("/api/deletePrompt", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { name } = request.body
        const owner = findPromptOwner(name)
        if (!owner) return reply.code(404).send({ error: "Prompt not found" })
        if (owner !== username && !isAdmin(username)) return reply.code(403).send({ error: "Forbidden" })
        try {
            deletePrompt(name, owner)
            if (owner !== username) logItem(`Deleted prompt: ${name} (owner: ${owner})`, "audit", username, request.ip)
            return reply.send({ ok: true })
        } catch (e) {
            return reply.code(400).send({ error: e.message })
        }
    })

    fastify.put("/api/editPrompt", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { name, description, content, apiKey } = request.body
        const owner = findPromptOwner(name)
        if (!owner) return reply.code(404).send({ error: "Prompt not found" })
        if (owner !== username && !isAdmin(username)) return reply.code(403).send({ error: "Forbidden" })
        try {
            editPrompt(name, description, content, owner)
            if (apiKey) {
                addPromptToApiKey(apiKey, name)
            }
            if (owner !== username) logItem(`Edited prompt: ${name} (owner: ${owner})`, "audit", username, request.ip)
            return reply.send({ ok: true })
        } catch (e) {
            return reply.code(400).send({ error: e.message })
        }
    })

    fastify.get("/api/masterkeys", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        return reply.send(getMasterKeys(username))
    })

    fastify.get("/api/apikeys", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        return reply.send(getApiKeys(username))
    })

    fastify.post("/api/apikeys/create", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { masterKey } = request.body
        if (!masterKey) return reply.code(400).send({ error: "masterKey is required" })
        const result = createApiKey(masterKey, username)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.post("/api/masterkeys/redeem", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { code } = request.body
        if (!code) return reply.code(400).send({ error: "code is required" })
        const result = redeemMasterKeyCode(code.trim().toUpperCase(), username)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.get("/api/masterkeys/accessible", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        return reply.send(getUserAccessibleMasterKeys(username))
    })

    fastify.delete("/api/apikeys/delete", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { key } = request.body
        if (!key) return reply.code(400).send({ error: "key is required" })
        const result = deleteApiKey(key, username)
        if (result.worked && isAdmin(username)) logItem(`Deleted API key: ${key}`, "audit", username, request.ip)
        return reply.code(result.worked ? 200 : (result.message === "Forbidden" ? 403 : 400)).send(result)
    })

    fastify.get("/api/users/providers", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        return reply.send(getUserProviders(username))
    })

    fastify.post("/api/masterkeys/create", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { name, key, url, limit, models, contextWindows } = request.body
        if (!name || !key || !url) return reply.code(400).send({ error: "name, key, and url are required" })
        const result = createMasterKey(name, key, url, username, limit, models, username, contextWindows)
        if (result.worked) logItem(`Created master key: ${name}`, "audit", username, request.ip)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.put("/api/masterkeys/edit", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { name, ...updates } = request.body
        if (!name) return reply.code(400).send({ error: "name is required" })
        const result = editMasterKey(name, updates, username)
        if (result.worked) logItem(`Edited master key: ${name}`, "audit", username, request.ip)
        return reply.code(result.worked ? 200 : (result.message === "Forbidden" ? 403 : 400)).send(result)
    })

    fastify.delete("/api/masterkeys/delete", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { name } = request.body
        if (!name) return reply.code(400).send({ error: "name is required" })
        const result = deleteMasterKey(name, username)
        if (result.worked) logItem(`Deleted master key: ${name}`, "audit", username, request.ip)
        return reply.code(result.worked ? 200 : (result.message === "Forbidden" ? 403 : 400)).send(result)
    })

    fastify.get("/api/logs/audit", async (request, reply) => {
        if (!isAuthed(request, true)) return reply.code(401).send({ error: "Unauthorized" })
        return reply.send(getAuditLogs())
    })

    fastify.post("/api/users/create", async (request, reply) => {
        if (!isAuthed(request, true)) return reply.code(401).send({ error: "Unauthorized" })
        const admin = getUserFromRequest(request)
        const { username } = request.body ?? {}
        if (!username) return reply.code(400).send({ error: "username is required" })
        const autoPass = process.env.AUTO_PASSWORD
        if (!autoPass) return reply.code(500).send({ error: "AUTO_PASSWORD env var is not set" })
        const result = addUser(username, autoPass)
        if (result.worked) logItem(`Created user: ${username}`, "audit", admin, request.ip)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.post("/api/users/resetPasswordSelf", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { newPassword } = request.body ?? {}
        if (!newPassword) return reply.code(400).send({ error: "newPassword is required" })
        const autoPass = process.env.AUTO_PASSWORD
        if (autoPass && newPassword === autoPass) return reply.code(400).send({ error: "Choose a different password." })
        const result = resetPassword(username, newPassword)
        return reply.code(result ? 200 : 404).send({ worked: !!result })
    })

    fastify.post("/api/users/resetToAuto/:username", async (request, reply) => {
        if (!isAuthed(request, true)) return reply.code(401).send({ error: "Unauthorized" })
        const admin = getUserFromRequest(request)
        const { username } = request.params
        const autoPass = process.env.AUTO_PASSWORD
        if (!autoPass) return reply.code(500).send({ error: "AUTO_PASSWORD env var is not set" })
        const result = resetPassword(username, autoPass)
        if (result) logItem(`Reset password to auto for user: ${username}`, "audit", admin, request.ip)
        return reply.code(result ? 200 : 404).send({ worked: !!result })
    })

    fastify.post("/api/users/ban/:username", async (request, reply) => {
        if (!isAuthed(request, true)) return reply.code(401).send({ error: "Unauthorized" })
        const admin = getUserFromRequest(request)
        const { username } = request.params
        const { reason } = request.body ?? {}
        const result = banUser(username, reason ?? "")
        if (result.worked) logItem(`Banned user: ${username}${reason ? ` — reason: ${reason}` : ""}`, "audit", admin, request.ip)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.post("/api/users/unban/:username", async (request, reply) => {
        if (!isAuthed(request, true)) return reply.code(401).send({ error: "Unauthorized" })
        const admin = getUserFromRequest(request)
        const { username } = request.params
        const result = unbanUser(username)
        if (result.worked) logItem(`Unbanned user: ${username}`, "audit", admin, request.ip)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.post("/api/users/setAdmin/:username", async (request, reply) => {
        if (!isAuthed(request, true)) return reply.code(401).send({ error: "Unauthorized" })
        const requester = getUserFromRequest(request)
        if (!isOwner(requester)) return reply.code(403).send({ error: "Only the owner can change admin rank" })
        const { username } = request.params
        const { makeAdmin } = request.body ?? {}
        if (typeof makeAdmin !== "boolean") return reply.code(400).send({ error: "makeAdmin (boolean) is required" })
        const result = setUserAdmin(username, makeAdmin)
        if (result.worked) logItem(`Set ${username} admin=${makeAdmin}`, "audit", requester, request.ip)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.post("/api/addPromptToKey", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { promptName, apiKey } = request.body
        if (!promptName || !apiKey) return reply.code(400).send({ error: "promptName and apiKey are required" })

        if (!findPromptOwner(promptName)) return reply.code(404).send({ error: "Prompt not found" })

        const keyOwner = getApiKeys(username).find(k => k.key === apiKey)
        if (!keyOwner) return reply.code(404).send({ error: "API key not found" })

        const result = addPromptToApiKey(apiKey, promptName)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.post("/api/addLorebookToKey", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { lorebookName, apiKey } = request.body
        if (!lorebookName || !apiKey) return reply.code(400).send({ error: "lorebookName and apiKey are required" })

        if (!findLorebookOwner(lorebookName)) return reply.code(404).send({ error: "Lorebook not found" })

        const keyOwner = getApiKeys(username).find(k => k.key === apiKey)
        if (!keyOwner) return reply.code(404).send({ error: "API key not found" })

        const result = addLorebookToApiKey(apiKey, lorebookName)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.post("/api/addPluginToKey", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { pluginName, apiKey } = request.body
        if (!pluginName || !apiKey) return reply.code(400).send({ error: "pluginName and apiKey are required" })

        const keyOwner = getApiKeys(username).find(k => k.key === apiKey)
        if (!keyOwner) return reply.code(404).send({ error: "API key not found" })

        const result = addPluginToApiKey(apiKey, pluginName)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.delete("/api/removePromptFromKey", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { promptName, apiKey } = request.body
        if (!promptName || !apiKey) return reply.code(400).send({ error: "promptName and apiKey are required" })

        const keyOwner = getApiKeys(username).find(k => k.key === apiKey)
        if (!keyOwner) return reply.code(404).send({ error: "API key not found" })

        const result = removePromptFromApiKey(apiKey, promptName)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.delete("/api/removeLorebookFromKey", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { lorebookName, apiKey } = request.body
        if (!lorebookName || !apiKey) return reply.code(400).send({ error: "lorebookName and apiKey are required" })

        const keyOwner = getApiKeys(username).find(k => k.key === apiKey)
        if (!keyOwner) return reply.code(404).send({ error: "API key not found" })

        const result = removeLorebookFromApiKey(apiKey, lorebookName)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    fastify.delete("/api/removePluginFromKey", async (request, reply) => {
        if (!isAuthed(request)) return reply.code(401).send({ error: "Unauthorized" })
        const username = getUserFromRequest(request)
        const { pluginName, apiKey } = request.body
        if (!pluginName || !apiKey) return reply.code(400).send({ error: "pluginName and apiKey are required" })

        const keyOwner = getApiKeys(username).find(k => k.key === apiKey)
        if (!keyOwner) return reply.code(404).send({ error: "API key not found" })

        const result = removePluginFromApiKey(apiKey, pluginName)
        return reply.code(result.worked ? 200 : 400).send(result)
    })

    done()
}