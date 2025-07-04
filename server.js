const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { defaultModels, calculateCost } = require('./src/config/llmConfig');

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
  
  apiTrackedQueryIds: new Set(), // Track which queryIds had costs from API responses
  
  // Normalize model name by removing date suffix
  normalizeModelName(modelName) {
    if (!modelName) return 'unknown';
    
    // Handle common date/version patterns in model names
    const datePattern = /-\d{4}-\d{2}-\d{2}$/;
    if (datePattern.test(modelName)) {
      return modelName.replace(datePattern, '');
    }
    
    // Azure models often have formats like azure-gpt-4
    if (modelName.startsWith('azure-')) {
      return modelName.substring(6); // Remove 'azure-' prefix
    }
    
    // Handle Claude model naming variants - use canonical names
    if (modelName.includes('claude')) {
      // All claude-3-5-sonnet variants map to claude-3-5-sonnet
      if (modelName.includes('claude-3-5-sonnet')) {
        return 'claude-3-5-sonnet';
      }
      
      // All claude-3-opus variants map to claude-3-opus
      if (modelName.includes('claude-3-opus')) {
        return 'claude-3-opus';
      }
      
      // All claude-3-haiku variants map to claude-3-haiku
      if (modelName.includes('claude-3-haiku')) {
        return 'claude-3-haiku';
      }
      
      // All claude-3-7-sonnet variants map to claude-3-7-sonnet
      if (modelName.includes('claude-3-7-sonnet')) {
        return 'claude-3-7-sonnet';
      }
      
      // All claude-2 variants map to claude-2
      if (modelName.includes('claude-2')) {
        return 'claude-2';
      }
      
      // Strip any date suffixes or versions
      if (modelName.includes('-20')) {
        // Extract the base model name without the date suffix
        const parts = modelName.split('-');
        const dateIndex = parts.findIndex(part => part.startsWith('20') && part.length >= 8);
        if (dateIndex > 0) {
          return parts.slice(0, dateIndex).join('-');
        }
      }
      
      // Remove -latest suffix if present
      if (modelName.endsWith('-latest')) {
        return modelName.replace('-latest', '');
      }
    }
    
    // Handle GPT model naming variants
    if (modelName.includes('gpt-4o')) {
      if (modelName.includes('gpt-4o-mini')) {
        return 'gpt-4o-mini'; // Standard form for gpt-4o-mini
      }
      return 'gpt-4o'; // Standard form for gpt-4o
    }
    
    return modelName;
  },
  
  // Get cost for a specific model and queryId
  getModelCost(queryId, modelName) {
    if (!queryId || !modelName) return 0;
    
    const normalizedModel = this.normalizeModelName(modelName);
    
    // Extract the base UUID part of the queryId (first 5 parts)
    const baseUuidParts = queryId.split('-').slice(0, 5);
    const baseUuid = baseUuidParts.join('-');
    
    // Search in all model entries for a matching cost entry
    for (const modelKey in this.costs.llm) {
      for (const entry of this.costs.llm[modelKey]) {
        if (!entry.queryId) continue;
        
        // Get UUID part of the entry
        const entryUuidParts = entry.queryId.split('-').slice(0, 5);
        const entryUuid = entryUuidParts.join('-');
        
        const exactModelMatch = entry.model === normalizedModel || 
                               entry.model === modelName || 
                               (entry.originalModel && entry.originalModel === modelName);
                               
        // If API already tracked cost for this UUID + model, use that cost
        if (entryUuid === baseUuid && exactModelMatch && entry.source === 'API') {
          return entry.cost;
        }
        
        // Also match on exact queryId
        if (entry.queryId === queryId && exactModelMatch) {
          return entry.cost;
        }
      }
    }
    
    return 0;
  },
  
  // Get a list of all API-tracked UUIDs (just the base UUID part)
  getApiTrackedUuids() {
    const baseUuids = new Set();
    
    Array.from(this.apiTrackedQueryIds).forEach(queryId => {
      const uuidParts = queryId.split('-').slice(0, 5);
      const baseUuid = uuidParts.join('-');
      baseUuids.add(baseUuid);
    });
    
    return baseUuids;
  },
  
  // Check if a UUID has been tracked by the API
  hasApiTrackedUuid(queryId) {
    if (!queryId) return false;
    
    const uuidParts = queryId.split('-').slice(0, 5);
    const baseUuid = uuidParts.join('-');
    
    return this.getApiTrackedUuids().has(baseUuid);
  },
  
  // Get the total accumulated cost
  getTotalCost() {
    return this.costs.total;
  },
  
  trackLlmCost(model, usage, operation = 'chat', queryId = null, source = 'unknown') {
    // Log for debugging
    console.log(`Server cost tracker: ${model}, ${operation}, ${queryId || 'no-query-id'}`);
    console.log('Usage data:', usage);
    console.log(`Cost tracking source: ${source}`);
    
    if (!model || !usage) {
      return { cost: 0, model: model || 'unknown', operation, usage: { totalTokens: 0 } };
    }

    // Normalize the model name first
    const normalizedModel = this.normalizeModelName(model);
    
    // Log the normalization process
    if (normalizedModel !== model) {
      console.log(`Server cost tracker: Normalized model name from ${model} to ${normalizedModel}`);
    }

    // Check if this specific model has already been tracked for this queryId
    // Need to check both the original and normalized model names
    if (queryId) {
      // Extract the base queryId (without model suffix)
      let baseQueryId = queryId;
      const splitPos = queryId.lastIndexOf('-');
      if (splitPos > 0) {
        baseQueryId = queryId.substring(0, splitPos);
      }
      
      // Check both the normalized model and original model name in the actual tracking data
      const alreadyTracked = Object.values(this.costs.llm).some(modelEntries => 
        modelEntries.some(entry => {
          // Check for exact match on model and queryId
          const exactMatch = entry.queryId === queryId && 
                             (entry.model === normalizedModel || entry.model === model);
                             
          // For Claude models, we need to check normalized form with base queryId too
          const claudeMatch = (normalizedModel.includes('claude') || model.includes('claude')) && 
                             entry.queryId.startsWith(baseQueryId) && 
                             (entry.model === normalizedModel || entry.model === model);
                             
          return exactMatch || claudeMatch;
        })
      );
      
      if (alreadyTracked) {
        console.log(`Cost already tracked for model ${model} (${normalizedModel}) with queryId ${queryId}, skipping duplicate tracking`);
        
        // Find the existing entry and return it
        let existingEntry = null;
        
        // Search through all model entries
        for (const modelKey in this.costs.llm) {
          const foundEntry = this.costs.llm[modelKey].find(entry => 
            (entry.queryId === queryId && (entry.model === normalizedModel || entry.model === model)) ||
            ((normalizedModel.includes('claude') || model.includes('claude')) && 
             entry.queryId.startsWith(baseQueryId) && 
             (entry.model === normalizedModel || entry.model === model))
          );
          
          if (foundEntry) {
            existingEntry = foundEntry;
            break;
          }
        }
        
        return existingEntry || { cost: 0, model: normalizedModel, operation, usage: { totalTokens: 0 } };
      }
    }

    // Initialize the model's array if it doesn't exist
    if (!this.costs.llm[normalizedModel]) {
      this.costs.llm[normalizedModel] = [];
    }
    
    // Normalize the usage data
    const normalizedUsage = {
      promptTokens: usage.promptTokens || usage.prompt_tokens || usage.input_tokens || usage.input || 0,
      completionTokens: usage.completionTokens || usage.completion_tokens || usage.output_tokens || usage.output || 0,
      totalTokens: usage.totalTokens || usage.total_tokens || usage.total || 0
    };
    
    // If total tokens isn't set, calculate it
    if (normalizedUsage.totalTokens === 0 && 
        (normalizedUsage.promptTokens > 0 || normalizedUsage.completionTokens > 0)) {
      normalizedUsage.totalTokens = normalizedUsage.promptTokens + normalizedUsage.completionTokens;
    }
    
    // Calculate cost using the appropriate pricing
    let cost = 0;
    const baseModel = normalizedModel.replace('azure-', ''); // Handle azure prefix
    const modelConfig = defaultModels[normalizedModel] || defaultModels[baseModel];
    
    if (modelConfig) {
      // For Claude models, usage might be in a different format
      if (normalizedModel.includes('claude')) {
        // Check if this is the Claude API format
        const inputTokens = normalizedUsage.promptTokens || usage.input_tokens || 0;
        const outputTokens = normalizedUsage.completionTokens || usage.output_tokens || 0;
        
        // Calculate cost using per-token rates (per million tokens)
        const inputCost = (modelConfig.input / 1000000) * inputTokens;
        const outputCost = (modelConfig.output / 1000000) * outputTokens;
        cost = inputCost + outputCost;
        
        // Format for logging - use fixed decimal notation with 10 places for very small values
        const costFormatted = cost < 0.000001 ? cost.toFixed(10) : cost.toFixed(7);
        console.log(`Claude cost calculation: Input ${inputTokens} tokens at $${modelConfig.input}/million + Output ${outputTokens} tokens at $${modelConfig.output}/million = $${costFormatted}`);
      } else {
        // Standard calculation for other models
        const costResult = calculateCost(normalizedModel, {
          input: normalizedUsage.promptTokens,
          output: normalizedUsage.completionTokens
        });
        cost = costResult.totalCost;
      }
    } else {
      console.warn(`No pricing found for model ${normalizedModel}, assuming zero cost`);
    }
    
    // Store the cost data
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model: normalizedModel,
      originalModel: model !== normalizedModel ? model : undefined,
      operation,
      usage: normalizedUsage,
      cost,
      queryId,
      source
    };
    
    this.costs.llm[normalizedModel].push(costEntry);
    this.costs.total += cost;
    
    console.log(`Cost calculated for ${normalizedModel}: $${cost.toFixed(7)} (source: ${source})`);
    console.log(`Total accumulated cost: $${this.costs.total.toFixed(7)}`);
    
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
    
    // Format the cost value - use fixed decimal notation with 10 decimal places for very small values
    const costFormatted = cost < 0.000001 ? cost.toFixed(10) : cost.toFixed(7);
    
    console.log(`Embedding cost calculated for ${normalizedModel}: $${costFormatted} (${tokenCount} tokens)`);
    console.log(`Total accumulated cost: $${this.costs.total.toFixed(7)}`);
    
    return costEntry;
  },
  
  getCostSummary() {
    console.log('Returning cost summary with total:', this.costs.total.toFixed(10));
    
    // Prepare llm data in array format
    let llmArray = [];
    for (const model in this.costs.llm) {
      llmArray = llmArray.concat(this.costs.llm[model]);
    }
    
    // Prepare embeddings data in array format
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
    console.log(`Total cost: $${this.costs.total.toFixed(7)}`);
    
    return true;
  },
  
  getApiProvidedCost(queryId) {
    if (!queryId) return 0;
    
    let cost = 0;
    // Look through all tracked LLM costs for this queryId
    Object.values(this.costs.llm).forEach(modelEntries => {
      modelEntries.forEach(entry => {
        if (entry.queryId === queryId) {
          cost = entry.cost;
        }
      });
    });
    
    return cost;
  },
  
  computeCost(model, usage, operation = 'chat', queryId = null, source = 'unknown') {
    // Log for debugging
    console.log(`Server cost tracker: ${model}, ${operation}, ${queryId || 'no-query-id'}`);
    console.log('Usage data:', usage);
    console.log(`Cost tracking source: ${source}`);
    
    if (!model || !usage) {
      return { cost: 0, model: model || 'unknown', operation, usage: { totalTokens: 0 } };
    }

    // Normalize the model name first
    const normalizedModel = this.normalizeModelName(model);
    
    // Log the normalization process
    if (normalizedModel !== model) {
      console.log(`Server cost tracker: Normalized model name from ${model} to ${normalizedModel}`);
    }

    // Check if this specific model has already been tracked for this queryId
    // Need to check both the original and normalized model names
    if (queryId) {
      // Extract the base queryId (without model suffix)
      let baseQueryId = queryId;
      const splitPos = queryId.lastIndexOf('-');
      if (splitPos > 0) {
        baseQueryId = queryId.substring(0, splitPos);
      }
      
      // Check both the normalized model and original model name in the actual tracking data
      const alreadyTracked = Object.values(this.costs.llm).some(modelEntries => 
        modelEntries.some(entry => {
          // Check for exact match on model and queryId
          const exactMatch = entry.queryId === queryId && 
                             (entry.model === normalizedModel || entry.model === model);
                             
          // For Claude models, we need to check normalized form with base queryId too
          const claudeMatch = (normalizedModel.includes('claude') || model.includes('claude')) && 
                             entry.queryId.startsWith(baseQueryId) && 
                             (entry.model === normalizedModel || entry.model === model);
                             
          return exactMatch || claudeMatch;
        })
      );
      
      if (alreadyTracked) {
        console.log(`Cost already tracked for model ${model} (${normalizedModel}) with queryId ${queryId}, skipping duplicate tracking`);
        
        // Find the existing entry and return it
        let existingEntry = null;
        
        // Search through all model entries
        for (const modelKey in this.costs.llm) {
          const foundEntry = this.costs.llm[modelKey].find(entry => 
            (entry.queryId === queryId && (entry.model === normalizedModel || entry.model === model)) ||
            ((normalizedModel.includes('claude') || model.includes('claude')) && 
             entry.queryId.startsWith(baseQueryId) && 
             (entry.model === normalizedModel || entry.model === model))
          );
          
          if (foundEntry) {
            existingEntry = foundEntry;
            break;
          }
        }
        
        return existingEntry || { cost: 0, model: normalizedModel, operation, usage: { totalTokens: 0 } };
      }
    }

    // Initialize the model's array if it doesn't exist
    if (!this.costs.llm[normalizedModel]) {
      this.costs.llm[normalizedModel] = [];
    }
    
    // Normalize the usage data
    const normalizedUsage = {
      promptTokens: usage.promptTokens || usage.prompt_tokens || usage.input_tokens || usage.input || 0,
      completionTokens: usage.completionTokens || usage.completion_tokens || usage.output_tokens || usage.output || 0,
      totalTokens: usage.totalTokens || usage.total_tokens || usage.total || 0
    };
    
    // If total tokens isn't set, calculate it
    if (normalizedUsage.totalTokens === 0 && 
        (normalizedUsage.promptTokens > 0 || normalizedUsage.completionTokens > 0)) {
      normalizedUsage.totalTokens = normalizedUsage.promptTokens + normalizedUsage.completionTokens;
    }
    
    // Calculate cost using the appropriate pricing
    let cost = 0;
    const baseModel = normalizedModel.replace('azure-', ''); // Handle azure prefix
    const modelConfig = defaultModels[normalizedModel] || defaultModels[baseModel];
    
    if (modelConfig) {
      // For Claude models, usage might be in a different format
      if (normalizedModel.includes('claude')) {
        // Check if this is the Claude API format
        const inputTokens = normalizedUsage.promptTokens || usage.input_tokens || 0;
        const outputTokens = normalizedUsage.completionTokens || usage.output_tokens || 0;
        
        // Calculate cost using per-token rates (per million tokens)
        const inputCost = (modelConfig.input / 1000000) * inputTokens;
        const outputCost = (modelConfig.output / 1000000) * outputTokens;
        cost = inputCost + outputCost;
        
        // Format for logging - use fixed decimal notation with 10 places for very small values
        const costFormatted = cost < 0.000001 ? cost.toFixed(10) : cost.toFixed(7);
        console.log(`Claude cost calculation: Input ${inputTokens} tokens at $${modelConfig.input}/million + Output ${outputTokens} tokens at $${modelConfig.output}/million = $${costFormatted}`);
      } else {
        // Standard calculation for other models
        const costResult = calculateCost(normalizedModel, {
          input: normalizedUsage.promptTokens,
          output: normalizedUsage.completionTokens
        });
        cost = costResult.totalCost;
      }
    } else {
      console.warn(`No pricing found for model ${normalizedModel}, assuming zero cost`);
    }
    
    // Store the cost data
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model: normalizedModel,
      originalModel: model !== normalizedModel ? model : undefined,
      operation,
      usage: normalizedUsage,
      cost,
      queryId,
      source
    };
    
    this.costs.llm[normalizedModel].push(costEntry);
    this.costs.total += cost;
    
    console.log(`Cost calculated for ${normalizedModel}: $${cost.toFixed(7)} (source: ${source})`);
    console.log(`Total accumulated cost: $${this.costs.total.toFixed(7)}`);
    
    return costEntry;
  },
  
  /**
   * Get costs for a specific model queryId
   * @param {string} queryId - The query identifier
   * @returns {Array} - Array of cost entries for this queryId
   */
  getModelCosts(queryId) {
    if (!queryId) return [];
    
    const results = [];
    
    // Check LLM costs
    for (const model in this.costs.llm) {
      const modelEntries = this.costs.llm[model].filter(entry => 
        entry.queryId === queryId || entry.trackingId === queryId
      );
      
      if (modelEntries.length > 0) {
        results.push(...modelEntries);
      }
    }
    
    return results;
  }
};

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from the React app in production
app.use(express.static(path.join(__dirname, 'build')));

