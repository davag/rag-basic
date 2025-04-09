import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Typography, 
  Box, 
  TextField, 
  Button, 
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Link,
  Stack,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Slider,
  Divider
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import { createLlmInstance } from '../utils/apiServices';
import { ParallelLLMProcessor } from '../utils/parallelLLMProcessor';
import { v4 as uuidv4 } from 'uuid';
import { vendorColors, defaultModels, apiConfig, getAvailableModelsBasedOnKeys } from '../config/llmConfig';
import InfoIcon from '@mui/icons-material/Info';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context.
If the answer is not in the context, say that you don't know. 
Do not make up information that is not in the context.
Provide detailed reasoning and comprehensive answers when possible, exploring the nuances of the question.
If there are multiple possible interpretations or perspectives in the context, discuss them.
Use up to 4000 tokens if necessary to fully explain complex topics.`;

// Helper function to calculate cost per 1K tokens
const calculateCostPer1K = (model) => {
  return ((model.input || 0) + (model.output || 0)) / 1000;
};

const QueryInterface = ({ vectorStore, namespaces = [], onQuerySubmitted, isProcessing, setIsProcessing, initialState }) => {
  /**
   * IMPORTANT: About "Unused" Variables and Functions
   * 
   * This component has several state variables and functions that may appear
   * unused but are actually used in specific conditions or are kept for:
   * 
   * 1. Future extensibility: Some functions are intended for upcoming features
   * 2. Event handlers: Connected to JSX but not directly referenced elsewhere
   * 3. Component APIs: Functions may be passed as props to child components 
   * 4. Integration points: Used in the wider application architecture
   * 
   * Before removing any seemingly unused code, verify its purpose thoroughly.
   */

  // Component state
  const [currentProcessingModel, setCurrentProcessingModel] = useState(null);
  const [error, setError] = useState(null);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedModels, setSelectedModels] = useState(['gpt-4o-mini']);
  const [promptSets, setPromptSets] = useState([
    {
      id: 1,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      temperature: 0
    }
  ]);
  
  const [processingStep, setProcessingStep] = useState('');
  const [responses, setResponses] = useState({});
  // eslint-disable-next-line no-unused-vars
  const [isGettingPromptIdeas, setIsGettingPromptIdeas] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [promptIdeas, setPromptIdeas] = useState(null);
  const [expandedQuery, setExpandedQuery] = useState(false);
  const [selectedNamespaces, setSelectedNamespaces] = useState(['default']);
  const [processingStartTimes] = useState({});
  const [elapsedTimes, setElapsedTimes] = useState({});
  const [timerInterval, setTimerInterval] = useState(null);
  
  // Add parallel progress state
  const [parallelProgress, setParallelProgress] = useState({
    completed: 0,
    pending: 0,
    total: 0,
    models: {}
  });
  
  // State for tracking progress
  // eslint-disable-next-line no-unused-vars
  const [progressData, setProgressData] = useState({
    current: 0,
    total: 0,
    message: '',
    detailedStatus: []
  });
  
  // eslint-disable-next-line no-unused-vars
  const [processingStartTime, setProcessingStartTime] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [responseMetrics, setResponseMetrics] = useState({});
  // eslint-disable-next-line no-unused-vars
  const [activeTab, setActiveTab] = useState('query');

  // Reference to the file input element
  const fileInputRef = useRef(null);

  // Add new state for expanded prompt set and prompt
  const [expandedPromptSet, setExpandedPromptSet] = useState(null);
  const [expandedPrompt, setExpandedPrompt] = useState('');
  const [expandedQueryText, setExpandedQueryText] = useState('');
  
  // Get available models based on keys and filter for CHAT models
  const availableChatModels = useMemo(() => {
    // Instead of filtering based on keys, get all active chat models
    const chatModels = Object.entries(defaultModels)
      .filter(([_, model]) => model.active && model.type === 'chat')
      .map(([modelId]) => modelId);
    
    console.log('[QueryInterface] Available active chat models:', chatModels);
    return chatModels;
  }, []);

  // Determine which model APIs are configured
  const isOpenAIConfigured = !!(apiConfig.openAI && apiConfig.openAI.apiKey);
  const isAnthropicConfigured = !!(apiConfig.anthropic && apiConfig.anthropic.apiKey);
  const isAzureConfigured = !!(apiConfig.azure && apiConfig.azure.apiKey && apiConfig.azure.endpoint);
  const isOllamaConfigured = !!(apiConfig.ollama && apiConfig.ollama.endpoint);

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
      // Make sure we preserve model status when updating progress
      const updatedProgress = {
        ...progressInfo.progress,
        models: { ...parallelProgress.models, ...(progressInfo.progress.models || {}) }
      };
      setParallelProgress(updatedProgress);
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
      
      // Filter out any models that aren't currently available
      const validModels = (cleanState.selectedModels || []).filter(modelId => {
        const isValid = availableChatModels.includes(modelId);
        if (!isValid) {
          console.warn(`Model ${modelId} from saved configuration is no longer available`);
        }
        return isValid;
      });
      
      // Set selected models with a fallback, ensuring only valid models are included
      setSelectedModels(
        validModels.length > 0 ? validModels : ['gpt-4o-mini']
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
  }, [initialState, availableChatModels]);

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
    if (!ms) return '0s';
    
    // Format to include minutes if applicable
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Handle prompt set changes
  const handlePromptSetChange = (id, field, value) => {
    setPromptSets(prev => prev.map(set => 
      set.id === id ? { ...set, [field]: value } : set
    ));
  };

  // Handle namespace change
  // eslint-disable-next-line no-unused-vars
  const handleNamespaceChange = (event) => {
    setSelectedNamespaces(event.target.value);
  };

  // Get prompt ideas from the LLM
  // eslint-disable-next-line no-unused-vars
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

  // Add a new prompt set
  // eslint-disable-next-line no-unused-vars
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

  // Remove a prompt set
  // eslint-disable-next-line no-unused-vars
  const handleRemovePromptSet = (id) => {
    if (promptSets.length > 1) {
      setPromptSets(prev => prev.filter(set => set.id !== id));
    }
  };

  const submitQuery = async () => {
    // Prevent submission if already processing
    if (isProcessing) return;
    
    // Validate input
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }
    
    // Filter out any invalid models before processing
    const validModels = selectedModels.filter(modelId => {
      const isValid = availableChatModels.includes(modelId);
      if (!isValid) {
        console.warn(`Removing invalid model ${modelId} from query processing`);
      }
      return isValid;
    });
    
    if (validModels.length === 0) {
      setError('Please select at least one valid model');
      console.warn('No valid models selected in QueryInterface, aborting query processing');
      return;
    }
    
    // Update selectedModels to only include valid ones
    setSelectedModels(validModels);
    
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
              
              // Extract API-provided cost if available
              const apiProvidedCost = result.cost !== undefined ? Number(result.cost) :
                                      result.rawResponse?.cost !== undefined ? Number(result.rawResponse.cost) : null;
              
              // Track if this cost should be used for display in the UI (comes from API)
              const useForDisplay = result.useForDisplay === true || result.rawResponse?.useForDisplay === true;
              if (useForDisplay) {
                console.log(`[COST INFO] Using API-reported cost for UI display: $${apiProvidedCost} for ${model}`);
              }

              // Helper function to handle elapsed time
              const getElapsedTime = (time, timeType) => {
                if (!time) return 0;
                
                // If explicit type is provided, trust it
                if (timeType === 'duration') {
                  console.log(`[TIME DEBUG] Using explicit duration: ${time}ms`);
                  return time;
                }
                
                // If it's a timestamp (greater than 24 hours in ms), convert to elapsed time
                if (time > 24 * 60 * 60 * 1000) {
                  console.log(`[TIME DEBUG] Converting timestamp ${time} to elapsed time: ${Date.now() - time}ms`);
                  return Date.now() - time;
                }
                
                console.log(`[TIME DEBUG] Using as-is duration: ${time}ms`);
                return time;
              };

              const elapsedTime = getElapsedTime(
                result.elapsedTime, 
                result.elapsedTimeType || (result.rawResponse && result.rawResponse.elapsedTimeType)
              );
              
              // Format 1: Composite key at top level (for ResponseComparison.js)
              metrics[`${setKey}-${model}`] = {
                model,
                promptSet: set.id,
                elapsedTime,
                responseTime: elapsedTime, // Add responseTime alias
                tokenUsage: tokenUsage,
                calculatedCost: apiProvidedCost, // Add API-provided cost when available
                useForDisplay // Flag from server indicating this cost should be used for display
              };
              
              // Format 2: Nested under set key (for newer components)
              metrics[setKey][model] = {
                model,
                promptSet: set.id,
                elapsedTime,
                responseTime: elapsedTime, // Add responseTime alias
                tokenUsage: tokenUsage,
                calculatedCost: apiProvidedCost, // Add API-provided cost when available
                useForDisplay // Flag from server indicating this cost should be used for display
              };
              
              // Format 3: Direct model key (for simpler lookups)
              metrics[model] = {
                model,
                promptSet: set.id,
                elapsedTime,
                responseTime: elapsedTime, // Add responseTime alias
                tokenUsage: tokenUsage,
                set: setKey,
                calculatedCost: apiProvidedCost, // Add API-provided cost when available
                useForDisplay // Flag from server indicating this cost should be used for display
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
      // Enhanced error handling for common issues
      let errorMessage = error.message;
      
      // Special handling for common errors
      if (error.message?.includes('Rate limit')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
      }
      else if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        errorMessage = 'Request timed out. Please try again or check your connection.';
      }
      else if (error.message?.includes('Authentication') || error.message?.includes('API key')) {
        errorMessage = 'Authentication error. Please check your API keys and permissions.';
      }
      else if (error.message?.includes('vector store')) {
        errorMessage = 'Error accessing the vector store. Please check if your documents are properly indexed.';
      }
      else if (error.message?.includes('llm')) {
        errorMessage = 'Error communicating with the language model. Please check your model configuration.';
      }
      else {
        errorMessage = `Error: ${error.message || 'An unexpected error occurred. Please try again.'}`;
      }
      
      setError(errorMessage);
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
        
        // Filter out any invalid models from the imported configuration
        const validModels = (config.selectedModels || []).filter(modelId => {
          const isValid = availableChatModels.includes(modelId);
          if (!isValid) {
            console.warn(`Model ${modelId} from imported configuration is not available`);
          }
          return isValid;
        });
        
        // Update state with imported configuration
        if (config.query) setQuery(config.query);
        // Only set valid models, fallback to default if none are valid
        setSelectedModels(validModels.length > 0 ? validModels : ['gpt-4o-mini']);
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

  // Handle prompt expansion
  // eslint-disable-next-line no-unused-vars
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

  // Handle query expansion
  // eslint-disable-next-line no-unused-vars
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
      
      // Use the total from progress.progress if available, otherwise use the number of models or previous total
      const total = progress.progress?.total || 
                   (selectedModels.length * promptSets.length) || 
                   prev.total || 
                   Object.keys(newModels).length;
      
      return {
        ...prev,
        completed: completedCount,
        total: total, // Set the total from progress data
        models: newModels
      };
    });
  };

  // Legacy function - currently unused but kept for reference
  // eslint-disable-next-line no-unused-vars
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
      
      // Enhanced error handling for common issues
      let errorMessage = error.message;
      
      // Special handling for common errors
      if (error.message?.includes('Rate limit')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
      }
      else if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        errorMessage = 'Request timed out. Please try again or check your connection.';
      }
      else if (error.message?.includes('Authentication') || error.message?.includes('API key')) {
        errorMessage = 'Authentication error. Please check your API keys and permissions.';
      }
      else if (error.message?.includes('vector store')) {
        errorMessage = 'Error accessing the vector store. Please check if your documents are properly indexed.';
      }
      else if (error.message?.includes('llm')) {
        errorMessage = 'Error communicating with the language model. Please check your model configuration.';
      }
      else {
        errorMessage = `Error: ${error.message || 'An unexpected error occurred. Please try again.'}`;
      }
      
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a helper method to ensure o3-mini content is properly displayed
  const extractContentFromResponse = (modelId, responseObj) => {
    // If it's already a string, just return it
    if (typeof responseObj === 'string') {
      return responseObj;
    }
    
    // Handle o3-mini specially
    if (modelId.includes('o3-mini')) {
      console.log(`[DISPLAY] Processing o3-mini response:`, JSON.stringify(responseObj, null, 2));
      
      // First, check for standard responses
      if (responseObj?.text) {
        console.log(`[DISPLAY] Found o3-mini response in .text:`, responseObj.text.substring(0, 100) + '...');
        return responseObj.text;
      }
      
      // Check for the exact format shown in the user query
      if (responseObj.id && responseObj.choices && responseObj.choices.length > 0) {
        const choice = responseObj.choices[0];
        if (choice.message?.content) {
          const content = choice.message.content;
          console.log(`[DISPLAY] Found o3-mini direct response in choices[0].message.content:`, 
                     content.substring(0, 100) + '...');
          return content;
        }
      }
      
      // Check for raw response object with choices
      if (responseObj?.choices && responseObj.choices.length > 0) {
        const choice = responseObj.choices[0];
        const content = choice.message?.content;
        if (content) {
          console.log(`[DISPLAY] Found o3-mini response in .choices[0].message.content:`, content.substring(0, 100) + '...');
          return content;
        }
        
        // Sometimes o3-mini has delta content
        if (choice.delta?.content) {
          console.log(`[DISPLAY] Found o3-mini response in .choices[0].delta.content:`, choice.delta.content.substring(0, 100) + '...');
          return choice.delta.content;
        }
        
        // Check for finish_reason - it might indicate why content is missing
        if (choice.finish_reason === 'length') {
          return `[The response was truncated because it reached the token limit. Try a shorter query or a different model.]`;
        }
      }
      
      // Check for rawResponse which might contain the actual data
      if (responseObj?.rawResponse) {
        console.log(`[DISPLAY] Looking deeper in rawResponse:`, JSON.stringify(responseObj.rawResponse, null, 2));
        
        // Check for the exact format shown in the user query
        if (responseObj.rawResponse.id && responseObj.rawResponse.choices && responseObj.rawResponse.choices.length > 0) {
          const choice = responseObj.rawResponse.choices[0];
          if (choice.message?.content) {
            const content = choice.message.content;
            console.log(`[DISPLAY] Found o3-mini response in rawResponse.choices[0].message.content:`, 
                       content.substring(0, 100) + '...');
            return content;
          }
        }
        
        // Check for completion_tokens_details in the usage data which is unique to o3-mini
        if (responseObj.rawResponse.usage?.completion_tokens_details) {
          const details = responseObj.rawResponse.usage.completion_tokens_details;
          
          // The key pattern: o3-mini sometimes has reasoning_tokens > 0 but accepted_prediction_tokens = 0
          if (details.reasoning_tokens > 0 && details.accepted_prediction_tokens === 0) {
            console.log(`[DISPLAY] Found o3-mini with reasoning (${details.reasoning_tokens} tokens) but no accepted prediction`);
            return `[The o3-mini model generated reasoning (${details.reasoning_tokens} tokens) but didn't produce a final answer. This is a known limitation of this model. Try a different model like azure-gpt-4o-mini.]`;
          }
        }
        
        // Try to find content in rawResponse
        if (responseObj.rawResponse.choices?.[0]?.message?.content) {
          const content = responseObj.rawResponse.choices[0].message.content;
          console.log(`[DISPLAY] Found content in rawResponse:`, content.substring(0, 100) + '...');
          return content;
        }
      }
      
      // If we found some strings, use those
      if (responseObj?.content) {
        console.log(`[DISPLAY] Found o3-mini response in .content:`, responseObj.content.substring(0, 100) + '...');
        return responseObj.content;
      }
      
      // Try parsing the full response object as JSON to look for content fields
      try {
        const objStr = JSON.stringify(responseObj);
        if (objStr.includes('"content"')) {
          // Try to extract content from any nested object
          const matches = objStr.match(/"content"\s*:\s*"([^"]+)"/);
          if (matches && matches[1]) {
            const extractedContent = matches[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            console.log('[DISPLAY] Extracted o3-mini content from JSON string:', extractedContent.substring(0, 100) + '...');
            return extractedContent;
          }
        }
      } catch (e) {
        console.error('[DISPLAY] Error parsing o3-mini response:', e);
      }
    }
    
    // Default extraction logic for non-o3-mini models
    if (responseObj?.text) {
      return responseObj.text;
    }
    
    if (responseObj?.content) {
      return responseObj.content;
    }
    
    // Attempt to stringify for raw objects
    if (typeof responseObj === 'object') {
      try {
        return JSON.stringify(responseObj, null, 2);
      } catch (e) {
        console.error('Error stringifying response:', e);
        return 'Error processing response';
      }
    }
    
    return responseObj?.toString() || 'No content found';
  };
  
  // Update the displayResponse method to use the helper
  // eslint-disable-next-line no-unused-vars
  const displayResponse = (modelId, response) => {
    console.log(`[DISPLAY] displayResponse called for ${modelId}`, response);
    if (!response) return '';
    
    // Extract content using the helper function
    const content = extractContentFromResponse(modelId, response);
    console.log(`[DISPLAY] extracted content for ${modelId}:`, content ? content.substring(0, 100) + '...' : 'empty');
    
    // Handle special case of missing content for o3-mini
    if (!content && modelId.includes('o3-mini')) {
      console.log(`[DISPLAY] o3-mini content is missing, providing fallback message`);
      // Check if there's any indication of token usage
      if (response.usage || response.rawResponse?.usage) {
        const usage = response.usage || response.rawResponse?.usage || {};
        return `[The o3-mini model processed your query but returned an empty response. ${usage.completion_tokens || 0} tokens were generated. Try a different model.]`;
      }
      return '[The o3-mini model did not return content. Try using azure-gpt-4o-mini instead.]';
    }
    
    // Formats citation markers in the text to be highlighted
    const formattedText = content.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
      return `<span class="citation-marker">[${p1}]</span>`;
    });
    
    return formattedText;
  };

  // Add an effect to validate Azure models selections
  useEffect(() => {
    // Check if any Azure OpenAI models are selected
    const hasAzureModels = selectedModels.some(model => model.startsWith('azure-'));
    
    // If Azure models are selected, check for required configuration
    if (hasAzureModels) {
      const azureApiKey = apiConfig.azure.apiKey;
      const azureEndpoint = apiConfig.azure.endpoint;
      
      if (!azureApiKey || !azureEndpoint) {
        console.warn(
          'Azure OpenAI models selected but API key or endpoint missing. ' +
          'Configure these in LLM Settings or add REACT_APP_AZURE_OPENAI_API_KEY and ' +
          'REACT_APP_AZURE_OPENAI_ENDPOINT to your environment variables.'
        );
        
        // Only show warning if no error exists already
        if (!error) {
          setError(
            'Azure OpenAI configuration incomplete. Please set up Azure OpenAI API key and endpoint ' +
            'in the LLM Settings page or your environment variables.'
          );
        }
      } else {
        // Clear any Azure-related errors if configuration is valid
        if (error && error.includes('Azure OpenAI configuration')) {
          setError(null);
        }
      }
    }
  }, [selectedModels, error]);

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

        <Box sx={{ flexGrow: 1, p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Step 3: Query Your Documents
          </Typography>
          
          {/* Model Selection */}
          <Box mb={3}>
            <Typography variant="h6" gutterBottom>Select Models</Typography>
            <Paper elevation={1} sx={{ p: 2 }}>
              {/* OpenAI Models */}
              <Box mb={2}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: vendorColors['OpenAI'] }}>
                  OpenAI Models
                  {!isOpenAIConfigured && (
                    <Tooltip title="OpenAI API key not configured. Visit LLM Settings to set up.">
                      <span style={{ marginLeft: '8px', cursor: 'help' }}>⚠️</span>
                    </Tooltip>
                  )}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableChatModels
                    .filter(modelId => defaultModels[modelId]?.vendor === 'OpenAI')
                    .map(modelId => {
                      const model = defaultModels[modelId];
                      if (!model) return null;
                      return (
                        <Chip
                          key={modelId}
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <span>{modelId}</span>
                              {calculateCostPer1K(model) > 0 && (
                                <Typography 
                                  variant="caption" 
                                  color={selectedModels.includes(modelId) ? "text.secondary" : "text.secondary"}
                                  sx={{ ml: 0.5, opacity: 0.8, fontWeight: 500 }}
                                >
                                  ${calculateCostPer1K(model).toFixed(4)}
                                </Typography>
                              )}
                            </Box>
                          }
                          clickable
                          onClick={() => {
                            if (!isOpenAIConfigured) return;
                            const newSelected = selectedModels.includes(modelId)
                              ? selectedModels.filter(m => m !== modelId)
                              : [...selectedModels, modelId];
                            setSelectedModels(newSelected);
                          }}
                          color={selectedModels.includes(modelId) ? "default" : "default"}
                          disabled={isProcessing || !isOpenAIConfigured}
                          sx={{
                            bgcolor: selectedModels.includes(modelId) ? `${vendorColors['OpenAI']}12` : 'default',
                            borderColor: selectedModels.includes(modelId) ? vendorColors['OpenAI'] : '#e0e0e0',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            fontWeight: selectedModels.includes(modelId) ? 500 : 400,
                            boxShadow: selectedModels.includes(modelId) ? 1 : 0,
                            '& .MuiChip-label': { color: 'text.primary' },
                            '&:hover': { bgcolor: selectedModels.includes(modelId) ? `${vendorColors['OpenAI']}18` : '' },
                            opacity: !isOpenAIConfigured ? 0.6 : 1,
                          }}
                        />
                      );
                  })}
                  {availableChatModels.filter(modelId => defaultModels[modelId]?.vendor === 'OpenAI').length === 0 && isOpenAIConfigured && (
                    <Typography variant="caption" color="textSecondary">No active OpenAI chat models found in config.</Typography>
                  )}
                </Box>
              </Box>

              {/* Anthropic Models */}
              <Box mb={2}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: vendorColors['Anthropic'] }}>
                   Anthropic Models
                   {!isAnthropicConfigured && (
                     <Tooltip title="Anthropic API key not configured. Visit LLM Settings to set up.">
                       <span style={{ marginLeft: '8px', cursor: 'help' }}>⚠️</span>
                     </Tooltip>
                   )}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableChatModels
                    .filter(modelId => defaultModels[modelId]?.vendor === 'Anthropic')
                    .map(modelId => {
                       const model = defaultModels[modelId];
                       if (!model) return null;
                       return (
                         <Chip
                           key={modelId}
                           label={
                             <Box sx={{ display: 'flex', alignItems: 'center' }}>
                               <span>{modelId}</span>
                               {calculateCostPer1K(model) > 0 && (
                                 <Typography 
                                   variant="caption" 
                                   color={selectedModels.includes(modelId) ? "text.secondary" : "text.secondary"}
                                   sx={{ ml: 0.5, opacity: 0.8, fontWeight: 500 }}
                                 >
                                   ${calculateCostPer1K(model).toFixed(4)}
                                 </Typography>
                               )}
                             </Box>
                           }
                           clickable
                           onClick={() => {
                              if (!isAnthropicConfigured) return;
                              const newSelected = selectedModels.includes(modelId)
                                ? selectedModels.filter(m => m !== modelId)
                                : [...selectedModels, modelId];
                              setSelectedModels(newSelected);
                            }}
                           color={selectedModels.includes(modelId) ? "default" : "default"}
                           disabled={isProcessing || !isAnthropicConfigured}
                           sx={{
                             bgcolor: selectedModels.includes(modelId) ? `${vendorColors['Anthropic']}12` : 'default',
                             borderColor: selectedModels.includes(modelId) ? vendorColors['Anthropic'] : '#e0e0e0',
                             borderWidth: 1,
                             borderStyle: 'solid',
                             fontWeight: selectedModels.includes(modelId) ? 500 : 400,
                             boxShadow: selectedModels.includes(modelId) ? 1 : 0,
                             '& .MuiChip-label': { color: 'text.primary' },
                             '&:hover': { bgcolor: selectedModels.includes(modelId) ? `${vendorColors['Anthropic']}18` : '' },
                             opacity: !isAnthropicConfigured ? 0.6 : 1,
                           }}
                         />
                       );
                  })}
                  {availableChatModels.filter(modelId => defaultModels[modelId]?.vendor === 'Anthropic').length === 0 && isAnthropicConfigured && (
                     <Typography variant="caption" color="textSecondary">No active Anthropic chat models found in config.</Typography>
                  )}
                </Box>
              </Box>

              {/* Azure Models */}
              <Box mb={2}>
                 <Typography variant="subtitle2" sx={{ mb: 1, color: vendorColors['AzureOpenAI'] }}>
                   Azure OpenAI Models
                   {(!isAzureConfigured) && (
                     <Tooltip title="Azure API key or endpoint not configured. Visit LLM Settings to set up.">
                       <span style={{ marginLeft: '8px', cursor: 'help' }}>⚠️</span>
                     </Tooltip>
                   )}
                 </Typography>
                 <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                   {availableChatModels
                     .filter(modelId => defaultModels[modelId]?.vendor === 'AzureOpenAI')
                     .map(modelId => {
                       const model = defaultModels[modelId];
                       if (!model) return null;
                       return (
                         <Chip
                           key={modelId}
                           label={
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <span>{modelId}</span>
                                {calculateCostPer1K(model) > 0 && (
                                  <Typography 
                                    variant="caption" 
                                    color={selectedModels.includes(modelId) ? "text.secondary" : "text.secondary"}
                                    sx={{ ml: 0.5, opacity: 0.8, fontWeight: 500 }}
                                  >
                                    ${calculateCostPer1K(model).toFixed(4)}
                                  </Typography>
                                )}
                              </Box>
                            }
                           clickable
                           onClick={() => {
                              if (!isAzureConfigured) return;
                              const newSelected = selectedModels.includes(modelId)
                                ? selectedModels.filter(m => m !== modelId)
                                : [...selectedModels, modelId];
                              setSelectedModels(newSelected);
                            }}
                           color={selectedModels.includes(modelId) ? "default" : "default"}
                           disabled={isProcessing || !isAzureConfigured}
                           sx={{
                             bgcolor: selectedModels.includes(modelId) ? `${vendorColors['AzureOpenAI']}12` : 'default',
                             borderColor: selectedModels.includes(modelId) ? vendorColors['AzureOpenAI'] : '#e0e0e0',
                             borderWidth: 1,
                             borderStyle: 'solid',
                             fontWeight: selectedModels.includes(modelId) ? 500 : 400,
                             boxShadow: selectedModels.includes(modelId) ? 1 : 0,
                             '& .MuiChip-label': { color: 'text.primary' },
                             '&:hover': { bgcolor: selectedModels.includes(modelId) ? `${vendorColors['AzureOpenAI']}18` : '' },
                             opacity: (!isAzureConfigured) ? 0.6 : 1,
                           }}
                         />
                       );
                   })}
                   {availableChatModels.filter(modelId => defaultModels[modelId]?.vendor === 'AzureOpenAI').length === 0 && isAzureConfigured && (
                     <Typography variant="caption" color="textSecondary">No active Azure chat models found in config.</Typography>
                   )}
                 </Box>
              </Box>
              
              {/* Ollama Models */}
              <Box mb={2}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: vendorColors['Ollama'] }}>
                  Ollama Models
                  {!isOllamaConfigured && (
                    <Tooltip title="Ollama endpoint not set. Visit LLM Settings to configure it. Make sure you have Ollama installed and running.">
                      <span style={{ marginLeft: '8px', cursor: 'help' }}>⚠️</span>
                    </Tooltip>
                  )}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableChatModels
                    .filter(modelId => defaultModels[modelId]?.vendor === 'Ollama')
                    .map(modelId => {
                      const model = defaultModels[modelId];
                      if (!model) return null;
                      
                      return (
                        <Chip
                          key={modelId}
                          label={modelId}
                          clickable
                          onClick={() => {
                            if (!isOllamaConfigured) return;
                            const newSelected = selectedModels.includes(modelId)
                              ? selectedModels.filter(m => m !== modelId)
                              : [...selectedModels, modelId];
                            setSelectedModels(newSelected);
                          }}
                          color={selectedModels.includes(modelId) ? "default" : "default"}
                          disabled={isProcessing || !isOllamaConfigured}
                          sx={{
                            bgcolor: selectedModels.includes(modelId) ? `${vendorColors['Ollama']}12` : 'default',
                            borderColor: selectedModels.includes(modelId) ? vendorColors['Ollama'] : '#e0e0e0',
                            borderWidth: 1,
                            borderStyle: 'solid',
                            fontWeight: selectedModels.includes(modelId) ? 500 : 400,
                            boxShadow: selectedModels.includes(modelId) ? 1 : 0,
                            '& .MuiChip-label': { color: 'text.primary' },
                            '&:hover': { bgcolor: selectedModels.includes(modelId) ? `${vendorColors['Ollama']}18` : '' },
                            opacity: !isOllamaConfigured ? 0.4 : 1,
                          }}
                        />
                      );
                  })}
                  {availableChatModels.filter(modelId => defaultModels[modelId]?.vendor === 'Ollama').length === 0 && isOllamaConfigured && (
                    <Typography variant="caption" color="textSecondary">No active Ollama chat models found in config.</Typography>
                  )}
                </Box>
              </Box>

              {/* Selected models summary */}
              {selectedModels.length > 0 && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #eee' }}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedModels.length} models selected
                  </Typography>
                </Box>
              )}
            </Paper> { /* Closing Paper tag for Model Selection */ }
          </Box> { /* Closing Box tag for Model Selection */ }

          {/* Prompt Engineering Section */}
          <Box mb={3}>
            <Typography variant="h6" gutterBottom>Configure Prompts</Typography>
            <Paper elevation={1} sx={{ p: 2 }}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Your Question
                  <Tooltip title="This is the question you want to ask about your documents.">
                    <IconButton size="small" sx={{ ml: 0.5 }}>
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Typography>
                
                <Box sx={{ position: 'relative' }}>
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    mb: 1
                  }}>
                    <Typography variant="body2" color="textSecondary">Question</Typography>
                    
                    <Box>
                      <IconButton 
                        size="small" 
                        onClick={() => {
                          setExpandedQuery(true);
                          setExpandedQueryText(query);
                        }}
                        disabled={isProcessing}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  
                  <Box sx={{ 
                    p: 1, 
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    bgcolor: '#fafafa',
                    height: '150px',
                    overflowY: 'auto',
                    mb: 1
                  }}>
                    <TextField
                      multiline
                      rows={5}
                      placeholder="Enter your question about the documents..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={isProcessing}
                      fullWidth
                      variant="outlined"
                      InputProps={{
                        sx: { 
                          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                          fontSize: '0.95rem',
                          lineHeight: '1.4',
                          border: 'none',
                          '& fieldset': { border: 'none' },
                          p: 0
                        }
                      }}
                    />
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box mb={2}>
                <Typography variant="subtitle2" gutterBottom>
                  System Prompt
                  <Tooltip title="Instructions given to the model that define its behavior. The system prompt directs how the model should respond.">
                    <IconButton size="small" sx={{ ml: 0.5 }}>
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Typography>
                
                {promptSets.map((set, index) => (
                  <Box key={set.id} mb={2} sx={{ position: 'relative' }}>
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      mb: 1
                    }}>
                      <Typography variant="body2" color="textSecondary">Set {set.id}</Typography>
                      
                      <Box>
                        {promptSets.length > 1 && (
                          <IconButton 
                            size="small" 
                            onClick={() => handleRemovePromptSet(set.id)}
                            disabled={isProcessing}
                            sx={{ ml: 1 }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                        
                        <IconButton 
                          size="small" 
                          onClick={() => {
                            setExpandedPromptSet(set);
                            setExpandedPrompt(set.systemPrompt);
                          }}
                          disabled={isProcessing}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    
                    <Box sx={{ 
                      p: 1, 
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      bgcolor: '#fafafa',
                      height: '150px',
                      overflowY: 'auto',
                      mb: 1
                    }}>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                          fontSize: '0.95rem',
                          lineHeight: '1.4'
                        }}
                      >
                        {set.systemPrompt.length > 300 ? 
                          `${set.systemPrompt.substring(0, 300)}...` : 
                          set.systemPrompt}
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="caption" color="textSecondary" sx={{ mr: 1 }}>
                        Temperature:
                      </Typography>
                      <Slider
                        value={set.temperature}
                        onChange={(e, newValue) => {
                          const newSets = [...promptSets];
                          const setIndex = newSets.findIndex(s => s.id === set.id);
                          if (setIndex !== -1) {
                            newSets[setIndex] = {
                              ...newSets[setIndex],
                              temperature: newValue
                            };
                            setPromptSets(newSets);
                          }
                        }}
                        min={0}
                        max={1}
                        step={0.1}
                        disabled={isProcessing}
                        valueLabelDisplay="auto"
                        sx={{ 
                          width: '180px', 
                          mx: 1,
                          display: 'inline-block',
                          verticalAlign: 'middle'
                        }}
                      />
                      <Typography 
                        variant="caption" 
                        color="textSecondary" 
                        sx={{ 
                          display: 'inline-block',
                          verticalAlign: 'middle',
                          minWidth: '30px'
                        }}
                      >
                        {set.temperature.toFixed(1)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleAddPromptSet}
                  disabled={isProcessing}
                  sx={{ mt: 1 }}
                >
                  Add Prompt Set
                </Button>
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Box mt={2} sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ mr: 1 }}>
                  Selected Namespaces:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {namespaces.map(namespace => (
                    <Chip
                      key={namespace}
                      label={namespace}
                      size="small"
                      color={selectedNamespaces.includes(namespace) ? "primary" : "default"}
                      onClick={() => {
                        if (isProcessing) return;
                        const newSelected = selectedNamespaces.includes(namespace)
                          ? selectedNamespaces.filter(n => n !== namespace)
                          : [...selectedNamespaces, namespace];
                        setSelectedNamespaces(newSelected.length > 0 ? newSelected : ['default']);
                      }}
                      disabled={isProcessing}
                    />
                  ))}
                </Box>
              </Box>
            </Paper>
          </Box>
        </Box>
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