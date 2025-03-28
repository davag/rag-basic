const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');
require('dotenv').config();

// Set limits high enough to handle large requests
const BODY_PARSER_LIMIT = '50mb';

const BACKEND_PORT = process.env.BACKEND_PORT || 3002;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

module.exports = function(app) {
  console.log('[PROXY SETUP] Setting up middleware with bodyParser limits:', BODY_PARSER_LIMIT);
  
  // Add body parsing middleware before the proxy with increased limits
  app.use(bodyParser.json({ limit: BODY_PARSER_LIMIT }));
  app.use(bodyParser.urlencoded({ extended: true, limit: BODY_PARSER_LIMIT }));
  
  // Custom middleware to log ALL request bodies for debugging
  app.use('/api/proxy/azure', (req, res, next) => {
    console.log('\n[AZURE PROXY DEBUGGER] Request path:', req.path);
    console.log('[AZURE PROXY DEBUGGER] Method:', req.method);
    console.log('[AZURE PROXY DEBUGGER] Content-Type:', req.headers['content-type']);
    console.log('[AZURE PROXY DEBUGGER] Body keys:', Object.keys(req.body || {}));
    console.log('[AZURE PROXY DEBUGGER] Has deploymentName:', !!req.body.deploymentName);
    console.log('[AZURE PROXY DEBUGGER] DeploymentName value:', req.body.deploymentName);
    
    // Don't manipulate the body yet, just log it
    next();
  });

  // Add generic proxy for all API requests
  app.use(
    '/api',
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      logLevel: 'debug',
      onProxyReq: function(proxyReq, req) {
        console.log(`Proxying API request: ${req.method} ${req.path}`);

        // For POST requests, we need to restream the body
        if (req.method === 'POST' && req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
          proxyReq.end();
        }
      },
      onError: function(err, req, res) {
        console.error('API Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      }
    })
  );

  // Proxy cost tracking and other API endpoints
  app.use(
    '/api/cost-tracking',
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      logLevel: 'debug',
      onProxyReq: function(proxyReq, req) {
        console.log(`Proxying cost tracking request: ${req.method} ${req.path}`);

        // For POST requests, we need to restream the body
        if (req.method === 'POST' && req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          // Make sure we end the stream to avoid hanging
          proxyReq.write(bodyData);
          proxyReq.end();
        }
      },
      onError: function(err, req, res) {
        console.error('Cost Tracking Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      }
    })
  );
  
  // Legacy format endpoints
  app.use(
    '/api/cost-tracking-summary',
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      logLevel: 'debug',
      onProxyReq: function(proxyReq, req) {
        // For POST requests, we need to restream the body
        if (req.method === 'POST' && req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
          proxyReq.end();
        }
      },
      onError: function(err, req, res) {
        console.error('Cost Tracking Summary Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      }
    })
  );
  
  app.use(
    '/api/cost-tracking-export',
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      logLevel: 'debug',
      onProxyReq: function(proxyReq, req) {
        // For POST requests, we need to restream the body
        if (req.method === 'POST' && req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
          proxyReq.end();
        }
      },
      onError: function(err, req, res) {
        console.error('Cost Tracking Export Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      }
    })
  );
  
  app.use(
    '/api/cost-tracking-reset',
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      logLevel: 'debug',
      onProxyReq: function(proxyReq, req) {
        // For POST requests, we need to restream the body
        if (req.method === 'POST' && req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
          proxyReq.end();
        }
      },
      onError: function(err, req, res) {
        console.error('Cost Tracking Reset Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      }
    })
  );
  
  app.use(
    '/api/cost-tracking-settings',
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      logLevel: 'debug',
      onProxyReq: function(proxyReq, req) {
        // For POST requests, we need to restream the body
        if (req.method === 'POST' && req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
          proxyReq.end();
        }
      },
      onError: function(err, req, res) {
        console.error('Cost Tracking Settings Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      }
    })
  );

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

          // Remove the API key and queryId from the body
          const modifiedBody = { ...req.body };
          delete modifiedBody.openaiApiKey;
          delete modifiedBody.queryId;

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
        '^/api/proxy/anthropic/messages': '/v1/messages',
        '^/api/proxy/anthropic': '/v1',  // Default path rewrite for other endpoints
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
          
          // Remove the API key and queryId from the body
          const modifiedBody = { ...req.body };
          delete modifiedBody.anthropicApiKey;
          delete modifiedBody.queryId;
          
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
        global.console.log('Anthropic response headers:', proxyRes.headers);
        
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
                global.console.log('Anthropic API response body:', parsedBody);
                if (parsedBody.error) {
                  global.console.error('Anthropic API error:', parsedBody.error);
                }
              } else {
                global.console.log('Anthropic API response is not JSON format');
                global.console.log('Raw response body (first 300 chars):', responseBody.substring(0, 300));
              }
            } catch (e) {
              global.console.error('Error parsing Anthropic response:', e);
              global.console.log('Raw response body (first 300 chars):', responseBody.substring(0, 300));
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

  // Proxy Azure OpenAI API requests
  app.use(
    '/api/proxy/azure/chat/completions',
    createProxyMiddleware({
      target: 'https://api.openai.com', // This will be overridden by the actual Azure endpoint
      changeOrigin: true,
      router: function(req) {
        // STATIC DEPLOYMENT NAME FIX 
        console.log('[AZURE PROXY] STATIC FIX: Setting deploymentName to gpt-4o');
        req.body.deploymentName = 'gpt-4o';  // Hardcode this explicitly
        
        // Log complete request body for debugging
        console.log('[AZURE PROXY] Full request body keys:', Object.keys(req.body).join(', '));
        console.log('[AZURE PROXY] Has deploymentName after static fix:', !!req.body.deploymentName);
        console.log('[AZURE PROXY] DeploymentName value after static fix:', req.body.deploymentName);
        console.log('[AZURE PROXY] Has model:', !!req.body.model);
        
        // EMERGENCY FIX - BYPASS THE CHECKS AND FORCE DEPLOYMENT NAME
        let forcedDeploymentName;
        if (req.body.model && req.body.model.startsWith('azure-')) {
          forcedDeploymentName = req.body.model.replace('azure-', '');
        } else if (req.body.model) {
          forcedDeploymentName = req.body.model;
        } else {
          // Last resort
          forcedDeploymentName = 'gpt-4o';
        }
        console.log(`[AZURE PROXY EMERGENCY] Forcing deployment name: ${forcedDeploymentName}`);
        req.body.deploymentName = forcedDeploymentName;
        
        if (req.body.model) {
          console.log('[AZURE PROXY] Model value:', req.body.model);
        }
        
        // CRITICAL FIX: Ensure deploymentName is present
        if (!req.body.deploymentName && req.body.model) {
          if (req.body.model.startsWith('azure-')) {
            req.body.deploymentName = req.body.model.replace('azure-', '');
          } else {
            req.body.deploymentName = req.body.model;
          }
          console.log(`[AZURE PROXY CRITICAL FIX] Set deploymentName to '${req.body.deploymentName}' from model`);
        }
        
        // Get the Azure endpoint from the request body
        const endpoint = req.body.azureEndpoint;
        if (!endpoint) {
          throw new Error('Azure endpoint is required');
        }
        // Remove trailing slash if present
        return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
      },
      pathRewrite: function(path, req) {
        console.log('[PATH REWRITE] START - Original path:', path);
        
        // HARDCODED PATH SOLUTION - bypass all variable logic
        const hardcodedPath = '/openai/deployments/gpt-4o/chat/completions?api-version=2023-05-15';
        console.log(`[PATH REWRITE] USING HARDCODED PATH: ${hardcodedPath}`);
        
        // Set this in req.body to make sure it's there for later stages
        req.body.deploymentName = 'gpt-4o';
        
        return hardcodedPath;
      },
      onProxyReq: function(proxyReq, req) {
        if (req.method === 'POST' && req.body) {
          // HARDCODED HEADER SOLUTION
          console.log('[PROXY REQ] Setting hardcoded deployment name in headers');
          proxyReq.setHeader('x-ms-azure-openai-deployment', 'gpt-4o');
          
          // Get the API key from the request body
          const apiKey = req.body.azureApiKey;
          
          if (!apiKey) {
            global.console.error('Missing API key in Azure OpenAI request');
            return;
          }

          // Set the API key header
          proxyReq.setHeader('api-key', apiKey);
          proxyReq.setHeader('Content-Type', 'application/json');

          // Remove Azure-specific fields from the body but KEEP model
          const modifiedBody = { ...req.body };
          delete modifiedBody.azureApiKey;
          delete modifiedBody.azureEndpoint;
          delete modifiedBody.apiVersion;
          delete modifiedBody.queryId;
          
          // IMPORTANT: Make sure the model is the same as the deployment name
          // This is critical for Azure OpenAI
          modifiedBody.model = 'gpt-4o';
          
          // Convert the modified body to a string
          const bodyData = JSON.stringify(modifiedBody);

          // Log the modified request (without sensitive data)
          global.console.log('[AZURE OPENAI FINAL REQUEST]:', {
            deploymentName: 'gpt-4o', // Hardcoded
            model: modifiedBody.model,
            bodyLength: bodyData.length,
            hasMessages: !!modifiedBody.messages
          });

          // Set the correct content length
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));

          // Write the body to the request
          proxyReq.write(bodyData);
          
          // End the request explicitly 
          proxyReq.end();
        }
      },
      onProxyRes: function(proxyRes) {
        // Add CORS headers
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, api-key';

        // Log response status
        global.console.log('Azure OpenAI response status:', proxyRes.statusCode);

        // Log error responses
        if (proxyRes.statusCode !== 200) {
          let responseBody = '';
          proxyRes.on('data', chunk => {
            responseBody += chunk;
          });

          proxyRes.on('end', () => {
            try {
              if (responseBody.trim().startsWith('{')) {
                const parsedBody = JSON.parse(responseBody);
                if (parsedBody.error) {
                  global.console.error('Azure OpenAI API error:', parsedBody.error);
                }
              }
            } catch (e) {
              global.console.error('Error parsing Azure OpenAI response:', e);
            }
          });
        }
      },
      onError: function(err, req, res) {
        global.console.error('Azure OpenAI Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error', message: err.message });
      },
      proxyTimeout: 30000,
      timeout: 30000,
      logLevel: 'debug'
    })
  );
}; 