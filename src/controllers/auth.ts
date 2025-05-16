import { Express, Request, Response, RequestHandler } from 'express'
import { NginxManager } from '../utils/nginx'
import { log } from '../utils/general'

/**
 * Controller class for handling Nginx-related HTTP routes.
 */
export class NginxController {
  private app: Express
  private nginxManager: NginxManager
  private requestHandlers: RequestHandler[]

  /**
   * Initializes a new instance of the NginxController.
   * @param app - The Express application instance.
   * @param requestHandlers - An array of request handlers to be used for middleware.
   */
  constructor({ app, requestHandlers }: { app: Express; requestHandlers: RequestHandler[] }) {
    this.app = app
    this.requestHandlers = requestHandlers
    this.nginxManager = new NginxManager()
  }

  /**
   * Registers all Nginx-related routes with the Express application.
   */
  public registerRoutes(): void {
    this.app.get('/nginx/reload', ...this.requestHandlers, this.reloadNginx)
    this.app.post('/nginx/config/update', ...this.requestHandlers, this.updateConfig)
    this.app.get('/nginx/config/get', ...this.requestHandlers, this.getConfig)
    this.app.get('/nginx/config/get-default', ...this.requestHandlers, this.getDefaultConfig)
    this.app.post('/nginx/config/write-default', ...this.requestHandlers, this.writeDefaultConfig)
    this.app.post('/nginx/certificates/obtain', ...this.requestHandlers, this.obtainCertificates)
    this.app.get('/nginx/certificates/renew', ...this.requestHandlers, this.renewCertificates)

    log('info', 'NginxController initialized')
  }

  /**
   * Starts the Nginx service.
   * @returns A promise that resolves when the Nginx service has started.
   */
  public async start(): Promise<void> {
    const { success, message } = await this.nginxManager.start()
    if (!success) {
      log('error', `Failed to start Nginx: ${message}`)
    }
  }

  /**
   * Reloads the Nginx configuration.
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   */
  private async reloadNginx(req: Request, res: Response): Promise<void> {
    const { success, message } = await this.nginxManager.reload()
    const status = success ? 200 : 500
    res.status(status).json({ success, message })
  }

  /**
   * Updates the Nginx configuration with the provided data.
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   */
  private async updateConfig(req: Request, res: Response): Promise<void> {
    if (req.body && req.body.config) {
      const newConfig = req.body.config
      const { success, message } = await this.nginxManager.updateConfig(newConfig)
      const status = success ? 200 : 500
      res.status(status).json({ success, message })
    } else {
      res.status(400).json({ success: false, message: 'Invalid request body' })
    }
  }

  /**
   * Retrieves the current Nginx configuration.
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   */
  private async getConfig(req: Request, res: Response): Promise<void> {
    const { success, message, config } = await this.nginxManager.getConfig()
    const status = success ? 200 : 500
    res.status(status).json({ success, message, config })
  }

  /**
   * Retrieves the default Nginx configuration template.
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   */
  private async getDefaultConfig(req: Request, res: Response): Promise<void> {
    const { success, message, config } = await this.nginxManager.getTemplate()
    if (success && config) {
      res.json({ success, config })
    } else {
      res.status(500).json({ success, message })
    }
  }

  /**
   * Writes the default Nginx configuration template with the provided domain and CIDR groups.
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   */
  private async writeDefaultConfig(req: Request, res: Response): Promise<void> {
    if (req.body && req.body.domain && req.body.cidrGroups) {
      const { domain, cidrGroups } = req.body
      if (Array.isArray(cidrGroups) && typeof domain === 'string') {
        const { success, message } = await this.nginxManager.writeDefaultTemplate(domain, cidrGroups)
        if (success) {
          res.json({ success, message: 'Default config written successfully' })
        } else {
          res.status(500).json({ success, message })
        }
      } else {
        res.status(400).json({ success: false, message: 'Invalid request body' })
      }
    } else {
      res.status(400).json({ success: false, message: 'Invalid request body' })
    }
  }

  /**
   * Obtains SSL certificates for the provided domains.
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   */
  private async obtainCertificates(req: Request, res: Response): Promise<void> {
    if (req.body && req.body.domains && Array.isArray(req.body.domains)) {
      const domains = req.body.domains
      const { success, message } = await this.nginxManager.obtainCertificates(domains, true)
      const status = success ? 200 : 500
      res.status(status).json({ success, message })
    } else {
      res.status(400).json({ success: false, message: 'Invalid request body' })
    }
  }

  /**
   * Renews SSL certificates for the Nginx service.
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   */
  private async renewCertificates(req: Request, res: Response): Promise<void> {
    const { success, message } = await this.nginxManager.renewCertificates()
    const status = success ? 200 : 500
    res.status(status).json({ success, message })
  }
}
