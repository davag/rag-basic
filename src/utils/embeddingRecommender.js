/**
 * Analyzes document characteristics to recommend the most suitable embedding model
 */

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
 * Get model-specific chunk configurations
 * @returns {Object} Mapping of model names to their optimal chunk configurations
 */
export const getModelChunkConfigs = () => ({
  // OpenAI models
  'text-embedding-3-small': {
    chunkSize: 1000,
    chunkOverlap: 200,
    maxTokens: 8191,
    maxChunkSize: 4000,  // ~1000 tokens
    maxChunkOverlap: 800, // 20% of max chunk size
    description: 'Optimized for general text with good performance and cost efficiency'
  },
  'text-embedding-3-large': {
    chunkSize: 2000,
    chunkOverlap: 400,
    maxTokens: 8191,
    maxChunkSize: 8000,  // ~2000 tokens
    maxChunkOverlap: 1600, // 20% of max chunk size
    description: 'Better for complex technical content and longer context'
  },
  
  // Azure OpenAI models (inherit from OpenAI)
  'azure-text-embedding-3-small': {
    chunkSize: 1000,
    chunkOverlap: 200,
    maxTokens: 8191,
    maxChunkSize: 4000,  // ~1000 tokens
    maxChunkOverlap: 800, // 20% of max chunk size
    description: 'Azure-hosted version of text-embedding-3-small'
  },
  'azure-text-embedding-3-large': {
    chunkSize: 2000,
    chunkOverlap: 400,
    maxTokens: 8191,
    maxChunkSize: 8000,  // ~2000 tokens
    maxChunkOverlap: 1600, // 20% of max chunk size
    description: 'Azure-hosted version of text-embedding-3-large'
  },
  
  // Ollama models
  'nomic-embed-text': {
    chunkSize: 512,
    chunkOverlap: 100,
    maxTokens: 2048,
    maxChunkSize: 2048,  // ~512 tokens
    maxChunkOverlap: 400, // 20% of max chunk size
    description: 'Local inference model optimized for shorter chunks'
  }
});

/**
 * Recommend the most suitable embedding model based on document characteristics
 * @param {Array} documents - Array of document objects with pageContent
 * @returns {Object} Recommendation details including chunk configuration
 */
export const recommendEmbeddingModel = (documents) => {
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