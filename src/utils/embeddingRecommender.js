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
 * Recommend the most suitable embedding model based on document characteristics
 * @param {Array} documents - Array of document objects with pageContent
 * @returns {Object} Recommendation details
 */
export const recommendEmbeddingModel = (documents) => {
  if (!documents || documents.length === 0) {
    return {
      model: 'text-embedding-3-small',
      confidence: 1,
      reason: 'No documents provided. Defaulting to small model for cost efficiency.'
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

  // Decision making
  if (complexityScore > 0.5 || totalWords > 100000) {
    return {
      model: 'text-embedding-3-large',
      confidence: complexityScore,
      reason: `Recommended large model due to ${
        complexityScore > 0.5 ? 'high content complexity' : 'large document volume'
      }. Content analysis shows ${
        Math.round(avgTechnicalScore * 100)}% technical and ${
        Math.round(avgScientificScore * 100)}% scientific content.`
    };
  }

  return {
    model: 'text-embedding-3-small',
    confidence: 1 - complexityScore,
    reason: `Recommended small model due to moderate content complexity. Content analysis shows ${
      Math.round(avgTechnicalScore * 100)}% technical and ${
      Math.round(avgScientificScore * 100)}% scientific content.`
  };
}; 