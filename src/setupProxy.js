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
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
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

          // Add the required headers for Anthropic
          proxyReq.setHeader('x-api-key', apiKey);
          proxyReq.setHeader('anthropic-version', '2023-06-01');
          proxyReq.setHeader('Content-Type', 'application/json');
          // Add the required CORS header for direct browser access
          proxyReq.setHeader('anthropic-dangerous-direct-browser-access', 'true');
          
          // Remove the API key from the body
          const modifiedBody = { ...req.body };
          delete modifiedBody.anthropicApiKey;
          
          // Log the request structure (without sensitive data)
          global.console.log('Anthropic request structure:', {
            model: modifiedBody.model,
            hasMessages: !!modifiedBody.messages,
            messageCount: modifiedBody.messages ? modifiedBody.messages.length : 0,
            hasSystem: !!modifiedBody.system,
            temperature: modifiedBody.temperature,
            max_tokens: modifiedBody.max_tokens
          });

          const bodyData = JSON.stringify(modifiedBody);
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);

          // Log request headers
          global.console.log('Anthropic request headers:', {
            'anthropic-version': proxyReq.getHeader('anthropic-version'),
            'Content-Type': proxyReq.getHeader('Content-Type'),
            'Content-Length': proxyReq.getHeader('Content-Length'),
            'has-api-key': !!proxyReq.getHeader('x-api-key'),
            'has-cors-header': !!proxyReq.getHeader('anthropic-dangerous-direct-browser-access')
          });
        }
      },
      onProxyRes: function(proxyRes) {
        // Log response status
        global.console.log('Anthropic response status:', proxyRes.statusCode);
        
        // Add CORS headers
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access';
        
        // Log response body for debugging - but don't try to parse it here
        // as it might interfere with the response streaming
        if (proxyRes.statusCode !== 200) {
          let responseBody = '';
          proxyRes.on('data', chunk => {
            responseBody += chunk;
          });
          
          proxyRes.on('end', () => {
            try {
              // Only try to parse as JSON if it looks like JSON
              if (responseBody.trim().startsWith('{')) {
                const parsedBody = JSON.parse(responseBody);
                if (parsedBody.error) {
                  global.console.error('Anthropic API error:', parsedBody.error);
                }
              } else {
                global.console.log('Anthropic API response is not JSON format');
              }
            } catch (e) {
              global.console.error('Error parsing Anthropic response:', e);
              global.console.log('Raw response body (first 100 chars):', responseBody.substring(0, 100));
            }
          });
        }
      },
      onError: function(err, req, res) {
        global.console.error('Anthropic Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      },
      proxyTimeout: 30000,
      timeout: 30000,
      logLevel: 'debug'
    })
  );
}; 