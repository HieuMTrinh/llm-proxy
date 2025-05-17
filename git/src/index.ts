import express from 'express';
import { NginxController } from './controllers/nginxController';

async function bootstrap(): Promise<void> {
    const app = express();
    app.use(express.json());

    const nginxController = new NginxController();

    // Register Nginx-related HTTP routes
    nginxController.registerRoutes(app);

    // Start the Nginx service
    await nginxController.start();

    const port = process.env.PORT ?? 3000;
    app.listen(port, () => {
        console.log(`HTTP server listening on port ${port}`);
    });
}

bootstrap().catch((error) => {
    console.error('Application failed to start:', error);
    process.exit(1);
});