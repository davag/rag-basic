/**
 * Cost Tracker Module
 * 
 * This module provides functionality to track costs of AI operations (LLM calls, embeddings)
 * in a non-intrusive way. It acts as a singleton that can be used across the application.
 */

// Imported models/pricing information
import { calculateCost } from './apiServices';
import { defaultModels } from '../config/llmConfig';

class CostTracker {
  constructor() {
    // Singleton pattern
    if (CostTracker.instance) {
      return CostTracker.instance;
    }
    
    // Initialize cost tracking data structure
    this.costs = {
      llm: {},
      embeddings: {},
      total: 0, // Total accumulated cost
    };
    
    // Flag to enable/disable detailed logging
    this.detailedLogging = true;
    
    // Track which queries have already been processed to prevent duplicates
    this.processedQueries = new Set();
    
    CostTracker.instance = this;
  }
  
  /**
   * Enable or disable detailed cost logging
   * @param {boolean} enabled - Whether to enable detailed logging
   */
  setDetailedLogging(enabled) {
    this.detailedLogging = enabled;
    
    if (this.detailedLogging) {
      console.log('Cost tracker: Detailed logging enabled');
    }
  }
  
  /**
   * Normalize a model name by removing date/version suffixes
   * @param {string} model - The model name to normalize 
   * @returns {string} Normalized model name
   */
  normalizeModelName(model) {
    if (!model) return 'unknown';
    
    // Handle common date/version patterns in model names
    const datePattern = /-\d{4}-\d{2}-\d{2}$/;
    if (datePattern.test(model)) {
      return model.replace(datePattern, '');
    }
    
    // Azure models often have formats like azure-gpt-4
    if (model.startsWith('azure-')) {
      return model.substring(6); // Remove 'azure-' prefix
    }
    
    // Handle Claude model naming variants - use canonical names
    if (model.includes('claude')) {
      // All claude-3-5-sonnet variants map to claude-3-5-sonnet
      if (model.includes('claude-3-5-sonnet')) {
        return 'claude-3-5-sonnet';
      }
      
      // All claude-3-opus variants map to claude-3-opus
      if (model.includes('claude-3-opus')) {
        return 'claude-3-opus';
      }
      
      // All claude-3-haiku variants map to claude-3-haiku
      if (model.includes('claude-3-haiku')) {
        return 'claude-3-haiku';
      }
      
      // All claude-3-7-sonnet variants map to claude-3-7-sonnet
      if (model.includes('claude-3-7-sonnet')) {
        return 'claude-3-7-sonnet';
      }
      
      // All claude-2 variants map to claude-2
      if (model.includes('claude-2')) {
        return 'claude-2';
      }
      
      // Strip any date suffixes or versions
      if (model.includes('-20')) {
        // Extract the base model name without the date suffix
        const parts = model.split('-');
        const dateIndex = parts.findIndex(part => part.startsWith('20') && part.length >= 8);
        if (dateIndex > 0) {
          return parts.slice(0, dateIndex).join('-');
        }
      }
      
      // Remove -latest suffix if present
      if (model.endsWith('-latest')) {
        return model.replace('-latest', '');
      }
    }
    
    // Handle GPT model naming variants
    if (model.includes('gpt-4o')) {
      if (model.includes('gpt-4o-mini')) {
        return 'gpt-4o-mini'; // Standard form for gpt-4o-mini
      }
      return 'gpt-4o'; // Standard form for gpt-4o
    }
    
    return model;
  }
  
  /**
   * Get a unique ID for cost tracking to prevent duplicates
   * @param {string} model - The model name
   * @param {string} queryId - The query identifier
   * @returns {string} Unique tracking ID
   */
  getUniqueTrackingId(model, queryId) {
    if (!queryId) return null;
    
    // Extract the base queryId (first part before model suffix, if present)
    let baseQueryId = queryId;
    const lastDashPos = queryId.lastIndexOf('-');
    if (lastDashPos > 0) {
      // Check if the part after the last dash looks like a model name
      const possibleModel = queryId.substring(lastDashPos + 1);
      if (possibleModel.includes('gpt') || 
          possibleModel.includes('claude') || 
          possibleModel.includes('o3') ||
          possibleModel.includes('llama')) {
        baseQueryId = queryId.substring(0, lastDashPos);
      }
    }
    
    const normalizedModel = this.normalizeModelName(model);
    return `${baseQueryId}-${normalizedModel}`;
  }

