import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { route } from '../server/src/router';

const root = join(process.cwd(), 'frontend', 'build');
const port = Number(process.env.PORT || 8888);
const types: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (requestUrl.pathname.startsWith('/api/v1')) {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const method = request.method || 'GET';
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(request);
      const apiResponse = await route(new Request(requestUrl, { method, headers, body }));
      response.writeHead(apiResponse.status, Object.fromEntries(apiResponse.headers.entries()));
      response.end(Buffer.from(await apiResponse.arrayBuffer()));
      return;
    }

    const candidate = normalize(join(root, decodeURIComponent(requestUrl.pathname)));
    const safeCandidate = candidate.startsWith(root) ? candidate : join(root, 'index.html');
    const file = existsSync(safeCandidate) && statSync(safeCandidate).isFile()
      ? safeCandidate
      : join(root, 'index.html');
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown local server error',
    }));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Local application available at http://127.0.0.1:${port}`);
});
