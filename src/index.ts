import dotenv from 'dotenv'
import express from 'express'
import 'express-async-errors'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { tokenMiddleware } from './utils/auth'
import { log } from './utils/general'
import { AuthController } from './controllers/auth'
import { NginxController } from './controllers/nginx'
import { LLMController } from './controllers/llm'

dotenv.config()
const { PORT, TARGET_URLS, PAYLOAD_LIMIT } = process.env
if (!TARGET_URLS) {
  throw new Error('Configuration error: TARGET_URLS must be defined')
}
const port = Number(PORT) || 8080
const targetUrls = TARGET_URLS.split(',').map((url) => url.trim())
const payloadLimit = PAYLOAD_LIMIT || '1mb'

const app = express()
app.use(express.json({ limit: payloadLimit }))
app.use(express.urlencoded({ extended: false, limit: payloadLimit }))
app.use(cors())
app.use(helmet())
app.use(morgan('combined', { stream: { write: msg => log('info', msg.trim()) } }))
log('info', `Payload limit is: ${payloadLimit}`)

// Express routes
app.get('/', (req, res) => {
  res.send('LLM Proxy')
})

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

const authController = new AuthController({ app })
authController.registerRoutes()

const nginxController = new NginxController({ app, requestHandlers: [tokenMiddleware] })
nginxController.registerRoutes()

const llmController = new LLMController({ app, requestHandlers: [tokenMiddleware], targetUrls })
llmController.registerRoutes()

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

// error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log('error', err.stack || err.message)
  res.status(err.status || 500).json({ error: err.message })
})

const server = app.listen(port, () => {
  log('info', `Server running at http://localhost:${port}`)
})

const shutdown = () => {
  log('info', 'Received shutdown signal, closing server...')
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)