// ================= HITL REVIEW WORKFLOW (IN-MEMORY) =================

// In-memory stores for prompts and reviews
const prompts = [];
const reviews = [];
let promptIdCounter = 1;
let reviewIdCounter = 1;

// POST /api/prompts - submit a prompt for review
app.post('/api/prompts', (req, res) => {
  const { text, userId, response, setKey } = req.body;
  if (!text) return res.status(400).json({ error: 'Prompt text required' });
  const prompt = {
    id: promptIdCounter++,
    text,
    userId: userId || null,
    response: response || '',
    setKey: setKey || '',
    status: 'in_review',
    createdAt: new Date(),
    reviewId: null
  };
  prompts.push(prompt);
  res.json({ success: true, prompt });
});

// GET /api/reviews/queue - list prompts awaiting review
app.get('/api/reviews/queue', (req, res) => {
  const queue = prompts.filter(p => p.status === 'in_review');
  res.json(queue);
});

// POST /api/reviews/:id - submit a review for a prompt
app.post('/api/reviews/:id', (req, res) => {
  const promptId = parseInt(req.params.id, 10);
  const { reviewerId, scores, comments } = req.body;
  const prompt = prompts.find(p => p.id === promptId);
  if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
  if (prompt.status !== 'in_review') return res.status(400).json({ error: 'Prompt not in review' });
  const review = {
    id: reviewIdCounter++,
    promptId,
    reviewerId: reviewerId || null,
    scores: scores || {},
    comments: comments || '',
    status: 'reviewed',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  reviews.push(review);
  prompt.status = 'reviewed';
  prompt.reviewId = review.id;
  res.json({ success: true, review });
});

// GET /api/prompts/:id - get prompt and review status
app.get('/api/prompts/:id', (req, res) => {
  const promptId = parseInt(req.params.id, 10);
  const prompt = prompts.find(p => p.id === promptId);
  if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
  let review = null;
  if (prompt.reviewId) {
    review = reviews.find(r => r.id === prompt.reviewId);
  }
  res.json({ ...prompt, review });
});

// ================= END HITL REVIEW WORKFLOW =================

// IMPORTANT: There are two proxy setups in this application:
// 1. The webpack dev server proxy middleware (configured in package.json)
// 2. Our own direct implementation below
// We need to ensure they don't conflict.

// Extract the base queryId if it contains a model name
function extractBaseQueryId(queryId) {
  if (!queryId) return queryId;
  
  if (queryId.includes('-')) {
    const lastDashPos = queryId.lastIndexOf('-');
    if (lastDashPos > 0) {
      // Check if the part after the last dash looks like a model name
      const possibleModel = queryId.substring(lastDashPos + 1);
      if (possibleModel.includes('gpt') || 
          possibleModel.includes('claude') || 
          possibleModel.includes('o3') ||
          possibleModel.includes('llama')) {
        return queryId.substring(0, lastDashPos);
      }
    }
  }
  
  return queryId;
}

// Replace the existing Anthropic proxy implementation with this version
app.post('/api/proxy/anthropic/messages', async (req, res) => {
  try {
    // Extract relevant data from request
    const apiKey = req.body.anthropicApiKey || process.env.REACT_APP_ANTHROPIC_API_KEY;
    const { model, messages, queryId, isForValidation, isDeliberateCall } = req.body;
    
    // Strong validation - block ALL API calls that don't have a queryId
    // This prevents any automatic API calls that might happen in the background
    if (!queryId) {
      console.log(`\n=============== BLOCKING ANTHROPIC API CALL ===============`);
      console.log(`Blocked API call to model: ${model}`);
      console.log(`Reason: No queryId provided, indicating this is not a user-requested call`);
      console.log(`=============== END BLOCKED CALL ===============\n`);
      
      return res.status(200).json({
        content: [{ text: "This call was blocked because no queryId was provided, indicating it wasn't explicitly requested by the user." }],
        model: model,
        blocked: true
      });
    }
    
    // Special check for automatic Claude calls when no models are selected
    // When isDeliberateCall is not true and there's no queryId, it's likely an automatic call
    if (!isDeliberateCall && model.includes('claude-3-5-sonnet')) {
      console.log(`\n=============== CHECKING CLAUDE CALL TYPE ===============`);
      console.log(`Model requested: ${model}`);
      console.log(`QueryId provided: ${queryId ? 'Yes' : 'No'}`);
      console.log(`isDeliberateCall flag: ${isDeliberateCall ? 'Yes' : 'No'}`);
      
      // If queryId exists, this is likely a deliberate call even if isDeliberateCall is false
      if (queryId) {
        console.log(`QueryId present (${queryId}), considering this a deliberate call`);
      } else {
        console.log(`\n=============== BLOCKING AUTOMATIC CLAUDE CALL ===============`);
        console.log(`Blocked automatic call to model: ${model}`);
        console.log(`This appears to be an automatic call without any models explicitly selected`);
        console.log(`=============== END BLOCKED CALL ===============\n`);
        
        return res.status(200).json({
          content: [{ text: "This call was blocked because no models were explicitly selected." }],
          model: model,
          blocked: true
        });
      }
    }
    
    // Extract the base queryId for consistent tracking
    const baseQueryId = extractBaseQueryId(queryId);
    
    // Make model-specific query ID to avoid duplicate cost tracking
    const modelSpecificQueryId = baseQueryId ? `${baseQueryId}-${model}` : null;
    
    // Log request details
    console.log(`\n=============== ANTHROPIC API REQUEST ===============`);
    console.log(`Model: ${model}`);
    console.log(`QueryId: ${queryId || 'none'}`);
    console.log(`BaseQueryId: ${baseQueryId || 'none'}`);
    console.log(`ModelSpecificQueryId: ${modelSpecificQueryId || 'none'}`);
    
    if (!apiKey) {
      console.error('No Anthropic API key provided');
      return res.status(400).json({ error: 'Anthropic API key is required' });
    }
    
    // Create clean request body with only parameters the Anthropic API accepts
    // This is more robust than trying to delete each custom parameter
    const cleanRequestBody = {
      model: req.body.model,
      messages: req.body.messages,
      system: req.body.system,
      max_tokens: req.body.max_tokens || 4096,
      temperature: req.body.temperature
    };
    
    // Optional parameters
    if (req.body.top_p !== undefined) cleanRequestBody.top_p = req.body.top_p;
    if (req.body.top_k !== undefined) cleanRequestBody.top_k = req.body.top_k;
    if (req.body.stop_sequences) cleanRequestBody.stop_sequences = req.body.stop_sequences;
    if (req.body.stream === true) cleanRequestBody.stream = true;
    
    // Forward request to Anthropic API
    const response = await axios.post('https://api.anthropic.com/v1/messages', cleanRequestBody, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      }
    });
    
    console.log('Anthropic API response status:', response.status);
    
    // Track costs if usage information is available
    if (response.data && response.data.usage) {
      // Use the unified cost computation method to ensure consistency
      const costInfo = costTracker.computeCost(model, response.data.usage, 'chat', modelSpecificQueryId, 'API');
      console.log(`Cost tracked for Anthropic API call: $${costInfo.cost.toFixed(10)}`);
      
      // Add calculated cost info to response
      response.data.cost = costInfo.cost;
    } else {
      console.log('No usage information available in Anthropic response for cost tracking');
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying to Anthropic API:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
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
        console.log(`Cost tracked for OpenAI embedding: $${costInfo.cost.toFixed(7)}`);
        console.log(`Tokens processed: ${tokenCount}, Model: ${model}, Operation: ${operation}`);
        
        // Add cost info to response
        response.data.cost = costInfo.cost;
      } else {
        // Handle LLM cost tracking
        const model = response.data.model || cleanRequestBody.model;
        const usage = response.data.usage;
        
        // Create a model-specific queryId for proper cost tracking
        const modelSpecificQueryId = queryId ? `${queryId}-${model}` : null;
        
        // Check if this specific model has already been tracked for this queryId
        let alreadyTracked = false;
        if (modelSpecificQueryId) {
          const normalizedModel = costTracker.normalizeModelName(model);
          
          // Extract the base queryId (without model suffix)
          let baseQueryId = modelSpecificQueryId;
          const splitPos = modelSpecificQueryId.lastIndexOf('-');
          if (splitPos > 0) {
            baseQueryId = modelSpecificQueryId.substring(0, splitPos);
          }
          
          // Check for exact or related matches
          alreadyTracked = Object.values(costTracker.costs.llm).some(modelEntries => 
            modelEntries.some(entry => {
              // Check for exact match on model and queryId
              const exactMatch = entry.queryId === modelSpecificQueryId && 
                               (entry.model === normalizedModel || entry.model === model);
              
              return exactMatch;
            })
          );
        }
        
        if (alreadyTracked) {
          console.log(`Cost already tracked for model ${model} with queryId ${modelSpecificQueryId}, skipping duplicate tracking`);
        } else {
          try {
            const costInfo = costTracker.computeCost(model, usage, 'chat', modelSpecificQueryId, 'API');
            if (costInfo && typeof costInfo.cost === 'number') {
              console.log(`Cost tracked for OpenAI API call: $${costInfo.cost.toFixed(10)}`);
              
              // Add this queryId to the set of API-tracked costs to prevent duplication
              if (modelSpecificQueryId) {
                costTracker.apiTrackedQueryIds.add(modelSpecificQueryId);
              }
            } else {
              console.warn('Invalid cost info returned from computeCost:', costInfo);
            }
          } catch (costError) {
            console.error('Error tracking cost:', costError.message);
          }
        }
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
    // COMPLETE REQUEST DUMP
    console.log('========================= AZURE OPENAI REQUEST DUMP =========================');
    console.log('Request headers:', req.headers);
    console.log('Request body stringified:', JSON.stringify(req.body, null, 2));
    console.log('DeploymentName direct access:', req.body.deploymentName);
    console.log('Model direct access:', req.body.model);
    console.log('==========================================================================');
    
    // IMMEDIATE FIX FOR DEPLOYMENT NAME
    // This is a critical fix that ensures we always have a deployment name
    let forcedDeploymentName;
    if (req.body.model && req.body.model.startsWith('azure-')) {
      forcedDeploymentName = req.body.model.replace('azure-', '');
    } else if (req.body.model) {
      forcedDeploymentName = req.body.model;
    } else {
      // Last resort
      forcedDeploymentName = 'gpt-4o';
    }
    
    console.log(`[AZURE CRITICAL] Force setting deployment name to: ${forcedDeploymentName}`);
    req.body.deploymentName = forcedDeploymentName;
    
    // Extract query ID if provided
    const queryId = req.body.queryId;
    
    // Get model name from the request (this is reliably present)
    const model = req.body.model;
    
    // Get deployment name directly from model name when missing
    // This is the KEY fix - making sure we always have a deployment name
    let deploymentName = req.body.deploymentName;
    if (!deploymentName && model) {
      if (model.startsWith('azure-')) {
        deploymentName = model.replace('azure-', '');
      } else {
        deploymentName = model; // Use model name directly as fallback
      }
      console.log(`[AZURE DIRECT FIX] Using model name to set deployment name: ${deploymentName}`);
      
      // Update request body with the fixed deployment name
      req.body.deploymentName = deploymentName;
    }
    
    // Final model/deployment name
    const finalModel = model || `azure-${deploymentName}`;
    
    // Extract the base queryId for consistent tracking
    const baseQueryId = extractBaseQueryId(queryId);
    
    // Make model-specific query ID to avoid duplicate cost tracking
    const modelSpecificQueryId = baseQueryId ? `${baseQueryId}-${finalModel}` : null;
    
    console.log(`Azure OpenAI API request: model=${finalModel}, deployment=${deploymentName}, queryId=${queryId}`);
    console.log(`BaseQueryId: ${baseQueryId || 'none'}`);
    console.log(`ModelSpecificQueryId: ${modelSpecificQueryId || 'none'}`);
    
    // Extract the Azure OpenAI API key and endpoint from the request
    const apiKey = req.body.azureApiKey;
    const endpoint = req.body.azureEndpoint;
    const apiVersion = req.body.apiVersion || process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
    
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
      console.error('[AZURE ERROR] Missing deployment name in request and unable to derive from model');
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI deployment name is required and could not be derived from model'
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

    // Special handling for o3-mini model - temperature parameter is not supported
    if (deploymentName.includes('o3-mini')) {
      console.warn(`[AZURE WARNING] Removing temperature parameter for ${deploymentName} as it's not supported`);
      delete cleanRequestBody.temperature;
      
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
    }
    
    // Special handling for o4-mini model - uses max_completion_tokens instead of max_tokens
    if (deploymentName.includes('o4-mini')) {
      console.warn(`[AZURE WARNING] Converting max_tokens to max_completion_tokens for ${deploymentName}`);
      
      if (cleanRequestBody.max_tokens) {
        cleanRequestBody.max_completion_tokens = cleanRequestBody.max_tokens;
        delete cleanRequestBody.max_tokens;
        console.log(`[O4-MINI INFO] Set max_completion_tokens=${cleanRequestBody.max_completion_tokens} for o4-mini model`);
      }
    }
    
    // Special handling for o4-mini model - temperature must be 1 (default), not 0
    if (deploymentName.includes('o4-mini')) {
      console.warn(`[AZURE WARNING] ${deploymentName} only supports temperature=1 (default), removing temperature parameter`);
      delete cleanRequestBody.temperature;
      console.log(`[O4-MINI INFO] Removed temperature parameter for ${deploymentName} - using default value (1)`);
    }
    
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
    
    // Final validation of key parameters before sending the request
    console.log('[AZURE PRE-FLIGHT CHECK]');
    console.log(`- Deployment name: '${deploymentName}'`);
    console.log(`- API key length: ${apiKey ? apiKey.length : 'MISSING'}`);
    console.log(`- Endpoint: '${formattedEndpoint}'`);
    console.log(`- API version: '${apiVersion}'`);
    console.log(`- Messages count: ${cleanRequestBody.messages?.length || 0}`);
    
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
        console.log('[O3-MINI RESPONSE] Analyzing first choice content');
      }
    }
    
    // Track costs if usage information is available
    if (azureResponse.data && azureResponse.data.usage) {
      const usage = azureResponse.data.usage;
      
      // Use the unified cost computation method
      const costInfo = costTracker.computeCost(finalModel, usage, 'chat', modelSpecificQueryId, 'API');
      console.log(`Cost tracked for Azure OpenAI API call: $${costInfo.cost.toFixed(10)}`);
      
      // Add calculated cost info to response
      azureResponse.data.cost = costInfo.cost;
      console.log(`Added calculated cost to Azure response: $${costInfo.cost.toFixed(10)}`);
    } else {
      console.log('No usage information available in Azure OpenAI response for cost tracking');
    }
    
    res.json(azureResponse.data);
  } catch (error) {
    console.error('Error proxying to Azure OpenAI API:', error.message);
    
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

// Add a dedicated endpoint for chat completions that properly tracks costs
app.post('/api/proxy/openai/chat/completions', async (req, res) => {
  try {
    const apiKey = req.body.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY;
    // Extract query ID if provided
    const queryId = req.body.queryId;
    
    // Get model name from request body
    const model = req.body.model;
    
    // Extract the base queryId for consistent tracking
    const baseQueryId = extractBaseQueryId(queryId);
    
    // Make model-specific query ID to avoid duplicate cost tracking
    const modelSpecificQueryId = baseQueryId ? `${baseQueryId}-${model}` : null;
    
    console.log(`OpenAI API request: model=${model}, queryId=${queryId}`);
    console.log(`BaseQueryId: ${baseQueryId || 'none'}`);
    console.log(`ModelSpecificQueryId: ${modelSpecificQueryId || 'none'}`);
    
    if (!apiKey) {
      console.error('No OpenAI API key provided');
      return res.status(400).json({ error: 'OpenAI API key is required' });
    }
    
    // Create a clean request body by removing API key and queryId
    const cleanRequestBody = { ...req.body };
    delete cleanRequestBody.openaiApiKey;
    delete cleanRequestBody.queryId;
    
    // Forward the request to OpenAI
    const response = await axios.post('https://api.openai.com/v1/chat/completions', cleanRequestBody, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('OpenAI API response status:', response.status);
    
    // Track costs if usage information is available
    if (response.data && response.data.usage) {
      const usage = response.data.usage;
      
      // Use the unified cost computation method to ensure consistency
      const costInfo = costTracker.computeCost(model, usage, 'chat', modelSpecificQueryId, 'API');
      console.log(`Cost tracked for OpenAI API call: $${costInfo.cost.toFixed(10)}`);
      
      // Add calculated cost info to response
      response.data.cost = costInfo.cost;
    } else {
      console.log('No usage information available in OpenAI response for cost tracking');
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

// Proxy endpoint for Azure OpenAI Embeddings API
app.post('/api/proxy/azure/embeddings', async (req, res) => {
  try {
    console.log('========================= AZURE EMBEDDINGS REQUEST =========================');
    console.log('Request body keys:', Object.keys(req.body).join(', '));
    console.log('DeploymentName:', req.body.deploymentName);
    console.log('Model:', req.body.model);
    console.log('Input type:', typeof req.body.input);
    console.log('Input is array:', Array.isArray(req.body.input));
    if (Array.isArray(req.body.input)) {
      console.log('Input length:', req.body.input.length);
    }
    console.log('==========================================================================');
    
    // Extract parameters from request
    const apiKey = req.body.azureApiKey;
    const endpoint = req.body.azureEndpoint;
    const deploymentName = req.body.deploymentName;
    const apiVersion = req.body.apiVersion || process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
    const queryId = req.body.queryId;
    
    // Validate required parameters
    if (!apiKey) {
      console.error('[AZURE EMBEDDINGS ERROR] Missing API key in request');
      return res.status(401).json({
        error: {
          message: 'Azure OpenAI API key is required'
        }
      });
    }
    
    if (!endpoint) {
      console.error('[AZURE EMBEDDINGS ERROR] Missing endpoint in request');
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI endpoint is required'
        }
      });
    }
    
    if (!deploymentName) {
      console.error('[AZURE EMBEDDINGS ERROR] Missing deployment name in request');
      return res.status(400).json({
        error: {
          message: 'Azure OpenAI deployment name is required'
        }
      });
    }
    
    // Create clean request body
    const cleanRequestBody = {
      input: req.body.input
    };
    
    // Ensure the endpoint URL is properly formatted
    let formattedEndpoint = endpoint;
    if (formattedEndpoint.endsWith('/')) {
      formattedEndpoint = formattedEndpoint.slice(0, -1);
    }
    
    // Construct the full target URL
    const targetUrl = `${formattedEndpoint}/openai/deployments/${deploymentName}/embeddings?api-version=${apiVersion}`;
    console.log(`[AZURE EMBEDDINGS] Target URL: ${targetUrl}`);
    console.log(`[AZURE EMBEDDINGS] Request body:`, JSON.stringify(cleanRequestBody, null, 2));
    
    // Make the request to Azure OpenAI API
    const azureResponse = await axios.post(
      targetUrl,
      cleanRequestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log(`[AZURE EMBEDDINGS] Response status: ${azureResponse.status}`);
    console.log(`[AZURE EMBEDDINGS] Response has data: ${!!azureResponse.data}`);
    if (azureResponse.data && azureResponse.data.data) {
      console.log(`[AZURE EMBEDDINGS] Number of embeddings returned: ${azureResponse.data.data.length}`);
    }
    
    // Track costs if usage information is available
    if (azureResponse.data && azureResponse.data.usage) {
      const usage = azureResponse.data.usage;
      const model = req.body.model || `azure-${deploymentName}`;
      
      // For embeddings, we track using token count
      const tokenCount = usage.total_tokens || usage.prompt_tokens || 0;
      if (tokenCount > 0) {
        const costInfo = costTracker.trackEmbeddingCost(model, tokenCount, 'embeddings', queryId);
        console.log(`Cost tracked for Azure Embeddings API call: $${costInfo.cost.toFixed(10)}`);
        
        // Add calculated cost info to response
        azureResponse.data.cost = costInfo.cost;
      }
    }
    
    res.json(azureResponse.data);
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

// Cost tracking endpoint
app.post('/api/cost-tracking/track-model-usage', (req, res) => {
  try {
    const { model, usage, operation, queryId } = req.body;
    
    if (!model || !usage) {
      return res.status(400).json({ error: 'Model and usage data are required' });
    }
    
    console.log(`\n=============== COST TRACKING REQUEST ===============`);
    console.log(`Model: ${model}`);
    console.log(`Usage: ${JSON.stringify(usage)}`);
    console.log(`Operation: ${operation}`);
    console.log(`QueryId: ${queryId}`);
    console.log('========================= END REQUEST DUMP =========================');
    
    const costInfo = costTracker.trackLlmCost(model, usage, operation, queryId, 'API');
    res.json({
      success: true,
      cost: costInfo.cost,
      useForDisplay: true,
      costInfo
    });
  } catch (error) {
    console.error('Error tracking cost:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Add cost tracking summary endpoint with dash for legacy/frontend compatibility
app.get('/api/cost-tracking-summary', (req, res) => {
  try {
    const summary = costTracker.getCostSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Web scraping endpoints
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const TurndownService = require('turndown');

// Initialize Turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
});

// Configure Turndown to handle more elements
turndownService.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: function (content) {
    return '~~' + content + '~~';
  }
});

// Helper function for recursive web scraping
async function scrapeRecursively(options) {
  const {
    startUrl,
    useJavaScript,
    waitForSelector,
    removeElements,
    maxDepth,
    maxPages,
    linkPattern,
    excludePattern,
    stayOnDomain
  } = options;

  const visitedUrls = new Set();
  const pages = [];
  const urlQueue = [{ url: startUrl, depth: 0, parentUrl: null }];
  const skippedUrls = [];
  let rootTitle = '';

  // Parse patterns
  const includePatterns = linkPattern ? linkPattern.split(',').map(p => p.trim()).filter(p => p) : [];
  const excludePatterns = excludePattern ? excludePattern.split(',').map(p => p.trim()).filter(p => p) : [];
  
  // Get base domain for domain checking
  const baseDomain = stayOnDomain ? new URL(startUrl).hostname : null;

  while (urlQueue.length > 0 && pages.length < maxPages) {
    const { url: currentUrl, depth, parentUrl } = urlQueue.shift();
    
    // Skip if already visited
    if (visitedUrls.has(currentUrl)) {
      continue;
    }
    
    // Skip if depth exceeds limit
    if (depth >= maxDepth) {
      continue;
    }

    console.log(`Scraping (depth ${depth}): ${currentUrl}`);
    
    try {
      // Mark as visited
      visitedUrls.add(currentUrl);
      
      // Scrape the current page
      const pageResult = await scrapeSinglePage({
        url: currentUrl,
        useJavaScript,
        waitForSelector,
        removeElements
      });
      
      if (pageResult.success) {
        // Store the root title
        if (depth === 0) {
          rootTitle = pageResult.title;
        }
        
        pages.push({
          url: currentUrl,
          title: pageResult.title,
          content: pageResult.content,
          metadata: {
            ...pageResult.metadata,
            depth,
            parentUrl
          },
          depth,
          parentUrl
        });
        
        // Extract links for next level (if not at max depth)
        if (depth < maxDepth - 1 && pageResult.html) {
          const $ = cheerio.load(pageResult.html);
          const links = new Set();
          
          // Find all links
          $('a[href]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (!href) return;
            
            try {
              const linkUrl = new URL(href, currentUrl).href;
              
              // Apply domain restriction
              if (baseDomain && new URL(linkUrl).hostname !== baseDomain) {
                return;
              }
              
              // Apply include patterns
              if (includePatterns.length > 0) {
                const matchesInclude = includePatterns.some(pattern => linkUrl.includes(pattern));
                if (!matchesInclude) return;
              }
              
              // Apply exclude patterns
              if (excludePatterns.length > 0) {
                const matchesExclude = excludePatterns.some(pattern => linkUrl.includes(pattern));
                if (matchesExclude) return;
              }
              
              // Skip common non-content files
              if (linkUrl.match(/\.(pdf|jpg|jpeg|png|gif|zip|doc|docx|xls|xlsx)$/i)) {
                return;
              }
              
              // Skip fragments and mailto/tel links
              if (linkUrl.includes('#') || linkUrl.startsWith('mailto:') || linkUrl.startsWith('tel:')) {
                return;
              }
              
              links.add(linkUrl);
            } catch (urlError) {
              // Invalid URL, skip
            }
          });
          
          // Add new links to queue
          for (const link of links) {
            if (!visitedUrls.has(link) && pages.length + urlQueue.length < maxPages) {
              urlQueue.push({
                url: link,
                depth: depth + 1,
                parentUrl: currentUrl
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error scraping ${currentUrl}:`, error.message);
      skippedUrls.push({ url: currentUrl, error: error.message });
    }
  }

  return {
    pages,
    rootTitle,
    skippedUrls
  };
}

// Helper function to scrape a single page
async function scrapeSinglePage({ url, useJavaScript, waitForSelector, removeElements }) {
  let html;
  let title = '';
  
  if (useJavaScript) {
    // Use Puppeteer for JavaScript-heavy sites
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set user agent to avoid blocking
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Navigate to the page
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for specific selector if provided
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }
      
      // Get the page content
      html = await page.content();
      title = await page.title();
      
    } finally {
      await browser.close();
    }
  } else {
    // Use simple HTTP request for static content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    html = response.data;
  }
  
  // Parse HTML with Cheerio
  const $ = cheerio.load(html);
  
  // Get title if not already set
  if (!title) {
    title = $('title').text() || $('h1').first().text() || 'Scraped Content';
  }
  
  // Remove unwanted elements
  const defaultRemoveElements = [
    'script', 'style', 'nav', 'header', 'footer', 
    '.advertisement', '.ads', '.sidebar', '.menu',
    '#comments', '.comments', '.social-share'
  ];
  
  const elementsToRemove = [...defaultRemoveElements, ...removeElements];
  elementsToRemove.forEach(selector => {
    $(selector).remove();
  });
  
  // Extract main content - try common content selectors
  const contentSelectors = [
    'main',
    'article', 
    '.content',
    '.main-content',
    '.post-content',
    '.entry-content',
    '#content',
    '.container'
  ];
  
  let mainContent = null;
  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0 && element.text().trim().length > 100) {
      mainContent = element;
      break;
    }
  }
  
  // If no main content found, use body but clean it up
  if (!mainContent) {
    mainContent = $('body');
  }
  
  // Convert to markdown
  const cleanHtml = mainContent.html();
  const markdown = turndownService.turndown(cleanHtml);
  
  // Clean up the markdown
  const cleanMarkdown = markdown
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/\[(\s*)\]/g, '') // Remove empty links
    .trim();
  
  // Create metadata
  const metadata = {
    source: url,
    title: title.trim(),
    scrapedAt: new Date().toISOString(),
    method: useJavaScript ? 'puppeteer' : 'axios',
    contentLength: cleanMarkdown.length
  };
  
  return {
    success: true,
    content: cleanMarkdown,
    metadata,
    title: title.trim(),
    html // Return HTML for link extraction
  };
}

// Endpoint to scrape a webpage and convert to markdown
app.post('/api/scrape-webpage', async (req, res) => {
  try {
    const { 
      url, 
      useJavaScript = false, 
      waitForSelector = null, 
      removeElements = [],
      // Recursive options
      followLinks = false,
      maxDepth = 1,
      maxPages = 10,
      linkPattern = null,
      excludePattern = null,
      stayOnDomain = true
    } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Scraping webpage: ${url} (JavaScript: ${useJavaScript}, Follow links: ${followLinks})`);
    
    // If recursive scraping is enabled, use the recursive function
    if (followLinks && maxDepth > 1) {
      const recursiveResult = await scrapeRecursively({
        startUrl: url,
        useJavaScript,
        waitForSelector,
        removeElements,
        maxDepth,
        maxPages,
        linkPattern,
        excludePattern,
        stayOnDomain
      });
      
      return res.json({
        success: true,
        pages: recursiveResult.pages,
        rootTitle: recursiveResult.rootTitle,
        totalPages: recursiveResult.pages.length,
        skippedUrls: recursiveResult.skippedUrls
      });
    }
    
    // Single page scraping (original logic)
    const result = await scrapeSinglePage({
      url,
      useJavaScript,
      waitForSelector,
      removeElements
    });
    
    if (result.success) {
      console.log(`Successfully scraped ${url}: ${result.metadata.contentLength} characters`);
      
      res.json({
        success: true,
        content: result.content,
        metadata: result.metadata,
        title: result.title
      });
    } else {
      throw new Error('Failed to scrape page');
    }
    
  } catch (error) {
    console.error('Error scraping webpage:', error.message);
    res.status(500).json({ 
      error: 'Failed to scrape webpage',
      details: error.message 
    });
  }
});

// Endpoint to validate URL before scraping
app.post('/api/validate-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const trimmedUrl = url.trim();
    
    if (!trimmedUrl) {
      return res.status(400).json({ error: 'URL cannot be empty' });
    }
    
    // Add protocol if missing
    let validUrl = trimmedUrl;
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      validUrl = 'https://' + trimmedUrl;
    }
    
    // Basic URL validation
    try {
      new URL(validUrl);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL format: ' + error.message });
    }
    
    // Check if URL is accessible
    const response = await axios.head(validUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const contentType = response.headers['content-type'] || '';
    const isHtml = contentType.includes('text/html');
    
    res.json({
      valid: true,
      accessible: true,
      contentType,
      isHtml,
      statusCode: response.status,
      correctedUrl: validUrl !== trimmedUrl ? validUrl : undefined,
      recommendJavaScript: false // Could be enhanced with heuristics
    });
    
  } catch (error) {
    console.error('Error validating URL:', error.message);
    res.json({
      valid: false,
      accessible: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});