import { 
  RecursiveCharacterTextSplitter,
  MarkdownTextSplitter,
  TokenTextSplitter,
  CharacterTextSplitter,
  LatexTextSplitter
} from 'langchain/text_splitter';

/**
 * Available chunking strategies with their configurations
 */
export const chunkingStrategies = {
  recursive: {
    name: 'Recursive Character',
    description: 'Splits text recursively by characters, trying to keep semantic units together',
    splitter: RecursiveCharacterTextSplitter,
    defaultConfig: {
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ["\n\n", "\n", " ", ""]
    }
  },
  markdown: {
    name: 'Markdown',
    description: 'Splits markdown text while preserving document structure',
    splitter: MarkdownTextSplitter,
    defaultConfig: {
      chunkSize: 1000,
      chunkOverlap: 200
    }
  },
  character: {
    name: 'Character',
    description: 'Splits text by character count, useful for code or structured text',
    splitter: CharacterTextSplitter,
    defaultConfig: {
      chunkSize: 1000,
      chunkOverlap: 200,
      separator: "\n"
    }
  },
  latex: {
    name: 'LaTeX',
    description: 'Splits LaTeX documents while preserving document structure',
    splitter: LatexTextSplitter,
    defaultConfig: {
      chunkSize: 1000,
      chunkOverlap: 200
    }
  },
  token: {
    name: 'Token-based',
    description: 'Splits text based on token count rather than character count',
    splitter: TokenTextSplitter,
    defaultConfig: {
      chunkSize: 1000,
      chunkOverlap: 200
    }
  }
};

/**
 * Create a text splitter instance based on the selected strategy
 * @param {string} strategy - The chunking strategy to use
 * @param {Object} config - Configuration options for the splitter
 * @returns {TextSplitter} A configured text splitter instance
 */
export const createTextSplitter = (strategy, config = {}) => {
  const strategyConfig = chunkingStrategies[strategy];
  if (!strategyConfig) {
    throw new Error(`Unknown chunking strategy: ${strategy}`);
  }

  const finalConfig = {
    ...strategyConfig.defaultConfig,
    ...config
  };

  return new strategyConfig.splitter(finalConfig);
};

/**
 * Get recommended chunking strategy based on document type and content
 * @param {Array} documents - Array of document objects
 * @returns {Object} Recommended strategy and configuration
 */
export const recommendChunkingStrategy = (documents) => {
  if (!documents || documents.length === 0) {
    return {
      strategy: 'recursive',
      config: chunkingStrategies.recursive.defaultConfig,
      reason: 'No documents provided. Defaulting to recursive character splitting.'
    };
  }

  // Analyze document types
  const docTypes = new Set();
  documents.forEach(doc => {
    const source = doc.metadata.source || '';
    if (source.endsWith('.md')) docTypes.add('markdown');
    if (source.endsWith('.tex')) docTypes.add('latex');
    if (source.endsWith('.py') || source.endsWith('.js') || source.endsWith('.java') || source.endsWith('.cpp')) docTypes.add('code');
    if (source.endsWith('.json')) docTypes.add('json');
  });

  // If all documents are JSON, use character splitter with specific settings
  if (docTypes.has('json') && docTypes.size === 1) {
    return {
      strategy: 'character',
      config: {
        chunkSize: 2000,
        chunkOverlap: 200,
        separator: '\n'
      },
      reason: 'All documents are JSON files. Using character-based splitting with newline separator for better structure preservation.'
    };
  }

  // If all documents are markdown, use markdown splitter
  if (docTypes.has('markdown') && docTypes.size === 1) {
    return {
      strategy: 'markdown',
      config: chunkingStrategies.markdown.defaultConfig,
      reason: 'All documents are markdown files. Using markdown-aware splitting.'
    };
  }

  // If all documents are LaTeX, use LaTeX splitter
  if (docTypes.has('latex') && docTypes.size === 1) {
    return {
      strategy: 'latex',
      config: chunkingStrategies.latex.defaultConfig,
      reason: 'All documents are LaTeX files. Using LaTeX-aware splitting.'
    };
  }

  // If all documents are code files, use character splitter
  if (docTypes.has('code') && docTypes.size === 1) {
    return {
      strategy: 'character',
      config: chunkingStrategies.character.defaultConfig,
      reason: 'All documents are code files. Using character-based splitting with newline separator.'
    };
  }

  // For mixed content or other file types, use recursive splitting
  return {
    strategy: 'recursive',
    config: chunkingStrategies.recursive.defaultConfig,
    reason: 'Mixed document types. Using recursive character splitting for best compatibility.'
  };
}; 