  /**
   * Unified cost computation method - single source of truth for all cost calculations
   * @param {string} model - The model name
   * @param {object} usage - Token usage data
   * @param {string} operation - Operation type
   * @param {string} queryId - Query identifier
   * @param {string} source - Source of the cost (API, calculated, etc.)
   * @returns {object} Cost information
   */
  computeCost(model, usage, operation = 'chat', queryId = null, source = 'calculated') {
    if (!model) {
      console.warn(`Cost tracker: Missing model name`);
      return { cost: 0, model: 'unknown', operation, usage: { totalTokens: 0 } };
    }
    
    const normalizedModel = this.normalizeModelName(model);
    const trackingId = this.getUniqueTrackingId(model, queryId);
    
    // Check if this exact query+model combination has already been processed
    if (trackingId && this.processedQueries.has(trackingId)) {
      console.log(`Cost already tracked for ${normalizedModel} with ID ${trackingId}`);
      
      // Find and return the existing cost entry
      for (const modelKey in this.costs.llm) {
        const foundEntry = this.costs.llm[modelKey].find(entry => 
          entry.trackingId === trackingId
        );
        
        if (foundEntry) {
          return foundEntry;
        }
      }
      
      return { cost: 0, model: normalizedModel, operation, usage: { totalTokens: 0 } };
    }
    
    // Normalize the usage data consistently
    const normalizedUsage = this.normalizeUsageData(usage, normalizedModel);
    
    // Determine the cost - API provided or calculated
    let cost = 0;
    
    // Check if cost is already provided directly (from API)
    if (usage && usage.cost !== undefined) {
      cost = Number(usage.cost);
      console.log(`Using API-provided cost for ${normalizedModel}: $${cost.toFixed(8)}`);
    } 
    // Otherwise calculate based on token usage and pricing
    else {
      // Handle different model types
      if (normalizedModel.includes('llama') || normalizedModel.includes('mistral') || normalizedModel.includes('gemma')) {
        cost = 0; // Local models are free
      } else {
        // Use centralized cost calculation function
        const inputTokens = normalizedUsage.promptTokens || 0;
        const outputTokens = normalizedUsage.completionTokens || 0;
        
        const costResult = calculateCost(normalizedModel, {
          input: inputTokens,
          output: outputTokens
        });
        
        cost = costResult.totalCost;
      }
      
      console.log(`Calculated cost for ${normalizedModel}: $${cost.toFixed(8)} based on ${normalizedUsage.totalTokens} tokens`);
    }
    
    // Create cost entry
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model: normalizedModel,
      originalModel: model !== normalizedModel ? model : undefined,
      operation,
      usage: normalizedUsage,
      cost,
      queryId,
      trackingId,
      source
    };
    
    // Add to tracking data
    if (!this.costs.llm[normalizedModel]) {
      this.costs.llm[normalizedModel] = [];
    }
    
    // Store the cost entry
    this.costs.llm[normalizedModel].push(costEntry);
    this.costs.total += cost;
    
    // Mark as processed to prevent duplicates
    if (trackingId) {
      this.processedQueries.add(trackingId);
    }
    
    // Log if detailed logging is enabled
    if (this.detailedLogging) {
      console.log(`Cost tracker: LLM operation logged - ${normalizedModel}, ${operation}, $${cost.toFixed(8)}`);
      console.log(`Token usage: ${normalizedUsage.totalTokens} total tokens (${normalizedUsage.estimated ? 'estimated' : 'reported'})`);
    }
    
