const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();

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

// The "catchall" handler: for any request that doesn't match one above, send back the index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Log environment variables status (without showing the actual keys)
console.log('Environment variables status:');
console.log('OPENAI_API_KEY:', process.env.REACT_APP_OPENAI_API_KEY ? 'Set' : 'Not set');
console.log('ANTHROPIC_API_KEY:', process.env.REACT_APP_ANTHROPIC_API_KEY ? 'Set' : 'Not set');
console.log('OLLAMA_API_URL:', process.env.REACT_APP_OLLAMA_API_URL || 'Not set (using default)');

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
}); 