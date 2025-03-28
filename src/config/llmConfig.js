/**
 * Central configuration file for all LLM-related settings
 * This serves as the single source of truth for model definitions, costs, and default settings
 */

// Default vendor colors for UI display
const vendorColors = {
  'OpenAI': '#10a37f',    // Green
  'AzureOpenAI': '#0078d4',  // Microsoft blue
  'Anthropic': '#5436da',  // Purple
  'Ollama': '#ff6b6b',     // Red
  'Other': '#888888'       // Gray
};

// IMPORTANT: For Azure OpenAI models, the deploymentName property MUST match exactly 
// what's configured in your Azure portal. If you get "No response received from server" 
// errors, verify that these deployment names exist in your Azure OpenAI service.

// Default model definitions with pricing (per 1M tokens)
const defaultModels = {
  // OpenAI models
  'gpt-4o': {
    vendor: 'OpenAI',
    input: 2.5,
    output: 10,
    active: true,
    description: 'Most capable GPT-4 model optimized for chat at a lower price.'
  },
  'gpt-4o-mini': {
    vendor: 'OpenAI',
    input: 0.150,
    output: 0.600,
    active: true,
    description: 'Affordable GPT-4 class model for everyday use.'
  },
  'o3-mini': {
    vendor: 'OpenAI',
    input: 1.10,
    output: 4.40,
    active: true,
    description: 'OpenAI\'s newest model with improved reasoning capabilities.'
  },
  
  // Azure OpenAI models
  'azure-gpt-4o': {
    vendor: 'AzureOpenAI',
    input: 0.03,
    output: 0.06,
    active: true,
    description: 'Azure-hosted GPT-4o - optimized version of GPT-4.',
    deploymentName: 'gpt-4o',
    apiVersion: '2023-05-15'
  },
  'azure-gpt-4o-mini': {
    vendor: 'AzureOpenAI',
    input: 0.15,
    output: 0.60,
    active: true,
    description: 'Azure-hosted GPT-4o-mini - affordable, faster version of GPT-4o.',
    deploymentName: 'gpt-4o-mini',
    apiVersion: '2023-05-15'
  },
  'azure-o3-mini': {
    vendor: 'AzureOpenAI',
    input: 1.10,
    output: 4.40,
    active: true,
    description: 'Azure-hosted o3-mini model',
    deploymentName: 'o3-mini',
    apiVersion: '2023-05-15'
  },
  
  // Azure OpenAI embedding models
  'azure-text-embedding-3-small': {
    vendor: 'AzureOpenAI',
    input: 0.00002,
    output: 0.00002,
    active: true,
    description: 'Azure-hosted text-embedding-3-small - optimized for general text with good performance and cost efficiency.',
    deploymentName: 'text-embedding-3-small',
    apiVersion: '2023-05-15'
  },
  'azure-text-embedding-3-large': {
    vendor: 'AzureOpenAI',
    input: 0.00013,
    output: 0.00013,
    active: true,
    description: 'Azure-hosted text-embedding-3-large - better for complex technical content and longer context.',
    deploymentName: 'text-embedding-3-large',
    apiVersion: '2023-05-15'
  },
  
  // Anthropic models
  'claude-3-5-sonnet': {
    vendor: 'Anthropic',
    input: 3.0,
    output: 15.0,
    maxTokens: 200000,
    active: true,
    description: 'Fast and cost-effective Claude model with excellent performance.'
  },
  'claude-3-7-sonnet': {
    vendor: 'Anthropic',
    input: 15.0,
    output: 75.0,
    maxTokens: 200000,
    active: true,
    description: 'Anthropic\'s most advanced Claude model with exceptional reasoning capabilities.'
  },
  
  // Ollama models (free for local inference)
  'llama3.2:latest': {
    vendor: 'Ollama',
    input: 0,
    output: 0,
    active: true,
    description: 'Open source Llama 3 (8B) model for local inference via Ollama.'
  },
  'gemma3:12b': {
    vendor: 'Ollama',
    input: 0,
    output: 0,
    active: true,
    description: 'Open source Gemma 3 (12B) model for local inference via Ollama.'
  },
  'mistral:latest': {
    vendor: 'Ollama',
    input: 0,
    output: 0,
    active: true,
    description: 'Open source Mistral (7B) model for local inference via Ollama.'
  }
};

