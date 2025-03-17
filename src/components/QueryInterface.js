import React, { useState } from 'react';
import { 
  Typography, 
  Box, 
  TextField, 
  Button, 
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { createLlmInstance, createQaChain, executeQuery } from '../utils/apiServices';

const DEFAULT_SYSTEM_PROMPTS = {
  openai: `You are a helpful assistant that answers questions based on the provided context. 
If the answer is not in the context, say that you don't know. 
Do not make up information that is not in the context.`,
  
  anthropic: `You are a helpful assistant that answers questions based on the provided context. 
If the answer is not in the context, say that you don't know. 
Do not make up information that is not in the context.`,

  ollama: `You are a helpful assistant that answers questions based on the provided context. 
If the answer is not in the context, say that you don't know. 
Do not make up information that is not in the context.`
};

const QueryInterface = ({ vectorStore, namespaces, onQuerySubmitted, isProcessing, setIsProcessing }) => {
  const [query, setQuery] = useState('');
  const [selectedModels, setSelectedModels] = useState(['gpt-4o-mini', 'claude-3-5-sonnet-latest']);
  const [systemPrompts, setSystemPrompts] = useState({
    // OpenAI models
    'gpt-4o': DEFAULT_SYSTEM_PROMPTS.openai,
    'gpt-4o-mini': DEFAULT_SYSTEM_PROMPTS.openai,
    'o1-mini': DEFAULT_SYSTEM_PROMPTS.openai,
    'o1-preview': DEFAULT_SYSTEM_PROMPTS.openai,
    
    // Anthropic models
    'claude-3-7-sonnet-latest': DEFAULT_SYSTEM_PROMPTS.anthropic,
    'claude-3-5-sonnet-latest': DEFAULT_SYSTEM_PROMPTS.anthropic,
    
    // Ollama models
    'llama3.2:latest': DEFAULT_SYSTEM_PROMPTS.ollama,
    'mistral:latest': DEFAULT_SYSTEM_PROMPTS.ollama
  });
  const [error, setError] = useState(null);
  const [expandedPrompt, setExpandedPrompt] = useState(null);
  const [selectedNamespaces, setSelectedNamespaces] = useState(['default']);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');

  const handleQueryChange = (event) => {
    setQuery(event.target.value);
  };

  const handleModelChange = (event) => {
    setSelectedModels(event.target.value);
  };

  const handleSystemPromptChange = (model, value) => {
    setSystemPrompts(prev => ({
      ...prev,
      [model]: value
    }));
  };

  const handlePromptAccordionChange = (model) => (event, isExpanded) => {
    setExpandedPrompt(isExpanded ? model : null);
  };

  const handleNamespaceChange = (event) => {
    setSelectedNamespaces(event.target.value);
  };

  const handleOllamaEndpointChange = (event) => {
    setOllamaEndpoint(event.target.value);
  };

  const submitQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setIsProcessing(true);
    setError(null);
    
    const responses = {};
    const metrics = {};
    
    try {
      // Filter vector store by selected namespaces if available
      let filteredVectorStore = vectorStore;
      
      // This is a simplified approach - in a real implementation, you would need to
      // filter the vector store based on namespaces before querying
      if (vectorStore.documentsByNamespace && selectedNamespaces.length > 0 && 
          selectedNamespaces.length < namespaces.length) {
        // For demonstration purposes, we'll just log that we're filtering
        window.console.log(`Filtering vector store to namespaces: ${selectedNamespaces.join(', ')}`);
        // In a real implementation, you would create a new vector store with only the documents
        // from the selected namespaces
      }
      
      // Retrieve documents once for all models
      const retriever = filteredVectorStore.asRetriever(4); // topK = 4
      const startRetrievalTime = Date.now();
      const docs = await retriever.getRelevantDocuments(query);
      const endRetrievalTime = Date.now();
      const retrievalTime = endRetrievalTime - startRetrievalTime;
      
      window.console.log(`Retrieved ${docs.length} documents in ${retrievalTime}ms`);
      
      // Format the context from retrieved documents
      const context = docs.map(doc => doc.pageContent).join('\n\n');
      
      // Create the prompt with context
      const prompt = `
Context information is below.
---------------------
${context}
---------------------
Given the context information and not prior knowledge, answer the question: ${query}
`;
      
      // Process each model with the same retrieved documents
      for (const model of selectedModels) {
        // Create LLM instance with appropriate configuration
        const llm = createLlmInstance(model, systemPrompts[model], {
          ollamaEndpoint: ollamaEndpoint
        });
        
        const startTime = Date.now();
        
        // Call the LLM directly with the prompt
        const answer = await llm.invoke(prompt);
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        responses[model] = {
          answer: typeof answer === 'object' ? answer.text : answer,
          sources: docs.map(doc => ({
            content: doc.pageContent.substring(0, 200) + '...',
            source: doc.metadata.source,
            namespace: doc.metadata.namespace || 'default'
          }))
        };
        
        metrics[model] = {
          responseTime: responseTime + retrievalTime, // Include retrieval time in the total
          tokenUsage: {
            estimated: true,
            total: Math.round((typeof answer === 'object' ? answer.text : answer).length / 4) // Very rough estimate
          }
        };
      }
      
      onQuerySubmitted(responses, metrics);
    } catch (err) {
      window.console.error('Error executing query:', err);
      setError('Error executing query: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Query Interface
      </Typography>

      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Enter Your Question
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={4}
          variant="outlined"
          placeholder="Enter your question here..."
          value={query}
          onChange={handleQueryChange}
          disabled={isProcessing}
          sx={{ mb: 3 }}
        />

        <Typography variant="h6" gutterBottom>
          Select Namespaces to Query
        </Typography>
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="namespace-select-label">Namespaces</InputLabel>
          <Select
            labelId="namespace-select-label"
            id="namespace-select"
            multiple
            value={selectedNamespaces}
            onChange={handleNamespaceChange}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} />
                ))}
              </Box>
            )}
            disabled={isProcessing}
          >
            {namespaces.map((namespace) => (
              <MenuItem key={namespace} value={namespace}>
                {namespace}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="model-select-label">Select Models to Compare</InputLabel>
          <Select
            labelId="model-select-label"
            id="model-select"
            multiple
            value={selectedModels}
            onChange={handleModelChange}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} />
                ))}
              </Box>
            )}
            disabled={isProcessing}
          >
            <MenuItem disabled>
              <Typography variant="subtitle2">OpenAI Models</Typography>
            </MenuItem>
            <MenuItem value="gpt-4o">GPT-4o</MenuItem>
            <MenuItem value="gpt-4o-mini">GPT-4o-mini</MenuItem>
            <MenuItem value="o1-mini">o1-mini</MenuItem>
            <MenuItem value="o1-preview">o1-preview</MenuItem>
            <Divider />
            <MenuItem disabled>
              <Typography variant="subtitle2">Anthropic Models</Typography>
            </MenuItem>
            <MenuItem value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</MenuItem>
            <MenuItem value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</MenuItem>
            <Divider />
            <MenuItem disabled>
              <Typography variant="subtitle2">Ollama Models</Typography>
            </MenuItem>
            <MenuItem value="llama3.2:latest">Llama 3 (8B)</MenuItem>
            <MenuItem value="mistral:latest">Mistral (7B)</MenuItem>
          </Select>
        </FormControl>

        {selectedModels.some(model => model.includes('llama') || model.includes('mistral')) && (
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom>
              Ollama Configuration
            </Typography>
            <TextField
              fullWidth
              label="Ollama API Endpoint"
              variant="outlined"
              value={ollamaEndpoint}
              onChange={handleOllamaEndpointChange}
              placeholder="http://localhost:11434"
              helperText="The URL of your Ollama API endpoint"
              disabled={isProcessing}
              sx={{ mb: 2 }}
            />
          </Box>
        )}

        <Typography variant="h6" gutterBottom>
          System Prompts
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Customize the system prompts for each model to test different RAG strategies.
        </Typography>

        {selectedModels.map((model) => (
          <Accordion 
            key={model}
            expanded={expandedPrompt === model}
            onChange={handlePromptAccordionChange(model)}
            sx={{ mb: 1 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>{model}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                fullWidth
                multiline
                rows={6}
                variant="outlined"
                value={systemPrompts[model]}
                onChange={(e) => handleSystemPromptChange(model, e.target.value)}
                disabled={isProcessing}
              />
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      <Box mt={3} display="flex" justifyContent="center">
        <Button
          variant="contained"
          color="primary"
          onClick={submitQuery}
          disabled={isProcessing || !query.trim() || selectedModels.length === 0}
          size="large"
        >
          {isProcessing ? (
            <>
              <CircularProgress size={24} color="inherit" style={{ marginRight: 10 }} />
              Processing Query...
            </>
          ) : (
            'Submit Query'
          )}
        </Button>
      </Box>

      {error && (
        <Box mt={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
    </Box>
  );
};

export default QueryInterface; 