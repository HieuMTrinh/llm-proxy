import { Express, NextFunction, Request, RequestHandler, Response } from 'express'
import { log, md5, sleep, extractDomainName } from '../utils/general'
import axios, { AxiosRequestConfig } from 'axios'

export interface Model {
  id: string
  object: string
  owned_by: string
  permission: Array<any>
}

export interface ModelMap {
  [key: string]: { url: string; model: Model }
}

const DEFAULT_CONTENT_TYPE = 'application/json'
const DEFAULT_PATH = '/v1'
const POST_METHOD = 'POST'
const ERROR_INTERNAL_SERVER = 'Internal Server Error'
const ERROR_PROCESSING_REQUEST = 'Error processing request'

function getPath(url: string): { path: string; base: string; apiKey?: string } {
  try {
    const urlParts = url.split('|')
    const apiKey = urlParts.length > 1 ? urlParts[1] : undefined
    const { origin, pathname } = new URL(urlParts[0])
    return {
      path: pathname === '/' ? DEFAULT_PATH : pathname,
      base: origin,
      apiKey
    }
  } catch {
    return url.startsWith('/')
      ? { path: url, base: 'http://localhost' }
      : { path: DEFAULT_PATH, base: 'http://localhost' }
  }
}

async function fetchModels(targetUrls: string[]): Promise<ModelMap> {
  const tmp: ModelMap = {}
  for (const urlAndToken of targetUrls) {
    const { path, base, apiKey } = getPath(urlAndToken)
    const headers: Record<string, string> = {
      accept: DEFAULT_CONTENT_TYPE,
      'Content-Type': DEFAULT_CONTENT_TYPE
    }

    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    try {
      const response = await axios.get(`${base}${path}/models`, { headers })
      const models = response.data.data || []
      const hostId = extractDomainName(base) // Consider logging the hostId if needed
      models.forEach((model: Model) => {
        tmp[md5(model.id)] = { url: urlAndToken, model }
      })
      log('info', `Models cached successfully for ${base}. [${models.map((m) => m.id).join(', ')}]`)
    } catch (error) {
      log('error', `Error fetching models from ${base}${path}/models: ${error.message}`)
      // You might want to maintain error counts or handle retry logic here
    }
  }
  return tmp
}

export class LLMController {
  private app: Express
  private requestHandlers: RequestHandler[]
  private targetUrls: string[] = []
  private modelCache: ModelMap = {}

  constructor({
    app,
    requestHandlers,
    targetUrls
  }: {
    app: Express
    requestHandlers: RequestHandler[]
    targetUrls: string[]
  }) {
    this.app = app
    this.requestHandlers = requestHandlers
    this.targetUrls = targetUrls
  }

  public registerRoutes(): void {
    this.app.get(`${DEFAULT_PATH}/models`, ...this.requestHandlers, this.models.bind(this))
    this.app.use('/', ...this.requestHandlers, this.forwardPostRequest.bind(this))
    log('info', 'LLMController routes registered')
    log('info', 'Fetching model lists...')
    this.cacheModels()
  }

  private async cacheModels(): Promise<void> {
    while (true) {
      this.modelCache = await fetchModels(this.targetUrls)
      await sleep(60000) // Rethink interval settings based on your needs
    }
  }

  private models(req: Request, res: Response): void {
    res.json({ data: Object.values(this.modelCache).map((item) => item.model), object: 'list' })
  }

  public async forwardPostRequest(req: Request, res: Response, next: NextFunction) {
    if (req.method === POST_METHOD && req.path.startsWith(DEFAULT_PATH)) {
      const { model: modelId } = req.body
      const { base: firstBaseUrl, path: firstPath, apiKey: firstApiKey } = getPath(this.targetUrls[0])

      let targetUrl = firstBaseUrl
      let targetPath = firstPath
      let targetApiKey = firstApiKey

      const hash = md5(modelId)
      if (modelId && this.modelCache[hash]) {
        const { path, base, apiKey } = getPath(this.modelCache[hash].url)
        targetUrl = base
        targetPath = path
        targetApiKey = apiKey
      }

      const reqPath = req.path.startsWith(`${DEFAULT_PATH}/`)
        ? req.path.replace(`${DEFAULT_PATH}`, targetPath)
        : `${targetPath}${req.path}`
      const fullUrl = new URL(reqPath, targetUrl).toString()
      log('info', `Forwarding request to: ${fullUrl} -> ${modelId}`)

      const headers: Record<string, string> = { ...req.headers }
      if (targetApiKey) headers['Authorization'] = `Bearer ${targetApiKey}`

      try {
        const axiosConfig: AxiosRequestConfig = {
          method: req.method,
          url: fullUrl,
          headers,
          data: req.body,
          responseType: 'stream'
        }

        // Remove headers that might cause issues
        delete axiosConfig.headers['host']
        delete axiosConfig.headers['content-length']

        const axiosResponse = await axios(axiosConfig)
        res.status(axiosResponse.status)
        Object.entries(axiosResponse.headers).forEach(([key, value]) => res.setHeader(key, value))
        axiosResponse.data.pipe(res)
      } catch (error) {
        log(`Error forwarding request: ${error.message}`, 'error')
        if (axios.isAxiosError(error) && error.response) {
          res.status(error.response.status).json({ error: ERROR_PROCESSING_REQUEST })
        } else {
          res.status(500).json({ error: ERROR_INTERNAL_SERVER })
        }
      }
    } else {
      next()
    }
  }
}
