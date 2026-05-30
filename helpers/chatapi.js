const StorageAPI = require("./storage.js")
const { checkAndIncrementUsage } = StorageAPI
const { preprocess } = require("./chatAPI/preprocessing.js")
const { scanChat }  = require("./chatAPI/mod.js")

// OpenAI-compatible error shape. source: "app" | "upstream"
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
    const modelList = StorageAPI.getModels(request.headers.authorization.split(" ")[1])

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

    const proxyUrl = `https://ffproxy.sayuki-proxy.com/?target=${encodeURIComponent(masterKey.upstreamUrl)}`
    const upstream = await fetch(proxyUrl, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${masterKey.upstreamKey}`,
        "X-Proxy-Token": "sayuki-proxy-forward-protection"
      },
      body: JSON.stringify(request.body),
      method: "POST"
    })

    if (!upstream.ok) {
      let upstreamBody
      try { upstreamBody = await upstream.json() } catch { upstreamBody = null }
      return reply.status(upstream.status).send({
        error: {
          message: upstreamBody?.error?.message ?? "Upstream provider returned an error.",
          type: "upstream_error",
          code: upstreamBody?.error?.code ?? "upstream_error",
          param: null,
          upstream_status: upstream.status
        }
      })
    }

    if (request.body.stream === true) {
      const { Readable } = require("stream")
      reply.header("Content-Type", "text/event-stream")
      return reply.send(Readable.fromWeb(upstream.body))
    } else {
      return reply.send(await upstream.json())
    }
  })

  done()
}
