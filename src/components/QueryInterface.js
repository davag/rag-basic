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
  const [selectedModels, setSelectedModels] = useState(['gpt-3.5-turbo', 'claude-3-haiku-20240307']);
  const [systemPrompts, setSystemPrompts] = useState({
    'gpt-3.5-turbo': DEFAULT_SYSTEM_PROMPTS.openai,
    'gpt-4-turbo': DEFAULT_SYSTEM_PROMPTS.openai,
    'claude-3-haiku-20240307': DEFAULT_SYSTEM_PROMPTS.anthropic,
    'claude-3-sonnet-20240229': DEFAULT_SYSTEM_PROMPTS.anthropic,
    'claude-3-opus-20240229': DEFAULT_SYSTEM_PROMPTS.anthropic,
    'llama3:8b': DEFAULT_SYSTEM_PROMPTS.ollama,
    'llama3:70b': DEFAULT_SYSTEM_PROMPTS.ollama,
    'mistral:7b': DEFAULT_SYSTEM_PROMPTS.ollama
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
      
      for (const model of selectedModels) {
        // Create LLM instance with appropriate configuration
        const llm = createLlmInstance(model, systemPrompts[model], {
          ollamaEndpoint: ollamaEndpoint
        });
        
        // Create QA chain
        const chain = createQaChain(llm, filteredVectorStore, { topK: 4 });
        
        // Execute query
        const { result, metrics: queryMetrics } = await executeQuery(chain, query);
        
        responses[model] = {
          answer: result.text,
          sources: result.sourceDocuments.map(doc => ({
            content: doc.pageContent.substring(0, 200) + '...',
            source: doc.metadata.source,
            namespace: doc.metadata.namespace || 'default'
          }))
        };
        
        metrics[model] = queryMetrics;
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
            <MenuItem value="gpt-3.5-turbo">GPT-3.5 Turbo</MenuItem>
            <MenuItem value="gpt-4-turbo">GPT-4 Turbo</MenuItem>
            <Divider />
            <MenuItem disabled>
              <Typography variant="subtitle2">Anthropic Models</Typography>
            </MenuItem>
            <MenuItem value="claude-3-haiku-20240307">Claude 3 Haiku</MenuItem>
            <MenuItem value="claude-3-sonnet-20240229">Claude 3 Sonnet</MenuItem>
            <MenuItem value="claude-3-opus-20240229">Claude 3 Opus</MenuItem>
            <Divider />
            <MenuItem disabled>
              <Typography variant="subtitle2">Ollama Models</Typography>
            </MenuItem>
            <MenuItem value="llama3:8b">Llama 3 (8B)</MenuItem>
            <MenuItem value="llama3:70b">Llama 3 (70B)</MenuItem>
            <MenuItem value="mistral:7b">Mistral (7B)</MenuItem>
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