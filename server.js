const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Simple cost tracker implementation for the server
const costTracker = {
  costs: {
    llm: {},
    embeddings: {}, // Will properly track embedding costs by model
    total: 0,
  },
  
  detailedLogging: true,
  embeddingPricing: {
    'text-embedding-ada-002': 0.0001,
    'text-embedding-3-small': 0.00002,
    'text-embedding-3-large': 0.00013
  },
  
  // Normalize model name by removing date suffix
  normalizeModelName(modelName) {
    if (!modelName) return 'unknown';
    
    // Remove date suffix in format -YYYY-MM-DD
    const normalizedName = modelName.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    
    if (normalizedName !== modelName && this.detailedLogging) {
      console.log(`Server cost tracker: Normalized model name from ${modelName} to ${normalizedName}`);
    }
    
    return normalizedName;
  },
  
  trackLlmCost(model, usage, operation = 'chat', queryId = null) {
    // Log for debugging
    console.log(`Server cost tracker: ${model}, ${operation}, ${queryId || 'no-query-id'}`);
    console.log('Usage data:', usage);
    
    if (!model || !usage) {
      return { cost: 0, model: model || 'unknown', operation, usage: { totalTokens: 0 } };
    }
    
    // Normalize the model name
    const normalizedModel = this.normalizeModelName(model);
    
    // Normalize the usage data
    const normalizedUsage = {
      promptTokens: usage.promptTokens || usage.prompt_tokens || usage.input || 0,
      completionTokens: usage.completionTokens || usage.completion_tokens || usage.output || 0,
      totalTokens: usage.totalTokens || usage.total_tokens || usage.total || 0
    };
    
    // If total tokens isn't set, calculate it
    if (normalizedUsage.totalTokens === 0 && 
        (normalizedUsage.promptTokens > 0 || normalizedUsage.completionTokens > 0)) {
      normalizedUsage.totalTokens = normalizedUsage.promptTokens + normalizedUsage.completionTokens;
    }
    
    // Calculate cost based on the model and token count
    // Simple pricing model for demonstration
    let cost = 0;
    if (normalizedModel.includes('gpt-4')) {
      // GPT-4 pricing estimate
      cost = (normalizedUsage.promptTokens * 0.00003) + (normalizedUsage.completionTokens * 0.00006);
    } else if (normalizedModel.includes('gpt-3.5')) {
      // GPT-3.5 pricing estimate
      cost = (normalizedUsage.promptTokens * 0.000005) + (normalizedUsage.completionTokens * 0.000015);
    } else if (normalizedModel.includes('claude-3-5')) {
      // Claude 3.5 Sonnet pricing estimate
      cost = normalizedUsage.totalTokens * 0.000009;
    } else if (normalizedModel.includes('claude-3-opus')) {
      // Claude 3 Opus pricing estimate
      cost = normalizedUsage.totalTokens * 0.00015;
    } else if (normalizedModel.includes('claude-3-haiku')) {
      // Claude 3 Haiku pricing estimate
      cost = normalizedUsage.totalTokens * 0.00025;
    } else if (normalizedModel.includes('claude-2')) {
      // Claude 2 pricing estimate
      cost = normalizedUsage.totalTokens * 0.00008;
    } else if (normalizedModel.includes('mistral') || normalizedModel.includes('llama') || normalizedModel.includes('gemma')) {
      // Local models are free
      cost = 0;
    } else {
      // Default pricing for unknown models
      cost = normalizedUsage.totalTokens * 0.00001;
    }
    
    // Store the cost data
    if (!this.costs.llm[normalizedModel]) {
      this.costs.llm[normalizedModel] = [];
    }
    
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model: normalizedModel,
      originalModel: model !== normalizedModel ? model : undefined, // Keep original model name for reference if different
      operation,
      usage: normalizedUsage,
      cost,
      queryId
    };
    
    this.costs.llm[normalizedModel].push(costEntry);
    this.costs.total += cost;
    
    console.log(`Cost calculated for ${normalizedModel}: $${cost.toFixed(6)}`);
    console.log(`Total accumulated cost: $${this.costs.total.toFixed(6)}`);
    
    return costEntry;
  },
  
  trackEmbeddingCost(model, tokenCount, operation = 'document', queryId = null) {
    // Normalize the model name
    const normalizedModel = this.normalizeModelName(model);
    
    // Get pricing for the model
    let costPerToken;
    
    if (normalizedModel.includes('large') || normalizedModel.includes('text-embedding-3-large')) {
      // text-embedding-3-large pricing
      costPerToken = 0.00013 / 1000000; // $0.00013 per 1M tokens
    } else if (normalizedModel.includes('small') || normalizedModel.includes('text-embedding-3-small')) {
      // text-embedding-3-small pricing
      costPerToken = 0.00002 / 1000000; // $0.00002 per 1M tokens 
    } else if (normalizedModel.includes('ada') || normalizedModel.includes('text-embedding-ada')) {
      // text-embedding-ada-002 pricing
      costPerToken = 0.0001 / 1000000; // $0.0001 per 1M tokens
    } else if (normalizedModel.includes('ollama')) {
      // Ollama models are free for local inference
      costPerToken = 0;
    } else {
      // Default pricing for unknown models
      costPerToken = 0.0001 / 1000000; // $0.0001 per 1M tokens
    }
    
    // Calculate the cost
    const cost = tokenCount * costPerToken;
    
    // Create a proper cost entry
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model: normalizedModel,
      originalModel: model !== normalizedModel ? model : undefined, // Keep original model name for reference if different
      operation,
      usage: {
        tokenCount
      },
      cost,
      queryId
    };
    
    // Store the embedding cost data by model
    if (!this.costs.embeddings[normalizedModel]) {
      this.costs.embeddings[normalizedModel] = [];
    }
    this.costs.embeddings[normalizedModel].push(costEntry);
    
    // Add to total cost
    this.costs.total += cost;
    
    console.log(`Embedding cost calculated for ${normalizedModel}: $${cost.toFixed(6)} (${tokenCount} tokens)`);
    console.log(`Total accumulated cost: $${this.costs.total.toFixed(6)}`);
    
    return costEntry;
  },
  
  getCostSummary() {
    console.log('Returning cost summary with total:', this.costs.total.toFixed(6));
    
    // Prepare llm data in array format
    let llmArray = [];
    for (const model in this.costs.llm) {
      llmArray = llmArray.concat(this.costs.llm[model]);
    }
    
    // Prepare embeddings data in array format (similar to llm)
    let embeddingsArray = [];
    for (const model in this.costs.embeddings) {
      embeddingsArray = embeddingsArray.concat(this.costs.embeddings[model]);
    }
    
    return {
      totalCost: this.costs.total,
      costsByModel: this._getCostsByModel(),
      costsByOperation: this._getCostsByOperation(),
      llm: llmArray,
      embeddings: embeddingsArray
    };
  },
  
  _getCostsByModel() {
    const result = {};
    // Add LLM costs by model
    for (const model in this.costs.llm) {
      result[model] = this.costs.llm[model].reduce((sum, entry) => sum + entry.cost, 0);
    }
    
    // Add embedding costs by model
    for (const model in this.costs.embeddings) {
      result[model] = (result[model] || 0) + this.costs.embeddings[model].reduce((sum, entry) => sum + entry.cost, 0);
    }
    
    return result;
  },
  
  _getCostsByOperation() {
    const result = {
      // Initialize with 0 values for expected categories
      llm: 0,
      embeddings: 0
    };
    
    // Add LLM costs by operation
    for (const model in this.costs.llm) {
      for (const entry of this.costs.llm[model]) {
        const operation = entry.operation || 'chat';
        
        // Initialize the operation total if needed
        if (result[operation] === undefined) {
          result[operation] = 0;
        }
        
        result[operation] += entry.cost;
        // Also add to the "llm" category total
        result.llm += entry.cost;
      }
    }
    
    // Add embedding costs by operation
    for (const model in this.costs.embeddings) {
      for (const entry of this.costs.embeddings[model]) {
        const operation = entry.operation || 'document';
        
        // Initialize the operation total if needed
        if (result[operation] === undefined) {
          result[operation] = 0;
        }
        
        result[operation] += entry.cost;
        // Also add to the "embeddings" category total
        result.embeddings += entry.cost;
      }
    }
    
    return result;
  },
  
  resetCostData() {
    this.costs = {
      llm: {},
      embeddings: {},
      total: 0
    };
    console.log('Cost data has been reset');
    return true;
  },
  
  exportCostData() {
    return { ...this.costs };
  },
  
  setDetailedLogging(enabled) {
    this.detailedLogging = enabled;
    console.log(`Cost tracker detailed logging ${enabled ? 'enabled' : 'disabled'}`);
  },
  
  setEmbeddingPricing(pricingData) {
    if (pricingData && typeof pricingData === 'object') {
      this.embeddingPricing = { ...this.embeddingPricing, ...pricingData };
      console.log('Updated embedding pricing:', this.embeddingPricing);
    }
  },
  
  // Migrate existing cost data by normalizing model names
  migrateExistingCostData() {
    console.log('Starting migration of existing cost data with model normalization...');
    
    // Create normalized cost structure
    const migratedCosts = {
      llm: {},
      embeddings: {},
      total: 0
    };
    
    // Migrate LLM costs
    let totalCost = 0;
    for (const modelName in this.costs.llm) {
      const normalizedName = this.normalizeModelName(modelName);
      
      // If model name changed, log it
      if (normalizedName !== modelName) {
        console.log(`Migrating LLM model data from ${modelName} to ${normalizedName}`);
      }
      
      // Initialize array for normalized model if needed
      if (!migratedCosts.llm[normalizedName]) {
        migratedCosts.llm[normalizedName] = [];
      }
      
      // Copy entries with normalized model name
      for (const entry of this.costs.llm[modelName]) {
        const updatedEntry = {
          ...entry,
          model: normalizedName,
          originalModel: modelName !== normalizedName ? modelName : undefined
        };
        
        migratedCosts.llm[normalizedName].push(updatedEntry);
        totalCost += entry.cost;
      }
    }
    
    // Migrate embedding costs
    for (const modelName in this.costs.embeddings) {
      const normalizedName = this.normalizeModelName(modelName);
      
      // If model name changed, log it
      if (normalizedName !== modelName) {
        console.log(`Migrating embedding model data from ${modelName} to ${normalizedName}`);
      }
      
      // Initialize array for normalized model if needed
      if (!migratedCosts.embeddings[normalizedName]) {
        migratedCosts.embeddings[normalizedName] = [];
      }
      
      // Copy entries with normalized model name
      for (const entry of this.costs.embeddings[modelName]) {
        const updatedEntry = {
          ...entry,
          model: normalizedName,
          originalModel: modelName !== normalizedName ? modelName : undefined
        };
        
        migratedCosts.embeddings[normalizedName].push(updatedEntry);
        totalCost += entry.cost;
      }
    }
    
    // Update the costs data
    this.costs = migratedCosts;
    this.costs.total = totalCost;
    
    console.log(`Migration complete. Data now has ${Object.keys(this.costs.llm).length} LLM models and ${Object.keys(this.costs.embeddings).length} embedding models.`);
    console.log(`Total cost: $${this.costs.total.toFixed(6)}`);
    
    return true;
  },
  
  getTotalCost() {
    return this.costs.total;
  }
};

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from the React app in production
app.use(express.static(path.join(__dirname, 'build')));

