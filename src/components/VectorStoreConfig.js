import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  Slider, 
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
import { recommendEmbeddingModel, getModelChunkConfigs } from '../utils/embeddingRecommender';
import { recommendChunkingStrategy, chunkingStrategies, createTextSplitter } from '../utils/chunkingStrategies';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { costTracker } from '../utils/costTracker';

// Custom class for Ollama embeddings
class OllamaEmbeddings {
  constructor(options = {}) {
    this.model = options.modelName || 'nomic-embed-text';
    this.ollamaEndpoint = options.ollamaEndpoint || process.env.REACT_APP_OLLAMA_API_URL || 'http://localhost:11434';
    this.dimensions = 768; // nomic-embed-text embeddings are 768-dimensional
  }

  // Method to embed single text
  async embedQuery(text) {
    try {
      const response = await axios.post(`${this.ollamaEndpoint}/api/embeddings`, {
        model: this.model,
        prompt: text
      });
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
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');
  const [chunkingStrategy, setChunkingStrategy] = useState('recursive');
  const [recommendation, setRecommendation] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [namespaceSummary, setNamespaceSummary] = useState({});
  const [helpExpanded, setHelpExpanded] = useState(false);

  // Settings for endpoints
  const [ollamaBaseUrl] = useState(
    localStorage.getItem('ollamaEndpoint') || 
    process.env.REACT_APP_OLLAMA_API_URL || 
    'http://localhost:11434'
  );
  // The following states are defined but not currently used 
  // They're kept for future implementation of advanced configuration options
  const [azureApiKey] = useState(process.env.REACT_APP_AZURE_OPENAI_API_KEY || '');
  const [azureEndpoint] = useState(process.env.REACT_APP_AZURE_OPENAI_ENDPOINT || '');
  const [apiVersion] = useState(process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2023-05-15');
  
  // Get Azure deployment name from the embeddingModel
  const getDeploymentName = () => {
    return embeddingModel.startsWith('azure-') ? embeddingModel.replace('azure-', '') : '';
  };

  // Get model and chunking strategy recommendations when documents change
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

  // Update chunk settings when embedding model changes
  useEffect(() => {
    const modelConfigs = getModelChunkConfigs();
    const config = modelConfigs[embeddingModel];
    if (config) {
      setChunkSize(config.chunkSize);
      setChunkOverlap(config.chunkOverlap);
      if (onChunkParametersChange) {
        onChunkParametersChange(config.chunkSize, config.chunkOverlap);
      }
    }
  }, [embeddingModel, onChunkParametersChange]);

  // Add function to estimate tokens (rough approximation)
  const estimateTokens = (text) => {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  };

  // Validate chunk size against model's token limit
  const validateChunkSize = (size) => {
    const modelConfig = getModelChunkConfigs()[embeddingModel];
    if (!modelConfig) return true;

    const estimatedTokens = estimateTokens(size);
    return estimatedTokens <= modelConfig.maxTokens;
  };

  const handleChunkSizeChange = (event, newValue) => {
    if (validateChunkSize(newValue)) {
      setChunkSize(newValue);
      if (onChunkParametersChange) {
        onChunkParametersChange(newValue, chunkOverlap);
      }
    } else {
      // If invalid, set to max allowed size
      const modelConfig = getModelChunkConfigs()[embeddingModel];
      const maxChars = modelConfig.maxTokens * 4; // Convert tokens to chars
      setChunkSize(maxChars);
      if (onChunkParametersChange) {
        onChunkParametersChange(maxChars, chunkOverlap);
      }
    }
  };

  const handleChunkOverlapChange = (event, newValue) => {
    setChunkOverlap(newValue);
    if (onChunkParametersChange) {
      onChunkParametersChange(chunkSize, newValue);
    }
  };

  const handleEmbeddingModelChange = (event) => {
    const newModel = event.target.value;
    console.log('[DEBUG] Embedding model changed to:', newModel);
    setEmbeddingModel(newModel);
    // Save the selected model to localStorage
    localStorage.setItem('selectedEmbeddingModel', newModel);
    console.log('[DEBUG] Saved embedding model to localStorage:', newModel);
  };

  const handleChunkingStrategyChange = (event) => {
    const strategy = event.target.value;
    setChunkingStrategy(strategy);
    
    // Update chunk size and overlap based on strategy defaults
    const strategyConfig = chunkingStrategies[strategy].defaultConfig;
    setChunkSize(strategyConfig.chunkSize);
    setChunkOverlap(strategyConfig.chunkOverlap);
    
    if (onChunkParametersChange) {
      onChunkParametersChange(strategyConfig.chunkSize, strategyConfig.chunkOverlap);
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
      console.log('[DEBUG] Split documents into chunks:', splitDocs.length);
      
      console.log('[DEBUG] Creating embeddings with model:', embeddingModel);
      
      let embeddings;
      const deploymentName = getDeploymentName();
      
      // Track embedding costs differently based on the provider
      if (embeddingModel.startsWith('ollama-')) {
        // ... existing Ollama embeddings code ...
        
        console.log('[DEBUG] Using Ollama embeddings');
        
        embeddings = new OllamaEmbeddings({
          model: embeddingModel.replace('ollama-', ''),
          baseUrl: ollamaBaseUrl || 'http://localhost:11434'
        });
      } else if (embeddingModel.startsWith('azure-')) {
        // ... existing Azure embeddings code ...
        
        console.log('[DEBUG] Using Azure OpenAI embeddings');
        
        // Define Azure embeddings class with cost tracking
        class AzureOpenAIEmbeddings {
          constructor(options) {
            this.apiKey = options.apiKey;
            this.endpoint = options.endpoint;
            this.deploymentName = options.deploymentName;
            this.apiVersion = options.apiVersion;
          }
          
          async embedQuery(text) {
            try {
              const response = await axios.post(`/api/proxy/azure/embeddings`, {
                azureApiKey: this.apiKey,
                azureEndpoint: this.endpoint,
                deploymentName: this.deploymentName,
                apiVersion: this.apiVersion,
                input: text,
                queryId: operationId
              });
              
              // Extract embedding data
              const embedding = response.data.data[0].embedding;
              
              // Estimate token count (for cost tracking)
              const tokenCount = Math.ceil(text.length / 4);
              
              // Track the cost directly (in case query parameter wasn't handled)
              costTracker.trackEmbeddingCost('azure-embedding', tokenCount, 'query', operationId);
              
              return embedding;
            } catch (error) {
              console.error('Error generating embeddings with Azure:', error);
              throw new Error(`Azure embedding error: ${error.message}`);
            }
          }
          
          async embedDocuments(documents) {
            // Process each document sequentially to avoid rate limits
            const embeddings = [];
            
            for (const doc of documents) {
              try {
                const embedding = await this.embedQuery(doc);
                embeddings.push(embedding);
                
                // Track cost for each document
                const tokenCount = Math.ceil(doc.length / 4);
                costTracker.trackEmbeddingCost('azure-embedding', tokenCount, 'document', operationId);
              } catch (error) {
                console.error('Error embedding document:', error);
                throw error;
              }
            }
            
            return embeddings;
          }
        }

        embeddings = new AzureOpenAIEmbeddings({
          apiKey: azureApiKey,
          endpoint: azureEndpoint,
          deploymentName: deploymentName,
          apiVersion: apiVersion
        });
      } else {
        // Use OpenAI embeddings for OpenAI models with cost tracking
        console.log('[DEBUG] Using OpenAI embeddings with model:', embeddingModel);
        
        // Create custom OpenAI embeddings class with cost tracking
        class TrackedOpenAIEmbeddings extends OpenAIEmbeddings {
          constructor(options) {
            super(options);
            this.model = options.modelName || 'text-embedding-3-small';
          }
          
          async embedQuery(text) {
            // Call parent implementation
            const result = await super.embedQuery(text);
            
            // Track cost
            const tokenCount = Math.ceil(text.length / 4);
            costTracker.trackEmbeddingCost(this.model, tokenCount, 'query', operationId);
            
            return result;
          }
          
          async embedDocuments(documents) {
            // Call parent implementation
            const result = await super.embedDocuments(documents);
            
            // Track cost for all documents
            const totalChars = documents.reduce((sum, doc) => sum + doc.length, 0);
            const tokenCount = Math.ceil(totalChars / 4);
            costTracker.trackEmbeddingCost(this.model, tokenCount, 'document', operationId);
            
            return result;
          }
        }
        
        // Use OpenAI embeddings for OpenAI models
        embeddings = new TrackedOpenAIEmbeddings({
          openAIApiKey: process.env.REACT_APP_OPENAI_API_KEY,
          modelName: embeddingModel
        });
      }

      console.log('[DEBUG] Starting to create vector store with embeddings');
      
      // Create vector store - using MemoryVectorStore instead of FAISS for browser compatibility
      const vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);
      console.log('[DEBUG] Vector store created successfully');
      
      // Add namespace information to the vector store
      vectorStore.namespaces = namespaces;
      vectorStore.documentsByNamespace = documentsByNamespace;
      
      setSuccess(true);
      onVectorStoreCreated(vectorStore);
    } catch (err) {
      window.console.error('Error creating vector store:', err);
      setError('Error creating vector store: ' + err.message);
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
                  <Typography gutterBottom>Chunk Size: {chunkSize}</Typography>
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
                <Slider
                  value={chunkSize}
                  onChange={handleChunkSizeChange}
                  min={100}
                  max={getModelChunkConfigs()[embeddingModel]?.maxChunkSize || 4000}
                  step={100}
                  marks={[
                    { value: 100, label: '100' },
                    { value: (getModelChunkConfigs()[embeddingModel]?.maxChunkSize || 4000) / 2, 
                      label: `${Math.round((getModelChunkConfigs()[embeddingModel]?.maxChunkSize || 4000) / 2)}` },
                    { value: getModelChunkConfigs()[embeddingModel]?.maxChunkSize || 4000, 
                      label: `${getModelChunkConfigs()[embeddingModel]?.maxChunkSize || 4000}` }
                  ]}
                  disabled={isProcessing}
                />
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  The size of each text chunk in characters. Smaller chunks are more precise but may lose context.
                  Max tokens: {getModelChunkConfigs()[embeddingModel]?.maxTokens || 'Unknown'}
                </Typography>
              </Box>

              <Box flex={1}>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography gutterBottom>Chunk Overlap: {chunkOverlap}</Typography>
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
                <Slider
                  value={chunkOverlap}
                  onChange={handleChunkOverlapChange}
                  min={0}
                  max={getModelChunkConfigs()[embeddingModel]?.maxChunkOverlap || 500}
                  step={50}
                  marks={[
                    { value: 0, label: '0' },
                    { value: (getModelChunkConfigs()[embeddingModel]?.maxChunkOverlap || 500) / 2, 
                      label: `${Math.round((getModelChunkConfigs()[embeddingModel]?.maxChunkOverlap || 500) / 2)}` },
                    { value: getModelChunkConfigs()[embeddingModel]?.maxChunkOverlap || 500, 
                      label: `${getModelChunkConfigs()[embeddingModel]?.maxChunkOverlap || 500}` }
                  ]}
                  disabled={isProcessing}
                />
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  The number of characters to overlap between chunks. Helps maintain context between chunks.
                  Max overlap: {getModelChunkConfigs()[embeddingModel]?.maxChunkOverlap || 'Unknown'}
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
                value={embeddingModel}
                onChange={handleEmbeddingModelChange}
                label="Embedding Model"
              >
                {Object.entries(getModelChunkConfigs()).map(([model, config]) => (
                  <MenuItem key={model} value={model}>
                    <Box>
                      <Typography variant="body1">{model}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {config.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Select the model to use for generating embeddings. Each model has optimized chunk settings.
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