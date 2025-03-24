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
  Slider,
  Stack,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import { createLlmInstance } from '../utils/apiServices';
import { ParallelLLMProcessor } from '../utils/parallelLLMProcessor';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { v4 as uuidv4 } from 'uuid';

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
  
  // Add parallel progress state
  const [parallelProgress, setParallelProgress] = useState({
    completed: 0,
    pending: 0,
    total: 0,
    models: {}
  });
  
  // Add progressData and processingStartTime state for parallel processing
  const [progressData, setProgressData] = useState({
    current: 0,
    total: 0,
    message: '',
    detailedStatus: []
  });
  
  const [processingStartTime, setProcessingStartTime] = useState(null);
  const [responseMetrics, setResponseMetrics] = useState({});
  const [activeTab, setActiveTab] = useState('query');

  // Reference to the file input element
  const fileInputRef = useRef(null);

  // Add new state for expanded prompt set and prompt
  const [expandedPromptSet, setExpandedPromptSet] = useState(null);
  const [expandedPrompt, setExpandedPrompt] = useState('');
  const [expandedQueryText, setExpandedQueryText] = useState('');
  
  // Handler for processor progress updates
  const handleProcessorProgress = (progressInfo) => {
    console.log("Processor progress update:", progressInfo);
    
    if (!progressInfo) return;
    
    // Update progress data
    setProgressData(prevData => ({
      ...prevData,
      message: progressInfo.step || prevData.message,
      detailedStatus: [
        ...(prevData.detailedStatus || []),
        { 
          model: progressInfo.model || 'global',
          step: progressInfo.step || 'Processing',
          status: progressInfo.status || 'pending',
          timestamp: new Date().toISOString()
        }
      ]
    }));
    
    // Update parallel progress if available
    if (progressInfo.progress) {
      setParallelProgress(progressInfo.progress);
    }
    
    // Update current processing model if available
    if (progressInfo.model) {
      setCurrentProcessingModel(progressInfo.model);
    }
    
    // Update processing step if available
    if (progressInfo.step) {
      setProcessingStep(progressInfo.step);
    }
  };

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

