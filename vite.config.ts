import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function localApiPlugin(): Plugin {
  return {
    name: 'local-api-handler',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/youtube-playlist')) {
          try {
            const { default: handler } = await server.ssrLoadModule('./api/youtube-playlist.ts');
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            (req as any).query = Object.fromEntries(urlObj.searchParams.entries());
            await handler(req, res);
            return;
          } catch (err: any) {
            console.error('Error in local /api/youtube-playlist handler:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err?.message || 'Internal server error' }));
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), localApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, _res) => {
              // Graceful fallback for local development if standalone backend is not running
            });
          }
        }
      },
    },
  };
});
