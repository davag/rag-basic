/**
 * Cost Tracker Module
 * 
 * This module provides functionality to track costs of AI operations (LLM calls, embeddings)
 * in a non-intrusive way. It acts as a singleton that can be used across the application.
 */

// Imported models/pricing information
import { calculateCost } from './apiServices';

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
    
    // Embedding model pricing per 1M tokens (in USD)
    this.embeddingPricing = {
      'text-embedding-ada-002': 0.0001,
      'text-embedding-3-small': 0.00002,
      'text-embedding-3-large': 0.00013
    };
    
    // Flag to enable/disable detailed logging
    this.detailedLogging = true;
    
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
   * Track cost for an LLM API call
   * @param {string} model - The model name
   * @param {object} usage - Token usage object {promptTokens, completionTokens, total} or {prompt_tokens, completion_tokens, total_tokens}
   * @param {string} operation - Operation type (e.g., 'chat', 'completion')
   * @param {string} queryId - Optional query identifier to group related costs
   * @returns {object} Cost information
   */
  trackLlmCost(model, usage, operation = 'chat', queryId = null) {
    // More detailed logging to help debug token usage
    console.log(`Cost tracker called for model: ${model}`);
    console.log(`Usage data received:`, usage);
    
    if (!model) {
      console.warn(`Cost tracker: Missing model name`);
      return { cost: 0, model: 'unknown', operation, usage: { totalTokens: 0 } };
    }
    
    if (!usage || typeof usage !== 'object') {
      console.warn(`Cost tracker: Missing or invalid usage data for ${model}`);
      
      // For Ollama models, provide a default token estimate since they don't report usage
      if (model.includes('llama') || model.includes('mistral') || model.includes('gemma')) {
        console.log(`Cost tracker: Creating default token estimate for Ollama model ${model}`);
        const defaultUsage = {
          promptTokens: 500,
          completionTokens: 500,
          totalTokens: 1000,
          estimated: true
        };
        
        return {
          cost: 0, // Ollama models are free for local inference
          model,
          operation,
          usage: defaultUsage,
          queryId
        };
      }
      
      return { cost: 0, model, operation, usage: { totalTokens: 0 } };
    }
    
    // Handle different usage formats with more flexibility
    let normalizedUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimated: false
    };
    
    // Check all possible token keys
    // For prompt tokens
    if (usage.promptTokens !== undefined) normalizedUsage.promptTokens = usage.promptTokens;
    else if (usage.prompt_tokens !== undefined) normalizedUsage.promptTokens = usage.prompt_tokens;
    else if (usage.input_tokens !== undefined) normalizedUsage.promptTokens = usage.input_tokens;
    
    // For completion tokens
    if (usage.completionTokens !== undefined) normalizedUsage.completionTokens = usage.completionTokens;
    else if (usage.completion_tokens !== undefined) normalizedUsage.completionTokens = usage.completion_tokens;
    else if (usage.output_tokens !== undefined) normalizedUsage.completionTokens = usage.output_tokens;
    
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
    
    // As a last resort for models that don't report token usage (e.g., Azure, Ollama), create an estimate
    if (normalizedUsage.totalTokens === 0) {
      // Check response length if available
      let estimatedTotal = 0;
      
      if (usage.response && typeof usage.response === 'string') {
        estimatedTotal = Math.round(usage.response.length / 4);
      } else if (usage.text && typeof usage.text === 'string') {
        estimatedTotal = Math.round(usage.text.length / 4);
      } else if (usage.answer && typeof usage.answer === 'string') {
        estimatedTotal = Math.round(usage.answer.length / 4);
      }
      
      // If we can estimate from text length
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
    
    console.log(`Cost tracker: Normalized usage for ${model}:`, normalizedUsage);
    
    // Calculate cost based on token usage and model
    const cost = calculateCost(model, normalizedUsage.totalTokens);
    
    // Create cost entry
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model,
      operation,
      usage: normalizedUsage,
      cost,
      queryId
    };
    
    // Add to tracking data
    if (!this.costs.llm[model]) {
      this.costs.llm[model] = [];
    }
    this.costs.llm[model].push(costEntry);
    this.costs.total += cost;
    
    // Log if detailed logging is enabled
    if (this.detailedLogging) {
      console.log(`Cost tracker: LLM operation logged - ${model}, ${operation}, $${cost.toFixed(6)}`);
      console.log(`Token usage: ${normalizedUsage.totalTokens} total tokens (${normalizedUsage.estimated ? 'estimated' : 'reported'})`);
    }
    
    return costEntry;
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
      return { cost: 0, model, operation };
    }
    
    // Get pricing for this model or use default
    const pricePerMillion = this.embeddingPricing[model] || 0.10;
    
    // Calculate cost
    const cost = (pricePerMillion * tokenCount) / 1000000;
    
    // Create cost entry
    const timestamp = new Date();
    const costEntry = {
      timestamp,
      model,
      operation,
      usage: {
        tokenCount
      },
      cost,
      queryId
    };
    
    // Add to tracking data
    if (!this.costs.embeddings[model]) {
      this.costs.embeddings[model] = [];
    }
    this.costs.embeddings[model].push(costEntry);
    this.costs.total += cost;
    
    // Log if detailed logging is enabled
    if (this.detailedLogging) {
      console.log(`Cost tracker: Embedding operation logged - ${model}, ${operation}, $${cost.toFixed(6)}`);
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
    
    // Process embedding costs
    for (const model in this.costs.embeddings) {
      modelCosts[model] = this.costs.embeddings[model].reduce((total, entry) => total + entry.cost, 0);
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
    const filteredCosts = {
      llm: this.costs.llm.filter(entry => 
        entry.timestamp >= startDate && entry.timestamp <= endDate
      ),
      embeddings: this.costs.embeddings.filter(entry => 
        entry.timestamp >= startDate && entry.timestamp <= endDate
      )
    };
    
    // Calculate total for this period
    let periodTotal = 0;
    filteredCosts.llm.forEach(entry => periodTotal += entry.cost);
    filteredCosts.embeddings.forEach(entry => periodTotal += entry.cost);
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
      embeddingPricing: this.embeddingPricing,
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
   * Update embedding pricing
   * @param {object} pricingData - New pricing data
   */
  setEmbeddingPricing(pricingData) {
    this.embeddingPricing = {
      ...this.embeddingPricing,
      ...pricingData
    };
    
    if (this.detailedLogging) {
      console.log('Updated embedding pricing:', this.embeddingPricing);
    }
    
    return true;
  }

  // Get a summary of all cost tracking data
  getCostSummary() {
    return {
      totalCost: this.getTotalCost(),
      costsByModel: this.getCostsByModel(),
      costsByOperation: this.getCostsByOperation()
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