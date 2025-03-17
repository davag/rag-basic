const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
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

  // Proxy Anthropic API requests
  app.use(
    '/api/proxy/anthropic',
    createProxyMiddleware({
      target: 'https://api.anthropic.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/proxy/anthropic': '/v1/messages',
      },
      onProxyReq: function(proxyReq, req, res) {
        if (req.body && req.body.anthropicApiKey) {
          // Set the Anthropic API key in the headers
          proxyReq.setHeader('x-api-key', req.body.anthropicApiKey);
          proxyReq.setHeader('anthropic-version', '2023-06-01');
          
          // Create a new body without the API key
          const newBody = { ...req.body };
          delete newBody.anthropicApiKey;
          
          // Convert body to string
          const bodyData = JSON.stringify(newBody);
          
          // Update content-length header
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          
          // Write new body to request
          proxyReq.write(bodyData);
          proxyReq.end();
        }
      },
      onProxyRes: function(proxyRes) {
        // Add CORS headers to the response
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-api-key, anthropic-version';
      }
    })
  );

  // Proxy OpenAI API requests
  app.use(
    '/api/proxy/openai',
    createProxyMiddleware({
      target: 'https://api.openai.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/proxy/openai': '/v1',
      },
      onProxyReq: function(proxyReq, req, res) {
        console.log('OpenAI proxy request received:');
        console.log(`- Method: ${req.method}`);
        console.log(`- Path: ${req.path}`);
        console.log(`- Original URL: ${req.originalUrl}`);
        
        if (req.body) {
          console.log('- Request body present');
          
          if (req.body.openaiApiKey) {
            console.log('- API key found in request body');
            const apiKeyPrefix = req.body.openaiApiKey.substring(0, 10);
            console.log(`- API key prefix: ${apiKeyPrefix}...`);
            
            // Set the OpenAI API key in the headers
            proxyReq.setHeader('Authorization', `Bearer ${req.body.openaiApiKey}`);
            console.log('- Set Authorization header with Bearer token');
            
            // Create a new body without the API key
            const newBody = { ...req.body };
            delete newBody.openaiApiKey;
            
            // Convert body to string
            const bodyData = JSON.stringify(newBody);
            
            // Update content-length header
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            console.log(`- Updated Content-Length: ${Buffer.byteLength(bodyData)}`);
            
            // Write new body to request
            proxyReq.write(bodyData);
            console.log('- Wrote modified body to proxy request');
            
            // Log headers being sent
            console.log('- Proxy request headers:');
            const headers = proxyReq.getHeaders();
            Object.keys(headers).forEach(key => {
              console.log(`  ${key}: ${key === 'authorization' ? 'Bearer [REDACTED]' : headers[key]}`);
            });
          } else {
            console.error('No OpenAI API key provided in request body');
          }
          
          // Always end the request
          proxyReq.end();
          console.log('- Ended proxy request');
        } else {
          console.error('No request body found');
          proxyReq.end();
        }
      },
      onProxyRes: function(proxyRes, req, res) {
        // Log response status for debugging
        console.log(`OpenAI proxy response received: ${proxyRes.statusCode}`);
        
        // Log response headers
        console.log('OpenAI proxy response headers:');
        Object.keys(proxyRes.headers).forEach(key => {
          console.log(`  ${key}: ${proxyRes.headers[key]}`);
        });
        
        // Add CORS headers to the response
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        
        // Collect the response body for logging
        let responseBody = '';
        proxyRes.on('data', chunk => {
          responseBody += chunk;
        });
        
        proxyRes.on('end', () => {
          try {
            const parsedBody = JSON.parse(responseBody);
            if (parsedBody.error) {
              console.error('OpenAI API error response:', parsedBody.error);
            } else {
              console.log('OpenAI API successful response');
            }
          } catch (e) {
            console.error('Error parsing response body:', e);
          }
        });
      }
    })
  );
}; 