import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'read-input-folder',
        configureServer(server) {
          server.middlewares.use('/api/list-input', (req, res, next) => {
            // Correct path based on user workspace
            const inputDir = path.resolve(__dirname, 'OpitmizadorV3gilmore/input');

            if (!fs.existsSync(inputDir)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Input directory not found' }));
              return;
            }

            try {
              const files = fs.readdirSync(inputDir)
                .filter((file: string) => file.endsWith('.xlsx') || file.endsWith('.xls'))
                .map((file: string) => {
                  const stats = fs.statSync(path.join(inputDir, file));
                  return { name: file, mtime: stats.mtime };
                })
                .sort((a: any, b: any) => b.mtime - a.mtime); // Sort by new

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(files));
            } catch (e) {
              console.error(e);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Error reading directory' }));
            }
          });

          server.middlewares.use('/api/read-input', (req, res, next) => {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const filename = url.searchParams.get('file');

            if (!filename) {
              res.statusCode = 400;
              res.end('Missing file parameter');
              return;
            }

            const filePath = path.resolve(__dirname, 'OpitmizadorV3gilmore/input', filename);

            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end('File not found');
              return;
            }

            try {
              const fileBuffer = fs.readFileSync(filePath);
              res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
              res.end(fileBuffer);
            } catch (e) {
              res.statusCode = 500;
              res.end('Error reading file');
            }
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