// IMPORTANT: There are two proxy setups in this application:
// 1. The webpack dev server proxy middleware (configured in package.json)
// 2. Our own direct implementation below
// We need to ensure they don't conflict.

// Replace the existing Anthropic proxy implementation with this version
app.post('/api/anthropic-proxy', async (req, res) => {
  try {
    // Use API key from request body or fall back to environment variable
    const apiKey = req.body.anthropicApiKey || process.env.REACT_APP_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key is required' });
    }
    
    // Extract API key and queryId from the request
    const { anthropicApiKey, queryId, ...cleanRequestBody } = req.body;
    
    console.log('Proxying request to Anthropic API...');
    console.log(`Request includes queryId for tracking: ${queryId ? 'yes' : 'no'}`);
    
    const response = await axios.post('https://api.anthropic.com/v1/messages', cleanRequestBody, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Received response from Anthropic API');
    
    // Track costs if usage information is available
    if (response.data && response.data.usage) {
      // Extract model and usage information
      const model = response.data.model || cleanRequestBody.model;
      const usage = {
        prompt_tokens: response.data.usage.input_tokens || 0,
        completion_tokens: response.data.usage.output_tokens || 0,
        total_tokens: (response.data.usage.input_tokens || 0) + (response.data.usage.output_tokens || 0)
      };
      
      // Track cost
      const costInfo = costTracker.trackLlmCost(model, usage, 'chat', queryId);
      console.log(`Cost tracked for Anthropic API call: $${costInfo.cost.toFixed(6)}`);
      
      // Add cost info to response
      response.data.cost = costInfo.cost;
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to Anthropic API:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Replace the existing OpenAI proxy implementation with this version
app.post('/api/openai-proxy/:endpoint(*)', async (req, res) => {
  try {
    const apiKey = req.body.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY;
    const endpoint = req.params.endpoint;
    
    console.log(`OpenAI proxy request to endpoint: ${endpoint}`);
    
    if (!apiKey) {
      console.error('No OpenAI API key provided');
      return res.status(400).json({ error: 'OpenAI API key is required' });
    }
    
    // Extract API key and queryId - don't send these to OpenAI
    const { openaiApiKey, queryId, ...cleanRequestBody } = req.body;
    
    console.log(`Request to OpenAI API endpoint: ${endpoint}`);
    console.log(`Request includes queryId for cost tracking: ${queryId ? 'yes' : 'no'}`);
    
    const response = await axios.post(`https://api.openai.com/v1/${endpoint}`, cleanRequestBody, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`OpenAI API response status: ${response.status}`);
    
    // Track costs if usage information is available
    if (response.data && response.data.usage) {
      if (endpoint.includes('embeddings')) {
        // Handle embedding cost tracking
        const model = response.data.model || cleanRequestBody.model;
        const tokenCount = response.data.usage.total_tokens || 0;
        const operation = Array.isArray(cleanRequestBody.input) && cleanRequestBody.input.length > 1 ? 'document' : 'query';
        
        const costInfo = costTracker.trackEmbeddingCost(model, tokenCount, operation, queryId);
        console.log(`Cost tracked for OpenAI embedding: $${costInfo.cost.toFixed(6)}`);
        console.log(`Tokens processed: ${tokenCount}, Model: ${model}, Operation: ${operation}`);
        
        // Add cost info to response
        response.data.cost = costInfo.cost;
      } else {
        // Handle LLM cost tracking
        const model = response.data.model || cleanRequestBody.model;
        const usage = response.data.usage;
        
        const costInfo = costTracker.trackLlmCost(model, usage, 'chat', queryId);
        console.log(`Cost tracked for OpenAI API call: $${costInfo.cost.toFixed(6)}`);
        
        // Add cost info to response
        response.data.cost = costInfo.cost;
      }
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to OpenAI API:', error.message);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Proxy endpoint for Azure OpenAI API to avoid CORS issues
app.post('/api/proxy/azure/chat/completions', async (req, res) => {
  try {
    // Extract the Azure OpenAI API key and endpoint from the request
    const apiKey = req.body.azureApiKey;
    const endpoint = req.body.azureEndpoint;
    const apiVersion = req.body.apiVersion || process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
    const deploymentName = req.body.deploymentName;
    const queryId = req.body.queryId; // Extract queryId for cost tracking
    
    console.log('[DEBUG] Azure API Proxy Request:');
    console.log(`- Request URL: ${req.originalUrl}`);
    console.log(`- Azure endpoint: ${endpoint}`);
    console.log(`- Deployment name: ${deploymentName}`);
    console.log(`- API version: ${apiVersion}`);
    console.log(`- API key provided: ${apiKey ? 'Yes (length: ' + apiKey.length + ', first 5 chars: ' + apiKey.substring(0, 5) + '...)' : 'No'}`);
    console.log(`- QueryId provided: ${queryId ? 'Yes' : 'No'}`);
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
    
    // Special handling for o3-mini model - temperature parameter is not supported
    if (deploymentName.includes('o3-mini')) {
      console.warn(`[AZURE WARNING] Removing temperature parameter for ${deploymentName} as it's not supported`);
      delete req.body.temperature;
      
      // Apply specific settings proven to work with o3-mini
      if (!cleanRequestBody.max_tokens || cleanRequestBody.max_tokens > 3000) {
        console.warn(`[AZURE WARNING] Setting max_tokens=2048 for ${deploymentName} to allow deeper reasoning`);
        cleanRequestBody.max_tokens = 2048;
      }
      
      // Add top_p parameter for better diversity
      if (!cleanRequestBody.top_p) {
        cleanRequestBody.top_p = 0.95;
      }
      
      console.log(`[O3-MINI INFO] Using API version ${apiVersion} for o3-mini model`);
      console.log(`[O3-MINI INFO] Parameters: max_tokens=${cleanRequestBody.max_tokens}, top_p=${cleanRequestBody.top_p}`);
      console.log(`[O3-MINI INFO] Increased token limit to allow more detailed reasoning`);
      
      // Add special handler for o3-mini responses to log token usage details
      let o3MiniResponseHandler = (response) => {
        if (response && response.data) {
          console.log('[O3-MINI RESPONSE] Analyzing response details:');
          
          // Log token usage details which are particularly important for o3-mini
          if (response.data.usage) {
            const usage = response.data.usage;
            console.log('[O3-MINI RESPONSE] Token usage:', JSON.stringify(usage, null, 2));
            
            // Check for the special case of reasoning tokens without accepted prediction tokens
            if (usage.completion_tokens_details) {
              const details = usage.completion_tokens_details;
              if (details.reasoning_tokens > 0 && details.accepted_prediction_tokens === 0) {
                console.log(`[O3-MINI WARNING] Model used ${details.reasoning_tokens} reasoning tokens but has 0 accepted prediction tokens`);
                console.log('[O3-MINI WARNING] This indicates the model generated reasoning but did not produce a final answer');
              }
            }
          }
          
          // Check for content in the response
          if (response.data.choices && response.data.choices.length > 0) {
            const choice = response.data.choices[0];
            const content = choice.message?.content;
            
            if (content) {
              console.log(`[O3-MINI RESPONSE] Content found (${content.length} chars)`);
              console.log(`[O3-MINI RESPONSE] Content preview: ${content.substring(0, 100)}...`);
            } else {
              console.log('[O3-MINI WARNING] No content found in message.content field');
              console.log('[O3-MINI WARNING] Finish reason:', choice.finish_reason);
            }
          } else {
            console.log('[O3-MINI WARNING] No choices array found in response');
          }
        }
        
        return response;
      };
    }
    
    // Create a clean request body by removing Azure-specific fields AND the queryId
    // Spreading each property individually to ensure queryId is properly removed
    const cleanRequestBody = {};
    Object.keys(req.body).forEach(key => {
      // Skip Azure-specific fields and queryId
      if (
        key !== 'azureApiKey' && 
        key !== 'azureEndpoint' && 
        key !== 'apiVersion' && 
        key !== 'deploymentName' && 
        key !== 'queryId'
      ) {
        cleanRequestBody[key] = req.body[key];
      }
    });
    
    // Log detailed request info
    console.log(`Proxying Azure OpenAI request to: ${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`);
    console.log('Request body structure:', {
      messagesCount: cleanRequestBody.messages?.length,
      maxTokens: cleanRequestBody.max_tokens,
      temperature: cleanRequestBody.temperature
    });
    
    // Ensure the endpoint URL is properly formatted
    let formattedEndpoint = endpoint;
    if (formattedEndpoint.endsWith('/')) {
      formattedEndpoint = formattedEndpoint.slice(0, -1);
    }
    
    // Construct the full target URL
    const targetUrl = `${formattedEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
    console.log(`[DEBUG] Final Azure API target URL: ${targetUrl}`);
    
    // Make the request to Azure OpenAI API
    console.log(`[DEBUG] About to make Azure API request to: ${targetUrl}`);
    console.log(`[DEBUG] Request body: ${JSON.stringify(cleanRequestBody, null, 2)}`);
    
    // For o3-mini models, add specific logging
    if (deploymentName.includes('o3-mini')) {
      console.log(`[O3-MINI REQUEST] Sending request to ${targetUrl} with API version ${apiVersion}`);
    }
    
    const azureResponse = await axios.post(
      targetUrl,
      cleanRequestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        timeout: 60000 // 60 second timeout
      }
    );
    
    // Special handling for o3-mini responses for debugging
    if (deploymentName.includes('o3-mini')) {
      console.log(`[O3-MINI RESPONSE] Status: ${azureResponse.status}`);
      console.log(`[O3-MINI RESPONSE] Headers: ${JSON.stringify(azureResponse.headers, null, 2)}`);
      console.log(`[O3-MINI RESPONSE] Data structure: ${Object.keys(azureResponse.data).join(', ')}`);
      
      if (azureResponse.data.choices && azureResponse.data.choices.length > 0) {
        const firstChoice = azureResponse.data.choices[0];
        console.log(`[O3-MINI RESPONSE] First choice keys: ${Object.keys(firstChoice).join(', ')}`);
        console.log(`[O3-MINI RESPONSE] Finish reason: ${firstChoice.finish_reason}`);
        
        if (firstChoice.message) {
          console.log(`[O3-MINI RESPONSE] Message keys: ${Object.keys(firstChoice.message).join(', ')}`);
          console.log(`[O3-MINI RESPONSE] Content empty?: ${!firstChoice.message.content || firstChoice.message.content.trim() === ''}`);
          console.log(`[O3-MINI RESPONSE] Content length: ${firstChoice.message.content?.length || 0}`);
          
          // If content is empty but we have completion tokens, log a warning
          if ((!firstChoice.message.content || firstChoice.message.content.trim() === '') && 
              azureResponse.data.usage && 
              azureResponse.data.usage.completion_tokens > 0) {
            console.warn(`[O3-MINI WARNING] Empty content despite using ${azureResponse.data.usage.completion_tokens} completion tokens`);
            console.warn(`[O3-MINI WARNING] This is a known issue with o3-mini and finish_reason=${firstChoice.finish_reason}`);
          }
        }
      }
      
      // Add cost information to the response for client-side handling
      if (azureResponse.data.usage) {
        // Calculate cost based on token usage
        const inputTokens = azureResponse.data.usage.prompt_tokens || 0;
        const outputTokens = azureResponse.data.usage.completion_tokens || 0;
        
        // Use o3-mini pricing (very rough estimate)
        const inputCost = (inputTokens * 1.10) / 1000000;  // $1.10 per 1M tokens
        const outputCost = (outputTokens * 4.40) / 1000000; // $4.40 per 1M tokens
        const totalCost = inputCost + outputCost;
        
        // Add cost to the response
        azureResponse.data.cost = totalCost;
        console.log(`[O3-MINI RESPONSE] Estimated cost: $${totalCost.toFixed(6)}`);
      }
    }
    
    // Check if the response data has a specific structure expected for Azure OpenAI
    if (azureResponse.data && azureResponse.data.choices) {
      console.log('Azure OpenAI response data structure:');
      console.log(`- choices: Array with ${azureResponse.data.choices.length} items`);
      if (azureResponse.data.usage) {
        console.log(`- usage: ${JSON.stringify(azureResponse.data.usage)}`);
      }
      
      // Track cost if queryId is provided and the request is successful
      if (queryId && azureResponse.data.usage) {
        const usage = azureResponse.data.usage;
        const tokenUsage = {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens
        };
        
        // Normalize model name (removing Azure prefix if present)
        const modelName = deploymentName.includes('gpt-') ? 
          deploymentName : 
          `${deploymentName}-${apiVersion}`;
        
        // Track cost
        costTracker.trackLlmCost(modelName, tokenUsage, 'chat', queryId);
      }
    } else {
      console.warn('Unexpected response structure from Azure OpenAI API');
      console.log('Response data:', azureResponse.data);
    }
    
    // Return the Azure OpenAI API response
    res.json(azureResponse.data);
  } catch (error) {
    console.error('Error proxying to Azure OpenAI API:', error.message);
    
    // Check if the error is from Azure OpenAI and contains a structured error response
    if (error.response && error.response.data) {
      console.error('Azure OpenAI API error response:', error.response.data);
      
      // Return the error with the same structure as the Azure OpenAI API
      return res.status(error.response.status).json({
        error: error.response.data.error || {
          message: error.message,
          code: error.response.status,
          status: error.response.statusText
        }
      });
    }
    
    // Generic error response
    res.status(500).json({
      error: {
        message: `Error proxying to Azure OpenAI API: ${error.message}`
      }
    });
  }
});

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

// Cost tracking API endpoints
app.get('/api/cost-tracking-summary', (req, res) => {
  try {
    const summary = costTracker.getCostSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error getting cost summary:', error);
    res.status(500).json({ error: 'Failed to get cost summary' });
  }
});

// Add slash-format endpoints to match frontend expectations
app.get('/api/cost-tracking/summary', (req, res) => {
  try {
    const summary = costTracker.getCostSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error getting cost summary:', error);
    res.status(500).json({ error: 'Failed to get cost summary' });
  }
});

app.get('/api/cost-tracking-export', (req, res) => {
  try {
    const costData = costTracker.exportCostData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="cost-tracking-data.json"');
    res.json(costData);
  } catch (error) {
    console.error('Error exporting cost data:', error);
    res.status(500).json({ error: 'Failed to export cost data' });
  }
});

// Add slash-format endpoint for export
app.get('/api/cost-tracking/export', (req, res) => {
  try {
    const costData = costTracker.exportCostData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="cost-tracking-data.json"');
    res.json(costData);
  } catch (error) {
    console.error('Error exporting cost data:', error);
    res.status(500).json({ error: 'Failed to export cost data' });
  }
});

app.post('/api/cost-tracking-reset', (req, res) => {
  try {
    costTracker.resetCostData();
    res.json({ success: true, message: 'Cost data has been reset' });
  } catch (error) {
    console.error('Error resetting cost data:', error);
    res.status(500).json({ error: 'Failed to reset cost data' });
  }
});

// Add slash-format endpoint for reset
app.post('/api/cost-tracking/reset', (req, res) => {
  try {
    costTracker.resetCostData();
    res.json({ success: true, message: 'Cost data has been reset' });
  } catch (error) {
    console.error('Error resetting cost data:', error);
    res.status(500).json({ error: 'Failed to reset cost data' });
  }
});

app.post('/api/cost-tracking-settings', (req, res) => {
  try {
    const { detailedLogging } = req.body;
    
    if (detailedLogging !== undefined) {
      costTracker.setDetailedLogging(detailedLogging);
    }
    
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating cost tracking settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Add slash-format endpoint for settings
app.post('/api/cost-tracking/settings', (req, res) => {
  try {
    const { detailedLogging } = req.body;
    
    if (detailedLogging !== undefined) {
      costTracker.setDetailedLogging(detailedLogging);
    }
    
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating cost tracking settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Add a new endpoint to track model usage directly
app.post('/api/cost-tracking/track-model-usage', (req, res) => {
  try {
    const { model, usage, operation, queryId } = req.body;
    
    if (!model || !usage) {
      return res.status(400).json({ error: 'Model and usage data are required' });
    }
    
    console.log(`Server tracking cost for model ${model}:`, usage);
    
    // Track the cost
    const costInfo = costTracker.trackLlmCost(model, usage, operation || 'chat', queryId);
    
    console.log(`Server tracked cost for ${model}: $${costInfo.cost.toFixed(6)}`);
    console.log(`Total cost accumulating: $${costTracker.getTotalCost().toFixed(6)}`);
    
    // Return the cost information
    res.json(costInfo);
  } catch (error) {
    console.error('Error tracking model usage:', error);
    res.status(500).json({ error: 'Failed to track model usage' });
  }
});

// Add a specific endpoint for tracking embedding costs
app.post('/api/cost-tracking/track-embedding-usage', (req, res) => {
  try {
    const { model, tokenCount, operation, queryId } = req.body;
    
    if (!model || !tokenCount) {
      return res.status(400).json({ error: 'Model and token count are required' });
    }
    
    console.log(`Server tracking embedding cost for model ${model} with ${tokenCount} tokens`);
    
    // Track the embedding cost
    const costInfo = costTracker.trackEmbeddingCost(model, tokenCount, operation || 'document', queryId);
    
    console.log(`Server tracked embedding cost for ${model}: $${costInfo.cost.toFixed(6)}`);
    console.log(`Total cost accumulating: $${costTracker.getTotalCost().toFixed(6)}`);
    
    // Return the cost information
    res.json(costInfo);
  } catch (error) {
    console.error('Error tracking embedding usage:', error);
    res.status(500).json({ error: 'Failed to track embedding usage' });
  }
});

// Add OpenAI proxy endpoint with the expected path
app.post('/api/proxy/openai/:endpoint(*)', async (req, res) => {
  try {
    const apiKey = req.body.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY;
    const endpoint = req.params.endpoint;
    
    console.log(`OpenAI proxy request to endpoint: ${endpoint}`);
    
    if (!apiKey) {
      console.error('No OpenAI API key provided');
      return res.status(400).json({ error: 'OpenAI API key is required' });
    }
    
    // Extract API key and queryId - don't send these to OpenAI
    const { openaiApiKey, queryId, ...cleanRequestBody } = req.body;
    
    console.log(`Request to OpenAI API endpoint: ${endpoint}`);
    console.log(`Request includes queryId for cost tracking: ${queryId ? 'yes' : 'no'}`);
    
    const response = await axios.post(`https://api.openai.com/v1/${endpoint}`, cleanRequestBody, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`OpenAI API response status: ${response.status}`);
    
    // Track costs if usage information is available
    if (response.data && response.data.usage) {
      if (endpoint.includes('embeddings')) {
        // Handle embedding cost tracking
        const model = response.data.model || cleanRequestBody.model;
        const tokenCount = response.data.usage.total_tokens || 0;
        const operation = Array.isArray(cleanRequestBody.input) && cleanRequestBody.input.length > 1 ? 'document' : 'query';
        
        const costInfo = costTracker.trackEmbeddingCost(model, tokenCount, operation, queryId);
        console.log(`Cost tracked for OpenAI embedding: $${costInfo.cost.toFixed(6)}`);
        console.log(`Tokens processed: ${tokenCount}, Model: ${model}, Operation: ${operation}`);
        
        // Add cost info to response
        response.data.cost = costInfo.cost;
      } else {
        // Handle LLM cost tracking
        const model = response.data.model || cleanRequestBody.model;
        const usage = response.data.usage;
        
        const costInfo = costTracker.trackLlmCost(model, usage, 'chat', queryId);
        console.log(`Cost tracked for OpenAI API call: $${costInfo.cost.toFixed(6)}`);
        
        // Add cost info to response
        response.data.cost = costInfo.cost;
      }
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to OpenAI API:', error.message);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Add Anthropic proxy endpoint with the expected path
app.post('/api/proxy/anthropic', async (req, res) => {
  try {
    // Use API key from request body or fall back to environment variable
    const apiKey = req.body.anthropicApiKey || process.env.REACT_APP_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key is required' });
    }
    
    // Extract API key and queryId from the request
    const { anthropicApiKey, queryId, ...cleanRequestBody } = req.body;
    
    console.log('Proxying request to Anthropic API...');
    console.log(`Request includes queryId for tracking: ${queryId ? 'yes' : 'no'}`);
    
    const response = await axios.post('https://api.anthropic.com/v1/messages', cleanRequestBody, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Received response from Anthropic API');
    
    // Track costs if usage information is available
    if (response.data && response.data.usage) {
      // Extract model and usage information
      const model = response.data.model || cleanRequestBody.model;
      const usage = {
        prompt_tokens: response.data.usage.input_tokens || 0,
        completion_tokens: response.data.usage.output_tokens || 0,
        total_tokens: (response.data.usage.input_tokens || 0) + (response.data.usage.output_tokens || 0)
      };
      
      // Track cost
      const costInfo = costTracker.trackLlmCost(model, usage, 'chat', queryId);
      console.log(`Cost tracked for Anthropic API call: $${costInfo.cost.toFixed(6)}`);
      
      // Add cost info to response
      response.data.cost = costInfo.cost;
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to Anthropic API:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Add Anthropic messages proxy endpoint
app.post('/api/proxy/anthropic/messages', async (req, res) => {
  try {
    // Use API key from request body or fall back to environment variable
    const apiKey = req.body.anthropicApiKey || process.env.REACT_APP_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key is required' });
    }
    
    // Extract API key and queryId from the request
    const { anthropicApiKey, queryId, ...cleanRequestBody } = req.body;
    
    console.log('Proxying request to Anthropic API (messages endpoint)...');
    console.log(`Request includes queryId for tracking: ${queryId ? 'yes' : 'no'}`);
    
    const response = await axios.post('https://api.anthropic.com/v1/messages', cleanRequestBody, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Received response from Anthropic API');
    
    // Track costs if usage information is available
    if (response.data && response.data.usage) {
      // Extract model and usage information
      const model = response.data.model || cleanRequestBody.model;
      const usage = {
        prompt_tokens: response.data.usage.input_tokens || 0,
        completion_tokens: response.data.usage.output_tokens || 0,
        total_tokens: (response.data.usage.input_tokens || 0) + (response.data.usage.output_tokens || 0)
      };
      
      // Track cost
      const costInfo = costTracker.trackLlmCost(model, usage, 'chat', queryId);
      console.log(`Cost tracked for Anthropic API call: $${costInfo.cost.toFixed(6)}`);
      
      // Add cost info to response
      response.data.cost = costInfo.cost;
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to Anthropic API:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message }
    });
  }
});

// Add Azure OpenAI embeddings proxy endpoint
app.post('/api/proxy/azure/embeddings', async (req, res) => {
  try {
    // Extract necessary parameters from the request
    const apiKey = req.body.azureApiKey || process.env.REACT_APP_AZURE_OPENAI_API_KEY;
    const endpoint = req.body.azureEndpoint || process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
    const apiVersion = req.body.apiVersion || process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2023-05-15';
    const deploymentName = req.body.deploymentName;
    const input = req.body.input;
    const queryId = req.body.queryId; // For cost tracking
    
    console.log('[DEBUG] Azure Embeddings API Proxy Request:');
    console.log(`- Azure endpoint: ${endpoint}`);
    console.log(`- Deployment name: ${deploymentName}`);
    console.log(`- API version: ${apiVersion}`);
    console.log(`- Has input: ${input ? 'Yes' : 'No'}`);
    console.log(`- QueryId provided: ${queryId ? 'Yes' : 'No'}`);
    
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
    
    if (!deploymentName) {
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI deployment name is required'
        }
      });
    }
    
    if (!input) {
      return res.status(400).json({
        error: {
          message: 'Input text is required'
        }
      });
    }
    
    // Ensure the endpoint URL is properly formatted
    let formattedEndpoint = endpoint;
    if (formattedEndpoint.endsWith('/')) {
      formattedEndpoint = formattedEndpoint.slice(0, -1);
    }
    
    // Create a clean request body without Azure-specific fields
    const cleanRequestBody = {
      input: input,
      model: deploymentName // Include model for Azure endpoints that need it
    };
    
    // Construct the full target URL
    const targetUrl = `${formattedEndpoint}/openai/deployments/${deploymentName}/embeddings?api-version=${apiVersion}`;
    console.log(`[DEBUG] Final Azure embeddings API target URL: ${targetUrl}`);
    
    // Make the request to Azure OpenAI API
    const response = await axios.post(
      targetUrl,
      cleanRequestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        }
      }
    );
    
    console.log('[DEBUG] Azure embeddings API response received');
    
    // Track embedding costs
    if (response.data) {
      // Calculate token count either from response or estimate from input
      let tokenCount = 0;
      
      if (response.data.usage && response.data.usage.total_tokens) {
        tokenCount = response.data.usage.total_tokens;
      } else {
        // Estimate token count (4 chars per token)
        tokenCount = Math.ceil(typeof input === 'string' ? input.length / 4 : 
          Array.isArray(input) ? input.reduce((sum, text) => sum + text.length, 0) / 4 : 0);
      }
      
      // Determine operation type (single query or batch document)
      const operation = Array.isArray(input) ? 'document' : 'query';
      
      // Track the cost with the appropriate model name
      const model = `azure-${deploymentName}`;
      const costInfo = costTracker.trackEmbeddingCost(model, tokenCount, operation, queryId);
      console.log(`Cost tracked for Azure embedding (${operation}): $${costInfo.cost.toFixed(6)}`);
      console.log(`Tokens processed: ${tokenCount}, Model: ${model}, Operation: ${operation}`);
      console.log(`Total accumulated cost: $${costTracker.getTotalCost().toFixed(6)}`);
      
      // Add cost info to response
      response.data.cost = costInfo.cost;
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to Azure OpenAI Embeddings API:', error.message);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
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

// Add endpoint to trigger cost data migration
app.post('/api/cost-tracking/migrate', (req, res) => {
  try {
    costTracker.migrateExistingCostData();
    res.json({ success: true, message: 'Cost data migration completed successfully' });
  } catch (error) {
    console.error('Error migrating cost data:', error);
    res.status(500).json({ error: 'Failed to migrate cost data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Run cost data migration once on server startup
  console.log('Running initial cost data migration to normalize model names...');
  try {
    costTracker.migrateExistingCostData();
    console.log('Initial cost data migration completed successfully');
  } catch (error) {
    console.error('Error during initial cost data migration:', error);
  }
}); 