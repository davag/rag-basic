import React, { useState, useEffect, useRef } from 'react';
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
  Divider,
  IconButton,
  Tooltip,
  Link,
  Switch,
  FormControlLabel,
  Slider,
  Stack,
  LinearProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import { createLlmInstance } from '../utils/apiServices';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context. 
If the answer is not in the context, say that you don't know. 
Do not make up information that is not in the context.`;

const QueryInterface = ({ vectorStore, namespaces, onQuerySubmitted, isProcessing, setIsProcessing, initialState }) => {
  const [query, setQuery] = useState('');
  const [selectedModels, setSelectedModels] = useState(['gpt-4o-mini', 'claude-3-5-sonnet-latest']);
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [useCustomPrompts, setUseCustomPrompts] = useState(false);
  const [customSystemPrompts, setCustomSystemPrompts] = useState({
    // OpenAI models
    'gpt-4o': DEFAULT_SYSTEM_PROMPT,
    'gpt-4o-mini': DEFAULT_SYSTEM_PROMPT,
    'o1-mini': DEFAULT_SYSTEM_PROMPT,
    'o1-preview': DEFAULT_SYSTEM_PROMPT,
    
    // Anthropic models
    'claude-3-7-sonnet-latest': DEFAULT_SYSTEM_PROMPT,
    'claude-3-5-sonnet-latest': DEFAULT_SYSTEM_PROMPT,
    
    // Ollama models
    'llama3.2:latest': DEFAULT_SYSTEM_PROMPT,
    'mistral:latest': DEFAULT_SYSTEM_PROMPT
  });
  const [globalTemperature, setGlobalTemperature] = useState(0);
  const [useCustomTemperatures, setUseCustomTemperatures] = useState(false);
  const [customTemperatures, setCustomTemperatures] = useState({
    // OpenAI models
    'gpt-4o': 0,
    'gpt-4o-mini': 0,
    'o1-mini': 0,
    'o1-preview': 0,
    
    // Anthropic models
    'claude-3-7-sonnet-latest': 0,
    'claude-3-5-sonnet-latest': 0,
    
    // Ollama models
    'llama3.2:latest': 0,
    'mistral:latest': 0
  });
  const [error, setError] = useState(null);
  const [expandedPrompt, setExpandedPrompt] = useState(null);
  const [expandedTemperature, setExpandedTemperature] = useState(null);
  const [selectedNamespaces, setSelectedNamespaces] = useState(['default']);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [globalPromptExpanded, setGlobalPromptExpanded] = useState(false);
  const [globalTemperatureExpanded, setGlobalTemperatureExpanded] = useState(false);
  const [currentProcessingModel, setCurrentProcessingModel] = useState(null);
  const [processingStep, setProcessingStep] = useState('');
  const [responses, setResponses] = useState({});

  // Reference to the file input element
  const fileInputRef = useRef(null);

  // Reset processing state when component is mounted or re-mounted
  useEffect(() => {
    // Reset processing-related state
    setResponses({});
    setCurrentProcessingModel(null);
    setProcessingStep('');
    
    // If we're not processing, make sure isProcessing is false
    if (!isProcessing) {
      setIsProcessing(false);
    }
    
    // This will run when the component is unmounted
    return () => {
      // Clean up any ongoing processes if needed
    };
  }, []); // Empty dependency array means this runs once on mount

  // Load initial state if provided
  useEffect(() => {
    if (initialState) {
      if (initialState.query) setQuery(initialState.query);
      if (initialState.selectedModels) setSelectedModels(initialState.selectedModels);
      if (initialState.selectedNamespaces) setSelectedNamespaces(initialState.selectedNamespaces);
      if (initialState.globalSystemPrompt) setGlobalSystemPrompt(initialState.globalSystemPrompt);
      if (initialState.useCustomPrompts !== undefined) setUseCustomPrompts(initialState.useCustomPrompts);
      if (initialState.customSystemPrompts && Object.keys(initialState.customSystemPrompts).length > 0) {
        setCustomSystemPrompts(prev => ({
          ...prev,
          ...initialState.customSystemPrompts
        }));
      }
      if (initialState.globalTemperature !== undefined) setGlobalTemperature(initialState.globalTemperature);
      if (initialState.useCustomTemperatures !== undefined) setUseCustomTemperatures(initialState.useCustomTemperatures);
      if (initialState.customTemperatures && Object.keys(initialState.customTemperatures).length > 0) {
        setCustomTemperatures(prev => ({
          ...prev,
          ...initialState.customTemperatures
        }));
      }
      if (initialState.ollamaEndpoint) setOllamaEndpoint(initialState.ollamaEndpoint);
    }
  }, [initialState]);

  const handleQueryChange = (event) => {
    setQuery(event.target.value);
  };

  const handleModelChange = (event) => {
    setSelectedModels(event.target.value);
  };

  const handleGlobalSystemPromptChange = (event) => {
    setGlobalSystemPrompt(event.target.value);
  };

  const handleCustomSystemPromptChange = (model, value) => {
    setCustomSystemPrompts(prev => ({
      ...prev,
      [model]: value
    }));
  };

  const handleUseCustomPromptsChange = (event) => {
    setUseCustomPrompts(event.target.checked);
  };

  const handlePromptAccordionChange = (model) => (event, isExpanded) => {
    setExpandedPrompt(isExpanded ? model : null);
  };

  const handleGlobalPromptAccordionChange = (event, isExpanded) => {
    setGlobalPromptExpanded(isExpanded);
  };

  const handleNamespaceChange = (event) => {
    setSelectedNamespaces(event.target.value);
  };

  const handleOllamaEndpointChange = (event) => {
    setOllamaEndpoint(event.target.value);
  };

  const handleGlobalTemperatureChange = (event, newValue) => {
    setGlobalTemperature(newValue);
  };

  const handleCustomTemperatureChange = (model, value) => {
    setCustomTemperatures(prev => ({
      ...prev,
      [model]: value
    }));
  };

  const handleUseCustomTemperaturesChange = (event) => {
    setUseCustomTemperatures(event.target.checked);
  };

  const handleTemperatureAccordionChange = (model) => (event, isExpanded) => {
    setExpandedTemperature(isExpanded ? model : null);
  };

  const handleGlobalTemperatureAccordionChange = (event, isExpanded) => {
    setGlobalTemperatureExpanded(isExpanded);
  };

  const getSystemPromptForModel = (model) => {
    return useCustomPrompts ? customSystemPrompts[model] : globalSystemPrompt;
  };

  const getTemperatureForModel = (model) => {
    // o1 models don't support temperature settings
    if (model.startsWith('o1')) {
      return undefined;
    }
    return useCustomTemperatures ? customTemperatures[model] : globalTemperature;
  };

  // Get current state to save when submitting
  const getCurrentState = () => {
    return {
      query,
      selectedModels,
      selectedNamespaces,
      globalSystemPrompt: useCustomPrompts ? '' : globalSystemPrompt,
      useCustomPrompts,
      // Only include custom prompts if they're being used
      customSystemPrompts: useCustomPrompts ? 
        // Filter to only include prompts for selected models
        Object.fromEntries(
          Object.entries(customSystemPrompts)
            .filter(([model]) => selectedModels.includes(model))
        ) : 
        {},
      globalTemperature: useCustomTemperatures ? 0 : globalTemperature,
      useCustomTemperatures,
      // Only include custom temperatures if they're being used
      customTemperatures: useCustomTemperatures ? 
        // Filter to only include temperatures for selected models
        Object.fromEntries(
          Object.entries(customTemperatures)
            .filter(([model]) => selectedModels.includes(model))
        ) : 
        {},
      ollamaEndpoint
    };
  };

  // Export query configuration to a JSON file
  const handleExportConfig = () => {
    const config = getCurrentState();
    const configJson = JSON.stringify(config, null, 2);
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `rag-query-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Trigger file input click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection for import
  const handleImportConfig = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        
        // Update state with imported configuration
        if (config.query) setQuery(config.query);
        if (config.selectedModels) setSelectedModels(config.selectedModels);
        if (config.selectedNamespaces) setSelectedNamespaces(config.selectedNamespaces);
        if (config.globalSystemPrompt) setGlobalSystemPrompt(config.globalSystemPrompt);
        if (config.useCustomPrompts !== undefined) setUseCustomPrompts(config.useCustomPrompts);
        if (config.customSystemPrompts) {
          setCustomSystemPrompts(prev => ({
            ...prev,
            ...config.customSystemPrompts
          }));
        }
        if (config.globalTemperature !== undefined) setGlobalTemperature(config.globalTemperature);
        if (config.useCustomTemperatures !== undefined) setUseCustomTemperatures(config.useCustomTemperatures);
        if (config.customTemperatures) {
          setCustomTemperatures(prev => ({
            ...prev,
            ...config.customTemperatures
          }));
        }
        if (config.ollamaEndpoint) setOllamaEndpoint(config.ollamaEndpoint);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        window.console.error('Error importing configuration:', error);
        setError('Failed to import configuration. The file may be invalid or corrupted.');
      }
    };
    reader.readAsText(file);
  };

  const submitQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProcessingStep('Preparing query');
    
    const responses = {};
    const metrics = {};
    const systemPromptsUsed = {};
    const temperaturesUsed = {};
    
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
      setProcessingStep('Retrieving relevant documents');
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
      
      // Estimate input token count (very rough estimate: 1 token ≈ 4 characters)
      const inputTokenEstimate = Math.round(prompt.length / 4);
      
      // Process each model with the same retrieved documents
      for (const model of selectedModels) {
        setCurrentProcessingModel(model);
        setProcessingStep(`Processing with ${model}`);
        
        // Get the appropriate system prompt for this model
        const systemPrompt = getSystemPromptForModel(model);
        systemPromptsUsed[model] = systemPrompt;
        
        // Get the appropriate temperature for this model
        const temperature = getTemperatureForModel(model);
        temperaturesUsed[model] = temperature;
        
        // Create LLM instance with appropriate configuration
        const llm = createLlmInstance(model, systemPrompt, {
          ollamaEndpoint: ollamaEndpoint,
          temperature: temperature
        });
        
        const startTime = Date.now();
        
        // Call the LLM directly with the prompt
        const answer = await llm.invoke(prompt);
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Get the answer text
        const answerText = typeof answer === 'object' ? answer.text : answer;
        
        // Estimate output token count (very rough estimate: 1 token ≈ 4 characters)
        const outputTokenEstimate = Math.round(answerText.length / 4);
        
        // Total token usage
        const totalTokens = inputTokenEstimate + outputTokenEstimate;
        
        responses[model] = {
          answer: answerText,
          sources: docs.map(doc => ({
            content: doc.pageContent,
            source: doc.metadata.source,
            namespace: doc.metadata.namespace || 'default'
          }))
        };
        
        metrics[model] = {
          responseTime: responseTime + retrievalTime, // Include retrieval time in the total
          tokenUsage: {
            estimated: true,
            input: inputTokenEstimate,
            output: outputTokenEstimate,
            total: totalTokens
          }
        };
      }
      
      setProcessingStep('Finalizing results');
      // Store the responses in state
      setResponses(responses);
      // Pass the current state along with the results
      onQuerySubmitted(responses, metrics, query, systemPromptsUsed, getCurrentState());
    } catch (err) {
      window.console.error('Error executing query:', err);
      setError('Error executing query: ' + err.message);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingModel(null);
      setProcessingStep('');
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Box display="flex" alignItems="center">
          <Typography variant="h5">
            Step 3: Ask Questions Using RAG
          </Typography>
          <Tooltip title="Learn more about how RAG queries work">
            <IconButton 
              size="small" 
              onClick={() => setHelpExpanded(!helpExpanded)}
              sx={{ ml: 1 }}
            >
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
        </Box>
        
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={handleExportConfig}
            disabled={isProcessing}
            size="small"
          >
            Export Config
          </Button>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={handleImportClick}
            disabled={isProcessing}
            size="small"
          >
            Import Config
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportConfig}
            accept=".json"
            style={{ display: 'none' }}
          />
        </Stack>
      </Box>

      <Typography variant="body2" color="textSecondary" paragraph>
        Now that your documents have been processed and stored as vector embeddings, you can ask questions about their content. The system will find the most relevant information and use it to generate accurate answers.
      </Typography>
      
      <Accordion 
        expanded={helpExpanded} 
        onChange={() => setHelpExpanded(!helpExpanded)}
        sx={{ mb: 3 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">How RAG Queries Work</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" paragraph>
            When you ask a question, the RAG system follows these steps:
          </Typography>
          
          <Typography variant="body2" component="div">
            <ol>
              <li><strong>Query Embedding:</strong> Your question is converted into a vector embedding using the same model used for your documents.</li>
              <li><strong>Similarity Search:</strong> The system searches the vector database to find document chunks that are semantically similar to your question.</li>
              <li><strong>Context Retrieval:</strong> The most relevant chunks are retrieved and combined to form the context for the LLM.</li>
              <li><strong>Answer Generation:</strong> The LLM uses the retrieved context along with your question to generate an accurate answer.</li>
              <li><strong>Source Attribution:</strong> The system provides references to the source documents used to generate the answer.</li>
            </ol>
          </Typography>
          
          <Typography variant="body2" paragraph>
            You can compare different LLM models to see how they perform with the same retrieved context. This helps evaluate which model provides the best answers for your specific use case.
          </Typography>
          
          <Link 
            href="https://www.pinecone.io/learn/retrieval-augmented-generation/" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            Learn more about RAG Query Processing
          </Link>
        </AccordionDetails>
      </Accordion>

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
          The system prompt guides how the AI responds to your questions.
        </Typography>
        
        <FormControlLabel
          control={
            <Switch
              checked={useCustomPrompts}
              onChange={handleUseCustomPromptsChange}
              disabled={isProcessing}
            />
          }
          label="Use custom prompts for each model"
          sx={{ mb: 2 }}
        />
        
        {!useCustomPrompts && (
          <Accordion 
            expanded={globalPromptExpanded}
            onChange={handleGlobalPromptAccordionChange}
            sx={{ mb: 3 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Global System Prompt (used for all models)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                fullWidth
                multiline
                rows={6}
                variant="outlined"
                value={globalSystemPrompt}
                onChange={handleGlobalSystemPromptChange}
                disabled={isProcessing}
              />
            </AccordionDetails>
          </Accordion>
        )}
        
        {useCustomPrompts && (
          <>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Customize the system prompts for each selected model.
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
                    value={customSystemPrompts[model]}
                    onChange={(e) => handleCustomSystemPromptChange(model, e.target.value)}
                    disabled={isProcessing}
                  />
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}

        {/* Temperature Controls */}
        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Temperature Settings
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Temperature controls how creative or deterministic the model responses are. 
          Higher values (0.7-1.0) make output more random and creative, while lower values (0-0.3) make output more focused and deterministic.
        </Typography>
        
        <FormControlLabel
          control={
            <Switch
              checked={useCustomTemperatures}
              onChange={handleUseCustomTemperaturesChange}
              disabled={isProcessing}
            />
          }
          label="Use custom temperature for each model"
          sx={{ mb: 2 }}
        />
        
        {!useCustomTemperatures && (
          <Accordion 
            expanded={globalTemperatureExpanded}
            onChange={handleGlobalTemperatureAccordionChange}
            sx={{ mb: 3 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Global Temperature (used for all models)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ px: 2 }}>
                <Typography id="global-temperature-slider" gutterBottom>
                  Temperature: {globalTemperature}
                </Typography>
                <Slider
                  aria-labelledby="global-temperature-slider"
                  value={globalTemperature}
                  onChange={handleGlobalTemperatureChange}
                  step={0.1}
                  marks
                  min={0}
                  max={1}
                  valueLabelDisplay="auto"
                  disabled={isProcessing}
                />
                <Box display="flex" justifyContent="space-between" mt={1}>
                  <Typography variant="caption" color="textSecondary">Deterministic (0)</Typography>
                  <Typography variant="caption" color="textSecondary">Creative (1)</Typography>
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
        
        {useCustomTemperatures && (
          <>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Customize the temperature for each selected model.
            </Typography>
            
            {selectedModels.map((model) => (
              <Accordion 
                key={`temp-${model}`}
                expanded={expandedTemperature === model}
                onChange={handleTemperatureAccordionChange(model)}
                sx={{ mb: 1 }}
                disabled={model.startsWith('o1')}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    {model} {model.startsWith('o1') && '(Temperature not supported)'}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ px: 2 }}>
                    <Typography id={`${model}-temperature-slider`} gutterBottom>
                      Temperature: {customTemperatures[model]}
                    </Typography>
                    <Slider
                      aria-labelledby={`${model}-temperature-slider`}
                      value={customTemperatures[model]}
                      onChange={(e, newValue) => handleCustomTemperatureChange(model, newValue)}
                      step={0.1}
                      marks
                      min={0}
                      max={1}
                      valueLabelDisplay="auto"
                      disabled={isProcessing || model.startsWith('o1')}
                    />
                    <Box display="flex" justifyContent="space-between" mt={1}>
                      <Typography variant="caption" color="textSecondary">Deterministic (0)</Typography>
                      <Typography variant="caption" color="textSecondary">Creative (1)</Typography>
                    </Box>
                    {model.startsWith('o1') && (
                      <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                        Note: o1 models do not support temperature adjustments.
                      </Typography>
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}
      </Paper>

      <Box mt={3} display="flex" justifyContent="center" flexDirection="column" alignItems="center">
        <Button
          variant="contained"
          color="primary"
          onClick={submitQuery}
          disabled={isProcessing || !query.trim() || selectedModels.length === 0}
          size="large"
        >
          {isProcessing ? 'Processing...' : 'Submit Query'}
        </Button>
        
        {isProcessing && (
          <Box sx={{ width: '100%', maxWidth: 500, mt: 2 }}>
            <Typography variant="body2" align="center" gutterBottom>
              {processingStep}
            </Typography>
            <LinearProgress sx={{ mb: 1 }} />
            
            <Box sx={{ mt: 2 }}>
              {selectedModels.map(model => (
                <Box key={model} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Box 
                    sx={{ 
                      width: 20, 
                      height: 20, 
                      borderRadius: '50%', 
                      mr: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: currentProcessingModel === model ? 'primary.main' : 'grey.300'
                    }}
                  >
                    {currentProcessingModel === model && <CircularProgress size={16} color="inherit" />}
                  </Box>
                  <Typography 
                    variant="body2" 
                    color={currentProcessingModel === model ? 'primary' : 'textSecondary'}
                    sx={{ fontWeight: currentProcessingModel === model ? 'bold' : 'normal' }}
                  >
                    {model}
                    {currentProcessingModel === model && ' (processing...)'}
                    {Object.keys(responses).includes(model) && ' (completed)'}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
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