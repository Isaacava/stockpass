import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function localSolanaRpcProxy(): Plugin {
  return {
    name: 'stockpass-local-solana-rpc-proxy',
    configureServer(server) {
      server.middlewares.use('/api/solana-rpc', (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'POST required' }));
          return;
        }

        const upstream = process.env.SOLANA_RPC_URL || '';
        if (!upstream) {
          res.statusCode = 503;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'SOLANA_RPC_URL is not configured.' }));
          return;
        }

        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', async () => {
          try {
            const response = await fetch(upstream, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body,
            });
            const text = await response.text();
            res.statusCode = response.status;
            res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
            res.setHeader('cache-control', 'no-store');
            res.end(text);
          } catch (error) {
            console.error('local-solana-rpc-proxy', error);
            res.statusCode = 502;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({
              error: error instanceof Error ? error.message : 'Solana RPC request failed.',
            }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localSolanaRpcProxy()],
  server: { port: 5173 }
});
