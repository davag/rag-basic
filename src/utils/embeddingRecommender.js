/**
 * Analyzes document characteristics to recommend the most suitable embedding model
 */

// Convert imports to requires
const { getAvailableModelsBasedOnKeys, defaultModels } = require('../config/llmConfig');
const { createLogger } = require('./logHandler'); // Use CommonJS require

const TECHNICAL_KEYWORDS = [
  'algorithm', 'function', 'class', 'method', 'api',
  'implementation', 'database', 'query', 'system',
  'technical', 'specification', 'architecture',
  'framework', 'library', 'module', 'component',
  'interface', 'protocol', 'configuration', 'deployment'
];

const SCIENTIFIC_KEYWORDS = [
  'analysis', 'research', 'study', 'experiment',
  'hypothesis', 'theory', 'methodology', 'data',
  'results', 'conclusion', 'findings', 'evidence',
  'statistical', 'scientific', 'empirical',
  'laboratory', 'observation', 'measurement'
];

// const createLogger = require('../utils/logHandler').createLogger; // Remove CommonJS require

// Create a logger instance for this module
const logger = createLogger('embedding-recommender');

/**
 * Calculate document complexity score based on various metrics
 * @param {string} text - Document content
 * @returns {Object} Complexity metrics
 */
const calculateComplexity = (text) => {
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const sentences = text.split(/[.!?]+/).filter(sentence => sentence.length > 0);
  const avgWordsPerSentence = words.length / sentences.length;
  
  // Calculate technical/scientific content density
  const technicalWords = words.filter(word => 
    TECHNICAL_KEYWORDS.some(keyword => 
      word.toLowerCase().includes(keyword.toLowerCase())
    )
  ).length;
  
  const scientificWords = words.filter(word => 
    SCIENTIFIC_KEYWORDS.some(keyword => 
      word.toLowerCase().includes(keyword.toLowerCase())
    )
  ).length;
  
  const technicalDensity = technicalWords / words.length;
  const scientificDensity = scientificWords / words.length;
  
  return {
    avgWordsPerSentence,
    technicalDensity,
    scientificDensity,
    totalWords: words.length
  };
};

/**
 * Get ONLY available EMBEDDING models based on configured API keys.
 * @returns {Array<string>} - Array of embedding model IDs whose vendor keys are configured.
 */
function getAvailableEmbeddingModels() {
  // Get all models available based on keys
  const allAvailableModels = getAvailableModelsBasedOnKeys();
  
  // Filter for models of type 'embedding'
  const embeddingModels = allAvailableModels.filter(modelId => {
    const modelConfig = defaultModels[modelId];
    return modelConfig && modelConfig.type === 'embedding';
  });
  
  logger.info('Filtered available embedding models:', embeddingModels);

  if (embeddingModels.length === 0) {
    logger.warn('No embedding models available with current configuration! Check API keys/endpoints and model definitions in llmConfig.js.');
    // Provide a default fallback if absolutely needed, but ideally rely on config
    if (allAvailableModels.includes('azure-text-embedding-3-small')) {
      return ['azure-text-embedding-3-small'];
    }
     if (allAvailableModels.includes('text-embedding-3-small')) {
      return ['text-embedding-3-small'];
    }
    // No fallback if no keys are configured at all
  }
  
  return embeddingModels;
}

/**
 * Get model-specific chunk configurations ONLY for available embedding models.
 * @returns {Object} Mapping of available embedding model names to their optimal chunk configurations
 */
const getModelChunkConfigs = () => {
  const availableEmbeddingModelIds = getAvailableEmbeddingModels();
  const allModelConfigs = defaultModels; // Use models directly from llmConfig
  const filteredConfigs = {};

  availableEmbeddingModelIds.forEach(modelId => {
    const config = allModelConfigs[modelId];
    if (config) {
      // Extract only chunking-related properties if needed, or just return the relevant part
      filteredConfigs[modelId] = {
        chunkSize: config.chunkSize || 1024, // Provide defaults if missing
        chunkOverlap: config.chunkOverlap || 200,
        maxTokens: config.maxTokens || 8191,
        description: config.description || 'Embedding model',
        vendor: config.vendor
        // Add other relevant properties from defaultModels if needed
      };
    }
  });

  logger.debug('Returning chunk configs for available embedding models:', filteredConfigs);
  return filteredConfigs;
};

/**
 * Recommend the most suitable embedding model based on document characteristics
 * @param {Array} documents - Array of document objects with pageContent
 * @returns {Object} Recommendation details including chunk configuration
 */
const recommendEmbeddingModel = (documents) => {
  if (!documents || documents.length === 0) {
    const defaultConfig = getModelChunkConfigs()['text-embedding-3-small'];
    return {
      model: 'text-embedding-3-small',
      confidence: 1,
      reason: 'No documents provided. Defaulting to small model for cost efficiency.',
      chunkConfig: defaultConfig
    };
  }

  let totalComplexity = 0;
  let maxComplexity = 0;
  let totalWords = 0;
  let technicalContentScore = 0;
  let scientificContentScore = 0;

  // Analyze each document
  documents.forEach(doc => {
    const complexity = calculateComplexity(doc.pageContent);
    totalComplexity += complexity.avgWordsPerSentence;
    maxComplexity = Math.max(maxComplexity, complexity.avgWordsPerSentence);
    totalWords += complexity.totalWords;
    technicalContentScore += complexity.technicalDensity;
    scientificContentScore += complexity.scientificDensity;
  });

  const avgComplexity = totalComplexity / documents.length;
  const avgTechnicalScore = technicalContentScore / documents.length;
  const avgScientificScore = scientificContentScore / documents.length;
  
  // Calculate overall complexity score (0-1)
  const complexityScore = Math.min(1, (
    (avgComplexity / 20) * 0.4 + // Sentence complexity weight
    avgTechnicalScore * 0.3 + // Technical content weight
    avgScientificScore * 0.3 // Scientific content weight
  ));

  // Decision making with chunk configurations
  const modelConfigs = getModelChunkConfigs();
  
  if (complexityScore > 0.5 || totalWords > 100000) {
    const config = modelConfigs['text-embedding-3-large'];
    return {
      model: 'text-embedding-3-large',
      confidence: complexityScore,
      reason: `Recommended large model due to ${
        complexityScore > 0.5 ? 'high content complexity' : 'large document volume'
      }. Content analysis shows ${
        Math.round(avgTechnicalScore * 100)}% technical and ${
        Math.round(avgScientificScore * 100)}% scientific content.`,
      chunkConfig: config
    };
  } else {
    const config = modelConfigs['text-embedding-3-small'];
    return {
      model: 'text-embedding-3-small',
      confidence: 1 - complexityScore,
      reason: `Recommended small model for ${
        complexityScore <= 0.5 ? 'general content' : 'cost efficiency'
      }. Content analysis shows ${
        Math.round(avgTechnicalScore * 100)}% technical and ${
        Math.round(avgScientificScore * 100)}% scientific content.`,
      chunkConfig: config
    };
  }
};

// Export functions using CommonJS
module.exports = {
  getAvailableEmbeddingModels,
  getModelChunkConfigs,
  recommendEmbeddingModel
}; 