    return costEntry;
  }
  
  /**
   * Track cost for an LLM API call - uses the unified computeCost method
   * @param {string} model - The model name
   * @param {object} usage - Token usage object {promptTokens, completionTokens, total} or {prompt_tokens, completion_tokens, total_tokens}
   * @param {string} operation - Operation type (e.g., 'chat', 'completion')
   * @param {string} queryId - Optional query identifier to group related costs
   * @returns {object} Cost information
   */
  trackLlmCost(model, usage, operation = 'chat', queryId = null, source = 'client') {
    console.log(`Cost tracker called for model: ${model}`);
    console.log(`Usage data received:`, usage);
    
    // Use the unified cost computation method
    return this.computeCost(model, usage, operation, queryId, source);
  }
  
  /**
   * Normalize token usage data to a consistent format
   * @param {object|number} usage - Token usage data or total token count
   * @param {string} model - Model name for special handling
   * @returns {object} Normalized usage data
   */
  normalizeUsageData(usage, model) {
    // Handle missing usage data
    if (!usage || typeof usage !== 'object') {
      // For Ollama models, provide a default token estimate
      if (model && (model.includes('llama') || model.includes('mistral') || model.includes('gemma'))) {
        return {
          promptTokens: 500,
          completionTokens: 500,
          totalTokens: 1000,
          estimated: true
        };
      }
      
      return { 
        promptTokens: 0, 
        completionTokens: 0, 
        totalTokens: 0,
        estimated: false 
      };
    }
    
    // Create normalized structure
    let normalizedUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimated: false
    };
    
    // First, prioritize getting token usage from API response objects
    if (usage.rawResponse?.usage) {
      console.log(`[CostTracker] Found API-reported token usage for ${model}:`, usage.rawResponse.usage);
      normalizedUsage.promptTokens = usage.rawResponse.usage.prompt_tokens || 0;
      normalizedUsage.completionTokens = usage.rawResponse.usage.completion_tokens || 0;
      normalizedUsage.totalTokens = usage.rawResponse.usage.total_tokens || 0;
      normalizedUsage.estimated = false;
      normalizedUsage.source = 'api';
      return normalizedUsage;
    }
    
    // Check all possible token keys
    // For prompt tokens
    if (usage.promptTokens !== undefined) normalizedUsage.promptTokens = usage.promptTokens;
    else if (usage.prompt_tokens !== undefined) normalizedUsage.promptTokens = usage.prompt_tokens;
    else if (usage.input_tokens !== undefined) normalizedUsage.promptTokens = usage.input_tokens;
    else if (usage.input !== undefined) normalizedUsage.promptTokens = usage.input;
    
    // For completion tokens
    if (usage.completionTokens !== undefined) normalizedUsage.completionTokens = usage.completionTokens;
    else if (usage.completion_tokens !== undefined) normalizedUsage.completionTokens = usage.completion_tokens;
    else if (usage.output_tokens !== undefined) normalizedUsage.completionTokens = usage.output_tokens;
    else if (usage.output !== undefined) normalizedUsage.completionTokens = usage.output;
    
    // For total tokens
    if (usage.totalTokens !== undefined) normalizedUsage.totalTokens = usage.totalTokens;
    else if (usage.total_tokens !== undefined) normalizedUsage.totalTokens = usage.total_tokens;
    else if (usage.total !== undefined) normalizedUsage.totalTokens = usage.total;
    
    // If we have prompt and completion but no total, calculate it
    if (normalizedUsage.totalTokens === 0 && 
        normalizedUsage.promptTokens > 0 && 
        normalizedUsage.completionTokens > 0) {
      normalizedUsage.totalTokens = normalizedUsage.promptTokens + normalizedUsage.completionTokens;
    }
    
    // If we only have total but not prompt/completion, estimate a 50/50 split
    if (normalizedUsage.totalTokens > 0 && 
        normalizedUsage.promptTokens === 0 && 
        normalizedUsage.completionTokens === 0) {
      normalizedUsage.promptTokens = Math.floor(normalizedUsage.totalTokens / 2);
      normalizedUsage.completionTokens = normalizedUsage.totalTokens - normalizedUsage.promptTokens;
      normalizedUsage.estimated = true;
    }
    
    // If we still have no token information, try to estimate from text length
    if (normalizedUsage.totalTokens === 0) {
      let estimatedTotal = 0;
      
      if (usage.response && typeof usage.response === 'string') {
        estimatedTotal = Math.round(usage.response.length / 4);
      } else if (usage.text && typeof usage.text === 'string') {
        estimatedTotal = Math.round(usage.text.length / 4);
      } else if (usage.answer && typeof usage.answer === 'string') {
        estimatedTotal = Math.round(usage.answer.length / 4);
      }
      
      if (estimatedTotal > 0) {
        normalizedUsage.totalTokens = estimatedTotal;
        normalizedUsage.promptTokens = Math.floor(estimatedTotal / 2);
        normalizedUsage.completionTokens = estimatedTotal - normalizedUsage.promptTokens;
        normalizedUsage.estimated = true;
      } else {
        // Default values for models that don't report token usage
        normalizedUsage.totalTokens = 1000; // Reasonable default
        normalizedUsage.promptTokens = 500;
        normalizedUsage.completionTokens = 500;
        normalizedUsage.estimated = true;
      }
    }
    
    return normalizedUsage;
  }
  
  /**
   * Find matching embedding model in defaultModels
   * @param {string} modelName - The embedding model name (may include vendor prefix)
   * @returns {string} The matched model name from defaultModels or null if not found
   */
  findMatchingEmbeddingModel(modelName) {
    // Direct match
    if (defaultModels[modelName]) {
      return modelName;
    }
    
    // If model starts with vendor prefix (e.g., "ollama-" or "azure-")
    const vendorPrefixes = ['ollama-', 'azure-'];
    for (const prefix of vendorPrefixes) {
      if (modelName.startsWith(prefix)) {
        // eslint-disable-next-line no-unused-vars
        const baseModelName = this.normalizeModelName(modelName);
        
        // Try to find exact match for the base model with the same prefix
        const exactBaseMatch = `${prefix}text-embedding-3-small`;
        if (defaultModels[exactBaseMatch]) {
          if (this.detailedLogging) {
            console.log(`Matched ${modelName} to ${exactBaseMatch}`);
          }
          return exactBaseMatch;
        }
        
        // If not found, use default embedding model
        const defaultMatch = 'text-embedding-3-small';
        if (defaultModels[defaultMatch]) {
          if (this.detailedLogging) {
            console.log(`Matched ${modelName} to ${defaultMatch}`);
          }
          return defaultMatch;
        }
      }
    }
    
    // If it contains embedding keywords
    const embeddingKeywords = ['embedding', 'embed'];
    for (const keyword of embeddingKeywords) {
      if (modelName.toLowerCase().includes(keyword)) {
        // Try to find an embedding model
        const embeddingModels = Object.keys(defaultModels).filter(
          key => key.includes('text-embedding')
        );
        
        if (embeddingModels.length > 0) {
          if (this.detailedLogging) {
            console.log(`Matched ${modelName} to ${embeddingModels[0]}`);
          }
          return embeddingModels[0];
        }
      }
    }
    
    // Default to the most cost-effective embedding model
    if (defaultModels['text-embedding-3-small']) {
      return 'text-embedding-3-small';
    }
    
    // Last resort: couldn't find an embedding model
    console.warn(`Could not find matching embedding model for ${modelName}`);
    return null;
  }
  
  /**
   * Track cost for embedding generation
   * @param {string} model - The embedding model name
   * @param {number} tokenCount - Number of tokens processed
   * @param {string} operation - Operation type (e.g., 'document', 'query')
   * @param {string} queryId - Optional query identifier to group related costs
   * @returns {object} Cost information
   */
  trackEmbeddingCost(model, tokenCount, operation = 'document', queryId = null) {
    if (!model || !tokenCount) {
      console.warn(`Cost tracker: Missing model or token count for embedding tracking`);
      return { cost: 0, model, operation };
    }
    
    // Normalize the model name
    const normalizedModel = this.normalizeModelName(model);
    const trackingId = this.getUniqueTrackingId(model, queryId);
    
    // Check if this exact query+model combination has already been processed
    if (trackingId && this.processedQueries.has(trackingId)) {
      console.log(`Embedding cost already tracked for ${normalizedModel} with ID ${trackingId}`);
      
      // Find and return the existing cost entry
      for (const modelKey in this.costs.embeddings) {
        const foundEntry = this.costs.embeddings[modelKey].find(entry => 
          entry.trackingId === trackingId
        );
        
        if (foundEntry) {
          return foundEntry;
        }
      }
      
      return { cost: 0, model: normalizedModel, operation };
    }
    
    // Find matching model in defaultModels configuration
    const matchedModel = this.findMatchingEmbeddingModel(normalizedModel);
    
    // Get embedding model configuration from central defaultModels
    const modelConfig = matchedModel ? defaultModels[matchedModel] : null;
    
    if (!modelConfig) {
      console.warn(`Cost tracker: No pricing found for embedding model ${normalizedModel}`);
      return { cost: 0, model: normalizedModel, operation };
    }
    
    // For embeddings, input and output costs are typically the same
    // Use input cost as the standard cost per token
    const pricePerMillion = modelConfig.input;
    
    // Calculate cost
    const cost = (pricePerMillion * tokenCount) / 1000000;
    
    // Create cost entry
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model: normalizedModel,
      originalModel: model !== normalizedModel ? model : undefined, // Keep original model name for reference if different
      matchedModel, // Keep track of which model configuration was used
      operation,
      usage: {
        tokenCount
      },
      cost,
      queryId,
      trackingId
    };
    
    // Add to tracking data
    if (!this.costs.embeddings[normalizedModel]) {
      this.costs.embeddings[normalizedModel] = [];
    }
    
    this.costs.embeddings[normalizedModel].push(costEntry);
    this.costs.total += cost;
    
    // Mark as processed to prevent duplicates
    if (trackingId) {
      this.processedQueries.add(trackingId);
    }
    
    // Log if detailed logging is enabled
    if (this.detailedLogging) {
      console.log(`Cost tracker: Embedding operation logged - ${normalizedModel}, ${operation}, $${cost.toFixed(8)}`);
      console.log(`Token count: ${tokenCount}`);
    }
    
    return costEntry;
  }
  
  /**
   * Get total cost across all operations
   * @returns {number} Total cost in USD
   */
  getTotalCost() {
    return this.costs.total;
  }
  
  /**
   * Get cost breakdown by model
   * @returns {object} Costs grouped by model
   */
  getCostsByModel() {
    const modelCosts = {};
    
    // Process LLM costs
    for (const model in this.costs.llm) {
      modelCosts[model] = this.costs.llm[model].reduce((total, entry) => total + entry.cost, 0);
    }
    
    // Process embedding costs - add to existing model entry if it exists
    for (const model in this.costs.embeddings) {
      if (modelCosts[model]) {
        // Model exists in LLM costs, add to it
        modelCosts[model] += this.costs.embeddings[model].reduce((total, entry) => total + entry.cost, 0);
      } else {
        // New model entry
        modelCosts[model] = this.costs.embeddings[model].reduce((total, entry) => total + entry.cost, 0);
      }
    }
    
    return modelCosts;
  }
  
  /**
   * Get cost breakdown by operation type
   * @returns {object} Costs grouped by operation type
   */
  getCostsByOperation() {
    const operationCosts = {
      llm: 0,
      embeddings: 0
    };
    
    // Sum LLM costs
    for (const model in this.costs.llm) {
      operationCosts.llm += this.costs.llm[model].reduce((total, entry) => total + entry.cost, 0);
    }
    
    // Sum embedding costs
    for (const model in this.costs.embeddings) {
      operationCosts.embeddings += this.costs.embeddings[model].reduce((total, entry) => total + entry.cost, 0);
    }
    
    return operationCosts;
  }
  
  /**
   * Get costs filtered by time period
   * @param {Date} startDate - Start date for filtering
   * @param {Date} endDate - End date for filtering
   * @returns {object} Filtered cost data
   */
  getCostsByTimePeriod(startDate, endDate) {
    // Initialize with empty structure
    const filteredCosts = {
      llm: {},
      embeddings: {},
      total: 0
    };
    
    // Filter LLM costs by date
    for (const model in this.costs.llm) {
      filteredCosts.llm[model] = this.costs.llm[model].filter(entry => 
        entry.timestamp >= startDate && entry.timestamp <= endDate
      );
    }
    
    // Filter embedding costs by date
    for (const model in this.costs.embeddings) {
      filteredCosts.embeddings[model] = this.costs.embeddings[model].filter(entry => 
        entry.timestamp >= startDate && entry.timestamp <= endDate
      );
    }
    
    // Calculate total for this period
    let periodTotal = 0;
    
    // Sum LLM costs for this period
    for (const model in filteredCosts.llm) {
      periodTotal += filteredCosts.llm[model].reduce((total, entry) => total + entry.cost, 0);
    }
    
    // Sum embedding costs for this period
    for (const model in filteredCosts.embeddings) {
      periodTotal += filteredCosts.embeddings[model].reduce((total, entry) => total + entry.cost, 0);
    }
    
    filteredCosts.total = periodTotal;
    
    return filteredCosts;
  }
  
  /**
   * Get costs for a specific query
   * @param {string} queryId - The query identifier
   * @returns {object} Costs related to the query
   */
  getCostsByQuery(queryId) {
    if (!queryId) return { llm: [], embeddings: [], total: 0 };
    
    const queryCosts = {
      llm: this.costs.llm.filter(entry => entry.queryId === queryId),
      embeddings: this.costs.embeddings.filter(entry => entry.queryId === queryId)
    };
    
    // Calculate total for this query
    let queryTotal = 0;
    queryCosts.llm.forEach(entry => queryTotal += entry.cost);
    queryCosts.embeddings.forEach(entry => queryTotal += entry.cost);
    queryCosts.total = queryTotal;
    
    return queryCosts;
  }
  
  /**
   * Export cost data as JSON
   * @returns {string} JSON string of cost data
   */
  exportCostData() {
    return {
      costs: this.costs,
      detailedLogging: this.detailedLogging,
      exportedAt: new Date().toISOString()
    };
  }
  
  /**
   * Reset cost data
   */
  resetCostData() {
    this.costs = {
      llm: {},
      embeddings: {},
      total: 0
    };
    console.log('Cost tracking data has been reset');
    return true;
  }
  
  /**
   * Get a summary of all cost tracking data
   * @returns {object} Summary of cost tracking data
   */
  getCostSummary() {
    // Convert LLM data from object of arrays to flat array
    let llmArray = [];
    for (const model in this.costs.llm) {
      llmArray = llmArray.concat(this.costs.llm[model]);
    }
    
    // Convert embedding data from object of arrays to flat array
    let embeddingsArray = [];
    for (const model in this.costs.embeddings) {
      embeddingsArray = embeddingsArray.concat(this.costs.embeddings[model]);
    }
    
    return {
      totalCost: this.getTotalCost(),
      costsByModel: this.getCostsByModel(),
      costsByOperation: this.getCostsByOperation(),
      llm: llmArray,
      embeddings: embeddingsArray
    };
  }
}