Format your response in a clear, structured way. Focus on actionable improvements and specific examples.`;
      
      const response = await llm.invoke(prompt);
      
      // Extract the relevant parts from the response
      const sections = response.split('\n\n').filter(section => 
        section.trim().toLowerCase().includes('improvement') || 
        section.trim().toLowerCase().includes('suggestion') ||
        section.trim().toLowerCase().includes('recommendation') ||
        section.trim().toLowerCase().includes('example')
      );
      
      // Format the extracted sections
      const formattedResponse = sections.map(section => {
        // Remove any section headers that might be too generic
        const cleanSection = section.replace(/^(improvements?|suggestions?|recommendations?|examples?):/i, '').trim();
        return cleanSection;
      }).join('\n\n');
      
      setPromptIdeas(formattedResponse);
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
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }
    
    if (selectedModels.length === 0) {
      setError('Please select at least one model');
      return;
    }
    
    if (selectedNamespaces.length === 0) {
      setError('Please select at least one namespace');
      return;
    }
    
    try {
      setIsProcessing(true);
      setError(null);
      setResponses({});
      setProcessingStep('Retrieving relevant documents');
      
      // Generate a unique query ID for cost tracking
      const queryId = uuidv4();
      
      // Create parallel processor for handling multiple models in parallel
      const processor = new ParallelLLMProcessor({
        onProgressUpdate: handleProgressUpdate
      });
      
      // Set up the models, prompts, and other parameters
      const response = await processor.processQuery({
        query,
        vectorStore,
        selectedModels,
        selectedNamespaces,
        promptSets,
        queryId // Add query ID for cost tracking
      });
      
      // Set the full response object in state
      setResponses(response);
      setCurrentProcessingModel(null);
      setProcessingStep('');
      
      // Create metrics for token usage, latency, etc.
      const metrics = {
        retrievalTime: response.metadata.retrievalTime
      };
      
      // Process model metrics
      for (const set of promptSets) {
        const setKey = `Set ${set.id}`;
        
        // Only process if this set exists in the response
        if (response.models[setKey]) {
          // Create a nested structure for this set
          if (!metrics[setKey]) {
            metrics[setKey] = {};
          }
          
          for (const model of selectedModels) {
            // Only process if we have results for this model
            if (response.models[setKey][model]) {
              const result = response.models[setKey][model];
              const tokenUsage = result.tokenUsage || {};
              
              // Store metrics in multiple formats for backward compatibility
              
              // Format 1: Composite key at top level (for ResponseComparison.js)
              metrics[`${setKey}-${model}`] = {
                model,
                promptSet: set.id,
                elapsedTime: result.elapsedTime,
                responseTime: result.elapsedTime, // Add responseTime alias
                tokenUsage: tokenUsage
              };
              
              // Format 2: Nested under set key (for newer components)
              metrics[setKey][model] = {
                model,
                promptSet: set.id,
                elapsedTime: result.elapsedTime,
                responseTime: result.elapsedTime, // Add responseTime alias
                tokenUsage: tokenUsage
              };
              
              // Format 3: Direct model key (for simpler lookups)
              metrics[model] = {
                model,
                promptSet: set.id,
                elapsedTime: result.elapsedTime,
                responseTime: result.elapsedTime, // Add responseTime alias
                tokenUsage: tokenUsage,
                set: setKey
              };
            }
          }
        }
      }
      
      // Add debug logging for metrics structure
      console.log("METRICS STRUCTURE:", {
        keys: Object.keys(metrics),
        topLevelKeys: Object.keys(metrics).filter(k => !k.includes('-')),
        setNestedKeys: promptSets.map(set => `Set ${set.id}`).filter(k => metrics[k] && typeof metrics[k] === 'object'),
        modelDirectKeys: selectedModels.filter(m => metrics[m])
      });
      
      // Collect system prompts for each model
      const systemPrompts = promptSets.reduce((acc, set) => {
        for (const model of selectedModels) {
          acc[`Set ${set.id}-${model}`] = set.systemPrompt;
        }
        return acc;
      }, {});
      
      // Call the onQuerySubmitted callback with all necessary data
      if (onQuerySubmitted) {
        onQuerySubmitted(
          response, 
          metrics, 
          query, 
          systemPrompts,
          {
            query,
            selectedModels,
            selectedNamespaces,
            promptSets: promptSets.map(set => ({ 
              id: set.id,
              systemPrompt: set.systemPrompt,
              temperature: set.temperature,
              models: selectedModels
            }))
          }
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
      setParallelProgress({
        completed: 0,
        pending: 0,
        total: 0,
        models: {}
      });
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

  const handleExpandPrompt = (set) => {
    setExpandedPromptSet(set);
    setExpandedPrompt(set.systemPrompt);
  };

  const handleSaveExpandedPrompt = () => {
    if (expandedPromptSet) {
      handlePromptSetChange(expandedPromptSet.id, 'systemPrompt', expandedPrompt);
      setExpandedPromptSet(null);
    }
  };

  const handleExpandQuery = () => {
    setExpandedQueryText(query);
    setExpandedQuery(true);
  };

  const handleSaveExpandedQuery = () => {
    setQuery(expandedQueryText);
    setExpandedQuery(false);
  };

  // Function to handle progress updates from the parallel processor
  const handleProgressUpdate = (progress) => {
    if (!progress) return;
    
    setCurrentProcessingModel(progress.model || 'all models');
    setProcessingStep(progress.step || 'Processing query');
    
    // Update parallel progress state
    setParallelProgress(prev => {
      const newModels = { ...prev.models };
      
      // Update model status
      if (progress.model) {
        newModels[progress.model] = {
          status: progress.status || 'pending',
          timestamp: Date.now()
        };
      }
      
      // Calculate completed count
      const completedCount = Object.values(newModels).filter(m => m.status === 'completed').length;
      
      return {
        ...prev,
        completed: completedCount,
        models: newModels
      };
    });
  };

  // Execute query via the parallel processor
  const processParallelQuery = async () => {
    if (!query || !vectorStore) return;
    
    // Generate a unique ID for this query to track costs
    const queryId = `query-${Date.now()}`;
    console.log(`Generated query ID for cost tracking: ${queryId}`);

    try {
      setIsProcessing(true);
      setProgressData({
        current: 0,
        total: selectedModels.length,
        message: 'Retrieving relevant documents...',
        detailedStatus: []
      });
      
      // Record processing start times
      const currentTime = Date.now();
      setProcessingStartTime(currentTime);
      
      // Create a parallel processor with progress callback
      const processor = new ParallelLLMProcessor({
        onProgressUpdate: handleProcessorProgress
      });
      
      // Process selected models in parallel with different prompt sets
      const processorResults = await processor.processQuery({
        query,
        vectorStore,
        selectedModels,
        selectedNamespaces,
        promptSets,
        queryId // Pass the queryId for cost tracking
      });
      
      console.log("Processor results:", processorResults);
      
      // Extract metrics for each model and prompt set
      const metrics = {};
      
      // Track whether we've extracted metrics from any model yet
      let hasExtractedMetrics = false;
      
      // UPDATED: Metrics handling for new nested structure
      if (processorResults.models) {
        console.log("Processing metrics from new nested structure");
        
        // For each prompt set
        Object.entries(processorResults.models).forEach(([setKey, setModels]) => {
          // Create a container for this set's metrics
          metrics[setKey] = {};
          
          // Process each model in this set
          Object.entries(setModels).forEach(([modelKey, modelResponse]) => {
            console.log(`Extracting metrics for ${modelKey} in ${setKey}`);
            
            // Calculate elapsed time
            const elapsedTime = modelResponse.elapsedTime || 0;
            
            // Extract token usage
            let tokenUsage = modelResponse.tokenUsage || {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              estimated: true
            };
            
            // If token usage is missing entirely, estimate it from the response text
            if (!tokenUsage || (tokenUsage.totalTokens === 0 && !tokenUsage.prompt_tokens && !tokenUsage.completion_tokens)) {
              console.log(`No token usage found for ${modelKey}, estimating from response text`);
              const responseText = modelResponse.text || '';
              const estimatedTokens = Math.round(responseText.length / 4);
              
              tokenUsage = {
                promptTokens: Math.floor(estimatedTokens / 2),
                completionTokens: Math.ceil(estimatedTokens / 2),
                totalTokens: estimatedTokens,
                estimated: true
              };
            }
            
            // Normalize token usage format
            const normalizedTokenUsage = {
              input: tokenUsage.promptTokens || tokenUsage.prompt_tokens || 0,
              output: tokenUsage.completionTokens || tokenUsage.completion_tokens || 0,
              total: tokenUsage.totalTokens || tokenUsage.total_tokens || 
                    (tokenUsage.promptTokens + tokenUsage.completionTokens) || 
                    (tokenUsage.prompt_tokens + tokenUsage.completion_tokens) || 0,
              estimated: tokenUsage.estimated || false
            };
            
            // Store metrics in multiple formats for compatibility
            // 1. Under the set name with model as key
            metrics[setKey][modelKey] = {
              responseTime: elapsedTime,
              elapsedTime: elapsedTime,
              tokenUsage: normalizedTokenUsage
            };
            
            // 2. Using combined key format
            const combinedKey = `${setKey}-${modelKey}`;
            metrics[combinedKey] = {
              responseTime: elapsedTime,
              elapsedTime: elapsedTime,
              tokenUsage: normalizedTokenUsage
            };
            
            // 3. For direct model key access
            metrics[modelKey] = {
              responseTime: elapsedTime,
              elapsedTime: elapsedTime,
              tokenUsage: normalizedTokenUsage
            };
            
            hasExtractedMetrics = true;
          });
        });
        
        // Also save metadata in metrics
        if (processorResults.metadata) {
          metrics.metadata = processorResults.metadata;
        }
      } 
      // Legacy format handling
      else {
        console.log("Processing metrics from legacy format");
        
        Object.keys(processorResults).forEach(key => {
          // Skip metadata keys
          if (key === 'query' || key === 'retrievalTime') {
            metrics[key] = processorResults[key];
            return;
          }
          
          // Handle prompt set formats
          if (key.startsWith('Set ') && typeof processorResults[key] === 'object') {
            const setKey = key;
            const setContent = processorResults[key];
            
            // Create a container for this set
            metrics[setKey] = {};
            
            // Process models in this set
            Object.keys(setContent).forEach(modelKey => {
              // Skip non-model properties
              if (modelKey === 'query' || modelKey === 'retrievalTime') {
                metrics[`${setKey}.${modelKey}`] = setContent[modelKey];
                return;
              }
              
              const modelResponse = setContent[modelKey];
              if (modelResponse) {
                // Calculate elapsed time
                const elapsedTime = modelResponse.elapsedTime || 0;
                
                // Extract token usage
                let tokenUsage = modelResponse.tokenUsage || {
                  promptTokens: 0,
                  completionTokens: 0,
                  totalTokens: 0,
                  estimated: true
                };
                
                // If token usage is missing, estimate it from the response text
                if (!tokenUsage || !tokenUsage.totalTokens) {
                  const responseText = modelResponse.text || '';
                  const estimatedTokens = Math.round(responseText.length / 4);
                  
                  tokenUsage = {
                    promptTokens: Math.floor(estimatedTokens / 2),
                    completionTokens: Math.ceil(estimatedTokens / 2),
                    totalTokens: estimatedTokens,
                    estimated: true
                  };
                }
                
                // Store in multiple formats for compatibility
                metrics[setKey][modelKey] = {
                  responseTime: elapsedTime,
                  elapsedTime: elapsedTime,
                  tokenUsage: tokenUsage
                };
                
                // Combined key for direct access
                metrics[`${setKey}-${modelKey}`] = {
                  responseTime: elapsedTime,
                  elapsedTime: elapsedTime,
                  tokenUsage: tokenUsage
                };
                
                hasExtractedMetrics = true;
              }
            });
          } 
          // Direct model responses
          else {
            const modelResponse = processorResults[key];
            if (typeof modelResponse === 'object') {
              const elapsedTime = modelResponse.elapsedTime || 0;
              const tokenUsage = modelResponse.tokenUsage || {
                estimated: true,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
              };
              
              metrics[key] = {
                responseTime: elapsedTime,
                elapsedTime: elapsedTime,
                tokenUsage: tokenUsage
              };
              
              hasExtractedMetrics = true;
            }
          }
        });
      }
      
      console.log("Final metrics object:", metrics);
      
      // If no metrics were extracted, add default ones
      if (!hasExtractedMetrics) {
        console.warn("No metrics were extracted, creating defaults");
        
        // Create default metrics for each model
        selectedModels.forEach(model => {
          metrics[model] = {
            responseTime: 1000, // Default 1 second
            elapsedTime: 1000,
            tokenUsage: {
              promptTokens: 500,
              completionTokens: 500,
              totalTokens: 1000,
              estimated: true
            }
          };
        });
      }
      
      // Set responses and metrics in state
      setResponses(processorResults);
      setResponseMetrics(metrics);
      
      // Switch to comparison view
      setActiveTab('comparison');
      
      // Log completion
      console.log("Query processing completed successfully");
      
    } catch (error) {
      console.error("Error processing parallel query:", error);
      setError(error.message);
    } finally {
      setIsProcessing(false);
    }
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
            <MenuItem value="azure-gpt-4o-mini">Azure GPT-4o Mini</MenuItem>
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

        <Box sx={{ position: 'relative', mb: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            label="Your Question"
            value={query}
            onChange={handleQueryChange}
            disabled={isProcessing}
            InputProps={{
              endAdornment: (
                <Tooltip title="Expand editor">
                  <IconButton
                    size="small"
                    onClick={handleExpandQuery}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                  >
                    <FullscreenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ),
            }}
          />
        </Box>

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
              
              <Box sx={{ position: 'relative', mb: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={6}
                  label="System Prompt"
                  value={set.systemPrompt}
                  onChange={(e) => handlePromptSetChange(set.id, 'systemPrompt', e.target.value)}
                  disabled={isProcessing}
                  InputProps={{
                    endAdornment: (
                      <Tooltip title="Expand editor">
                        <IconButton
                          size="small"
                          onClick={() => handleExpandPrompt(set)}
                          sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                          <FullscreenIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ),
                  }}
                />
              </Box>
              
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
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
            
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => {
                  if (promptSets[0]) {
                    handlePromptSetChange(promptSets[0].id, 'systemPrompt', promptIdeas);
                    setPromptIdeas(null);
                  }
                }}
                startIcon={<SaveIcon />}
              >
                Apply to Current Set
              </Button>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => {
                  const newSet = {
                    id: promptSets.length + 1,
                    systemPrompt: promptIdeas,
                    temperature: 0
                  };
                  setPromptSets(prev => [...prev, newSet]);
                  setPromptIdeas(null);
                }}
                startIcon={<AddIcon />}
              >
                Create New Set
              </Button>
            </Box>

            <Typography 
              variant="body1" 
              sx={{ 
                whiteSpace: 'pre-line',
                fontSize: '0.95rem',
                lineHeight: 1.7,
                maxHeight: '400px',
                overflowY: 'auto',
                p: 2,
                bgcolor: 'white',
                borderRadius: 1,
                border: '1px solid #e0e0e0'
              }}
            >
              {promptIdeas}
            </Typography>

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="text"
                color="primary"
                onClick={() => setPromptIdeas(null)}
                startIcon={<CloseIcon />}
              >
                Close
              </Button>
            </Box>
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
                  ? `Querying ${selectedModels.length * promptSets.length} models in parallel...` 
                  : 'Processing...'}
              </Typography>
            </Box>
            
            {localStorage.getItem('useParallelProcessing') === 'true' ? (
              <Paper 
                elevation={1} 
                sx={{ 
                  mt: 2, 
                  p: 2, 
                  width: '100%', 
                  maxWidth: 600,
                  border: '1px dashed #2196f3',
                  bgcolor: 'rgba(33, 150, 243, 0.05)'
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#2196f3' }}>
                  <span role="img" aria-label="Parallel">⚡</span> Parallel Processing Active
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                  {parallelProgress.completed > 0 
                    ? `${parallelProgress.completed} of ${parallelProgress.total} models processed simultaneously`
                    : 'All models are being processed simultaneously for faster results.'}
                </Typography>
                
                {/* Progress bar */}
                {parallelProgress.total > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={(parallelProgress.completed / parallelProgress.total) * 100}
                      sx={{ 
                        height: 10,
                        borderRadius: 5,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: '#2196f3'
                        }
                      }} 
                    />
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, textAlign: 'right' }}>
                      {Math.round((parallelProgress.completed / parallelProgress.total) * 100)}% complete
                    </Typography>
                  </Box>
                )}
                
                {/* Model status chips */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, maxHeight: 120, overflowY: 'auto' }}>
                  {[...new Set(Object.keys(parallelProgress.models))].map(model => {
                    const data = parallelProgress.models[model];
                    return (
                      <Chip 
                        key={model}
                        label={model} 
                        size="small"
                        color={data.status === 'completed' ? 'success' : 'primary'}
                        variant={data.status === 'completed' ? 'filled' : 'outlined'}
                        sx={{ 
                          animation: data.status === 'completed' ? 'none' : 'pulse 1.5s infinite',
                          '@keyframes pulse': {
                            '0%': { opacity: 0.6 },
                            '50%': { opacity: 1 },
                            '100%': { opacity: 0.6 }
                          }
                        }}
                      />
                    );
                  })}
                </Box>
              </Paper>
            ) : (
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
            )}
          </Box>
        )}
      </Box>

      {error && (
        <Box mt={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {/* Add the query dialog */}
      <Dialog
        open={expandedQuery}
        onClose={() => setExpandedQuery(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Edit Your Question
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={15}
            label="Your Question"
            value={expandedQueryText}
            onChange={(e) => setExpandedQueryText(e.target.value)}
            disabled={isProcessing}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpandedQuery(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveExpandedQuery}
            variant="contained"
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add the dialog component */}
      <Dialog
        open={!!expandedPromptSet}
        onClose={() => setExpandedPromptSet(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Edit System Prompt - Set {expandedPromptSet?.id}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={15}
            label="System Prompt"
            value={expandedPrompt}
            onChange={(e) => setExpandedPrompt(e.target.value)}
            disabled={isProcessing}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpandedPromptSet(null)}>Cancel</Button>
          <Button 
            onClick={handleSaveExpandedPrompt}
            variant="contained"
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QueryInterface; 