// Default application settings for LLMs
const defaultSettings = {
  ollamaEndpoint: process.env.REACT_APP_OLLAMA_API_URL || 'http://localhost:11434',
  promptAdvisorModel: 'gpt-4o-mini',
  responseValidatorModel: 'gpt-4o-mini',
  useParallelProcessing: true,
  defaultEvaluationCriteria: 
    'Accuracy: Does the response correctly answer the query based on the provided context?\n' +
    'Completeness: Does the response address all aspects of the query?\n' +
    'Relevance: Is the information in the response relevant to the query?\n' +
    'Conciseness: Is the response appropriately concise without omitting important information?\n' +
    'Clarity: Is the response clear, well-structured, and easy to understand?\n' +
    'Exception handling: Only if the output is code then check exceptions paths'
};

// API key configuration
const apiConfig = {
  openAI: {
    apiKey: process.env.REACT_APP_OPENAI_API_KEY,
    proxyUrl: process.env.REACT_APP_API_PROXY_URL || '/api/proxy/openai'
  },
  anthropic: {
    apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY,
    proxyUrl: process.env.REACT_APP_API_PROXY_URL || '/api/proxy/anthropic'
  },
  azure: {
    apiKey: process.env.REACT_APP_AZURE_OPENAI_API_KEY,
    endpoint: process.env.REACT_APP_AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.REACT_APP_AZURE_OPENAI_API_VERSION
  }
};

/**
 * Calculate cost for token usage with a specific model
 * @param {string} modelId - The model identifier
 * @param {Object} tokenCount - Object containing input and output token counts
 * @param {Object} customModels - Optional custom model definitions to override defaults
 * @returns {Object} - Cost breakdown
 */
const calculateCost = (modelId, tokenCount, customModels = null) => {
  const models = customModels || defaultModels;
  
  // Normalize the model ID by removing date suffixes
  let normalizedModelId = modelId;
  const datePattern = /-\d{4}-\d{2}-\d{2}$/;
  if (datePattern.test(modelId)) {
    normalizedModelId = modelId.replace(datePattern, '');
  }
  
  // Find the model in our config
  const model = models[normalizedModelId];

  if (!model) {
    console.warn(`Model ${modelId} (normalized: ${normalizedModelId}) not found in configuration`);
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  // Ensure token counts are valid numbers
  const inputTokens = Number(tokenCount.input) || 0;
  const outputTokens = Number(tokenCount.output) || 0;

  // Calculate costs in USD per million tokens, then convert to actual cost
  const inputCost = (model.input * inputTokens) / 1000000;
  const outputCost = (model.output * outputTokens) / 1000000;
  const totalCost = inputCost + outputCost;

  console.log(`Cost calculation for ${normalizedModelId}: 
    Input: ${inputTokens} tokens at $${model.input}/million = $${inputCost.toFixed(8)}
    Output: ${outputTokens} tokens at $${model.output}/million = $${outputCost.toFixed(8)}
    Total: $${totalCost.toFixed(8)}`);

  return {
    inputCost,
    outputCost,
    totalCost
  };
};

/**
 * Get active models list
 * @param {Object} customModels - Optional custom model definitions to override defaults
 * @returns {Array} - List of active model IDs
 */
const getActiveModels = (customModels = null) => {
  const models = customModels || defaultModels;
  return Object.entries(models)
    .filter(([_, model]) => model.active)
    .map(([id]) => id);
};

/**
 * Get models by vendor
 * @param {string} vendor - Vendor name
 * @param {Object} customModels - Optional custom model definitions to override defaults
 * @returns {Object} - Models from the specified vendor
 */
const getModelsByVendor = (vendor, customModels = null) => {
  const models = customModels || defaultModels;
  return Object.fromEntries(
    Object.entries(models).filter(([_, model]) => model.vendor === vendor)
  );
};

/**
 * Check if API keys are properly configured
 * @returns {Object} - Configuration status for each provider
 */
const checkApiConfiguration = () => {
  return {
    openAI: !!apiConfig.openAI.apiKey,
    anthropic: !!apiConfig.anthropic.apiKey,
    azure: !!(apiConfig.azure.apiKey && apiConfig.azure.endpoint),
    ollama: true // Ollama is always available if running locally
  };
};

module.exports = {
  vendorColors,
  defaultModels,
  defaultSettings,
  apiConfig,
  calculateCost,
  getActiveModels,
  getModelsByVendor,
  checkApiConfiguration
}; 