// Export singleton instance
export const costTracker = new CostTracker();

// Export decorator functions for easy API call wrapping
export const trackLlmApiCall = (apiCallFn) => {
  return async function(...args) {
    const result = await apiCallFn(...args);
    
    // Extract necessary information from result
    if (result && result.usage && result.model) {
      costTracker.trackLlmCost(
        result.model, 
        result.usage, 
        'chat', 
        args[0]?.queryId
      );
    }
    
    return result;
  };
};

export const trackEmbeddingApiCall = (apiCallFn) => {
  return async function(...args) {
    const result = await apiCallFn(...args);
    
    // For embeddings, we need to estimate token count from input
    // Rough estimate: 1 token per 4 chars
    if (args[0] && typeof args[0] === 'string') {
      const tokenCount = Math.ceil(args[0].length / 4);
      const model = args[1]?.model || 'text-embedding-3-small';
      
      costTracker.trackEmbeddingCost(
        model,
        tokenCount,
        'query',
        args[1]?.queryId
      );
    } else if (Array.isArray(args[0])) {
      // Handle document embeddings (array of texts)
      const totalChars = args[0].reduce((sum, text) => 
        sum + (typeof text === 'string' ? text.length : 0), 0);
      const tokenCount = Math.ceil(totalChars / 4);
      const model = args[1]?.model || 'text-embedding-3-small';
      
      costTracker.trackEmbeddingCost(
        model,
        tokenCount,
        'document',
        args[1]?.queryId
      );
    }
    
    return result;
  };
}; 