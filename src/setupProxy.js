const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');

module.exports = function(app) {
  // Add body parsing middleware before the proxy
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Handle OPTIONS requests for CORS preflight first
  app.use('/api/proxy/*', (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
      return res.sendStatus(200);
    }
    next();
  });

  // Proxy OpenAI API requests
  app.use(
    '/api/proxy/openai',
    createProxyMiddleware({
      target: 'https://api.openai.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/proxy/openai': '/v1',
      },
      onProxyReq: function(proxyReq, req) {
        // Only modify the request if it's a POST request with a body
        if (req.method === 'POST' && req.body) {
          // Get the API key from the body or environment variable
          const apiKey = req.body.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY;
          
          if (!apiKey) {
            global.console.error('No OpenAI API key provided in request body or environment');
            return;
          }

          // Log that we're setting the Authorization header (without exposing the key)
          global.console.log('Setting Authorization header with API key');
          global.console.log('API key prefix:', apiKey.substring(0, 10) + '...');

          // Set the Authorization header
          proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
          proxyReq.setHeader('Content-Type', 'application/json');

          // Remove the API key from the body
          const modifiedBody = { ...req.body };
          delete modifiedBody.openaiApiKey;

          // Convert the modified body to a string
          const bodyData = JSON.stringify(modifiedBody);

          // Log the modified request (without sensitive data)
          global.console.log('Modified request:', {
            headers: proxyReq.getHeaders(),
            bodyLength: bodyData.length,
            hasMessages: !!modifiedBody.messages
          });

          // Set the correct content length
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));

          // Write the body to the request
          proxyReq.write(bodyData);
        } else {
          global.console.error('Request is not POST or has no body:', {
            method: req.method,
            hasBody: !!req.body,
            bodyContent: req.body
          });
        }
      },
      onProxyRes: function(proxyRes) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      },
      // Add error handling
      onError: function(err, req, res) {
        global.console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      },
      // Increase timeout
      proxyTimeout: 30000,
      timeout: 30000,
      // Add logging
      logLevel: 'debug'
    })
  );

  // Proxy Anthropic API requests
  app.use(
    '/api/proxy/anthropic',
    createProxyMiddleware({
      target: 'https://api.anthropic.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/proxy/anthropic': '/v1/messages',
      },
      onProxyReq: function(proxyReq, req) {
        if (req.method === 'POST' && req.body) {
          const apiKey = req.body.anthropicApiKey;
          
          if (!apiKey) {
            global.console.error('No Anthropic API key provided');
            return;
          }

          proxyReq.setHeader('x-api-key', apiKey);
          proxyReq.setHeader('anthropic-version', '2023-06-01');
          proxyReq.setHeader('Content-Type', 'application/json');

          const modifiedBody = { ...req.body };
          delete modifiedBody.anthropicApiKey;

          const bodyData = JSON.stringify(modifiedBody);
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      onProxyRes: function(proxyRes) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-api-key, anthropic-version';
      },
      onError: function(err, req, res) {
        global.console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      },
      proxyTimeout: 30000,
      timeout: 30000,
      logLevel: 'debug'
    })
  );
}; 