import React, { useState, useEffect, useCallback } from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  Button, 
  Alert,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  LinearProgress,
  Chip,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  FormControl,
  InputLabel
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import InfoIcon from '@mui/icons-material/Info';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { validateResponsesInParallel } from '../utils/parallelValidationProcessor';
import 'jspdf-autotable';
import { defaultSettings, apiConfig, defaultModels } from '../config/llmConfig';
import { createLlmInstance } from '../utils/apiServices';
import PromptOptimizer from './PromptOptimizer';

// Log the imported config for debugging
console.log('Imported API config:', apiConfig);
console.log('Imported default settings:', defaultSettings);

// Filter model options based on available API configurations
const getValidatorModelOptions = () => {
  const isAzureConfigured = !!(apiConfig.azure && apiConfig.azure.apiKey && apiConfig.azure.endpoint);
  const isOpenAIConfigured = !!(apiConfig.openAI && apiConfig.openAI.apiKey);
  const isAnthropicConfigured = !!(apiConfig.anthropic && apiConfig.anthropic.apiKey);
  const isOllamaConfigured = !!(apiConfig.ollama && apiConfig.ollama.endpoint);
  
  console.log('API Config check:', {isAzureConfigured, isOpenAIConfigured, isAnthropicConfigured, isOllamaConfigured});
  
  // Start with all models and filter based on available configurations
  const options = [];
  
  // Add Azure models from the central configuration if Azure is configured
  if (isAzureConfigured) {
    // Filter models from the central config file
    const azureModels = Object.entries(defaultModels)
      .filter(([id, model]) => model.vendor === 'AzureOpenAI' && model.active && model.type === 'chat')
      .map(([id, model]) => ({ 
        label: `Azure ${model.deploymentName || id.replace('azure-', '')}`, 
        value: id 
      }));
    
    console.log('Azure models from central config:', azureModels);
    options.push(...azureModels);
    
    // If no Azure models found in config, use these fallbacks
    if (azureModels.length === 0) {
      console.warn('No Azure models found in central config, using fallbacks');
      options.push(
        { label: 'Azure GPT-4o Mini', value: 'azure-gpt-4o-mini' },
        { label: 'Azure GPT-4o', value: 'azure-gpt-4o' }
      );
    }
  }
  
  // Add OpenAI models if configured
  if (isOpenAIConfigured) {
    // Filter OpenAI models from the central config
    const openAIModels = Object.entries(defaultModels)
      .filter(([id, model]) => model.vendor === 'OpenAI' && model.active && model.type === 'chat')
      .map(([id, model]) => ({ 
        label: id, 
        value: id 
      }));
    
    console.log('OpenAI models from central config:', openAIModels);
    options.push(...openAIModels);
    
    // If no OpenAI models found in config, use these fallbacks
    if (openAIModels.length === 0) {
      console.warn('No OpenAI models found in central config, using fallbacks');
      options.push(
        { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
        { label: 'GPT-4o', value: 'gpt-4o' }
      );
    }
  }
  
  // Add Anthropic models if configured
  if (isAnthropicConfigured) {
    // Filter Anthropic models from the central config
    const anthropicModels = Object.entries(defaultModels)
      .filter(([id, model]) => model.vendor === 'Anthropic' && model.active && model.type === 'chat')
      .map(([id, model]) => ({ 
        label: id, 
        value: id 
      }));
    
    console.log('Anthropic models from central config:', anthropicModels);
    options.push(...anthropicModels);
    
    // If no Anthropic models found in config, use these fallbacks
    if (anthropicModels.length === 0) {
      console.warn('No Anthropic models found in central config, using fallbacks');
      options.push(
        { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' }
      );
    }
  }
  
  // Add Ollama models if configured
  if (isOllamaConfigured) {
    // Filter Ollama models from the central config
    const ollamaModels = Object.entries(defaultModels)
      .filter(([id, model]) => model.vendor === 'Ollama' && model.active && model.type === 'chat')
      .map(([id, model]) => ({ 
        label: id, 
        value: id 
      }));
    
    console.log('Ollama models from central config:', ollamaModels);
    options.push(...ollamaModels);
    
    // If no Ollama models found in config, use these fallbacks
    if (ollamaModels.length === 0) {
      console.warn('No Ollama models found in central config, using fallbacks');
      options.push(
        { label: 'Llama 3', value: 'llama3:8b' }
      );
    }
  }
  
  // If no APIs are configured, provide default options as fallback
  if (options.length === 0) {
    console.warn('[ResponseValidation] No API configurations found, showing default model options');
    options.push(
      { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
      { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' }
    );
  }
  
  return options;
};

// Function to determine the most reliable validator model to use
const getReliableValidatorModel = () => {
  // Check if Azure is explicitly enabled and configured
  const useAzureOpenAI = localStorage.getItem('useAzureOpenAI') === 'true';
  const isAzureConfigured = !!(apiConfig.azure && apiConfig.azure.apiKey && apiConfig.azure.endpoint);
  const isOpenAIConfigured = !!(apiConfig.openAI && apiConfig.openAI.apiKey);
  
  // Get the saved validator model
  const savedValidatorModel = localStorage.getItem('responseValidatorModel');
  
  // If we're explicitly using Azure and it's configured
  if (useAzureOpenAI && isAzureConfigured) {
    return savedValidatorModel && savedValidatorModel.startsWith('azure-') 
      ? savedValidatorModel 
      : 'azure-gpt-4o-mini';
  }
  
  // If OpenAI is configured
  if (isOpenAIConfigured) {
    return savedValidatorModel && !savedValidatorModel.startsWith('azure-')
      ? savedValidatorModel
      : 'gpt-4o-mini';
  }
  
  // If Azure is configured (but not explicitly preferred)
  if (isAzureConfigured) {
    return 'azure-gpt-4o-mini';
  }
  
  // Default fallback
  return 'gpt-4o-mini';
};

// Helper function to find metrics for any model regardless of storage pattern
const findMetrics = (metrics, modelKey) => {
  if (!metrics || !modelKey) return null;
  
  // Direct hit - metrics stored directly under the model key
  if (metrics[modelKey]) {
    console.log(`Found direct metrics for ${modelKey}`);
    return metrics[modelKey];
  }
  
  // Normalize the model name for consistent lookup
  let normalizedModelKey = modelKey;
  if (typeof window !== 'undefined' && window.costTracker) {
    normalizedModelKey = window.costTracker.normalizeModelName(modelKey);
  }
  
  // Try with normalized name
  if (normalizedModelKey !== modelKey && metrics[normalizedModelKey]) {
    console.log(`Found metrics for normalized name ${normalizedModelKey}`);
    return metrics[normalizedModelKey];
  }
  
  // Check if this is a composite key like "Set 1-gpt-4o-mini"
  if (modelKey.includes('-')) {
    // Try to extract set name and model name
    const setMatch = modelKey.match(/^(Set \d+)-(.+)$/);
    
    if (setMatch) {
      const setName = setMatch[1]; // e.g., "Set 2"
      const modelName = setMatch[2]; // e.g., "gpt-4o-mini"
      
      // Try normalized base model name
      let normalizedModelName = modelName;
      if (typeof window !== 'undefined' && window.costTracker) {
        normalizedModelName = window.costTracker.normalizeModelName(modelName);
      }
      
      // Case 1: Nested structure - metrics[setName][modelName]
      if (metrics[setName] && metrics[setName][modelName]) {
        console.log(`Found nested metrics for ${modelName} in ${setName}`);
        return metrics[setName][modelName];
      }
      
      // Try with normalized model name
      if (normalizedModelName !== modelName && 
          metrics[setName] && metrics[setName][normalizedModelName]) {
        console.log(`Found nested metrics for normalized ${normalizedModelName} in ${setName}`);
        return metrics[setName][normalizedModelName];
      }
      
      // Case 2: Just the model name
      if (metrics[modelName]) {
        console.log(`Found metrics by model name ${modelName}`);
        return metrics[modelName];
      }
      
      // Try with normalized model name
      if (normalizedModelName !== modelName && metrics[normalizedModelName]) {
        console.log(`Found metrics by normalized model name ${normalizedModelName}`);
        return metrics[normalizedModelName];
      }
      
      // Case 3: Just the set name
      if (metrics[setName]) {
        console.log(`Found metrics by set name ${setName}`);
        return metrics[setName];
      }
      
      // Case 4: Dot notation - metrics["Set 1.gpt-4o-mini"]
      const dotKey = `${setName}.${modelName}`;
      if (metrics[dotKey]) {
        console.log(`Found metrics with dot notation ${dotKey}`);
        return metrics[dotKey];
      }
      
      // Try with normalized model name
      const normalizedDotKey = `${setName}.${normalizedModelName}`;
      if (normalizedModelName !== modelName && metrics[normalizedDotKey]) {
        console.log(`Found metrics with dot notation using normalized name ${normalizedDotKey}`);
        return metrics[normalizedDotKey];
      }
    }
  }
  
  // Try checking all metrics keys for partial matches
  for (const key in metrics) {
    if (key.includes(modelKey)) {
      console.log(`Found metrics with partial key match: ${key}`);
      return metrics[key];
    }
    
    // Try with normalized model name
    if (normalizedModelKey !== modelKey && key.includes(normalizedModelKey)) {
      console.log(`Found metrics with partial normalized key match: ${key}`);
      return metrics[key];
    }
  }
  
  console.log(`No metrics found for ${modelKey}`);
  return null;
};

// Reusable criteria textarea component
const CriteriaTextArea = ({ value, onChange, rows = 8, sx = {} }) => (
  <>
    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
      Specify the criteria for evaluating responses. Define one criterion per line, optionally with descriptions after a colon.
    </Typography>
    <TextField
      label="Evaluation Criteria"
      fullWidth
      multiline
      rows={rows}
      value={value}
      onChange={onChange}
      placeholder="Enter evaluation criteria, one per line..."
      variant="outlined"
      sx={sx}
    />
  </>
);

function ResponseValidation({ 
  onValidationComplete,
  responses: propResponses = {},
  metrics: propMetrics = {},
  currentQuery: propCurrentQuery = '',
  systemPrompts = {},
  validationResults: initialValidationResults = {},
  isProcessing: initialIsProcessing = false,
  setIsProcessing: parentSetIsProcessing,
  initialValue = '', 
  isDisabled = false,
  onSystemPromptUpdate
}) {
  const [isProcessing, setIsProcessing] = useState(initialIsProcessing);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [validationResults, setValidationResults] = useState(initialValidationResults);
  const [metrics, setMetrics] = useState(propMetrics);
  const [responses, setResponses] = useState(propResponses);
  const [currentQuery, setCurrentQuery] = useState(propCurrentQuery);
  
  // Update internal state when props change
  useEffect(() => {
    console.log('ResponseValidation props updated:', {
      receivedResponses: propResponses,
      receivedMetrics: propMetrics,
      receivedQuery: propCurrentQuery,
      receivedIsProcessing: initialIsProcessing
    });
    
    // Update internal state with new prop values
    setResponses(propResponses);
    setMetrics(propMetrics);
    setCurrentQuery(propCurrentQuery);
    
    // Only update isProcessing if the parent provided a value
    if (initialIsProcessing !== undefined) {
      setIsProcessing(initialIsProcessing);
    }
    
    // Only update validationResults if the parent provided a value
    if (initialValidationResults && Object.keys(initialValidationResults).length > 0) {
      setValidationResults(initialValidationResults);
      // If we're receiving validation results, update the currently used criteria
      setCurrentlyUsedCriteria(customCriteria);
    }
    
  }, [propResponses, propMetrics, propCurrentQuery, initialIsProcessing, initialValidationResults]);
  
  // Define the onValidationComplete function to pass results back to parent
  const handleValidationComplete = (results, isFullyComplete = false) => {
    // Process results to ensure response data is preserved
    const processedResults = {};
    
    Object.entries(results).forEach(([key, result]) => {
      processedResults[key] = {
        ...result,
        // Ensure response data is available in standard locations
        modelResponse: result.originalResponse?.rawResponse || 
                       result.originalResponse?.response ||
                       result.originalResponse,
        // Preserve all original data
        originalData: result.originalResponse
      };
    });

    setValidationResults(processedResults);
    
    // Only set processing to false if this is the final completion
    if (isFullyComplete) {
      if (typeof parentSetIsProcessing === 'function') {
        parentSetIsProcessing(false);
      }
      
      if (typeof onValidationComplete === 'function') {
        onValidationComplete(processedResults);
      }
    }
  };
  
  // Get available model options first
  const validatorModelOptions = getValidatorModelOptions();
  
  // Get the reliable validator model
  const reliableModel = getReliableValidatorModel();
  
  // Use the reliable model if it's in our options, otherwise use the first available option
  const getInitialModel = () => {
    const isModelInOptions = validatorModelOptions.some(option => option.value === reliableModel);
    if (isModelInOptions) {
      return reliableModel;
    }
    return validatorModelOptions.length > 0 ? validatorModelOptions[0].value : 'gpt-4o-mini';
  };
  
  const [validatorModel, setValidatorModel] = useState(getInitialModel());
  const [customCriteria, setCustomCriteria] = useState(
    localStorage.getItem('defaultEvaluationCriteria') || defaultSettings.defaultEvaluationCriteria
  );
  const [currentValidatingModel, setCurrentValidatingModel] = useState(null);
  const [sortConfig] = useState({ key: 'overallScore', direction: 'descending' });
  const [editCriteriaOpen, setEditCriteriaOpen] = useState(false);
  
  // Add state to track the currently used criteria for validation
  const [currentlyUsedCriteria, setCurrentlyUsedCriteria] = useState(
    localStorage.getItem('defaultEvaluationCriteria') || defaultSettings.defaultEvaluationCriteria
  );
  
  // Additional state for parallel processing UI
  const [parallelProgress, setParallelProgress] = useState({
    completed: 0,
    pending: 0,
    total: 0,
    models: {}
  });
  
  // Store effectiveness data in state
  const [effectivenessData, setEffectivenessData] = useState({
    modelData: {},
    bestValueModel: null,
    fastestModel: null,
    mostEffectiveModel: null,
    lowestCostModel: null
  });
  
  // Wrap the effectiveness score calculation in useCallback
  const calculateEffectivenessScore = useCallback((validationResults, metrics) => {
    if (!validationResults || !metrics || Object.keys(validationResults).length === 0) {
      return {
        modelData: {},
        bestValueModel: null,
        fastestModel: null,
        mostEffectiveModel: null,
        lowestCostModel: null
      };
    }
    
    const effectiveness = {
      modelData: {}
    };
    let bestEfficiencyScore = 0;
    let bestTimeEfficiency = 0;
    let bestComprehensiveScore = 0;
    let lowestCost = Infinity;
    let bestValueModel = null;
    let fastestModel = null;
    let mostEffectiveModel = null;
    let lowestCostModel = null;
    
    // Calculate efficiency scores for each model
    Object.entries(validationResults).forEach(([model, result]) => {
      if (result.error) return; // Skip models with errors
      
      const overallScore = result.overall?.score || 0;
      const modelMetrics = findMetrics(metrics, model);
      
      // Get cost
      let cost = 0;
      if (modelMetrics && modelMetrics.calculatedCost) {
        cost = Number(modelMetrics.calculatedCost);
      } else {
        const modelResponse = responses?.[model] || 
                            (responses?.models && Object.values(responses.models)
                                .flatMap(set => Object.entries(set))
                                .find(([key]) => key === model)?.[1]);
        
        if (modelResponse && modelResponse.cost !== undefined) {
          cost = Number(modelResponse.cost);
        } else if (modelResponse && modelResponse.rawResponse && modelResponse.rawResponse.cost !== undefined) {
          cost = Number(modelResponse.rawResponse.cost);
        }
      }
      
      // Get response time
      const responseTime = modelMetrics?.responseTime || modelMetrics?.elapsedTime || 0;
      
      // Calculate cost effectiveness (0-100 scale)
      // Higher score = better value (high score per dollar)
      let costEfficiencyScore = 0;
      if (cost > 0) {
        // Tier-based approach: assign base scores by cost tier first
        let baseTierScore;
        if (cost < 0.0001) {
          // Ultra low cost tier (< $0.0001) - highest scores
          baseTierScore = 98;
        } else if (cost < 0.001) {
          // Very low cost tier ($0.0001-$0.001)
          baseTierScore = 90;
        } else if (cost < 0.005) {
          // Low cost tier ($0.001-$0.005)
          baseTierScore = 75;
        } else if (cost < 0.01) {
          // Medium cost tier ($0.005-$0.01)
          baseTierScore = 55;
        } else if (cost < 0.05) {
          // High cost tier ($0.01-$0.05) - dramatically lower score
          baseTierScore = 30;
        } else {
          // Very high cost tier (>$0.05)
          baseTierScore = 20;
        }
        
        // Factor in quality but with minimal impact - we want cost to dominate the efficiency metric
        // This significantly reduces quality's ability to compensate for high costs
        const qualityFactor = Math.min(1, Math.pow(overallScore / 100, 0.2)); // Very minimal quality penalty
        
        // Calculate final score - quality can only affect the score by at most ±15%
        // This ensures cost tiers are the dominant factor in the efficiency score
        const qualityAdjustment = (qualityFactor - 0.5) * 0.3; // -15% to +15% adjustment
        costEfficiencyScore = Math.max(5, Math.min(100, baseTierScore * (1 + qualityAdjustment)));
      } else {
        // If cost is 0, give it perfect cost efficiency (100%)
        costEfficiencyScore = 100;
      }
      
      // Calculate time effectiveness (0-100 scale)
      // Higher score = faster response (low time per score point)
      let timeEfficiencyScore = 0;
      if (responseTime > 0) {
        // Simple but effective formula that gives high scores for responses under 10 seconds
        // and reasonable differentiation between fast and medium responses
        
        // Response time curve:
        // 0-2s: 90-100 points
        // 2-5s: 80-90 points
        // 5-10s: 70-80 points
        // 10-15s: 60-70 points
        // 15-20s: 50-60 points
        // >20s: <50 points
        
        const responseTimeInSeconds = responseTime / 1000;
        let baseTimeScore;
        
        if (responseTimeInSeconds <= 2) {
          // Very fast responses (<=2s)
          baseTimeScore = 90 + (2 - responseTimeInSeconds) * 5; // 90-100
        } else if (responseTimeInSeconds <= 5) {
          // Fast responses (2-5s)
          baseTimeScore = 80 + (5 - responseTimeInSeconds) * (10/3); // 80-90
        } else if (responseTimeInSeconds <= 10) {
          // Medium responses (5-10s)
          baseTimeScore = 70 + (10 - responseTimeInSeconds) * 2; // 70-80
        } else if (responseTimeInSeconds <= 15) {
          // Medium-slow responses (10-15s)
          baseTimeScore = 60 + (15 - responseTimeInSeconds) * 2; // 60-70
        } else if (responseTimeInSeconds <= 20) {
          // Slow responses (15-20s)
          baseTimeScore = 50 + (20 - responseTimeInSeconds) * 2; // 50-60
        } else {
          // Very slow responses (>20s)
          baseTimeScore = Math.max(30, 50 - (responseTimeInSeconds - 20)); // <50
        }
        
        // Apply minor quality adjustment - time efficiency should primarily measure speed
        // with only a small penalty for poor quality
        const qualityFactor = Math.max(0.8, Math.min(1, overallScore / 75));
        timeEfficiencyScore = Math.max(10, Math.min(100, baseTimeScore * qualityFactor));
      } else if (overallScore > 0) {
        // If response time is missing but we have a score, use a default efficiency
        timeEfficiencyScore = Math.max(60, overallScore * 0.7); // 70% of quality score or minimum 60
      }
      
      // Calculate comprehensive score (balancing quality, cost, and speed)
      // Updated weights to provide a more balanced approach
      const qualityWeight = 0.4;    // Increased weight for quality
      const costWeight = 0.4;       // Slightly reduced cost weight
      const timeWeight = 0.2;       // Increased time weight
      
      // Apply a quality threshold - if quality is extremely low (below 20%), handle accordingly
      let comprehensiveEfficiencyScore;
      
      if (overallScore <= 1) {
        // Model failed or crashed completely - mark as N/A with a special value
        comprehensiveEfficiencyScore = null; // Use null to represent N/A
      } else if (overallScore < 20) {
        // For low but not failed scores (>1 and <20), apply a moderate penalty
        // This ensures that poor quality models get lower scores but not drastically low
        const qualityFactor = 0.3 + (0.7 * overallScore / 20); // Scales from 0.3 to 1.0
        comprehensiveEfficiencyScore = qualityFactor * (
          (qualityWeight * overallScore) +
          (costWeight * costEfficiencyScore) +
          (timeWeight * timeEfficiencyScore)
        );
      } else {
        // Normal calculation for acceptable quality scores
        comprehensiveEfficiencyScore = 
          (qualityWeight * overallScore) +
          (costWeight * costEfficiencyScore) +
          (timeWeight * timeEfficiencyScore);
      }
      
      // Update effectiveness data
      if (!effectiveness.modelData[model]) {
        effectiveness.modelData[model] = {
          cost: cost,
          responseTime: responseTime,
          overallScore: overallScore,
          costEfficiencyScore: costEfficiencyScore,
          timeEfficiencyScore: timeEfficiencyScore,
          comprehensiveEfficiencyScore: comprehensiveEfficiencyScore
        };
      } else {
        effectiveness.modelData[model].cost = cost;
        effectiveness.modelData[model].responseTime = responseTime;
        effectiveness.modelData[model].overallScore = overallScore;
        effectiveness.modelData[model].costEfficiencyScore = costEfficiencyScore;
        effectiveness.modelData[model].timeEfficiencyScore = timeEfficiencyScore;
        effectiveness.modelData[model].comprehensiveEfficiencyScore = comprehensiveEfficiencyScore;
      }
      
      // Update best model data
      if (comprehensiveEfficiencyScore !== null && 
          comprehensiveEfficiencyScore > bestComprehensiveScore) {
        bestComprehensiveScore = comprehensiveEfficiencyScore;
        mostEffectiveModel = model;
      }
      if (costEfficiencyScore > bestEfficiencyScore && 
          overallScore > 1) {
        bestEfficiencyScore = costEfficiencyScore;
        bestValueModel = model;
      }
      if (timeEfficiencyScore > bestTimeEfficiency && 
          overallScore > 1) {
        bestTimeEfficiency = timeEfficiencyScore;
        fastestModel = model;
      }
      if (cost < lowestCost && 
          overallScore > 1) {
        lowestCost = cost;
        lowestCostModel = model;
      }
    });
    
    // Calculate overall effectiveness data
    const overallEffectiveness = {
      modelData: effectiveness.modelData,
      bestValueModel: bestValueModel,
      fastestModel: fastestModel,
      mostEffectiveModel: mostEffectiveModel,
      lowestCostModel: lowestCostModel,
      mostEffectiveScore: bestComprehensiveScore,
      bestValueEfficiency: bestEfficiencyScore,
      fastestResponseTime: effectiveness.modelData[fastestModel]?.responseTime || 0,
      mostEffectiveResponseTime: effectiveness.modelData[mostEffectiveModel]?.responseTime || 0,
      effectivenessData: effectiveness.modelData
    };
    
    return overallEffectiveness;
  }, [responses]);

  // Add calculateEffectivenessScore to the dependency array
  useEffect(() => {
    if (Object.keys(validationResults).length > 0) {
      const data = calculateEffectivenessScore(validationResults, metrics);
      console.log("Calculated effectiveness data:", data);
      setEffectivenessData(data);
    }
  }, [validationResults, metrics, calculateEffectivenessScore]);

  // Load validator model from localStorage on component mount
  useEffect(() => {
    // Check if Azure is explicitly enabled by user
    const useAzureOpenAI = localStorage.getItem('useAzureOpenAI') === 'true';
    console.log(`Use Azure OpenAI setting on init: ${useAzureOpenAI ? 'ENABLED' : 'DISABLED'}`);
    
    // Check if Azure is properly configured using the imported apiConfig
    const isAzureConfigured = !!(apiConfig.azure && apiConfig.azure.apiKey && apiConfig.azure.endpoint);
    console.log(`Azure configuration status on init: ${isAzureConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
    
    // Check if OpenAI is configured with valid API key using the imported apiConfig
    const isOpenAIConfigured = !!(apiConfig.openAI && apiConfig.openAI.apiKey);
    console.log(`OpenAI configuration status on init: ${isOpenAIConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
    
    // Get the saved validator model
    const savedValidatorModel = localStorage.getItem('responseValidatorModel');
    console.log(`Saved validator model: ${savedValidatorModel}`);

    // If we're using Azure but it's not properly configured, we need to use OpenAI models
    if (useAzureOpenAI && !isAzureConfigured && savedValidatorModel && savedValidatorModel.startsWith('azure-')) {
      const openAIEquivalent = savedValidatorModel.replace('azure-', '');
      console.log(`Cannot use saved Azure model as Azure is not configured. Using OpenAI equivalent: ${openAIEquivalent}`);
      setValidatorModel(openAIEquivalent);
      localStorage.setItem('responseValidatorModel', openAIEquivalent);
      return;
    }
    
    // If we're using OpenAI but the saved model is an Azure model, convert it
    if (!useAzureOpenAI && savedValidatorModel && savedValidatorModel.startsWith('azure-')) {
      const openAIEquivalent = savedValidatorModel.replace('azure-', '');
      console.log(`Using OpenAI environment but saved model is Azure. Converting to: ${openAIEquivalent}`);
      setValidatorModel(openAIEquivalent);
      localStorage.setItem('responseValidatorModel', openAIEquivalent);
      return;
    }
    
    // If we're using Azure and the saved model is an OpenAI model, convert it
    if (useAzureOpenAI && isAzureConfigured && savedValidatorModel && !savedValidatorModel.startsWith('azure-')) {
      const azureEquivalent = `azure-${savedValidatorModel}`;
      console.log(`Using Azure environment but saved model is OpenAI. Converting to: ${azureEquivalent}`);
      setValidatorModel(azureEquivalent);
      localStorage.setItem('responseValidatorModel', azureEquivalent);
      return;
    }
    
    if (savedValidatorModel) {
      // Make sure we're using a reliable model, even for saved preferences
      const reliableModel = getReliableValidatorModel();
      setValidatorModel(reliableModel);
      
      // If the reliable model differs from the saved one, update localStorage
      if (reliableModel !== savedValidatorModel) {
        localStorage.setItem('responseValidatorModel', reliableModel);
      }
    } else {
      // If no saved model, set a default reliable model
      // Use the environment to determine whether to default to Azure or OpenAI
      const defaultBaseModel = 'gpt-4o-mini';
      const defaultModel = useAzureOpenAI && isAzureConfigured 
        ? `azure-${defaultBaseModel}` 
        : defaultBaseModel;
        
      console.log(`No saved model, using environment-appropriate default: ${defaultModel}`);
      const reliableModel = getReliableValidatorModel();
      
      setValidatorModel(reliableModel);
      localStorage.setItem('responseValidatorModel', reliableModel);
    }
    
    // Load default evaluation criteria from localStorage or use defaults
    const savedCriteria = localStorage.getItem('defaultEvaluationCriteria');
    if (savedCriteria) {
      setCustomCriteria(savedCriteria);
      setCurrentlyUsedCriteria(savedCriteria);
    } else {
      // If no saved criteria, use the default criteria from config
      setCustomCriteria(defaultSettings.defaultEvaluationCriteria);
      setCurrentlyUsedCriteria(defaultSettings.defaultEvaluationCriteria);
    }
  }, []);

  // Get the vendor name of a model, or use Set 1, Set 2, etc. for unknown models
  const getModelVendor = (model) => {
    if (model.includes('azure-')) return 'AzureOpenAI';
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'OpenAI';
    if (model.startsWith('claude')) return 'Anthropic';
    if (model.includes('llama') || model.includes('mistral') || model.includes('gemma')) return 'Ollama';
    
    // Check if the model name already contains "Set X" pattern
    if (/Set \d+/i.test(model)) {
      return model;
    }
    
    // For unknown models, extract number if it ends with a number like "model1" or "set1"
    const numMatch = model.match(/(\d+)$/);
    if (numMatch) {
      return `Set ${numMatch[1]}`;
    }
    
    return 'Set 1'; // Default to Set 1 for completely unknown models
  };

  // Reset validation state only when component is first mounted, not on re-renders
  useEffect(() => {
    // Log the current responses state for debugging
    console.log('Current responses state:', {
      responsesEmpty: !responses || Object.keys(responses).length === 0,
      responsesType: typeof responses,
      responsesKeys: responses ? Object.keys(responses) : [],
      responsesModels: responses?.models ? Object.keys(responses.models) : 'No models property'
    });
    
    // Only reset if there are no validation results yet
    if (!validationResults || Object.keys(validationResults || {}).length === 0) {
      setCurrentValidatingModel(null);
      
      // If we're not processing, make sure isProcessing is false
      if (!isProcessing) {
        setIsProcessing(false);
      }
    }
    
    // This will run when the component is unmounted
    return () => {
      // Clean up any ongoing processes if needed
    };
  }, [isProcessing, setIsProcessing, validationResults, responses]);

  const handleParallelProgress = useCallback((progressData) => {
    if (!progressData) return;
    
    // Update the current model for basic tracking
    setCurrentValidatingModel(progressData.model);
    
    setParallelProgress(prev => {
      const newModels = { ...prev.models };
      
      // Ensure consistent model name format: "modelName / Set X"
      let modelName = progressData.model;
      
      // If the model name starts with "Set", convert it to the correct format
      if (modelName.startsWith('Set ')) {
        const parts = modelName.split('-');
        if (parts.length > 1) {
          const setName = parts[0];
          const baseModel = parts.slice(1).join('-');
          modelName = `${baseModel} / ${setName}`;
        }
      } else if (!modelName.includes('Set')) {
        // If no Set is mentioned, add Set 1
        modelName = `${modelName} / Set 1`;
      }

      // Only update the model status if it's not completed yet
      if (!newModels[modelName] || newModels[modelName].status !== 'completed') {
        newModels[modelName] = {
          status: progressData.status,
          timestamp: Date.now()
        };
      }

      // Calculate completed count based on unique completed models
      const completedCount = Object.values(newModels).filter(m => m.status === 'completed').length;

      // Use the total from progressData.progress if available, otherwise use the count of models
      const total = progressData.progress?.total || Object.keys(newModels).length;

      return {
        ...prev,
        completed: completedCount,
        total: total, // Set the total from progress data
        models: newModels
      };
    });
  }, []);

  const validateResponses = async () => {
    try {
      console.log("=== Starting validation process ===");
      console.log("Responses object:", responses);
      console.log("Responses structure:", {
        responseType: typeof responses,
        hasDirectKeys: typeof responses === 'object' ? Object.keys(responses).length : 'n/a',
        hasModelsProperty: typeof responses === 'object' && responses?.models ? true : false,
        modelsKeys: typeof responses === 'object' && responses?.models ? Object.keys(responses.models) : 'n/a'
      });
      
      setIsProcessing(true);
      
      // Get the selected validator model or use a default reliable one
      const validatorModelToUse = getReliableValidatorModel();
      console.log(`Using validator model: ${validatorModelToUse}`);
      
      // Update the currently used criteria to reflect what we're actually using
      setCurrentlyUsedCriteria(customCriteria);
      
      // Get the validation preference from localStorage
      const useParallelValidation = localStorage.getItem('useParallelProcessing') === 'true';
      console.log(`Parallel validation preference: ${useParallelValidation ? 'ENABLED' : 'DISABLED'}`);

      // Debug log the full responses object
      console.log("Full responses object:", responses);

      // Filter out metadata entries from responses before validation
      const filteredResponses = {};
      const responseData = {}; // Store original responses
      
      if (responses) {
        console.log("Original responses structure:", Object.keys(responses));
        
        // Check if the new nested structure (responses.models) exists
        if (responses.models && typeof responses.models === 'object') {
          console.log("Using new nested models structure for validation");
          console.log("Models structure:", Object.keys(responses.models));
          
          // Process each set in the models object
          Object.entries(responses.models).forEach(([setKey, setModels]) => {
            console.log(`Processing set ${setKey}:`, Object.keys(setModels));
            
            if (typeof setModels === 'object' && !Array.isArray(setModels)) {
              // Process each model in the set
              Object.entries(setModels).forEach(([modelKey, modelResponse]) => {
                // Check if this is a real model key (not metadata)
                const isModelKey = 
                  modelKey.includes('gpt-') || 
                  modelKey.includes('claude-') ||
                  modelKey.includes('llama') ||
                  modelKey.includes('mistral') ||
                  modelKey.includes('gemma') ||
                  modelKey.includes('o1-') ||
                  modelKey.includes('o3-') ||
                  modelKey.includes('azure-');
                  
                if (isModelKey) {
                  const combinedKey = `${setKey}-${modelKey}`;
                  console.log(`Including model response for validation: ${combinedKey}`);
                  filteredResponses[combinedKey] = modelResponse;
                  // Store the full response including rawResponse
                  responseData[combinedKey] = modelResponse;
                }
              });
            }
          });
        } else {
          console.log("Using legacy format for responses");
          // Handle legacy format
          const modelKeyRegex = /^(gpt-|claude-|llama|mistral|gemma|o[13]-|azure-)/;
          
          // Filter entries to include only actual models
          Object.entries(responses).forEach(([key, value]) => {
            console.log(`Checking response key: ${key}, matches regex: ${modelKeyRegex.test(key)}`);
            if (modelKeyRegex.test(key)) {
              // Direct model response
              console.log(`Including direct model response for validation: ${key}`);
              filteredResponses[key] = value;
              responseData[key] = value;
            } else if (key.startsWith('Set ')) {
              // Set-based responses
              const setKey = key;
              const setContent = value;
              
              if (typeof setContent === 'object' && !Array.isArray(setContent)) {
                Object.entries(setContent).forEach(([modelKey, modelResponse]) => {
                  // Only include real model keys, not metadata
                  if (modelKeyRegex.test(modelKey)) {
                    const combinedKey = `${setKey}-${modelKey}`;
                    console.log(`Including set-based model for validation: ${combinedKey}`);
                    filteredResponses[combinedKey] = modelResponse;
                    responseData[combinedKey] = modelResponse;
                  }
                });
              }
            }
          });
        }
      }
      
      console.log("Filtered responses for validation:", Object.keys(filteredResponses));
      
      if (Object.keys(filteredResponses).length === 0) {
        console.warn("No valid model responses found to validate");
        handleValidationComplete({});
        setIsProcessing(false);
        return;
      }
      
      if (useParallelValidation) {
        console.log("Starting chunked parallel validation processing (chunks of 5)");
        
        // Process validations in chunks of 5 for better resource management
        const allResults = {};
        const modelEntries = Object.entries(filteredResponses);
        const totalModels = modelEntries.length;
        const chunkSize = 5;
        let completedModels = 0;
        
        // Get Ollama endpoint from localStorage or default settings
        const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || defaultSettings.ollamaEndpoint;
        
        // Process models in chunks
        for (let i = 0; i < modelEntries.length; i += chunkSize) {
          const chunk = modelEntries.slice(i, i + chunkSize);
          const chunkResponses = Object.fromEntries(chunk);
          
          console.log(`Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(totalModels / chunkSize)} with ${chunk.length} models`);
          
          // Process chunk in parallel
          const chunkPromises = chunk.map(async ([modelKey, response]) => {
            try {
              setCurrentValidatingModel(modelKey);
              console.log(`Validating model ${modelKey} in chunk`);
              
              // Extract the answer content
              let answer = '';
              if (typeof response === 'object') {
                if (response.answer && typeof response.answer === 'object' && response.answer.text) {
                  answer = response.answer.text;
                } else if (response.answer) {
                  answer = typeof response.answer === 'string' ? response.answer : JSON.stringify(response.answer);
                } else if (response.response) {
                  answer = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
                } else if (response.text) {
                  answer = response.text;
                } else {
                  answer = JSON.stringify(response);
                }
              } else if (typeof response === 'string') {
                answer = response;
              }
              
              // Create the evaluation prompt
              const prompt = `
You are an impartial judge evaluating the quality of an AI assistant's response to a user query.

SYSTEM PROMPT:
${systemPrompts[modelKey] || 'No system prompt provided'}

USER QUERY:
${currentQuery}

AI ASSISTANT'S RESPONSE:
${answer}

EVALUATION CRITERIA:
${customCriteria}

IMPORTANT INSTRUCTIONS:
1. You MUST evaluate EACH criterion listed above individually
2. For EACH criterion, provide:
   - A score from 1-10 (where 1 is poor and 10 is excellent)
   - A brief explanation justifying the score
3. Do not skip any criteria or add new ones
4. You MUST use the EXACT criterion names as provided above - do not modify, reformat, or change the case of the criterion names

Your evaluation should be structured as a JSON object with these properties:
{
  "criteria": {
    // Use the EXACT criterion names from above, preserving case and format
    "criterion_name": {
      "score": number, // 1-10
      "explanation": "string"
    },
    // ... repeat for all criteria, using exact names
  },
  "strengths": ["string"], // List of specific strengths
  "weaknesses": ["string"], // List of specific areas for improvement
  "unclear_statements": ["string"], // List of unclear or ambiguous statements with explanations
  "overall_score": number, // Average of all criteria scores (1-10)
  "overall_assessment": "string" // Brief summary of the evaluation
}

IMPORTANT: 
- Your response must be valid JSON
- You MUST include ALL criteria provided above
- You MUST use the EXACT criterion names as shown above

YOUR EVALUATION (in JSON format):
`;
              
              // Create LLM instance for validation
              const llm = createLlmInstance(validatorModelToUse, '', {
                ollamaEndpoint: ollamaEndpoint,
                // Skip temperature for o3-mini which doesn't support it
                ...(validatorModelToUse.includes('o3-mini') ? {} : { temperature: 0 }),
                isForValidation: true
              });
              
              // Call the LLM with the evaluation prompt
              const evaluationResult = await llm.invoke(prompt);
              
              // Parse the JSON response
              let parsedResult;
              try {
                // First attempt: direct JSON parse
                parsedResult = JSON.parse(evaluationResult);
              } catch (directParseError) {
                try {
                  // Second attempt: Extract JSON from the response using regex
                  const jsonMatch = evaluationResult.match(/\{[\s\S]*\}/);
                  parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
                  
                  if (!parsedResult) {
                    throw new Error('No JSON found in response');
                  }
                } catch (jsonError) {
                  console.error(`Failed to parse validation result for ${modelKey}:`, jsonError);
                  parsedResult = {
                    error: 'Failed to parse evaluation result JSON',
                    rawResponse: evaluationResult.substring(0, 500)
                  };
                }
              }
              
              // Normalize the result
              const normalizedResult = normalizeValidationResult(parsedResult);
              
              return { modelKey, result: normalizedResult };
              
            } catch (error) {
              console.error(`Error validating ${modelKey}:`, error);
              return {
                modelKey,
                result: {
                  error: `Validation error: ${error.message}`,
                  criteria: {},
                  strengths: [],
                  weaknesses: [],
                  overall: { score: 0, explanation: 'Validation failed' }
                }
              };
            }
          });
          
          // Wait for all models in this chunk to complete
          const chunkResults = await Promise.all(chunkPromises);
          
          // Add chunk results to overall results
          chunkResults.forEach(({ modelKey, result }) => {
            allResults[modelKey] = {
              ...result,
              originalResponse: responseData[modelKey] // Include original response
            };
            
            completedModels++;
            
            // Update progress
            if (handleParallelProgress) {
              handleParallelProgress({
                model: modelKey,
                status: 'completed',
                current: completedModels,
                total: totalModels,
                progress: {
                  completed: completedModels,
                  pending: totalModels - completedModels,
                  total: totalModels
                }
              });
            }
          });
          
          // Update validation results with partial results after each chunk
          handleValidationComplete({ ...allResults }, false);
          
          console.log(`Chunk ${Math.floor(i / chunkSize) + 1} completed. Total progress: ${completedModels}/${totalModels}`);
        }
        
        // Mark chunked parallel validation as fully complete
        handleValidationComplete(allResults, true);
        console.log("Chunked parallel validation completed successfully with results:", Object.keys(allResults));
      } else {
        console.log("Starting sequential validation processing");
        
        // Process validations one at a time
        const sequentialResults = {};
        const totalModels = Object.keys(filteredResponses).length;
        let completedModels = 0;
        
        // Get Ollama endpoint from localStorage or default settings
        const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || defaultSettings.ollamaEndpoint;
        
        // Process each model sequentially
        for (const [modelKey, response] of Object.entries(filteredResponses)) {
          try {
            setCurrentValidatingModel(modelKey);
            console.log(`Validating model ${modelKey} (${completedModels + 1}/${totalModels})`);
            
            // Extract the answer content
            let answer = '';
            if (typeof response === 'object') {
              if (response.answer && typeof response.answer === 'object' && response.answer.text) {
                answer = response.answer.text;
              } else if (response.answer) {
                answer = typeof response.answer === 'string' ? response.answer : JSON.stringify(response.answer);
              } else if (response.response) {
                answer = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
              } else if (response.text) {
                answer = response.text;
              } else {
                answer = JSON.stringify(response);
              }
            } else if (typeof response === 'string') {
              answer = response;
            }
            
            // Create the evaluation prompt
            const prompt = `
You are an impartial judge evaluating the quality of an AI assistant's response to a user query.

SYSTEM PROMPT:
${systemPrompts[modelKey] || 'No system prompt provided'}

USER QUERY:
${currentQuery}

AI ASSISTANT'S RESPONSE:
${answer}

EVALUATION CRITERIA:
${customCriteria}

IMPORTANT INSTRUCTIONS:
1. You MUST evaluate EACH criterion listed above individually
2. For EACH criterion, provide:
   - A score from 1-10 (where 1 is poor and 10 is excellent)
   - A brief explanation justifying the score
3. Do not skip any criteria or add new ones
4. You MUST use the EXACT criterion names as provided above - do not modify, reformat, or change the case of the criterion names

Your evaluation should be structured as a JSON object with these properties:
{
  "criteria": {
    // Use the EXACT criterion names from above, preserving case and format
    "criterion_name": {
      "score": number, // 1-10
      "explanation": "string"
    },
    // ... repeat for all criteria, using exact names
  },
  "strengths": ["string"], // List of specific strengths
  "weaknesses": ["string"], // List of specific areas for improvement
  "unclear_statements": ["string"], // List of unclear or ambiguous statements with explanations
  "overall_score": number, // Average of all criteria scores (1-10)
  "overall_assessment": "string" // Brief summary of the evaluation
}

IMPORTANT: 
- Your response must be valid JSON
- You MUST include ALL criteria provided above
- You MUST use the EXACT criterion names as shown above

YOUR EVALUATION (in JSON format):
`;
            
            // Create LLM instance for validation
            const llm = createLlmInstance(validatorModelToUse, '', {
              ollamaEndpoint: ollamaEndpoint,
              // Skip temperature for o3-mini which doesn't support it
              ...(validatorModelToUse.includes('o3-mini') ? {} : { temperature: 0 }),
              isForValidation: true
            });
            
            // Call the LLM with the evaluation prompt
            const evaluationResult = await llm.invoke(prompt);
            
            // Parse the JSON response
            let parsedResult;
            try {
              // First attempt: direct JSON parse
              parsedResult = JSON.parse(evaluationResult);
            } catch (directParseError) {
              try {
                // Second attempt: Extract JSON from the response using regex
                const jsonMatch = evaluationResult.match(/\{[\s\S]*\}/);
                parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
                
                if (!parsedResult) {
                  throw new Error('No JSON found in response');
                }
              } catch (jsonError) {
                console.error(`Failed to parse validation result for ${modelKey}:`, jsonError);
                parsedResult = {
                  error: 'Failed to parse evaluation result JSON',
                  rawResponse: evaluationResult.substring(0, 500)
                };
              }
            }
            
            // Normalize the result
            sequentialResults[modelKey] = normalizeValidationResult(parsedResult);
            
            // Update progress
            completedModels++;
            if (handleParallelProgress) {
              handleParallelProgress({
                model: modelKey,
                status: 'completed',
                current: completedModels,
                total: totalModels,
                progress: {
                  completed: completedModels,
                  pending: totalModels - completedModels,
                  total: totalModels
                }
              });
            }
            
            // Update validation results as we go (partial results)
            handleValidationComplete({ ...sequentialResults }, false);
            
          } catch (error) {
            console.error(`Error validating ${modelKey}:`, error);
            sequentialResults[modelKey] = {
              error: `Validation error: ${error.message}`,
              criteria: {},
              strengths: [],
              weaknesses: [],
              overall: { score: 0, explanation: 'Validation failed' }
            };
          }
        }
        
        // Mark sequential validation as fully complete
        handleValidationComplete(sequentialResults, true);
        console.log("Sequential validation completed with results:", Object.keys(sequentialResults));
      }
    } catch (error) {
      console.error('Error during validation:', error);
      handleValidationComplete({}, true); // Mark as complete even on error
    } finally {
      setIsProcessing(false);
      setCurrentValidatingModel(null);
    }
  };

  // Helper function to format effectiveness score
  const formatEffectivenessScore = (score) => {
    if (score === undefined || score === null || isNaN(score)) return 'N/A';
    return `${Math.round(score)}/100`;
  };

  // Helper function to format time efficiency score
  const formatTimeEfficiencyScore = (score) => {
    if (score === undefined || score === null || isNaN(score)) return 'N/A';
    return `${Math.round(score)}/100`;
  };

  // Helper function to format comprehensive efficiency score
  const formatComprehensiveEfficiencyScore = (score) => {
    if (score === undefined || score === null || isNaN(score)) return 'N/A';
    return `${Math.round(score)}/100`;
  };

  // Helper function to format criterion label
  const formatCriterionLabel = (criterion) => {
    // Return the exact criterion name without any modification
    return criterion;
  };

  // Helper function to normalize validation result
  const normalizeValidationResult = (result) => {
    if (!result || typeof result !== 'object' || result.error) {
      return result;
    }
    
    // Ensure criteria object exists
    if (!result.criteria || typeof result.criteria !== 'object') {
      result.criteria = {};
    }
    
    // Get the list of expected criteria from localStorage
    const expectedCriteria = localStorage.getItem('defaultEvaluationCriteria')
      ?.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const colonIndex = line.indexOf(':');
        return colonIndex > -1 ? line.substring(0, colonIndex).trim() : line.trim();
      }) || [];
    
    // Ensure all expected criteria exist in the result
    expectedCriteria.forEach(criterion => {
      if (!result.criteria[criterion]) {
        result.criteria[criterion] = {
          score: 5,
          explanation: 'No evaluation provided for this criterion'
        };
      }
    });
    
    // Normalize criteria scores
    Object.entries(result.criteria).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        if (value.score !== undefined) {
          value.score = Math.max(0, Math.min(10, Number(value.score)));
        } else {
          value.score = 5;
        }
      } else {
        result.criteria[key] = {
          score: Math.max(0, Math.min(10, Number(value) || 5)),
          explanation: `Score normalized for ${key}`
        };
      }
    });
    
    // Calculate overall score from criteria scores
    if (Object.keys(result.criteria).length > 0) {
      const scores = Object.values(result.criteria)
        .map(c => typeof c === 'object' ? c.score : Number(c))
        .filter(score => !isNaN(score));
        
      if (scores.length > 0) {
        result.overall_score = Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
      }
    }
    
    // Ensure overall score is a number between 0-10
    result.overall_score = Math.max(0, Math.min(10, Number(result.overall_score || 5)));
    
    // Create overall object if it doesn't exist
    if (!result.overall || typeof result.overall !== 'object') {
      result.overall = {
        score: result.overall_score * 10,
        explanation: result.overall_assessment || 'Score calculated from criteria average'
      };
    } else if (typeof result.overall === 'object') {
      result.overall.score = Math.round(result.overall_score * 10);
    }
    
    // Ensure arrays exist
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.weaknesses)) result.weaknesses = [];
    if (!Array.isArray(result.unclear_statements)) result.unclear_statements = [];
    
    return result;
  };

  // Helper function to get score color based on score
  const getScoreColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };


  // Helper function to format response time
  const formatResponseTime = (ms) => {
    if (ms === undefined || ms === null || isNaN(ms)) {
      return 'Unknown';
    }
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Helper function to format cost
  const formatCost = (costValue) => {
    if (costValue === undefined || costValue === null || isNaN(costValue)) return 'N/A';
    
    // Handle zero cost
    if (costValue === 0) return '$0.00';
    
    // Use different formatting based on cost range
    if (costValue < 0.0000001) {
      // For extremely small values, use scientific notation
      return `$${costValue.toExponential(2)}`;
    } else if (costValue < 0.00001) {
      // Very small values with 8 decimal places
      return `$${costValue.toFixed(8)}`;
    } else if (costValue < 0.0001) {
      // Small values with 7 decimal places
      return `$${costValue.toFixed(7)}`;
    } else if (costValue < 0.001) {
      // Medium-small values with 6 decimal places
      return `$${costValue.toFixed(6)}`;
    } else if (costValue < 0.01) {
      // Larger values with 5 decimal places
      return `$${costValue.toFixed(5)}`;
    } else if (costValue < 0.1) {
      // Regular values with 4 decimal places
      return `$${costValue.toFixed(4)}`;
    } else {
      // Larger values with 2 decimal places
      return `$${costValue.toFixed(2)}`;
    }
  };

  // Calculate if any scores are below threshold
  const hasLowScores = Object.values(validationResults || {}).some(result => {
    if (!result || result.error) return false;
    return Object.values(result.criteria || {}).some(criterion => {
      const score = typeof criterion === 'object' ? criterion.score : Number(criterion);
      return score < 8;
    });
  });

  const handleOptimizedPrompt = (newPrompt) => {
    // Update the system prompt
    if (onSystemPromptUpdate) {
      onSystemPromptUpdate(newPrompt);
    }
  };
  
  // Debug function to dump the system prompts structure
  const dumpSystemPromptsInfo = () => {
    console.log("SYSTEM PROMPTS INFO:");
    console.log("systemPrompts object:", systemPrompts);
    console.log("systemPrompts keys:", Object.keys(systemPrompts));
    console.log("Global system prompt:", systemPrompts.global);
    
    // Check for model-specific prompts
    if (validationResults) {
      const setKeys = Object.keys(validationResults || {});
      setKeys.forEach(setKey => {
        const modelMatch = setKey.match(/-([^-]+)$/);
        const modelId = modelMatch ? modelMatch[1] : null;
        if (modelId) {
          console.log(`Checking for prompt for model ${modelId} from set ${setKey}:`, 
            systemPrompts[modelId] ? 'FOUND' : 'NOT FOUND');
        }
        
        const setMatch = setKey.match(/Set (\d+)/);
        const setNumber = setMatch ? setMatch[1] : null;
        if (setNumber) {
          console.log(`Checking for prompt for set${setNumber} from set ${setKey}:`, 
            systemPrompts[`set${setNumber}`] ? 'FOUND' : 'NOT FOUND');
        }
      });
    }
  };

  return (
    <Box>
      {/* Add CSS animation for pulsing effect */}
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
        `}
      </style>
      
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Response Validation</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {/* Add Optimize button next to existing buttons */}
            {hasLowScores && (
              <Tooltip title="Optimize system prompt to improve scores">
                <Button
                  startIcon={<AutoFixHighIcon />}
                  variant="outlined"
                  color="primary"
                  onClick={() => {
                    dumpSystemPromptsInfo();
                    setOptimizerOpen(true);
                  }}
                  disabled={isProcessing}
                >
                  Optimize
                </Button>
              </Tooltip>
            )}
            <Tooltip title="Edit evaluation criteria">
              <Button 
                startIcon={<EditIcon />} 
                size="small" 
                variant="outlined"
                onClick={() => {
                  // When opening the dialog, make sure we show the currently used criteria if validation has been run
                  if (Object.keys(validationResults).length > 0 && !currentlyUsedCriteria) {
                    setCurrentlyUsedCriteria(customCriteria);
                  }
                  setEditCriteriaOpen(true);
                }}
              >
                Criteria
              </Button>
            </Tooltip>
          </Box>
        </Box>
        
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={5}>
            <Typography variant="subtitle2">Validator Model</Typography>
            <FormControl sx={{ m: 1, minWidth: 120 }} size="small">
              <InputLabel id="validator-model-select-label">Model</InputLabel>
              <Select
                labelId="validator-model-select-label"
                id="validator-model-select"
                value={validatorModel}
                label="Model"
                onChange={(e) => {
                  setValidatorModel(e.target.value);
                  localStorage.setItem('responseValidatorModel', e.target.value);
                }}
              >
                {validatorModelOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={7}>
            <Button 
              variant="contained" 
              disabled={isProcessing || (!responses || Object.keys(responses).length === 0)}
              onClick={() => {
                // Debug log to check button state before validation
                console.log('Validate button clicked, disabled status check:', {
                  isProcessing,
                  responsesCheck: !responses || Object.keys(responses).length === 0,
                  responses
                });
                validateResponses();
              }}
              sx={{ mt: 3.5 }}
              fullWidth
            >
              {isProcessing ? 'Validating...' : 'Validate Responses'}
            </Button>
          </Grid>
        </Grid>
        
        {/* Enhanced Validation progress indicator */}
        {isProcessing && (
          <Paper sx={{ 
            mb: 3, 
            p: 3, 
            bgcolor: 'grey.50', 
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 2
          }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                color: 'text.primary'
              }}>
                🔍 Validating Responses
                <Chip 
                  label={`${parallelProgress.completed}/${parallelProgress.total}`} 
                  size="small" 
                  variant="outlined"
                  color="primary"
                  sx={{ 
                    fontWeight: 'bold',
                    bgcolor: 'background.paper'
                  }}
                />
              </Typography>
              
              {/* Progress bar with percentage */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={(parallelProgress.completed / Math.max(1, parallelProgress.total)) * 100}
                  sx={{ 
                    flexGrow: 1, 
                    height: 10, 
                    borderRadius: 5,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: 'success.main',
                      borderRadius: 5
                    }
                  }}
                />
                <Typography variant="body2" sx={{ 
                  fontWeight: 'bold', 
                  minWidth: '40px',
                  color: 'text.primary'
                }}>
                  {Math.round((parallelProgress.completed / Math.max(1, parallelProgress.total)) * 100)}%
                </Typography>
              </Box>

              {/* Current status */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {currentValidatingModel ? (
                    `Currently validating: ${currentValidatingModel.replace(/^Set \d+-/, '')}`
                  ) : (
                    'Preparing validation...'
                  )}
                </Typography>
                
                {/* Estimated time remaining */}
                {parallelProgress.completed > 0 && parallelProgress.total > parallelProgress.completed && (
                  <Typography variant="caption" sx={{ 
                    fontStyle: 'italic',
                    color: 'text.secondary',
                    bgcolor: 'grey.100',
                    px: 1,
                    py: 0.5,
                    borderRadius: 1
                  }}>
                    {(() => {
                      const avgTimePerModel = 15; // Rough estimate: 15 seconds per model
                      const remaining = parallelProgress.total - parallelProgress.completed;
                      const estimatedSeconds = remaining * avgTimePerModel;
                      
                      if (estimatedSeconds < 60) {
                        return `~${estimatedSeconds}s remaining`;
                      } else {
                        const minutes = Math.ceil(estimatedSeconds / 60);
                        return `~${minutes}m remaining`;
                      }
                    })()}
                  </Typography>
                )}
              </Box>

              {/* Individual model status grid */}
              {Object.keys(parallelProgress.models).length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom sx={{ 
                    mb: 1,
                    color: 'text.primary',
                    fontWeight: 600
                  }}>
                    Model Progress:
                  </Typography>
                  <Grid container spacing={1}>
                    {Object.entries(parallelProgress.models).map(([modelName, modelStatus]) => {
                      const cleanModelName = modelName.replace(/^Set \d+-/, '').replace(/ \/ Set \d+$/, '');
                      const isCompleted = modelStatus.status === 'completed';
                      const isProcessing = modelStatus.status === 'processing' || modelName === currentValidatingModel;
                      
                      return (
                        <Grid item xs={6} sm={4} md={3} key={modelName}>
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1,
                            p: 1,
                            borderRadius: 1,
                            bgcolor: isCompleted ? 'success.light' : isProcessing ? 'warning.light' : 'grey.100',
                            color: isCompleted ? 'success.dark' : isProcessing ? 'warning.dark' : 'text.secondary',
                            border: '1px solid',
                            borderColor: isCompleted ? 'success.main' : isProcessing ? 'warning.main' : 'grey.300'
                          }}>
                            <Box sx={{ fontSize: '12px' }}>
                              {isCompleted ? '✅' : isProcessing ? '⏳' : '⏸️'}
                            </Box>
                            <Typography variant="caption" sx={{ 
                              fontSize: '0.75rem',
                              fontWeight: isProcessing ? 'bold' : 'normal',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {cleanModelName}
                            </Typography>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Box>
              )}

              {/* Processing mode indicator */}
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'grey.300' }}>
                <Typography variant="caption" sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  color: 'text.secondary'
                }}>
                  <Box component="span" sx={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    bgcolor: 'success.main',
                    animation: 'pulse 2s infinite'
                  }} />
                  Using chunked parallel processing (5 models at a time)
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}
        
        {/* Display validation results - show partial results even during processing */}
        {validationResults && Object.keys(validationResults).length > 0 && (
          <Box sx={{ mt: 3 }}>
            {/* Summary Table */}
            <Paper sx={{ mb: 3, overflow: 'auto' }}>
              <Box sx={{ p: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1">Response Validation Summary</Typography>
                {isProcessing && (
                  <Chip 
                    label={`${parallelProgress.completed}/${parallelProgress.total} completed`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ 
                      animation: 'pulse 2s infinite',
                      fontWeight: 'bold'
                    }}
                  />
                )}
              </Box>
              <Box sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>Model</th>
                      <th style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>Quality</th>
                      <th style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>Time</th>
                      <th style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>Time Efficiency</th>
                      <th style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>Cost</th>
                      <th style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>Cost Efficiency</th>
                      <th style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>Overall Efficiency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(validationResults)
                      .sort((a, b) => {
                        const modelDataA = effectivenessData.modelData[a[0]] || {};
                        const modelDataB = effectivenessData.modelData[b[0]] || {};
                        
                        // Handle null scores (failed models)
                        const scoreA = modelDataB.comprehensiveEfficiencyScore === null ? -1 : (modelDataB.comprehensiveEfficiencyScore || 0);
                        const scoreB = modelDataA.comprehensiveEfficiencyScore === null ? -1 : (modelDataA.comprehensiveEfficiencyScore || 0);
                        
                        return scoreA - scoreB;
                      })
                      .map(([model, result]) => {
                        if (result.error) return null;
                        
                        const modelMetrics = findMetrics(metrics, model);
                        const responseTime = modelMetrics?.responseTime || modelMetrics?.elapsedTime || 0;
                        const modelEffectiveness = effectivenessData.modelData[model] || {};
                        const cost = modelMetrics?.calculatedCost;
                        
                        // Skip including failed models in best determination
                        const hasFailed = result.overall?.score <= 1 || modelEffectiveness.comprehensiveEfficiencyScore === null;
                        
                        // Highlight best models
                        const isBestValue = !hasFailed && model === effectivenessData.bestValueModel;
                        const isFastest = !hasFailed && model === effectivenessData.fastestModel;
                        const isMostEffective = !hasFailed && model === effectivenessData.mostEffectiveModel;
                        const isLowestCost = !hasFailed && model === effectivenessData.lowestCostModel;
                        
                        const rowStyle = {
                          backgroundColor: isMostEffective ? 'rgba(156, 39, 176, 0.08)' : 
                                          isBestValue ? 'rgba(76, 175, 80, 0.08)' : 
                                          isFastest ? 'rgba(33, 150, 243, 0.08)' : 
                                          isLowestCost ? 'rgba(255, 152, 0, 0.08)' : 'transparent'
                        };
                        
                        return (
                          <tr key={model} style={rowStyle}>
                            <td style={{ padding: '8px 16px', borderBottom: '1px solid #e0e0e0', fontWeight: isMostEffective ? 'bold' : 'normal' }}>
                              {model}
                              {(isMostEffective || isBestValue || isFastest || isLowestCost) && (
                                <Box component="span" ml={1}>
                                  {isMostEffective && <span title="Most Effective">⭐</span>}
                                  {isBestValue && <span title="Best Value">💰</span>}
                                  {isFastest && <span title="Fastest">⚡</span>}
                                  {isLowestCost && <span title="Lowest Cost">💎</span>}
                                </Box>
                              )}
                            </td>
                            <td style={{ 
                              padding: '8px 16px', 
                              textAlign: 'center', 
                              borderBottom: '1px solid #e0e0e0',
                              color: getScoreColor(result.overall?.score || 0),
                              fontWeight: 'bold'
                            }}>
                              {result.overall?.score <= 1 ? 'Failed' : Math.round(result.overall?.score || 0)}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                              {formatResponseTime(responseTime)}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                              {formatTimeEfficiencyScore(modelEffectiveness.timeEfficiencyScore)}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                              {formatCost(cost)}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                              {formatEffectivenessScore(modelEffectiveness.costEfficiencyScore)}
                            </td>
                            <td style={{ 
                              padding: '8px 16px', 
                              textAlign: 'center', 
                              borderBottom: '1px solid #e0e0e0',
                              fontWeight: isMostEffective ? 'bold' : 'normal'
                            }}>
                              {formatComprehensiveEfficiencyScore(modelEffectiveness.comprehensiveEfficiencyScore)}
                            </td>
                          </tr>
                        );
                      })}
                    
                    {/* Show pending models during processing */}
                    {isProcessing && (() => {
                      // Get all models that should be validated
                      const allModels = Object.keys(responses);
                      const completedModels = Object.keys(validationResults);
                      const pendingModels = allModels.filter(model => !completedModels.includes(model));
                      
                      return pendingModels.map(model => (
                        <tr key={`pending-${model}`} style={{ backgroundColor: 'rgba(25, 118, 210, 0.08)' }}>
                          <td style={{ padding: '8px 16px', borderBottom: '1px solid #e0e0e0' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {model}
                              <Box sx={{ 
                                width: 16, 
                                height: 16, 
                                borderRadius: '50%', 
                                bgcolor: currentValidatingModel === model ? 'warning.main' : 'grey.400',
                                animation: currentValidatingModel === model ? 'pulse 1s infinite' : 'none'
                              }} />
                            </Box>
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0', color: '#666' }}>
                            {currentValidatingModel === model ? 'Validating...' : 'Pending'}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0', color: '#666' }}>-</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0', color: '#666' }}>-</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0', color: '#666' }}>-</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0', color: '#666' }}>-</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #e0e0e0', color: '#666' }}>-</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </Box>
            </Paper>
            
            <Grid container spacing={3}>
              {Object.entries(validationResults)
                .sort((a, b) => {
                  const valueA = a[1].overall?.score || 0;
                  const valueB = b[1].overall?.score || 0;
                  const direction = sortConfig.direction === 'ascending' ? 1 : -1;
                  return (valueA - valueB) * direction;
                })
                .map(([model, result]) => {
                  // Skip if there's an error in the result
                  if (result.error) {
                    return (
                      <Grid item xs={12} key={model}>
                        <Card sx={{ mb: 2, border: '1px solid #ff6b6b' }}>
                          <CardHeader 
                            title={<Typography variant="subtitle1">{model}</Typography>}
                            subheader="Validation Failed"
                            sx={{ pb: 1 }}
                          />
                          <CardContent>
                            <Alert severity="error">
                              {result.error}
                            </Alert>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  }
                  
                  // Get metrics for the model if available
                  const modelMetrics = findMetrics(metrics, model);
                  const responseTime = modelMetrics?.responseTime || modelMetrics?.elapsedTime || 0;
                  
                  // Get effectiveness data for this model
                  const modelEffectiveness = effectivenessData.modelData[model] || {};
                  
                  // Get vendor/category for the model
                  const vendor = getModelVendor(model);
                  
                  // Calculate if this is one of the "best" models
                  const isBestValue = model === effectivenessData.bestValueModel;
                  const isFastest = model === effectivenessData.fastestModel;
                  const isMostEffective = model === effectivenessData.mostEffectiveModel;
                  const isLowestCost = model === effectivenessData.lowestCostModel;
                  
                  return (
                    <Grid item xs={12} md={6} key={model}>
                      <Card sx={{ 
                        mb: 2, 
                        border: '1px solid',
                        borderColor: result.overall?.score >= 85 ? '#4caf50' : 
                                    result.overall?.score >= 70 ? '#ff9800' : '#e57373'
                      }}>
                        <CardHeader 
                          title={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle1">{model}</Typography>
                              <Chip 
                                label={vendor} 
                                size="small" 
                                color={
                                  vendor === 'OpenAI' ? 'success' : 
                                  vendor === 'AzureOpenAI' ? 'primary' : 
                                  vendor === 'Anthropic' ? 'secondary' : 'default'
                                }
                                variant="outlined"
                              />
                            </Box>
                          }
                          subheader={
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                              {isBestValue && (
                                <Chip 
                                  label="Best Value" 
                                  size="small" 
                                  color="success" 
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              )}
                              {isFastest && (
                                <Chip 
                                  label="Fastest" 
                                  size="small" 
                                  color="info" 
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              )}
                              {isMostEffective && (
                                <Chip 
                                  label="Most Effective" 
                                  size="small" 
                                  color="secondary" 
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              )}
                              {isLowestCost && (
                                <Chip 
                                  label="Lowest Cost" 
                                  size="small" 
                                  color="warning" 
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              )}
                            </Box>
                          }
                          action={
                            <Box sx={{ pt: 1, pr: 1 }}>
                              <Typography 
                                variant="h5" 
                                color={getScoreColor(result.overall?.score || 0)}
                                sx={{ fontWeight: 'bold' }}
                              >
                                {Math.round(result.overall?.score || 0)}
                              </Typography>
                            </Box>
                          }
                          sx={{ pb: 0 }}
                        />
                        <CardContent sx={{ pt: 1 }}>
                          <Grid container spacing={1}>
                            <Grid item xs={6}>
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="caption" color="textSecondary">Processing Time</Typography>
                                <Typography variant="body2">{formatResponseTime(responseTime)}</Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={6}>
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="caption" color="textSecondary">Cost</Typography>
                                <Typography variant="body2">
                                  {modelMetrics?.calculatedCost !== undefined ? 
                                    formatCost(modelMetrics.calculatedCost) : 'N/A'}
                                </Typography>
                              </Box>
                            </Grid>
                            {modelEffectiveness.costEfficiencyScore !== undefined && (
                              <Grid item xs={6}>
                                <Box sx={{ mb: 1 }}>
                                  <Typography variant="caption" color="textSecondary">Value Efficiency</Typography>
                                  <Typography variant="body2">
                                    {formatEffectivenessScore(modelEffectiveness.costEfficiencyScore)}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                            {modelEffectiveness.timeEfficiencyScore !== undefined && (
                              <Grid item xs={6}>
                                <Box sx={{ mb: 1 }}>
                                  <Typography variant="caption" color="textSecondary">Time Efficiency</Typography>
                                  <Typography variant="body2">
                                    {formatTimeEfficiencyScore(modelEffectiveness.timeEfficiencyScore)}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                          </Grid>
                          
                          <Divider sx={{ my: 1.5 }} />
                          
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Criteria Scores</Typography>
                            <Grid container spacing={2}>
                              {Object.entries(result.criteria || {})
                                .map(([criterion, criterionData], index) => {
                                  const score = typeof criterionData === 'object' ? criterionData.score : criterionData;
                                  const explanation = typeof criterionData === 'object' ? criterionData.explanation : null;
                                  
                                  return (
                                    <Grid item xs={6} key={criterion}>
                                      <Box sx={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        p: 1,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 1
                                      }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                          <Typography variant="body2">
                                            {formatCriterionLabel(criterion)}
                                          </Typography>
                                          {explanation && (
                                            <Tooltip 
                                              title={
                                                <Box>
                                                  <Typography variant="body2" fontWeight="bold">
                                                    {formatCriterionLabel(criterion)}
                                                  </Typography>
                                                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                                                    {explanation}
                                                  </Typography>
                                                </Box>
                                              }
                                              arrow
                                            >
                                              <Box 
                                                component="span" 
                                                sx={{ 
                                                  display: 'flex', 
                                                  alignItems: 'center',
                                                  cursor: 'help',
                                                  color: 'action.active',
                                                  '&:hover': { color: 'primary.main' }
                                                }}
                                              >
                                                <InfoIcon sx={{ fontSize: '1rem' }} />
                                              </Box>
                                            </Tooltip>
                                          )}
                                        </Box>
                                        <Typography 
                                          variant="body2" 
                                          fontWeight="bold"
                                          color={getScoreColor(score * 10)}
                                        >
                                          {score}/10
                                        </Typography>
                                      </Box>
                                    </Grid>
                                  );
                                })}
                            </Grid>
                          </Box>

                          <Accordion>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="subtitle2">Assessment Details</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              {/* Strengths Section */}
                              {result.strengths && result.strengths.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" color="success.main" gutterBottom>
                                    Strengths
                                  </Typography>
                                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                    {result.strengths.map((strength, index) => (
                                      <li key={index}>
                                        <Typography variant="body2">{strength}</Typography>
                                      </li>
                                    ))}
                                  </ul>
                                </Box>
                              )}

                              {/* Areas for Improvement Section */}
                              {result.weaknesses && result.weaknesses.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" color="error.main" gutterBottom>
                                    Areas for Improvement
                                  </Typography>
                                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                    {result.weaknesses.map((weakness, index) => (
                                      <li key={index}>
                                        <Typography variant="body2">{weakness}</Typography>
                                      </li>
                                    ))}
                                  </ul>
                                </Box>
                              )}

                              {/* Unclear Statements Section */}
                              {result.unclear_statements && result.unclear_statements.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" color="warning.main" gutterBottom>
                                    Unclear Statements
                                  </Typography>
                                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                    {result.unclear_statements.map((statement, index) => (
                                      <li key={index}>
                                        <Typography variant="body2">{statement}</Typography>
                                      </li>
                                    ))}
                                  </ul>
                                </Box>
                              )}

                              {/* Detailed Criteria Explanations */}
                              <Box>
                                <Typography variant="subtitle2" gutterBottom>
                                  Detailed Criteria Analysis
                                </Typography>
                                {Object.entries(result.criteria || {}).map(([criterion, criterionData]) => {
                                  const explanation = typeof criterionData === 'object' ? criterionData.explanation : null;
                                  if (!explanation) return null;
                                  
                                  return (
                                    <Box key={criterion} sx={{ mb: 1.5 }}>
                                      <Typography variant="body2" fontWeight="bold">
                                        {formatCriterionLabel(criterion)}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        {explanation}
                                      </Typography>
                                    </Box>
                                  );
                                })}
                              </Box>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion sx={{ mt: 2 }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="subtitle2">Model Response</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                {(() => {
                                  let response = responses[model];
                                  
                                  if (!response && responses.models) {
                                    const setMatch = model.match(/^(Set \d+)-(.+)$/);
                                    if (setMatch) {
                                      const [, setName, modelName] = setMatch;
                                      response = responses.models[setName]?.[modelName];
                                    } else {
                                      Object.values(responses.models).some(setModels => {
                                        if (setModels[model]) {
                                          response = setModels[model];
                                          return true;
                                        }
                                        return false;
                                      });
                                    }
                                  }

                                  if (!response) return 'No response available';
                                  
                                  if (typeof response === 'object') {
                                    if (response.answer && typeof response.answer === 'object' && response.answer.text) {
                                      return response.answer.text;
                                    } else if (response.answer) {
                                      return typeof response.answer === 'string' ? response.answer : JSON.stringify(response.answer, null, 2);
                                    } else if (response.response) {
                                      return typeof response.response === 'string' ? response.response : JSON.stringify(response.response, null, 2);
                                    } else if (response.text) {
                                      return response.text;
                                    } else {
                                      return JSON.stringify(response, null, 2);
                                    }
                                  }
                                  return response;
                                })()}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
            </Grid>
          </Box>
        )}
      </Paper>
      
      {/* Criteria edit dialog */}
      <Dialog 
        open={editCriteriaOpen} 
        onClose={() => setEditCriteriaOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit Evaluation Criteria</DialogTitle>
        <DialogContent>
          {/* Show info about what criteria are being displayed */}
          {Object.keys(validationResults).length > 0 ? (
            <Box sx={{ mb: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                📋 Currently Used Criteria
              </Typography>
              <Typography variant="body2">
                These are the criteria that were used for the most recent validation. 
                Edit them below and click "Save & Revalidate" to apply changes.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                📝 Default Criteria
              </Typography>
              <Typography variant="body2">
                Set up your evaluation criteria. These will be used when you run validation.
              </Typography>
            </Box>
          )}
          <CriteriaTextArea 
            value={Object.keys(validationResults).length > 0 ? currentlyUsedCriteria : customCriteria}
            onChange={(e) => {
              const newValue = e.target.value;
              if (Object.keys(validationResults).length > 0) {
                // If we have validation results, update the currently used criteria
                setCurrentlyUsedCriteria(newValue);
                setCustomCriteria(newValue);
              } else {
                // If no validation yet, just update the custom criteria
                setCustomCriteria(newValue);
              }
            }}
            rows={10}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCriteriaOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={async () => {
              setEditCriteriaOpen(false);
              
              // Use the appropriate criteria value based on whether validation has been run
              const criteriaToSave = Object.keys(validationResults).length > 0 ? currentlyUsedCriteria : customCriteria;
              
              localStorage.setItem('defaultEvaluationCriteria', criteriaToSave);
              localStorage.setItem('responseValidatorModel', validatorModel);
              
              // Update both criteria states to be in sync
              setCustomCriteria(criteriaToSave);
              setCurrentlyUsedCriteria(criteriaToSave);
              
              if (!responses || Object.keys(responses).length === 0) {
                console.error("No responses available to validate");
                alert("No responses available to validate. Please run a query first.");
                return;
              }
              
              setIsProcessing(true);
              handleValidationComplete({});
              try {
                console.log("Re-validating with new criteria:", criteriaToSave);
                await validateResponses();
              } catch (error) {
                console.error("Error during revalidation:", error);
                setIsProcessing(false);
              }
            }}
          >
            Save & Revalidate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add PromptOptimizer dialog */}
      <PromptOptimizer
        open={optimizerOpen}
        onClose={() => setOptimizerOpen(false)}
        currentSystemPrompt={systemPrompts.global || ''}
        validationResults={validationResults}
        onPromptOptimized={handleOptimizedPrompt}
        validatorModel={validatorModel}
        propCurrentQuery={(() => {
          console.warn('===== RESPONSE VALIDATION =====');
          console.warn('Passing currentQuery to PromptOptimizer:', currentQuery);
          console.warn('Is currentQuery defined?', currentQuery !== undefined);
          console.warn('currentQuery type:', typeof currentQuery);
          console.warn('currentQuery length:', currentQuery ? currentQuery.length : 0);
          console.warn('===============================');
          return currentQuery;
        })()}
        systemPrompts={{
          global: systemPrompts.global || '',
          ...systemPrompts,
          ...(Object.keys(validationResults || {}).reduce((acc, setKey) => {
            const setMatch = setKey.match(/Set (\d+)/);
            const setNumber = setMatch ? setMatch[1] : null;
            if (setNumber && !acc[`set${setNumber}`]) {
              acc[`set${setNumber}`] = systemPrompts.global || '';
            }
            return acc;
          }, {}))
        }}
        responses={responses}
      />
    </Box>
  );
}

export default ResponseValidation; 