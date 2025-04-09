import React, { useState, useEffect, useRef, useMemo } from 'react';
// Remove CommonJS require
// const { createLogger } = require('../utils/logHandler'); // Use CommonJS require
import { 
  Typography, 
  Box, 
  Button, 
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Link,
  FormHelperText,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RecommendIcon from '@mui/icons-material/Recommend';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { recommendEmbeddingModel, getModelChunkConfigs, getAvailableEmbeddingModels } from '../utils/embeddingRecommender';
import { recommendChunkingStrategy, chunkingStrategies, createTextSplitter } from '../utils/chunkingStrategies';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
// Add ES Module import for the named export from the CommonJS module
import { createLogger } from '../utils/logHandler';
import { defaultModels, apiConfig } from '../config/llmConfig';

// Instantiate logger AFTER imports
const logger = createLogger('VectorStoreConfig'); 

/**
 * IMPORTANT: About "Unused" Code Elements
 * 
 * This component contains classes and functions that may appear unused but serve specific purposes:
 * 
 * 1. OllamaEmbeddings - A custom implementation available for use in specific embedding scenarios
 * 2. validateChunkSize - Utility function for potential future validation enhancements
 * 3. Some useEffect hooks have modified dependency arrays to prevent infinite loops
 * 
 * These elements are maintained for extensibility, documentation, and future requirements.
 */

// Custom class for Ollama embeddings
// eslint-disable-next-line no-unused-vars
class OllamaEmbeddings {
  constructor(options = {}) {
    this.model = options.modelName || 'nomic-embed-text';
    this.ollamaEndpoint = options.ollamaEndpoint || process.env.REACT_APP_OLLAMA_API_URL || 'http://localhost:11434';
    this.dimensions = 768; // nomic-embed-text embeddings are 768-dimensional
    this.operationId = options.operationId || uuidv4(); // For cost tracking
  }

  // Method to embed single text
  async embedQuery(text) {
    try {
      const response = await axios.post(`${this.ollamaEndpoint}/api/embeddings`, {
        model: this.model,
        prompt: text
      });
      
      // Track embedding cost on server side
      try {
        const tokenCount = Math.ceil(text.length / 4);
        await axios.post('/api/cost-tracking/track-embedding-usage', {
          model: `ollama-${this.model}`,
          tokenCount: tokenCount,
          operation: 'query',
          queryId: this.operationId
        });
        console.log(`[DEBUG] Tracked Ollama embedding cost for ${this.model}`);
      } catch (costErr) {
        console.error('Error tracking Ollama embedding cost:', costErr);
      }
      
      return response.data.embedding;
    } catch (error) {
      window.console.error('Error generating embedding from Ollama:', error);
      throw new Error(`Ollama embeddings error: ${error.message}`);
    }
  }

  // Method to embed documents
  async embedDocuments(documents) {
    const embeddings = [];
    for (const doc of documents) {
      const embedding = await this.embedQuery(doc);
      embeddings.push(embedding);
      
      // Track embedding cost on server side for each document
      try {
        const tokenCount = Math.ceil(doc.length / 4);
        await axios.post('/api/cost-tracking/track-embedding-usage', {
          model: `ollama-${this.model}`,
          tokenCount: tokenCount,
          operation: 'document',
          queryId: this.operationId
        });
        console.log(`[DEBUG] Tracked Ollama document embedding cost for ${this.model}`);
      } catch (costErr) {
        console.error('Error tracking Ollama document embedding cost:', costErr);
      }
    }
    return embeddings;
  }
}

const VectorStoreConfig = ({ 
  documents, 
  namespaces, 
  onVectorStoreCreated, 
  isProcessing, 
  setIsProcessing,
  onChunkParametersChange 
}) => {
  // Track if the component has mounted to prevent unwanted initial updates
  const isMounted = useRef(false);
  
  const [chunkSize, setChunkSize] = useState(1024);
  const [chunkOverlap, setChunkOverlap] = useState(Math.round(1024 * 0.2));
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');
  const [chunkingStrategy, setChunkingStrategy] = useState('recursive');
  const [recommendation, setRecommendation] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [namespaceSummary, setNamespaceSummary] = useState({});
  const [helpExpanded, setHelpExpanded] = useState(false);

  // State for API keys/endpoints - needed for the Azure embedding class
  const [azureApiKey] = useState(process.env.REACT_APP_AZURE_OPENAI_API_KEY || localStorage.getItem('azureApiKey') || '');
  const [azureEndpoint] = useState(process.env.REACT_APP_AZURE_OPENAI_ENDPOINT || localStorage.getItem('azureEndpoint') || '');
  const [apiVersion] = useState(process.env.REACT_APP_AZURE_OPENAI_API_VERSION || localStorage.getItem('azureApiVersion') || '2023-05-15'); // Use consistent localStorage key

  // Use the updated getAvailableEmbeddingModels function
  const availableEmbeddingModels = useMemo(() => {
    const models = getAvailableEmbeddingModels(); 
    logger.info("[VECTOR STORE CONFIG] Available embedding models:", models);
    return models;
  }, []);
  
  // Effect to set default embedding model based on availability
  useEffect(() => {
    const savedModel = localStorage.getItem('selectedEmbeddingModel');
    
    if (availableEmbeddingModels.length > 0) {
      if (savedModel && availableEmbeddingModels.includes(savedModel)) {
        // If we have a saved model and it's available, use it
        if (embeddingModel !== savedModel) {
          logger.info(`[VECTOR STORE CONFIG] Using saved embedding model: ${savedModel}`);
          setEmbeddingModel(savedModel);
        }
      } else {
        // If no saved model or saved model isn't available, use the first available model
        const defaultModel = availableEmbeddingModels[0];
        logger.info(`[VECTOR STORE CONFIG] No valid saved model found or model not available. Using default: ${defaultModel}`);
        setEmbeddingModel(defaultModel);
        localStorage.setItem('selectedEmbeddingModel', defaultModel);
      }
    } else {
      // No embedding models available at all
      logger.warn('[VECTOR STORE CONFIG] No embedding models available based on API keys. Embedding will likely fail.');
      // Optionally clear the embedding model state or set to a placeholder
      // setEmbeddingModel(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableEmbeddingModels]); // Removed embeddingModel from dependency array to prevent loops
  
  // Handle embedding model change with improved error handling
  const handleEmbeddingModelChange = (e) => {
    const newModel = e.target.value;
    logger.info(`[VECTOR STORE CONFIG] Embedding model changed to: ${newModel}`);
    setEmbeddingModel(newModel);
    localStorage.setItem('selectedEmbeddingModel', newModel);
    
    // Log whether this is an Azure model or not
    if (newModel.startsWith('azure-')) {
      logger.info(`[VECTOR STORE CONFIG] Selected Azure model: ${newModel}`);
      // No longer need to check configured deployments here
    }
  };

  // Get Azure deployment name DIRECTLY from llmConfig based on the selected embeddingModel
  const getDeploymentName = () => {
    if (embeddingModel && embeddingModel.startsWith('azure-')) {
      const modelConfig = defaultModels[embeddingModel];
      if (modelConfig && modelConfig.deploymentName) {
        logger.info(`Using Azure deployment name from llmConfig: ${modelConfig.deploymentName} for model ${embeddingModel}`);
        return modelConfig.deploymentName;
      } else {
        // Fallback if deploymentName is missing in config (should not happen ideally)
        const fallbackName = embeddingModel.replace('azure-', '');
        logger.warn(`Deployment name missing in llmConfig for ${embeddingModel}. Falling back to: ${fallbackName}`);
        return fallbackName; 
      }
    } 
    // Return null or empty string if not an Azure model
    return null; 
  };

  // Only run once on initial mount to set up recommended values
  useEffect(() => {
    if (documents && documents.length > 0) {
      const modelRec = recommendEmbeddingModel(documents);
      const chunkingRec = recommendChunkingStrategy(documents);
      setRecommendation(modelRec);
      
      // Only set the recommended model if there's no saved selection
      const savedModel = localStorage.getItem('selectedEmbeddingModel');
      if (!savedModel && modelRec.confidence > 0.8) {
        setEmbeddingModel(modelRec.model);
        setChunkSize(modelRec.chunkConfig.chunkSize);
        setChunkOverlap(modelRec.chunkConfig.chunkOverlap);
      }

      // Set recommended chunking strategy
      setChunkingStrategy(chunkingRec.strategy);
    }
  }, [documents]);

  // Track when component has mounted
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Update chunk settings when embedding model changes - only on initial model selection
  useEffect(() => {
    if (!isMounted.current) return; // Skip the first run
    
    const modelConfigs = getModelChunkConfigs();
    const config = modelConfigs[embeddingModel];
    if (config) {
      // Only set initial values when component first mounts or model changes
      const allowedSizes = [128, 256, 512, 1024, 2048, 4096, 8192];
      const closestAllowedSize = allowedSizes.reduce((prev, curr) => 
        Math.abs(curr - config.chunkSize) < Math.abs(prev - config.chunkSize) ? curr : prev
      );
      
      console.log(`[DEBUG] Setting initial chunk settings to size: ${closestAllowedSize}`);
      setChunkSize(closestAllowedSize);
      
      // Use our fixed overlap values for this chunk size (20% option)
      const allowedOverlaps = getAllowedOverlapValues(closestAllowedSize);
      const recommendedOverlap = allowedOverlaps[3]; // 20% option
      setChunkOverlap(recommendedOverlap);
      
      if (onChunkParametersChange) {
        onChunkParametersChange(closestAllowedSize, recommendedOverlap);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddingModel]);

  // Add function to estimate tokens (rough approximation)
  const estimateTokens = (text) => {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  };

  // eslint-disable-next-line no-unused-vars
  const validateChunkSize = (size) => {
    const modelConfig = getModelChunkConfigs()[embeddingModel];
    if (!modelConfig) return true;

    const estimatedTokens = estimateTokens(size);
    return estimatedTokens <= modelConfig.maxTokens;
  };

  // Define fixed allowed overlap values for each chunk size
  const getAllowedOverlapValues = (size) => {
    switch (size) {
      case 128:
        return [0, 6, 13, 26, 38];  // 0%, 5%, 10%, 20%, 30%
      case 256:
        return [0, 13, 26, 51, 77]; // 0%, 5%, 10%, 20%, 30%
      case 512:
        return [0, 26, 51, 102, 154]; // 0%, 5%, 10%, 20%, 30%
      case 1024:
        return [0, 51, 102, 205, 307]; // 0%, 5%, 10%, 20%, 30%
      case 2048:
        return [0, 102, 205, 410, 614]; // 0%, 5%, 10%, 20%, 30%
      case 4096:
        return [0, 205, 410, 819, 1229]; // 0%, 5%, 10%, 20%, 30%
      case 8192:
        return [0, 410, 819, 1638, 2458]; // 0%, 5%, 10%, 20%, 30%
      default:
        return [0, Math.round(size * 0.05), Math.round(size * 0.1), 
                Math.round(size * 0.2), Math.round(size * 0.3)];
    }
  };

  // Update the handler to use fixed values
  const handleChunkSizeChange = (e) => {
    const newValue = Number(e.target.value);
    console.log(`[DEBUG] handleChunkSizeChange called with value: ${newValue}`);
    
    // Update the chunk size
    setChunkSize(newValue);
    
    // Get allowed overlap values for this chunk size and select the 20% option (index 3)
    const allowedOverlaps = getAllowedOverlapValues(newValue);
    const recommendedOverlap = allowedOverlaps[3]; // 20% option
    
    console.log(`[DEBUG] Setting new overlap to: ${recommendedOverlap}`);
    setChunkOverlap(recommendedOverlap);
    
    // Show warning for large chunk sizes
    if (newValue >= 4096) {
      // Warning is displayed in the UI already with the menu item text
      console.log(`[DEBUG] Warning: Large chunk size selected (${newValue}). May affect performance and token usage.`);
    }
    
    if (onChunkParametersChange) {
      onChunkParametersChange(newValue, recommendedOverlap);
    }
  };

  const handleChunkOverlapChange = (e) => {
    const newValue = Number(e.target.value);
    console.log(`[DEBUG] handleChunkOverlapChange called with value: ${newValue}`);
    
    // Direct state update without conditions
    setChunkOverlap(newValue);
    
    if (onChunkParametersChange) {
      onChunkParametersChange(chunkSize, newValue);
    }
  };

  const handleChunkingStrategyChange = (event) => {
    const strategy = event.target.value;
    setChunkingStrategy(strategy);
    
    // Update chunk size and overlap based on strategy defaults
    const strategyConfig = chunkingStrategies[strategy].defaultConfig;
    
    // Find closest allowed values for chunk size
    const allowedSizes = [128, 256, 512, 1024, 2048, 4096, 8192];
    const closestSize = allowedSizes.reduce((prev, curr) => 
      Math.abs(curr - strategyConfig.chunkSize) < Math.abs(prev - strategyConfig.chunkSize) ? curr : prev
    , allowedSizes[0]);
    
    // Calculate overlap as a percentage of chunk size
    const overlapPercentage = strategyConfig.chunkOverlap / strategyConfig.chunkSize;
    const newOverlap = Math.round(closestSize * overlapPercentage);
    
    setChunkSize(closestSize);
    setChunkOverlap(newOverlap);
    
    if (onChunkParametersChange) {
      onChunkParametersChange(closestSize, newOverlap);
    }
  };

  const createVectorStore = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      setSuccess(false);
      
      // Generate a unique identifier for this embedding operation
      const operationId = uuidv4();
      
      // Log the start of operation
      console.log(`Starting vector store creation with ${documents.length} documents using ${chunkingStrategy} strategy`);
      
      // Create text splitter based on selected strategy
      const textSplitter = createTextSplitter(chunkingStrategy, {
        chunkSize,
        chunkOverlap
      });

      // Group documents by namespace
      const documentsByNamespace = {};
      documents.forEach(doc => {
        const namespace = doc.metadata.namespace || 'default';
        if (!documentsByNamespace[namespace]) {
          documentsByNamespace[namespace] = [];
        }
        documentsByNamespace[namespace].push(doc);
      });

      // Calculate namespace summary
      const summary = {};
      Object.keys(documentsByNamespace).forEach(namespace => {
        summary[namespace] = {
          documentCount: documentsByNamespace[namespace].length,
          totalChars: documentsByNamespace[namespace].reduce((acc, doc) => acc + doc.pageContent.length, 0)
        };
      });
      setNamespaceSummary(summary);

      // Split documents
      const splitDocs = await textSplitter.splitDocuments(documents);
      logger.info(`Split ${documents.length} documents into ${splitDocs.length} chunks using ${chunkingStrategy} strategy`);
      logger.debug('Creating embeddings with model:', embeddingModel);
      
      let embeddingsInstance; // Use a single variable for the instance
      
      if (embeddingModel === 'nomic-embed-text') {
        // For Ollama embeddings
        logger.info('[VECTOR STORE] Using Ollama embeddings with model:', embeddingModel);
        try {
          // Get Ollama endpoint from apiConfig or localStorage
          const ollamaEndpoint = apiConfig.ollama?.endpoint || 
                               localStorage.getItem('ollamaEndpoint') || 
                               process.env.REACT_APP_OLLAMA_API_URL || 
                               'http://localhost:11434';
          
          logger.info(`[VECTOR STORE] Using Ollama endpoint: ${ollamaEndpoint}`);
          
          embeddingsInstance = new OllamaEmbeddings({
            modelName: embeddingModel,
            ollamaEndpoint: ollamaEndpoint,
            operationId: operationId
          });
          
          // Verify connection to Ollama
          logger.info('[VECTOR STORE] Verifying Ollama connection...');
          try {
            const testResponse = await axios.get(`${ollamaEndpoint}/api/tags`, { timeout: 2000 });
            const availableModels = testResponse.data.models.map(m => m.name);
            logger.info(`[VECTOR STORE] Ollama available models: ${availableModels.join(', ')}`);
            
            if (!availableModels.includes(embeddingModel)) {
              logger.warn(`[VECTOR STORE] Selected model "${embeddingModel}" may not be available in Ollama. Available models: ${availableModels.join(', ')}`);
              logger.warn(`[VECTOR STORE] You may need to run: ollama pull ${embeddingModel}`);
            }
          } catch (connectionError) {
            logger.error('[VECTOR STORE] Failed to connect to Ollama:', connectionError);
            throw new Error(`Cannot connect to Ollama at ${ollamaEndpoint}. Is Ollama running?`);
          }
        } catch (error) {
          logger.error('[VECTOR STORE] Failed to initialize Ollama embeddings:', error);
          setError(`Initialization error for Ollama embeddings: ${error.message}`);
          setIsProcessing(false);
          return;
        }
      } else if (embeddingModel.startsWith('azure-')) {
        // Azure Embeddings Logic
        logger.info('[VECTOR STORE] Using Azure OpenAI embeddings');
        
        // Get the deployment name using the updated function
        const deploymentName = getDeploymentName();
        
        if (!azureApiKey || !azureEndpoint || !deploymentName) {
           const errorMsg = `Azure configuration incomplete for model ${embeddingModel}. Missing Key: ${!azureApiKey}, Endpoint: ${!azureEndpoint}, or DeploymentName could not be determined. Check LLM Settings and llmConfig.js.`;
           logger.error(errorMsg);
           setError(errorMsg);
           setIsProcessing(false);
           return; // Stop execution
        }

        // Define simple Azure embeddings class (no internal fallback logic needed anymore)
        class SimpleAzureOpenAIEmbeddings {
          constructor(options) {
            this.apiKey = options.apiKey;
            this.endpoint = options.endpoint;
            // Use the deploymentName derived from llmConfig
            this.deploymentName = options.deploymentName; 
            this.apiVersion = options.apiVersion;
            this.operationId = options.operationId;
            logger.debug('Instantiating SimpleAzureOpenAIEmbeddings with:', { 
              endpoint: this.endpoint?.substring(0,20), 
              deploymentName: this.deploymentName, 
              apiVersion: this.apiVersion 
            });
          }
          
          async _callAzureAPI(text) {
             if (!this.endpoint || !this.apiKey || !this.deploymentName) {
               throw new Error('Azure Embeddings configuration is missing (key, endpoint, or deployment name).');
             }
             logger.debug(`Calling Azure API: Deployment=${this.deploymentName}, Text Length=${text.length}`);
             try {
                const response = await axios.post(`/api/proxy/azure/embeddings`, {
                  azureApiKey: this.apiKey,
                  azureEndpoint: this.endpoint,
                  deploymentName: this.deploymentName, // Use the correct deployment name
                  apiVersion: this.apiVersion,
                  input: text,
                  queryId: this.operationId // Pass operationId for server-side tracking
                });
                return response.data.data[0].embedding;
             } catch (error) {
                logger.error(`Azure API Error with deployment "${this.deploymentName}":`, error);
                let userMessage = `Failed to get embeddings from Azure deployment "${this.deploymentName}".`;
                if (error.response) {
                   userMessage += ` Status: ${error.response.status}. Message: ${error.response.data?.error?.message || JSON.stringify(error.response.data)}`;
                   if (error.response.status === 404) {
                      userMessage += ` Ensure deployment "${this.deploymentName}" exists in Azure and is specified correctly in llmConfig.js.`;
                   }
                } else {
                  userMessage += ` Error: ${error.message}`;
                }
                throw new Error(userMessage);
             }
          }

          async embedQuery(text) {
            return this._callAzureAPI(text);
          }
          
          async embedDocuments(documents) {
            const embeddings = [];
            for (const doc of documents) {
              // Add a small delay between requests to potentially avoid rate limits
              await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
              try {
                 const embedding = await this._callAzureAPI(doc);
                 embeddings.push(embedding);
              } catch(error) {
                 logger.error('Error embedding a document with Azure:', error);
                 // Re-throw the specific error from _callAzureAPI
                 throw error; 
              }
            }
            return embeddings;
          }
        }

        try {
          embeddingsInstance = new SimpleAzureOpenAIEmbeddings({
            apiKey: azureApiKey,
            endpoint: azureEndpoint,
            deploymentName: deploymentName, // Pass the determined deployment name
            apiVersion: apiVersion,
            operationId: operationId
          });
        } catch (error) {
          logger.error('[VECTOR STORE] Failed to initialize Azure embeddings wrapper:', error);
          setError(`Initialization error for Azure embeddings: ${error.message}`);
          setIsProcessing(false);
          return;
        }

      } else {
        // Standard OpenAI Embeddings Logic
        logger.info('[VECTOR STORE] Using standard OpenAI embeddings');
        try {
          const openaiApiKey = process.env.REACT_APP_OPENAI_API_KEY || localStorage.getItem('openaiApiKey');
          if (!openaiApiKey) {
            throw new Error('OpenAI API key is required but not found.');
          }
          embeddingsInstance = new OpenAIEmbeddings({
            openAIApiKey: openaiApiKey,
            modelName: embeddingModel, // Use the selected model ID
            // Add batchSize if needed: batchSize: 512, 
          });
        } catch (error) {
           logger.error('[VECTOR STORE] Failed to initialize OpenAI embeddings wrapper:', error);
           setError(`Initialization error for OpenAI embeddings: ${error.message}`);
           setIsProcessing(false);
           return;
        }
      }

      // Create vector store if embeddings instance was successfully created
      if (embeddingsInstance) {
         logger.info('Creating MemoryVectorStore from documents...');
         const vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, embeddingsInstance);
         logger.info(`Successfully created vector store with ${embeddingModel}`);
         setSuccess(true);
         setError(null);
         onVectorStoreCreated(vectorStore);
      } else {
         // This case should ideally not be reached if checks above are correct
         setError('Failed to initialize an embedding model instance.');
      }

    } catch (err) {
      logger.error('Error during vector store creation process:', err);
      setError(`Error creating vector store: ${err.message}`);
      setSuccess(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={1}>
        <Typography variant="h5">
          Step 2: Configure & Initialize Vector Database
        </Typography>
        <Tooltip title="Learn more about vector databases and chunking">
          <IconButton 
            size="small" 
            onClick={() => setHelpExpanded(!helpExpanded)}
            sx={{ ml: 1 }}
          >
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography variant="body2" color="textSecondary" paragraph>
        In this step, your documents will be split into smaller chunks, converted into vector embeddings, and organized into a searchable database. This process is crucial for efficient retrieval of relevant information when you ask questions.
      </Typography>
      
      <Accordion 
        expanded={helpExpanded} 
        onChange={() => setHelpExpanded(!helpExpanded)}
        sx={{ mb: 3 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Understanding Chunking and Vector Databases</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" paragraph>
            <strong>Document Chunking:</strong> Large documents are split into smaller pieces (chunks) for more precise retrieval. This allows the system to find specific information within documents rather than returning entire documents.
          </Typography>
          
          <Typography variant="body2" paragraph>
            <strong>Chunking Strategies:</strong> Different strategies are optimized for different types of content:
          </Typography>
          
          <List dense>
            <ListItem>
              <ListItemText 
                primary="Recursive Character"
                secondary="Best for general text. Splits text recursively while trying to keep semantic units together."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Markdown"
                secondary="Optimized for markdown files. Preserves document structure and formatting."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Python Code"
                secondary="Specialized for Python files. Keeps functions and classes intact."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="SpaCy"
                secondary="Uses linguistic features for intelligent splitting. Good for natural language text."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Token-based"
                secondary="Splits based on token count rather than characters. Useful for LLM-specific needs."
              />
            </ListItem>
          </List>
          
          <Typography variant="body2" paragraph>
            <strong>Chunk Size:</strong> Determines how many characters are in each chunk. Smaller chunks (500-1000) are better for precise answers to specific questions. Larger chunks (1500-3000) preserve more context but may include irrelevant information.
          </Typography>
          
          <Typography variant="body2" paragraph>
            <strong>Chunk Overlap:</strong> The number of characters shared between adjacent chunks. Overlap helps maintain context across chunk boundaries, ensuring that sentences or concepts aren't split in a way that loses meaning.
          </Typography>
          
          <Typography variant="body2" paragraph>
            <strong>Vector Database:</strong> After chunking, each chunk is converted to a vector embedding (a list of numbers) that captures its semantic meaning. These vectors are stored in a database optimized for similarity search.
          </Typography>
          
          <Typography variant="body2" paragraph>
            <strong>Embedding Models:</strong> Different models create different quality embeddings. Larger models (like text-embedding-3-large) generally produce better results but cost more and may be slower.
          </Typography>
          
          <Box mt={2}>
            <Link 
              href="https://www.pinecone.io/learn/chunking-strategies/" 
              target="_blank" 
              rel="noopener noreferrer"
              sx={{ display: 'block', mb: 1 }}
            >
              Learn more about Chunking Strategies
            </Link>
            <Link 
              href="https://www.pinecone.io/learn/vector-embeddings/" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Learn more about Vector Embeddings
            </Link>
          </Box>
        </AccordionDetails>
      </Accordion>

      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel id="chunking-strategy-label">Chunking Strategy</InputLabel>
              <Select
                labelId="chunking-strategy-label"
                id="chunking-strategy"
                value={chunkingStrategy}
                onChange={handleChunkingStrategyChange}
                label="Chunking Strategy"
                disabled={isProcessing}
              >
                {Object.entries(chunkingStrategies).map(([key, strategy]) => (
                  <MenuItem key={key} value={key}>
                    <Box>
                      <Typography variant="body1">{strategy.name}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {strategy.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {documents.length > 0 
                  ? `Recommended strategy based on your documents: ${chunkingStrategies[chunkingStrategy].name}`
                  : 'Select the best strategy for your document type. Recursive splitting works well for most content.'}
              </FormHelperText>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <Box display="flex" gap={4}>
              <Box flex={1}>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography gutterBottom>Chunk Size</Typography>
                  <Tooltip title={
                    <Typography variant="body2">
                      {getModelChunkConfigs()[embeddingModel]?.description || 
                       'The size of each text chunk in characters. Smaller chunks are more precise but may lose context.'}
                      <br /><br />
                      Max tokens: {getModelChunkConfigs()[embeddingModel]?.maxTokens || 'Unknown'}
                      <br />
                      Max chunk size: {getModelChunkConfigs()[embeddingModel]?.maxChunkSize || 'Unknown'}
                    </Typography>
                  }>
                    <HelpOutlineIcon fontSize="small" sx={{ ml: 1, color: 'action.active' }} />
                  </Tooltip>
                </Box>
                <FormControl fullWidth>
                  <Select
                    value={chunkSize}
                    onChange={handleChunkSizeChange}
                    disabled={isProcessing}
                    MenuProps={{
                      anchorOrigin: {
                        vertical: 'bottom',
                        horizontal: 'left',
                      },
                      transformOrigin: {
                        vertical: 'top',
                        horizontal: 'left',
                      },
                      PaperProps: {
                        style: {
                          maxHeight: 300,
                        },
                      },
                    }}
                  >
                    <MenuItem value={128}>128 characters</MenuItem>
                    <MenuItem value={256}>256 characters</MenuItem>
                    <MenuItem value={512}>512 characters</MenuItem>
                    <MenuItem value={1024}>1024 characters (recommended)</MenuItem>
                    <MenuItem value={2048}>2048 characters</MenuItem>
                    <MenuItem value={4096}>4096 characters (large)</MenuItem>
                    <MenuItem value={8192}>8192 characters (very large)</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  The size of each text chunk in characters. Llama Index recommended values range from 128-2048. 
                  Larger values (4096-8192) may be useful for specific cases but can impact performance.
                </Typography>
              </Box>

              <Box flex={1}>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography gutterBottom>Chunk Overlap</Typography>
                  <Tooltip title={
                    <Typography variant="body2">
                      The number of characters shared between adjacent chunks. Helps maintain context across chunk boundaries.
                      Recommended overlap is 20% of chunk size.
                      <br /><br />
                      Max overlap: {getModelChunkConfigs()[embeddingModel]?.maxChunkOverlap || 'Unknown'}
                    </Typography>
                  }>
                    <HelpOutlineIcon fontSize="small" sx={{ ml: 1, color: 'action.active' }} />
                  </Tooltip>
                </Box>
                <FormControl fullWidth>
                  <Select
                    key={`overlap-select-${chunkSize}`}
                    value={chunkOverlap}
                    onChange={handleChunkOverlapChange}
                    disabled={isProcessing}
                    renderValue={(selected) => {
                      const percentage = Math.round((selected / chunkSize) * 100);
                      return `${percentage}% (${selected} characters)`;
                    }}
                    MenuProps={{
                      anchorOrigin: {
                        vertical: 'bottom',
                        horizontal: 'left',
                      },
                      transformOrigin: {
                        vertical: 'top',
                        horizontal: 'left',
                      },
                      PaperProps: {
                        style: {
                          maxHeight: 300,
                        },
                      },
                    }}
                  >
                    {getAllowedOverlapValues(chunkSize).map((value, index) => (
                      <MenuItem key={value} value={value}>
                        {index === 0 ? "0%" : `${index === 1 ? "5%" : index === 2 ? "10%" : index === 3 ? "20%" : "30%"}`} 
                        ({value} characters)
                        {index === 3 && " - recommended"}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  Characters to overlap between chunks. Shown as percentage of chunk size.
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel id="embedding-model-label">Embedding Model</InputLabel>
              {recommendation && (
                <Alert 
                  severity="info" 
                  sx={{ mb: 2 }}
                  icon={<RecommendIcon />}
                  action={
                    <Button 
                      color="inherit" 
                      size="small"
                      onClick={() => setEmbeddingModel(recommendation.model)}
                    >
                      Use Recommendation
                    </Button>
                  }
                >
                  <Typography variant="subtitle2" gutterBottom>
                    Model Recommendation
                  </Typography>
                  {recommendation.reason}
                </Alert>
              )}
              <Select
                labelId="embedding-model-label"
                id="embedding-model"
                value={embeddingModel || ''} // Handle null state if no models available
                onChange={handleEmbeddingModelChange}
                label="Embedding Model"
                disabled={availableEmbeddingModels.length === 0} // Disable if no models
              >
                {/* Use getModelChunkConfigs which now returns only available models */}
                {Object.entries(getModelChunkConfigs()).map(([modelId, config]) => (
                  <MenuItem key={modelId} value={modelId}>
                    <Box>
                      <Typography variant="body1">{modelId}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {config.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {availableEmbeddingModels.length === 0 
                  ? 'No embedding models available. Check API key configuration in LLM Settings.' 
                  : 'Select the model to use for generating embeddings. Only models with configured keys are shown.'
                }
              </FormHelperText>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <Box mt={3} display="flex" justifyContent="center">
        <Button
          variant="contained"
          color="primary"
          onClick={createVectorStore}
          disabled={isProcessing || documents.length === 0}
          size="large"
        >
          {isProcessing ? (
            <>
              <CircularProgress size={24} color="inherit" style={{ marginRight: 10 }} />
              Creating Vector Database...
            </>
          ) : (
            'Create Vector Database'
          )}
        </Button>
      </Box>

      {error && (
        <Box mt={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {success && (
        <Box mt={2}>
          <Alert severity="success">
            Vector store created successfully! You can now proceed to the query interface.
          </Alert>
        </Box>
      )}

      <Box mt={4}>
        <Typography variant="h6" gutterBottom>
          Document Summary
        </Typography>
        <Typography>
          Total Documents: {documents.length}
        </Typography>
        <Typography>
          Estimated Chunks: ~{Math.ceil(documents.reduce((acc, doc) => acc + doc.pageContent.length / (chunkSize - chunkOverlap), 0))}
        </Typography>
        
        <Box mt={2}>
          <Typography variant="subtitle1" gutterBottom>
            Namespaces:
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
            {namespaces.map((namespace) => (
              <Chip key={namespace} label={namespace} />
            ))}
          </Box>
          
          {Object.keys(namespaceSummary).length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Documents by Namespace:
              </Typography>
              {Object.entries(namespaceSummary).map(([namespace, data]) => (
                <Box key={namespace} mb={1}>
                  <Typography variant="body2">
                    <strong>{namespace}:</strong> {data.documentCount} documents, {(data.totalChars / 1000).toFixed(1)}K characters
                  </Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default VectorStoreConfig; 