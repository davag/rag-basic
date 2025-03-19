import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Stack
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { createLlmInstance } from '../utils/apiServices';
import { processModelsInParallel } from '../utils/parallelLLMProcessor';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context. 
If the answer is not in the context, say that you don't know. 
Do not make up information that is not in the context.`;

const QueryInterface = ({ vectorStore, namespaces = [], onQuerySubmitted, isProcessing, setIsProcessing, initialState }) => {
  const [query, setQuery] = useState('');
  const [selectedModels, setSelectedModels] = useState(['gpt-4o-mini', 'claude-3-5-sonnet-latest']);
  const [promptSets, setPromptSets] = useState([
    {
      id: 1,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      temperature: 0
    }
  ]);
  const [error, setError] = useState(null);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [currentProcessingModel, setCurrentProcessingModel] = useState(null);
  const [processingStep, setProcessingStep] = useState('');
  const [responses, setResponses] = useState({});
  const [isGettingPromptIdeas, setIsGettingPromptIdeas] = useState(false);
  const [promptIdeas, setPromptIdeas] = useState(null);
  const [expandedQuery, setExpandedQuery] = useState(false);
  const [selectedNamespaces, setSelectedNamespaces] = useState(['default']);
  const [processingStartTimes, setProcessingStartTimes] = useState({});
  const [elapsedTimes, setElapsedTimes] = useState({});
  const [timerInterval, setTimerInterval] = useState(null);

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
    
    // Load default query template from localStorage if query is empty
    if (!query) {
      const defaultTemplate = localStorage.getItem('defaultQueryTemplate');
      if (defaultTemplate) {
        setQuery(defaultTemplate);
      }
    }
  }, [isProcessing, setIsProcessing, query]);

  // Initialize state from initialState or localStorage (with priority for initialState)
  useEffect(() => {
    if (!initialState) return;
    
    console.log("QueryInterface initializing with initialState:", initialState);
    
    // Reset all state to defaults first to avoid mixing old state
    if (Object.keys(initialState).length > 0) {
      const cleanState = { ...initialState };
      
      // Log the state we're loading
      console.log("Loading query state with priority:", {
        query: cleanState.query || '(empty)',
        modelCount: cleanState.selectedModels?.length || 0
      });
      
      // Always set query from initialState if available
      if (cleanState.query) {
        console.log("Setting query from initialState:", cleanState.query);
        setQuery(cleanState.query);
      }
      
      // Set selected models with a fallback
      setSelectedModels(
        (cleanState.selectedModels && cleanState.selectedModels.length > 0) 
          ? cleanState.selectedModels 
          : ['gpt-4o-mini', 'claude-3-5-sonnet-latest']
      );
      
      // Set selected namespaces with a fallback
      setSelectedNamespaces(
        (cleanState.selectedNamespaces && cleanState.selectedNamespaces.length > 0) 
          ? cleanState.selectedNamespaces 
          : ['default']
      );
      
      // Set system prompt with a fallback
      setPromptSets(cleanState.promptSets || [
        {
          id: 1,
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          temperature: 0
        }
      ]);
    }
  }, [initialState]);

  // Function to update elapsed times
  const updateElapsedTimes = useCallback(() => {
    const now = Date.now();
    const updated = {};
    
    Object.entries(processingStartTimes || {}).forEach(([model, startTime]) => {
      if (startTime) {
        const elapsed = now - startTime;
        updated[model] = elapsed;
      }
    });
    
    setElapsedTimes(updated);
  }, [processingStartTimes]);
  
  // Set up and clear timer
  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        updateElapsedTimes();
      }, 100);
      setTimerInterval(interval);
    } else {
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
    }
    
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isProcessing, updateElapsedTimes, timerInterval]);
  
  // Format milliseconds to display time
  const formatElapsedTime = (ms) => {
    if (!ms) return '';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}.${Math.floor((ms % 1000) / 100)}s`;
    }
  };

  const handleQueryChange = (event) => {
    setQuery(event.target.value);
  };

  const handleModelChange = (event) => {
    setSelectedModels(event.target.value);
  };

  const handlePromptSetChange = (id, field, value) => {
    setPromptSets(prev => prev.map(set => 
      set.id === id ? { ...set, [field]: value } : set
    ));
  };

  const handleNamespaceChange = (event) => {
    setSelectedNamespaces(event.target.value);
  };

  const handleGetGlobalPromptIdeas = async () => {
    if (!promptSets[0].systemPrompt.trim()) return;
    
    setIsGettingPromptIdeas(true);
    try {
      const llm = createLlmInstance('gpt-4o-mini', 'You are an expert at improving system prompts for LLMs. Your goal is to help users create more effective prompts that lead to better responses.');
      
      const prompt = `Please analyze this system prompt and provide specific suggestions for improvement:

${promptSets[0].systemPrompt}

Provide feedback in these areas:
1. Clarity and specificity
2. Task definition
3. Constraints and guidelines
4. Potential edge cases
5. Performance optimization

Format your response in a clear, structured way.`;
      
      const response = await llm.invoke(prompt);
      setPromptIdeas(response);
    } catch (error) {
      console.error('Error getting prompt ideas:', error);
      setError('Failed to get prompt improvement suggestions. Please try again.');
    } finally {
      setIsGettingPromptIdeas(false);
    }
  };

  const handleAddPromptSet = () => {
    setPromptSets(prev => [
      ...prev,
      {
        id: prev.length + 1,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        temperature: 0
      }
    ]);
  };

  const handleRemovePromptSet = (id) => {
    if (promptSets.length > 1) {
      setPromptSets(prev => prev.filter(set => set.id !== id));
    }
  };

  const submitQuery = async () => {
    if (!query.trim() || selectedModels.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Get parallel processing preference from localStorage
      const useParallelProcessing = localStorage.getItem('useParallelProcessing') === 'true';
      console.log('QueryInterface - Parallel processing setting:', {
        rawValue: localStorage.getItem('useParallelProcessing'),
        useParallelProcessing
      });
      
      // Retrieve relevant documents
      setProcessingStep('Retrieving relevant documents');
      const docs = await vectorStore.similaritySearch(query, 5);
      
      // Filter documents by namespace if needed
      const filteredDocs = selectedNamespaces.length > 0 ? 
        docs.filter(doc => {
          const docNamespace = doc.metadata?.namespace || 'default';
          return selectedNamespaces.includes(docNamespace);
        }) : 
        docs;
      
      // Format the context from retrieved documents
      const context = filteredDocs.map(doc => doc.pageContent).join('\n\n');
      
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
      
      if (useParallelProcessing) {
        // Set processing step to indicate parallel processing
        setCurrentProcessingModel('all models');
        setProcessingStep('Processing queries in parallel');
        
        // Start timers for all models
        const startTimes = {};
        selectedModels.forEach(model => {
          startTimes[model] = Date.now();
        });
        setProcessingStartTimes(startTimes);
        
        // Process all models in parallel for each prompt set
        const allResponses = {};
        const allMetrics = {};
        
        for (const promptSet of promptSets) {
          const { responses: parallelResponses, metrics: parallelMetrics } = await processModelsInParallel(
            selectedModels,
            prompt,
            {
              getSystemPromptForModel: () => promptSet.systemPrompt,
              getTemperatureForModel: () => promptSet.temperature,
              sources: filteredDocs
            }
          );
          
          // Add set identifier to responses and metrics
          const setKey = `Set ${promptSet.id}`;
          allResponses[setKey] = parallelResponses || {};
          allMetrics[setKey] = parallelMetrics || {};
        }
        
        // Update state with results
        setResponses(allResponses);
        
        // Get current state to pass to parent component
        const queryState = getCurrentState();
        
        // Call the onQuerySubmitted callback with all results and state
        onQuerySubmitted(
          allResponses, 
          allMetrics,
          query,
          promptSets.reduce((acc, set) => ({
            ...acc,
            [`Set ${set.id}`]: {
              systemPrompt: set.systemPrompt,
              temperature: set.temperature,
              models: selectedModels
            }
          }), {}),
          queryState
        );
      } else {
        // Process models sequentially for each prompt set
        const allResponses = {};
        const allMetrics = {};
        
        for (const promptSet of promptSets) {
          const responses = {};
          const metrics = {};
          
          // Process each model with the same retrieved documents
          for (const model of selectedModels) {
            setCurrentProcessingModel(model);
            setProcessingStep(`Processing with ${model} (Set ${promptSet.id})`);
            
            // Start timer for current model
            setProcessingStartTimes(prev => ({
              ...prev,
              [model]: Date.now()
            }));
            
            // Get Ollama endpoint from localStorage
            const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || 'http://localhost:11434';
            
            // Create LLM instance with appropriate configuration
            const llm = createLlmInstance(model, promptSet.systemPrompt, {
              ollamaEndpoint: ollamaEndpoint,
              temperature: promptSet.temperature
            });
            
            const startTime = Date.now();
            
            // Call the LLM directly with the prompt
            const answer = await llm.invoke(prompt);
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            // Get the answer text
            const answerText = typeof answer === 'object' ? answer.text : answer;
            
            // Store the response
            responses[model] = {
              text: answerText,
              sources: filteredDocs
            };
            
            // Store metrics for this model
            metrics[model] = {
              responseTime,
              elapsedTime: endTime - startTime,
              tokenUsage: {
                estimated: true,
                input: inputTokenEstimate,
                output: Math.round(answerText.length / 4),
                total: inputTokenEstimate + Math.round(answerText.length / 4)
              }
            };
          }
          
          // Store responses and metrics for this set
          const setKey = `Set ${promptSet.id}`;
          allResponses[setKey] = responses;
          allMetrics[setKey] = metrics;
        }
        
        // Get current state to pass to parent component
        const queryState = getCurrentState();
        
        // Call the onQuerySubmitted callback with all results and state
        onQuerySubmitted(
          allResponses,
          allMetrics,
          query,
          promptSets.reduce((acc, set) => ({
            ...acc,
            [`Set ${set.id}`]: {
              systemPrompt: set.systemPrompt,
              temperature: set.temperature,
              models: selectedModels
            }
          }), {}),
          queryState
        );
      }
    } catch (error) {
      console.error('Error processing query:', error);
      // Provide more specific error messages based on the error type
      if (error.message?.includes('rate limit')) {
        setError('Rate limit exceeded. Please wait a moment before trying again.');
      } else if (error.message?.includes('timeout')) {
        setError('Request timed out. Please try again or check your connection.');
      } else if (error.message?.includes('unauthorized') || error.message?.includes('401')) {
        setError('Authentication error. Please check your API keys and permissions.');
      } else if (error.message?.includes('vector store')) {
        setError('Error accessing the vector store. Please check if your documents are properly indexed.');
      } else if (error.message?.includes('llm')) {
        setError('Error communicating with the language model. Please check your model configuration.');
      } else {
        setError(`Error: ${error.message || 'An unexpected error occurred. Please try again.'}`);
      }
    } finally {
      setIsProcessing(false);
      setCurrentProcessingModel(null);
      setProcessingStep('');
    }
  };

  // Function to get current state
  const getCurrentState = useCallback(() => {
    return {
      query,
      selectedModels: selectedModels || [],
      selectedNamespaces: selectedNamespaces || [],
      promptSets: promptSets || [{
        id: 1,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        temperature: 0
      }]
    };
  }, [query, selectedModels, selectedNamespaces, promptSets]);

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
        if (config.promptSets) setPromptSets(config.promptSets);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Error importing configuration:', error);
        setError('Failed to import configuration. The file may be invalid or corrupted.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Box>
      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Query Interface
          </Typography>
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
            <MenuItem value="o3-mini">o3-mini</MenuItem>
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
            <MenuItem value="gemma3:12b">Gemma 3 (12B)</MenuItem>
            <MenuItem value="mistral:latest">Mistral (7B)</MenuItem>
            <Divider />
            <MenuItem disabled>
              <Typography variant="subtitle2">Azure OpenAI Models</Typography>
            </MenuItem>
            <MenuItem value="azure-gpt-4o">Azure GPT-4o</MenuItem>
            <MenuItem value="azure-gpt-4o-mini">Azure GPT-4o-mini</MenuItem>
            <MenuItem value="azure-o1-mini">Azure o1-mini</MenuItem>
            <MenuItem value="azure-o3-mini">Azure o3-mini</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="namespace-select-label">Select Namespaces</InputLabel>
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
            {(namespaces || []).map((namespace) => (
              <MenuItem key={namespace} value={namespace}>
                {namespace}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          multiline
          rows={4}
          variant="outlined"
          label="Your Question"
          value={query}
          onChange={handleQueryChange}
          disabled={isProcessing}
          sx={{ mb: 3 }}
        />

        <Box sx={{ mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Prompt Sets</Typography>
            <Button
              variant="outlined"
              onClick={handleAddPromptSet}
              disabled={isProcessing}
              startIcon={<AddIcon />}
            >
              Add Set
            </Button>
          </Box>
          
          {promptSets.map((set) => (
            <Paper key={set.id} sx={{ p: 2, mb: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle1">Set {set.id}</Typography>
                {promptSets.length > 1 && (
                  <IconButton
                    onClick={() => handleRemovePromptSet(set.id)}
                    disabled={isProcessing}
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
              
              <TextField
                fullWidth
                multiline
                rows={3}
                label="System Prompt"
                value={set.systemPrompt}
                onChange={(e) => handlePromptSetChange(set.id, 'systemPrompt', e.target.value)}
                disabled={isProcessing}
                sx={{ mb: 2 }}
              />
              
              <Box>
                <Typography id={`temperature-slider-${set.id}`} gutterBottom>
                  Temperature: {set.temperature}
                </Typography>
                <Slider
                  aria-labelledby={`temperature-slider-${set.id}`}
                  value={set.temperature}
                  onChange={(e, newValue) => handlePromptSetChange(set.id, 'temperature', newValue)}
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
            </Paper>
          ))}
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              startIcon={<LightbulbIcon />}
              onClick={handleGetGlobalPromptIdeas}
              disabled={isProcessing || isGettingPromptIdeas || !promptSets[0].systemPrompt.trim()}
              sx={{ mr: 1 }}
            >
              {isGettingPromptIdeas ? (
                <>
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                  Getting Feedback...
                </>
              ) : 'Get Prompt Feedback'}
            </Button>
          </Box>
        </Box>

        {/* Display prompt improvement ideas */}
        {promptIdeas && (
          <Paper elevation={1} sx={{ p: 3, mb: 3, mt: 2, bgcolor: '#f8f9fa' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" gutterBottom>
                <LightbulbIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#FFC107' }} />
                Prompt Feedback
              </Typography>
              <Box>
                <IconButton size="small" onClick={() => setPromptIdeas(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Typography 
              variant="body1" 
              sx={{ 
                whiteSpace: 'pre-line',
                fontSize: '0.95rem',
                lineHeight: 1.7,
                maxHeight: '400px',
                overflowY: 'auto',
                p: 1
              }}
            >
              {promptIdeas}
            </Typography>
          </Paper>
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
            <Box textAlign="center" py={3}>
              <CircularProgress />
              <Typography variant="h6" sx={{ mt: 2 }}>
                {currentProcessingModel === 'all models' 
                  ? `${processingStep} (Processing all models simultaneously)` 
                  : `${processingStep} ${currentProcessingModel ? `with ${currentProcessingModel}` : ''}`}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {currentProcessingModel === 'all models' 
                  ? `Querying ${(selectedModels || []).length} models in parallel...` 
                  : 'Processing...'}
              </Typography>
            </Box>
            
            <Box sx={{ mt: 2 }}>
              {(selectedModels || []).map(model => (
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
                      bgcolor: currentProcessingModel === model ? 'primary.main' : (Object.keys(responses || {}).includes(model) ? 'success.main' : 'grey.300')
                    }}
                  >
                    {currentProcessingModel === model && <CircularProgress size={16} color="inherit" />}
                  </Box>
                  <Typography 
                    variant="body2" 
                    color={currentProcessingModel === model ? 'primary' : (Object.keys(responses || {}).includes(model) ? 'success.main' : 'textSecondary')}
                    sx={{ fontWeight: currentProcessingModel === model ? 'bold' : 'normal' }}
                  >
                    {model}
                    {currentProcessingModel === model && ' (processing...'}
                    {(currentProcessingModel === model || Object.keys(responses || {}).includes(model)) && 
                      ` ${formatElapsedTime(elapsedTimes[model] || 0)}`}
                    {currentProcessingModel === model && ')'}
                    {Object.keys(responses || {}).includes(model) && ` (completed in ${formatElapsedTime(elapsedTimes[model] || 0)})`}
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