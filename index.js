const fastify = require("fastify")
const path = require("path")
require("dotenv").config()

const app = fastify({ trustProxy: true })

app.register(require("@fastify/static"), {
    root: path.join(__dirname, "public"),
    prefix: "/",
})

app.register(require("@fastify/rate-limit"), {
    max: 100,
    timeWindow: "1 minute"
})

app.register(require("@fastify/cors"), {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
})

app.get("/health", async (request, reply) => {
    return reply.status(200).reply("ok") // i sure fucking hope we're ok
})

// mount the routes.
// see here you'd expect me to make a childish joke revolving around my oshi
// like "mount the pippa"
// but i am a normal person who would never do that
// except for the fact i just thought of that
// fuck
app.register(require("./helpers/chatApi.js"))
app.register(require("./helpers/routes.js"))

app.listen({port: process.env.PORT || 3000}, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})