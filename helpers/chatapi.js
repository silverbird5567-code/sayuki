const StorageAPI = require("./storage.js")
const { checkAndIncrementUsage } = StorageAPI
const { preprocess, countTokens } = require("./chatAPI/preprocessing.js")
const { scanChat }  = require("./chatAPI/mod.js")

const _reqStats = {
    total: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    recentTimestamps: [],
}

function _recordRequest() {
    _reqStats.total++
    const ts = Date.now()
    _reqStats.recentTimestamps.push(ts)
    const cutoff = ts - 60000
    _reqStats.recentTimestamps = _reqStats.recentTimestamps.filter(t => t >= cutoff)
}

function _recordTokens(input, output) {
    if (input)  _reqStats.totalInputTokens  += input
    if (output) _reqStats.totalOutputTokens += output
}

function getRequestStats() {
    const cutoff = Date.now() - 60000
    _reqStats.recentTimestamps = _reqStats.recentTimestamps.filter(t => t >= cutoff)
    const n = _reqStats.total
    return {
        requests: n,
        requestAverageInput:  n ? Math.round(_reqStats.totalInputTokens  / n) : 0,
        requestAverageOutput: n ? Math.round(_reqStats.totalOutputTokens / n) : 0,
        rpm: _reqStats.recentTimestamps.length,
    }
}

function makeError(message, code, type, status) {
  return { status, body: { error: { message, type, code, param: null } } }
}

const APP_ERRORS = {
  lorebary:         makeError("For safety and security concerns, Lorebary is not allowed to be used with Sayuki.", "lorebary_blocked",       "invalid_request_error", 400),
  no_api_key:       makeError("No API key provided.",                                                              "no_api_key",             "authentication_error",  401),
  invalid_api_key:  makeError("Invalid API key.",                                                                  "invalid_api_key",        "authentication_error",  401),
  rate_limit:       makeError("Rate limit exceeded for this provider. Try again after UTC midnight.",              "rate_limit_exceeded",    "rate_limit_error",      429),
  model_not_allowed:makeError("Model not allowed by this key.",                                                    "model_not_allowed",      "permission_error",      403),
  content_moderated:makeError("Your message was flagged by the content moderation system.",                        "content_moderated",      "invalid_request_error", 403),
}

function sendError(reply, err) {
  return reply.status(err.status).send(err.body)
}

module.exports = function (fastify, opts, done) {

  fastify.get("/v1/", async (request, reply) => {
    return reply.send(["/chat/completions", "models"])
  })

  fastify.get("/v1/models", async (request, reply) => {
    const apiKey = request.headers.authorization?.split(" ")[1] ?? null
    const modelList = StorageAPI.getModels(apiKey)

    return reply.send({
      object: "list",
      data: modelList.map(m => ({
        id: m.name,
        object: "model",
        created: 0,
        owned_by: m.owner
      }))
    })
  })

  fastify.get("/v1/chat/completions", function(request, reply) {
    return reply.status(405).send({
      error: { message: "Method Not Allowed", type: "invalid_request_error", code: "method_not_allowed", param: null }
    })
  })

  fastify.post("/v1/chat/completions", async function(request, reply) {

    if (JSON.stringify(request.body).includes("lorebary")) {
      return sendError(reply, APP_ERRORS.lorebary)
    }

    // strip tools
    request.body.tools = []

    if (request.headers.authorization == null) {
      return sendError(reply, APP_ERRORS.no_api_key)
    }

    const userKeyToken = request.headers.authorization.split(" ")[1]
    const masterKey = StorageAPI.validateKey(userKeyToken)

    if (masterKey === false) {
      return sendError(reply, APP_ERRORS.invalid_api_key)
    }

    if (!checkAndIncrementUsage(masterKey.masterKeyName, userKeyToken)) {
      return sendError(reply, APP_ERRORS.rate_limit)
    }

    if (masterKey.allowedModels.length > 0 && !masterKey.allowedModels.includes(request.body.model)) {
      return sendError(reply, APP_ERRORS.model_not_allowed)
    }

    request.body.messages = preprocess(
      request.body.messages,
      masterKey.lorebooks,
      masterKey.prompts,
      masterKey.plugins,
      StorageAPI.getContextWindow(request.body.model, masterKey.provider)
    )

    if ((await scanChat(request.body.messages, masterKey.user, request.ip))["isFlagged"]) {
      return sendError(reply, APP_ERRORS.content_moderated)
    }

    const inputEstimate = Math.round(countTokens(request.body.messages))

    const proxyUrl = `https://ffproxy.sayuki-proxy.com/?target=${encodeURIComponent(masterKey.upstreamUrl)}`
    const upstreamHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${masterKey.upstreamKey}`,
      "X-Proxy-Token": "sayuki-proxy-forward-protection"
    }
    const upstreamBody = JSON.stringify(request.body)

    if (global.__DEBUG) {
      global.__debugLog("UPSTREAM FETCH", {
        proxyUrl,
        targetUrl: masterKey.upstreamUrl,
        headers: upstreamHeaders,
        body: request.body,
      })
    }

    const upstream = await fetch(proxyUrl, {
      headers: upstreamHeaders,
      body: upstreamBody,
      method: "POST"
    })

    if (global.__DEBUG) {
      const upstreamRespHeaders = {}
      upstream.headers.forEach((v, k) => { upstreamRespHeaders[k] = v })
      global.__debugLog(`UPSTREAM RESPONSE ${upstream.status}`, { headers: upstreamRespHeaders })
    }

    if (!upstream.ok) {
      let upstreamBody
      try { upstreamBody = await upstream.json() } catch { upstreamBody = null }
      return reply.status(upstream.status).send({
        error: {
          message: "Upstream provider returned an error.",
          type: "upstream_error",
          code: upstreamBody?.error?.code ?? "upstream_error",
          param: null,
          upstream_status: upstream.status
        }
      })
    }

    _recordRequest()
    _recordTokens(inputEstimate, 0)

    if (request.body.stream === true) {
      const { Readable, Transform } = require("stream")
      reply.header("Content-Type", "text/event-stream")

      let outputLength = 0
      const interceptor = new Transform({
        transform(chunk, _enc, cb) {
          const lines = chunk.toString().split("\n")
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6).trim()
            if (payload === "[DONE]") continue
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content
              if (delta) outputLength += delta.length
            } catch {}
          }
          this.push(chunk)
          cb()
        },
        flush(cb) {
          _recordTokens(0, Math.round(outputLength / 3))
          cb()
        }
      })

      return reply.send(Readable.fromWeb(upstream.body).pipe(interceptor))
    } else {
      const responseBody = await upstream.json()
      const outputContent = responseBody?.choices?.[0]?.message?.content ?? ""
      _recordTokens(0, Math.round(outputContent.length / 3))
      if (global.__DEBUG) global.__debugLog("UPSTREAM RESPONSE BODY (non-stream)", responseBody)
      return reply.send(responseBody)
    }
  })

  done()
}

module.exports.getRequestStats = getRequestStats
