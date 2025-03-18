const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from the React app in production
app.use(express.static(path.join(__dirname, 'build')));

// Proxy endpoint for Anthropic API
app.post('/api/proxy/anthropic', async (req, res) => {
  try {
    // Use API key from request body or fall back to environment variable
    const apiKey = req.body.anthropicApiKey || process.env.REACT_APP_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key is required' });
    }
    
    // Remove the API key from the request body
    const { anthropicApiKey, ...requestBody } = req.body;
    
    console.log('Proxying request to Anthropic API...');
    
    const response = await axios.post('https://api.anthropic.com/v1/messages', requestBody, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Received response from Anthropic API');
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to Anthropic API:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Proxy endpoint for OpenAI API
app.post('/api/proxy/openai/:endpoint(*)', async (req, res) => {
  try {
    // Use API key from request body or fall back to environment variable
    const apiKey = req.body.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY;
    const endpoint = req.params.endpoint;
    
    console.log(`OpenAI proxy request to endpoint: ${endpoint}`);
    
    if (!apiKey) {
      console.error('No OpenAI API key provided in request body or environment variables');
      return res.status(400).json({ error: 'OpenAI API key is required' });
    }
    
    // Log API key prefix (for debugging, without exposing the full key)
    const apiKeyPrefix = apiKey.substring(0, 10);
    console.log(`Using API key with prefix: ${apiKeyPrefix}...`);
    
    // Remove the API key from the request body
    const { openaiApiKey, ...requestBody } = req.body;
    
    // Log request details
    console.log(`Request to OpenAI API endpoint: ${endpoint}`);
    console.log('Request headers:');
    console.log(`- Authorization: Bearer ${apiKeyPrefix}...`);
    console.log(`- Content-Type: application/json`);
    
    // Log request body (without sensitive information)
    console.log('Request body:', JSON.stringify({
      ...requestBody,
      // Don't log sensitive fields
      messages: requestBody.messages ? `[${requestBody.messages.length} messages]` : undefined
    }));
    
    const response = await axios.post(`https://api.openai.com/v1/${endpoint}`, requestBody, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`OpenAI API response status: ${response.status}`);
    
    // Log response headers
    console.log('Response headers:');
    Object.keys(response.headers).forEach(key => {
      console.log(`- ${key}: ${response.headers[key]}`);
    });
    
    // Log response data structure (without the actual content)
    if (response.data) {
      console.log('Response data structure:');
      if (response.data.choices) {
        console.log(`- choices: Array with ${response.data.choices.length} items`);
      }
      if (response.data.usage) {
        console.log(`- usage: ${JSON.stringify(response.data.usage)}`);
      }
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to OpenAI API:', error.message);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Response headers:', error.response.headers);
    } else if (error.request) {
      console.error('No response received. Request:', error.request);
    }
    
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Proxy endpoint for Azure OpenAI API to avoid CORS issues
app.post('/api/proxy/azure/:endpoint(*)', async (req, res) => {
  try {
    // Extract the Azure OpenAI API key and endpoint from the request
    const apiKey = req.body.azureApiKey;
    const endpoint = req.body.azureEndpoint;
    const apiVersion = req.body.apiVersion || process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2023-05-15';
    const deploymentName = req.body.deploymentName;
    
    console.log('[DEBUG] Azure API Proxy Request:');
    console.log(`- Request URL: ${req.originalUrl}`);
    console.log(`- Request params: ${JSON.stringify(req.params)}`);
    console.log(`- Endpoint path parameter: ${req.params.endpoint}`);
    console.log(`- Azure endpoint: ${endpoint}`);
    console.log(`- Deployment name: ${deploymentName}`);
    console.log(`- API version: ${apiVersion}`);
    console.log(`- API key provided: ${apiKey ? 'Yes (length: ' + apiKey.length + ', first 5 chars: ' + apiKey.substring(0, 5) + '...)' : 'No'}`);
    console.log(`- Request body keys: ${Object.keys(req.body).join(', ')}`);
    
    if (!apiKey) {
      console.error('[AZURE ERROR] Missing API key in request');
      return res.status(401).json({
        error: {
          message: 'Azure OpenAI API key is required'
        }
      });
    }
    
    if (!endpoint) {
      console.error('[AZURE ERROR] Missing endpoint in request');
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI endpoint is required'
        }
      });
    }
    
    if (!deploymentName) {
      console.error('[AZURE ERROR] Missing deployment name in request');
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI deployment name is required'
        }
      });
    }
    
    if (!apiVersion) {
      console.error('[AZURE ERROR] Missing API version in request');
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI API version is required'
        }
      });
    }
    
    // Remove the API key, endpoint and other Azure-specific fields from the request body
    const { azureApiKey, azureEndpoint, apiVersion: _, deploymentName: __, ...requestBody } = req.body;
    
    // Get the endpoint from the URL parameter
    const endpointPath = req.params.endpoint;
    
    // Log detailed request info
    console.log(`Proxying Azure OpenAI request to: ${endpoint}/openai/deployments/${deploymentName}/${endpointPath}?api-version=${apiVersion}`);
    console.log('Request body structure:', {
      messagesCount: requestBody.messages?.length,
      maxTokens: requestBody.max_tokens,
      temperature: requestBody.temperature
    });
    
    // Ensure the endpoint URL is properly formatted
    let formattedEndpoint = endpoint;
    if (formattedEndpoint.endsWith('/')) {
      formattedEndpoint = formattedEndpoint.slice(0, -1);
    }
    
    // Construct the full target URL
    const targetUrl = `${formattedEndpoint}/openai/deployments/${deploymentName}/${endpointPath}?api-version=${apiVersion}`;
    console.log(`[DEBUG] Final Azure API target URL: ${targetUrl}`);
    
    // Make the request to Azure OpenAI API
    console.log(`[DEBUG] About to make Azure API request to: ${targetUrl}`);
    console.log(`[DEBUG] Request body: ${JSON.stringify(requestBody, null, 2)}`);
    
    try {
      const response = await axios.post(
        targetUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
          }
        }
      );
      
      // Log response data structure (without the actual content)
      if (response.data) {
        console.log('Azure OpenAI response data structure:');
        if (response.data.choices) {
          console.log(`- choices: Array with ${response.data.choices.length} items`);
        }
        if (response.data.usage) {
          console.log(`- usage: ${JSON.stringify(response.data.usage)}`);
        }
      }
      
      res.json(response.data);
    } catch (error) {
      console.error('[AZURE ERROR] Request failed:', error.message);
      
      // Log more detailed error information
      if (error.response) {
        console.error('[AZURE ERROR] Response status:', error.response.status);
        console.error('[AZURE ERROR] Response data:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.status === 404) {
          console.error('[AZURE ERROR] 404 Not Found - Check your deployment name and endpoint URL');
          console.error(`Deployment name: "${deploymentName}"`);
          console.error(`Endpoint: "${endpoint}"`);
          console.error(`API version: "${apiVersion}"`);
        } else if (error.response.status === 401) {
          console.error('[AZURE ERROR] 401 Unauthorized - Check your API key');
        }
      } else if (error.request) {
        console.error('[AZURE ERROR] No response received. Request:', error.request);
      }
      
      res.status(error.response?.status || 500).json({
        error: error.response?.data || { message: error.message }
      });
    }
  } catch (error) {
    console.error('Error proxying to Azure OpenAI API:', error.message);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Response headers:', error.response.headers);
    } else if (error.request) {
      console.error('No response received. Request:', error.request);
    }
    
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Proxy endpoint for Anthropic API to avoid CORS issues
app.use('/api/proxy/anthropic', createProxyMiddleware({
  target: 'https://api.anthropic.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/proxy/anthropic': '/v1/messages'
  },
  onProxyReq: function(proxyReq, req) {
    if (req.method === 'POST' && req.body) {
      const apiKey = req.body.anthropicApiKey;
      
      if (!apiKey) {
        console.error('No Anthropic API key provided');
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
      console.log('Anthropic request structure:', {
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
      console.log('Anthropic request headers:', {
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
    console.log('Anthropic response status:', proxyRes.statusCode);
    
    // Add CORS headers
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access';
  },
  onError: function(err, req, res) {
    console.error('Anthropic Proxy Error:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}));

// Endpoint to list Azure OpenAI deployments
app.post('/api/list-azure-deployments', async (req, res) => {
  try {
    // Extract the Azure OpenAI API key and endpoint from the request or env
    const apiKey = req.body.azureApiKey || process.env.REACT_APP_AZURE_OPENAI_API_KEY;
    const endpoint = req.body.azureEndpoint || process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
    const apiVersion = req.body.apiVersion || process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2023-05-15';
    
    console.log('[DEBUG] Azure Deployments Request:');
    console.log(`- Azure endpoint: ${endpoint}`);
    console.log(`- API version: ${apiVersion}`);
    console.log(`- API key provided: ${apiKey ? 'Yes' : 'No'}`);
    
    if (!apiKey) {
      return res.status(401).json({
        error: {
          message: 'Azure OpenAI API key is required'
        }
      });
    }
    
    if (!endpoint) {
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI endpoint is required'
        }
      });
    }
    
    // Ensure the endpoint URL is properly formatted
    let formattedEndpoint = endpoint;
    if (formattedEndpoint.endsWith('/')) {
      formattedEndpoint = formattedEndpoint.slice(0, -1);
    }
    
    // List deployments endpoint
    const deploymentsUrl = `${formattedEndpoint}/openai/deployments?api-version=${apiVersion}`;
    console.log(`[DEBUG] Requesting Azure deployments from: ${deploymentsUrl}`);
    
    const response = await axios.get(
      deploymentsUrl,
      {
        headers: {
          'api-key': apiKey
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error getting Azure deployments:', error.message);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received. Request:', error.request);
    }
    
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// The "catchall" handler: for any request that doesn't match one above, send back the index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Log environment variables status (without showing the actual keys)
console.log('Environment variables status:');
console.log('OPENAI_API_KEY:', process.env.REACT_APP_OPENAI_API_KEY ? 'Set' : 'Not set');
console.log('ANTHROPIC_API_KEY:', process.env.REACT_APP_ANTHROPIC_API_KEY ? 'Set' : 'Not set');
console.log('AZURE_OPENAI_API_KEY:', process.env.REACT_APP_AZURE_OPENAI_API_KEY ? 'Set' : 'Not set');
console.log('AZURE_OPENAI_ENDPOINT:', process.env.REACT_APP_AZURE_OPENAI_ENDPOINT ? 'Set' : 'Not set');
console.log('OLLAMA_API_URL:', process.env.REACT_APP_OLLAMA_API_URL || 'Not set (using default)');

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
}); 