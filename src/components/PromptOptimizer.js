import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  LinearProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Slider,
  Grid,
  IconButton,
  Tooltip,
  Switch,
  Divider,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Link
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ReactDiffViewer, { lightTheme, DiffMethod } from 'react-diff-viewer';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { v4 as uuidv4 } from 'uuid';
import models from '../config/llmConfig';
import { debugLogResponseData } from '../utils/promptOptimizerDebug';
import { getLineDiff, getWordDiff } from '../utils/diffUtils';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

// Default constants - now configurable by user
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_SCORE_THRESHOLD = 8;

// Import defaultSettings and defaultModels
const { defaultSettings, defaultModels } = require('../config/llmConfig');

export default function PromptOptimizer({
  open,
  onClose,
  currentSystemPrompt,
  validationResults,
  onPromptOptimized,
  validatorModel,
  generatorModel,
  systemPrompts = {},
  availableModels = [],
  propCurrentQuery,
  responses,
}) {
  // Log the propCurrentQuery when the component receives it with high visibility
  console.warn('===== PROMPT OPTIMIZER MOUNT =====');
  console.warn('propCurrentQuery received:', propCurrentQuery);
  console.warn('Is propCurrentQuery defined?', propCurrentQuery !== undefined);
  console.warn('propCurrentQuery type:', typeof propCurrentQuery);
  console.warn('propCurrentQuery length:', propCurrentQuery ? propCurrentQuery.length : 0);
  console.warn('================================');

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [optimizationHistory, setOptimizationHistory] = useState([]);
  const [bestPrompt, setBestPrompt] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSet, setSelectedSet] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [initialPrompt, setInitialPrompt] = useState(currentSystemPrompt || '');
  const [selectedModel, setSelectedModel] = useState(generatorModel || defaultSettings.defaultModel || 'gpt-4o-mini');
  const [localModelQuery, setLocalModelQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [maxIterations, setMaxIterations] = useState(DEFAULT_MAX_ITERATIONS);
  const [scoreThreshold, setScoreThreshold] = useState(DEFAULT_SCORE_THRESHOLD);
  const [status, setStatus] = useState("");
  
  
  // Comparison dialog state
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [comparedIteration, setComparedIteration] = useState(null);
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false);

  // State for the LLM models loaded from localStorage
  const [models, setModels] = useState({});

  // Load models from localStorage on component mount
  useEffect(() => {
    if (open) {
      console.log("Loading LLM models from localStorage for optimization");
      const savedModels = localStorage.getItem('llmModels');
      if (savedModels) {
        try {
          const parsedModels = JSON.parse(savedModels);
          console.log("Loaded models from localStorage:", parsedModels);
          setModels(parsedModels);
        } catch (err) {
          console.error('Error parsing saved models:', err);
          setModels(defaultModels);
        }
      } else {
        console.log("Using default models:", defaultModels);
        setModels(defaultModels);
      }
    }
  }, [open]);

  // Get evaluation criteria from localStorage or use default
  const evaluationCriteria = useMemo(() => {
    const savedCriteria = localStorage.getItem('defaultEvaluationCriteria') || 
                          defaultSettings.defaultEvaluationCriteria;
    
    // Parse the criteria text into an array of criterion names
    return savedCriteria.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Extract criterion name (everything before the colon)
        const match = line.match(/^([^:]+):/);
        return match ? match[1].trim() : null;
      })
      .filter(name => name !== null);
  }, []);

  // Get the full evaluation criteria text
  const evaluationCriteriaText = useMemo(() => {
    return localStorage.getItem('defaultEvaluationCriteria') || 
           defaultSettings.defaultEvaluationCriteria;
  }, []);

  const availableSets = useMemo(() => {
    return Object.keys(validationResults || {});
  }, [validationResults]);

  // Direct access to validation set data to find prompts
  const findPromptInValidationData = useCallback((setKey) => {
    if (!setKey || !validationResults || !validationResults[setKey]) return null;
    
    const data = validationResults[setKey];
    console.log(`Looking for prompt in validation data for ${setKey}:`, data);
    
    // Check for system prompt in various places
    if (data.systemPrompt) return data.systemPrompt;
    if (data.prompt) return data.prompt;
    if (data.system) return data.system;
    
    // Look in requests/response
    if (data.request && data.request.systemPrompt) return data.request.systemPrompt;
    if (data.response && data.response.systemPrompt) return data.response.systemPrompt;
    
    return null;
  }, [validationResults]);

  // Define getSystemPromptForSet first
  const getSystemPromptForSet = useCallback((setKey) => {
    if (!setKey) {
      console.log("No set key provided, using default prompt:", currentSystemPrompt);
      return currentSystemPrompt;
    }

    console.log("Looking up prompt for set:", setKey);
    console.log("Available system prompts:", systemPrompts);
    console.log("Current system prompt:", currentSystemPrompt);

    // Try to extract from validation data directly
    const promptFromValidation = findPromptInValidationData(setKey);
    if (promptFromValidation) {
      console.log(`Found prompt in validation data for ${setKey}:`, promptFromValidation);
      return promptFromValidation;
    }

    // Extract model ID from set key (e.g., "Set 1-gpt-4o-mini" -> "gpt-4o-mini")
    const modelMatch = setKey.match(/-([^-]+)$/);
    let targetModel = modelMatch ? modelMatch[1] : null;
    
    // If no model in the set name, use validatorModel or selectedModel as fallback
    if (!targetModel) {
      targetModel = validatorModel || selectedModel || "unknown";
      console.log(`No model found in set name, using fallback: ${targetModel}`);
    }
    
    // Ensure we're using the full model name
    console.log(`Using full model name for TARGET MODEL: ${targetModel}`);
    
    // If set has an explicit system prompt in systemPrompts
    if (targetModel && systemPrompts[targetModel]) {
      console.log(`Found system prompt for model ${targetModel} in set ${setKey}:`, systemPrompts[targetModel]);
      return systemPrompts[targetModel];
    }
    
    // Try to extract set number (e.g., "Set 1-gpt-4o-mini" -> "1")
    const setMatch = setKey.match(/Set (\d+)/);
    const setNumber = setMatch ? setMatch[1] : null;
    console.log("Extracted set number:", setNumber);
    
    // If there's a system prompt for this set number
    if (setNumber && systemPrompts[`set${setNumber}`]) {
      console.log(`Found system prompt for set ${setNumber}:`, systemPrompts[`set${setNumber}`]);
      return systemPrompts[`set${setNumber}`];
    }
    
    // Also look for direct match with set key
    if (systemPrompts[setKey]) {
      console.log(`Found system prompt for exact set key ${setKey}:`, systemPrompts[setKey]);
      return systemPrompts[setKey];
    }

    // As a last resort, look for a different property name other than "global"
    const globalPrompt = systemPrompts.global || systemPrompts.default || systemPrompts.base || currentSystemPrompt;
    console.log(`Using global system prompt for ${setKey}:`, globalPrompt);
    return globalPrompt || currentSystemPrompt || "";
  }, [currentSystemPrompt, systemPrompts, validatorModel, selectedModel, findPromptInValidationData]);

  // Then define extractValidationData
  const extractValidationData = useCallback((setKey) => {
    if (!setKey || !validationResults || !validationResults[setKey]) {
      console.warn(`No validation results found for ${setKey}`);
      return null;
    }
    
    const data = validationResults[setKey];
    console.log(`Extracting validation data for ${setKey}:`, data);
    
    // First try to get criteria directly
    if (data.criteria && Object.keys(data.criteria).length > 0) {
      console.log(`Found criteria directly in validation results for ${setKey}`);
      return {
        prompt: getSystemPromptForSet(setKey),
        scores: data.criteria
      };
    }
    
    // Try to find scores in different locations
    if (data.scores) {
      // If scores is directly available
      console.log(`Found scores object in validation results for ${setKey}`);
      
      // Check if scores contains criteria-like objects
      const firstScore = Object.values(data.scores)[0];
      if (firstScore && (firstScore.score !== undefined || firstScore.explanation !== undefined)) {
        return {
          prompt: getSystemPromptForSet(setKey),
          scores: data.scores
        };
      }
    }
    
    // Look for criteria in response
    if (data.response && data.response.criteria) {
      console.log(`Found criteria in response for ${setKey}`);
      return {
        prompt: getSystemPromptForSet(setKey),
        scores: data.response.criteria
      };
    }
    
    // Look for overall scores that might be criteria
    if (data.overall) {
      console.log(`Found overall object in validation results for ${setKey}`);
      
      // Check if it's a criteria object
      if (typeof data.overall === 'object' && data.overall.score !== undefined) {
        // This might be a single criterion - convert to expected format
        const syntheticCriteria = {};
        syntheticCriteria["Overall Quality"] = {
          score: data.overall.score,
          explanation: data.overall.explanation || "Overall quality score",
          suggestion: data.overall.suggestion || "Improve system prompt"
        };
        
        // Add any other criteria if available
        if (data.accuracy && data.accuracy.score !== undefined) {
          syntheticCriteria["Accuracy"] = {
            score: data.accuracy.score,
            explanation: data.accuracy.explanation || "Accuracy score",
            suggestion: data.accuracy.suggestion || "Improve accuracy"
          };
        }
        
        if (data.relevance && data.relevance.score !== undefined) {
          syntheticCriteria["Relevance"] = {
            score: data.relevance.score,
            explanation: data.relevance.explanation || "Relevance score",
            suggestion: data.relevance.suggestion || "Improve relevance"
          };
        }
        
        return {
          prompt: getSystemPromptForSet(setKey),
          scores: syntheticCriteria
        };
      }
    }
    
    console.warn(`Could not find valid criteria/scores data for ${setKey}`);
    return null;
  }, [validationResults, getSystemPromptForSet]);

  // Now all the useEffect hooks with these functions in their dependencies will work correctly
  
  // Update prompt when set changes
  useEffect(() => {
    if (selectedSet) {
      console.log("Set changed to:", selectedSet);
      const promptForSet = getSystemPromptForSet(selectedSet);
      console.log(`Setting prompt for ${selectedSet}:`, promptForSet);
      setInitialPrompt(promptForSet || "");
    }
  }, [selectedSet, systemPrompts, currentSystemPrompt, getSystemPromptForSet]);

  // Update the initialization useEffect to use the extraction function (around line 150)
  useEffect(() => {
    if (open) {
      console.log("Dialog opened, initializing state");
      setCurrentIteration(0);
      setOptimizationHistory([]);
      setBestPrompt(null);
      setError(null);
      
      console.log("Available sets:", availableSets);
      console.log("System prompts object:", systemPrompts);
      console.log("Current system prompt:", currentSystemPrompt);
      
      // Set the selected set if available
      if (availableSets.length > 0) {
        const firstSet = availableSets[0];
        console.log("Setting initial set to:", firstSet);
        
        // Initial prompt will be set by the selectedSet effect
        setSelectedSet(firstSet);
        
        // Immediately try to extract validation data for the first set
        const validationData = extractValidationData(firstSet);
        
        if (validationData && validationData.scores) {
          console.log("Successfully extracted initial validation data:", validationData);
          
          // Calculate average score
          const scoreValues = Object.values(validationData.scores).map(item => item.score);
          const avgScore = scoreValues.length > 0 ? 
            scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : 0;
          
          // Add to optimization history
          setOptimizationHistory([{
            iteration: 0,
            prompt: validationData.prompt,
            scores: validationData.scores,
            averageScore: avgScore
          }]);
          
          // Set best prompt
          setBestPrompt(validationData.prompt);
        } else {
          console.warn(`No valid validation data found for initial set ${firstSet}`);
        }
      } else {
        // No sets available, use global prompt
        console.log("No sets available, using current system prompt");
        setInitialPrompt(currentSystemPrompt || "");
      }
    }
  }, [open, availableSets, currentSystemPrompt, systemPrompts, validationResults, extractValidationData]);

  // Debug log to see what's in validation results
  useEffect(() => {
    if (open && validationResults && selectedSet) {
      console.log("Selected set:", selectedSet);
      console.log("System prompt for set:", getSystemPromptForSet(selectedSet));
    }
  }, [open, validationResults, selectedSet]);

  // Effect to handle initial model selection and updates
  useEffect(() => {
    if (open) {
      // First try generatorModel from props
      if (generatorModel) {
        console.log(`Setting model from generatorModel prop: ${generatorModel}`);
        setSelectedModel(generatorModel);
      } 
      // Then try localStorage for responseValidatorModel as fallback
      else {
        const savedGeneratorModel = localStorage.getItem('promptAdvisorModel');
        if (savedGeneratorModel) {
          console.log(`Setting model from localStorage promptAdvisorModel: ${savedGeneratorModel}`);
          setSelectedModel(savedGeneratorModel);
        }
        // If neither is available, use validatorModel or default
        else if (validatorModel) {
          console.log(`Using validatorModel as fallback: ${validatorModel}`);
          setSelectedModel(validatorModel);
        }
      }
    }
  }, [open, generatorModel, validatorModel]);

  // Debug log to see model information - update the array dependencies
  useEffect(() => {
    if (open) {
      console.log("Current validator model:", validatorModel);
      console.log("Current generator model:", generatorModel);
      console.log("Selected model for optimization:", selectedModel);
      console.log("Models available:", models);
    }
  }, [open, validatorModel, generatorModel, selectedModel, models]);

  const updateProgress = (step, current, total) => {
    setCurrentStep(step);
    setProgress({ current, total });
  };

  // Keep fallbackModels as an emergency backup
  const fallbackModels = [
    { id: 'gpt-4o', name: 'GPT-4o', type: 'chat', badge: 'OpenAI' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', type: 'chat', badge: 'OpenAI' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', type: 'chat', badge: 'OpenAI' },
    { id: 'claude-3-opus', name: 'Claude 3 Opus', type: 'chat', badge: 'Anthropic' },
    { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', type: 'chat', badge: 'Anthropic' },
    { id: 'claude-3-haiku', name: 'Claude 3 Haiku', type: 'chat', badge: 'Anthropic' }
  ];

  // Refactor createLlmInstance to accept a modelId parameter
  const createLlmInstance = (modelIdOverride) => {
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
    const useProxy = !apiKey || apiKey === '';
    const endpoint = useProxy ? '/api/proxy/openai' : 'https://api.openai.com/v1';

    // Use the provided modelIdOverride, or fallback to selectedModel
    const modelToUse = modelIdOverride || selectedModel || generatorModel || defaultSettings.defaultModel || 'gpt-4o-mini';

    // Get vendor information from the loaded models
    const modelConfig = models[modelToUse] || {};
    const vendor = modelConfig.vendor || (
      modelToUse.startsWith('gpt') || modelToUse.startsWith('o1') || modelToUse.startsWith('o3') ? 'OpenAI' :
      modelToUse.startsWith('claude') ? 'Anthropic' : 'OpenAI'
    );

    console.log(`Using ${modelToUse} (${vendor}) for LLM call`);

    return {
      generate: async (prompt) => {
        try {
          console.log(`Generating with ${modelToUse}`);
          const headers = {
            'Content-Type': 'application/json',
          };
          if (!useProxy && apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          // Anthropic
          if (vendor === 'Anthropic') {
            const anthropicKey = process.env.REACT_APP_ANTHROPIC_API_KEY || localStorage.getItem('anthropicApiKey');
            if (!anthropicKey) throw new Error('Anthropic API key not configured');
            const anthropicHeaders = {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01'
            };
            const anthropicEndpoint = '/api/proxy/anthropic';
            const anthropicResponse = await fetch(`${anthropicEndpoint}/v1/messages`, {
              method: 'POST',
              headers: anthropicHeaders,
              body: JSON.stringify({
                model: modelToUse,
                messages: [
                  { role: 'user', content: prompt }
                ],
                max_tokens: 1000,
                ...(modelToUse !== 'claude-3-sonnet' && modelToUse !== 'claude-3-haiku' ? { temperature: 0.7 } : {})
              }),
            });
            if (!anthropicResponse.ok) {
              const contentType = anthropicResponse.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const errorData = await anthropicResponse.json();
                throw new Error(`Anthropic API error: ${errorData.error?.message || anthropicResponse.statusText}`);
              } else {
                const errorText = await anthropicResponse.text();
                throw new Error(`Anthropic API error: ${anthropicResponse.status} ${anthropicResponse.statusText}`);
              }
            }
            const anthropicData = await anthropicResponse.json();
            return anthropicData.content[0].text;
          }
          // OpenAI
          const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: modelToUse,
              messages: [
                { role: 'system', content: 'You are a helpful AI assistant.' },
                { role: 'user', content: prompt }
              ],
              ...(modelToUse !== 'o3-mini' ? { temperature: 0.7 } : {})
            }),
          });
          if (!response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await response.json();
              throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
            } else {
              const errorText = await response.text();
              throw new Error(`API error: ${response.status} ${response.statusText}`);
            }
          }
          const data = await response.json();
          return data.choices[0].message.content;
        } catch (error) {
          console.error('LLM generation error:', error);
          throw error;
        }
      }
    };
  };

  const renderValidationResults = (results) => {
    if (!results || !results.criteria) return null;
    
    return (
      <Box mb={3}>
        <Typography variant="h6" component="div" gutterBottom>
          Validation Results
        </Typography>
        <List>
          {Object.entries(results.criteria).map(([criterion, details]) => (
            <ListItem key={criterion}>
              <ListItemText
                primary={
                  <Typography component="div">
                    {criterion}: <strong>{details.score}/10</strong>
                  </Typography>
                }
                secondary={
                  <div>
                    <Typography component="div" variant="body2">
                      {details.explanation}
                    </Typography>
                    <Typography component="div" variant="body2" sx={{ mt: 1 }}>
                      <strong>Suggestion:</strong> {details.suggestion}
                    </Typography>
                  </div>
                }
              />
            </ListItem>
          ))}
        </List>
      </Box>
    );
  };

  const renderSummaryTable = () => {
    if (optimizationHistory.length === 0) return null;
    
    // Calculate best score
    const bestScore = Math.max(...optimizationHistory.map(h => h.averageScore || 0));
    
    // Get previous scores for comparison
    const getScoreTrend = (currentIndex, criterionName) => {
      if (currentIndex === 0) return null;
      const currentScore = optimizationHistory[currentIndex].scores?.[criterionName]?.score;
      const prevScore = optimizationHistory[currentIndex-1].scores?.[criterionName]?.score;
      
      if (currentScore === undefined || prevScore === undefined) return null;
      
      if (currentScore > prevScore) return "▲";
      if (currentScore < prevScore) return "▼";
      return "–";
    };
    
    // Function to get score color
    const getScoreColor = (score) => {
      if (score >= 9) return 'success.main';
      if (score >= 7) return 'success.light';
      if (score >= 5) return '#f0ad4e'; // Warning yellow
      return 'error.main';
    };
    
    return (
      <Box mb={4}>
        <Typography variant="h6" component="div" gutterBottom>
          Optimization Summary
        </Typography>
        <TableContainer component={Paper} elevation={2}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'background.paper' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Iteration</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Avg Score</TableCell>
                {evaluationCriteria.map(criterion => (
                  <TableCell key={criterion} sx={{ fontWeight: 'bold' }}>{criterion}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {optimizationHistory.map((item, index) => {
                const isBestScore = item.averageScore === bestScore;
                
                return (
                  <TableRow 
                    key={item.iteration}
                    sx={{ 
                      backgroundColor: isBestScore ? 'rgba(76, 175, 80, 0.15)' : 
                                      (item.averageScore >= scoreThreshold ? 'rgba(76, 175, 80, 0.05)' : 'inherit'),
                      fontWeight: isBestScore ? 'bold' : 'normal'
                    }}
                  >
                    <TableCell>
                      {item.iteration === 0 ? "Original" : `Iteration ${item.iteration}`}
                    </TableCell>
                    <TableCell>
                      <Typography 
                        component="span" 
                        sx={{ 
                          fontWeight: 'medium',
                          color: getScoreColor(item.averageScore) 
                        }}
                      >
                        {item.averageScore ? item.averageScore.toFixed(2) : 'N/A'}
                      </Typography>
                      {index > 0 && (
                        <Typography 
                          component="span" 
                          color={item.averageScore > optimizationHistory[index-1].averageScore ? "success.main" : 
                                 item.averageScore < optimizationHistory[index-1].averageScore ? "error.main" : "text.secondary"}
                          sx={{ ml: 1, fontSize: '0.85rem' }}
                        >
                          {item.averageScore > optimizationHistory[index-1].averageScore ? "▲" : 
                           item.averageScore < optimizationHistory[index-1].averageScore ? "▼" : "–"}
                        </Typography>
                      )}
                    </TableCell>
                    {evaluationCriteria.map(criterion => (
                      <TableCell key={criterion}>
                        <Typography 
                          component="span" 
                          sx={{ 
                            color: getScoreColor(item.scores?.[criterion]?.score || 0)
                          }}
                        >
                          {item.scores?.[criterion]?.score ?? 'N/A'}
                        </Typography>
                        {index > 0 && (
                          <Typography 
                            component="span" 
                            color={getScoreTrend(index, criterion) === "▲" ? "success.main" : 
                                   getScoreTrend(index, criterion) === "▼" ? "error.main" : "text.secondary"}
                            sx={{ ml: 0.5, fontSize: '0.85rem' }}
                          >
                            {getScoreTrend(index, criterion)}
                          </Typography>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // Function to open the comparison dialog for a specific iteration
  const openCompareDialog = (iteration) => {
    // Prevent comparing iteration 0 to itself
    if (iteration === 0) return;
    setComparedIteration(iteration);
    setCompareDialogOpen(true);
  };

  // Function to close the comparison dialog
  const closeCompareDialog = () => {
    setCompareDialogOpen(false);
    setComparedIteration(null);
  };

  // New function to render the comparison dialog
  const renderComparisonDialog = () => {
    if (!compareDialogOpen || comparedIteration === null || optimizationHistory.length < 2) {
      return null;
    }

    // Get the original prompt (iteration 0)
    const originalData = optimizationHistory.find(item => item.iteration === 0);
    // Get the compared iteration
    const iterationData = optimizationHistory.find(item => item.iteration === comparedIteration);

    if (!originalData || !iterationData) {
      return null;
    }

    // If prompts are identical, show a message instead of the diff UI
    if ((originalData.prompt || '') === (iterationData.prompt || '')) {
      return (
        <Dialog open={compareDialogOpen} onClose={closeCompareDialog} maxWidth="lg" fullWidth>
          <DialogTitle>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">
                Comparing Original Prompt vs. Iteration {comparedIteration}
              </Typography>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Box p={4} textAlign="center">
              <Typography variant="body1" color="text.secondary">
                No changes between these iterations.
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeCompareDialog} color="secondary">
              Close
            </Button>
          </DialogActions>
        </Dialog>
      );
    }

    // Function to get score color
    const getScoreColor = (score) => {
      if (score >= 9) return 'success.main';
      if (score >= 7) return 'success.light';
      if (score >= 5) return '#f0ad4e'; // Warning yellow
      return 'error.main';
    };

    // Calculate score differences
    const calculateDiff = (criterion) => {
      const origScore = originalData.scores?.[criterion]?.score;
      const iterScore = iterationData.scores?.[criterion]?.score;
      
      if (origScore === undefined || iterScore === undefined) return null;
      
      const diff = iterScore - origScore;
      const formattedDiff = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      const color = diff > 0 ? 'success.main' : (diff < 0 ? 'error.main' : 'text.secondary');
      
      return { value: formattedDiff, color, hasChanged: diff !== 0 };
    };

    // Calculate average score diff
    const origAvg = originalData.averageScore || 0;
    const iterAvg = iterationData.averageScore || 0;
    const avgDiff = iterAvg - origAvg;
    const formattedAvgDiff = avgDiff > 0 ? `+${avgDiff.toFixed(2)}` : avgDiff.toFixed(2);
    const avgDiffColor = avgDiff > 0 ? 'success.main' : (avgDiff < 0 ? 'error.main' : 'text.secondary');

    // Function to generate visual diff for prompts
    const generateDiffView = () => {
      let origLines = originalData.prompt.split('\n');
      let iterLines = iterationData.prompt.split('\n');
      if (ignoreWhitespace) {
        origLines = origLines.map(l => l.trim());
        iterLines = iterLines.map(l => l.trim());
      }
      // Simple diff highlighting
      const diffResult = [];
      const maxLen = Math.max(origLines.length, iterLines.length);
      for (let i = 0; i < maxLen; i++) {
        const origLine = i < origLines.length ? origLines[i] : '';
        const iterLine = i < iterLines.length ? iterLines[i] : '';
        const isChanged = origLine !== iterLine;
        if (!showOnlyDiffs || isChanged) {
          diffResult.push({ origLine, iterLine, isChanged });
        }
      }
      return diffResult;
    };

    // Generate diff for display
    const diffLines = generateDiffView();
    
    // Filter criteria if showing only diffs
    const filteredCriteria = evaluationCriteria.filter(criterion => {
      if (!showOnlyDiffs) return true;
      const diff = calculateDiff(criterion);
      return diff && diff.hasChanged;
    });

    return (
      <Dialog 
        open={compareDialogOpen} 
        onClose={closeCompareDialog} 
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              Comparing Original Prompt vs. Iteration {comparedIteration}
            </Typography>
            <Box display="flex" alignItems="center">
              <Typography variant="body2" mr={1}>Show only differences:</Typography>
              <Switch
                checked={showOnlyDiffs}
                onChange={(e) => setShowOnlyDiffs(e.target.checked)}
                color="primary"
                size="small"
              />
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3}>
            {/* Scores comparison section */}
            <Grid item xs={12}>
              <Box mb={3}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Score Comparison
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Criterion</TableCell>
                        <TableCell>Original</TableCell>
                        <TableCell>Iteration {comparedIteration}</TableCell>
                        <TableCell>Difference</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredCriteria.map(criterion => {
                        const origScore = originalData.scores?.[criterion]?.score;
                        const iterScore = iterationData.scores?.[criterion]?.score;
                        const diff = calculateDiff(criterion);
                        
                        return (
                          <TableRow key={criterion}>
                            <TableCell><strong>{criterion}</strong></TableCell>
                            <TableCell style={{ color: getScoreColor(origScore) }}>
                              {origScore !== undefined ? origScore.toFixed(1) : 'N/A'}
                            </TableCell>
                            <TableCell style={{ color: getScoreColor(iterScore) }}>
                              {iterScore !== undefined ? iterScore.toFixed(1) : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {diff && (
                                <Typography component="span" sx={{ color: diff.color, fontWeight: 'bold' }}>
                                  {diff.value}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow sx={{ bgcolor: 'background.default' }}>
                        <TableCell><strong>Average</strong></TableCell>
                        <TableCell style={{ color: getScoreColor(origAvg), fontWeight: 'bold' }}>
                          {origAvg.toFixed(2)}
                        </TableCell>
                        <TableCell style={{ color: getScoreColor(iterAvg), fontWeight: 'bold' }}>
                          {iterAvg.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Typography component="span" sx={{ color: avgDiffColor, fontWeight: 'bold' }}>
                            {formattedAvgDiff}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Grid>
            
            {/* Prompt comparison section */}
            <Grid item xs={12}>
              <Box mb={3}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Prompt Differences
                </Typography>
                <Box display="flex" alignItems="center" mb={1} gap={2}>
                  <Switch
                    checked={ignoreWhitespace}
                    onChange={e => setIgnoreWhitespace(e.target.checked)}
                    color="primary"
                    size="small"
                  />
                  <Typography variant="body2">
                    Ignore whitespace/formatting changes
                  </Typography>
                  <Switch
                    checked={diffGranularity === 'word'}
                    onChange={e => setDiffGranularity(e.target.checked ? 'word' : 'line')}
                    color="primary"
                    size="small"
                  />
                  <Typography variant="body2">
                    Word-level diff
                  </Typography>
                  <Switch
                    checked={showRawDebug}
                    onChange={e => setShowRawDebug(e.target.checked)}
                    color="secondary"
                    size="small"
                  />
                  <Typography variant="body2">
                    Debug: Show raw/invisible chars
                  </Typography>
                </Box>
                {/* Advanced custom diff view */}
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default', p: 1, maxHeight: 400, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {(() => {
                    const contextLines = 2;
                    if (diffGranularity === 'word') {
                      // Word-level diff, line by line
                      let origLines = originalData.prompt.split('\n');
                      let iterLines = iterationData.prompt.split('\n');
                      if (ignoreWhitespace) {
                        origLines = origLines.map(l => l.trim());
                        iterLines = iterLines.map(l => l.trim());
                      }
                      const maxLen = Math.max(origLines.length, iterLines.length);
                      let hasAnyChange = false;
                      const rendered = Array.from({ length: maxLen }).map((_, i) => {
                        const oldLine = origLines[i] || '';
                        const newLine = iterLines[i] || '';
                        const wordDiff = getWordDiff(oldLine, newLine);
                        const hasChange = wordDiff.some(part => part.added || part.removed);
                        if (hasChange) hasAnyChange = true;
                        if (!showOnlyDiffs || hasChange) {
                          return (
                            <Box key={i} sx={{ display: 'flex', gap: 2, mb: 0.5 }}>
                              <Box sx={{ flex: 1, pr: 1, borderRight: '1px solid #eee' }}>
                                {wordDiff.map((part, idx) => (
                                  <span key={idx} style={{ background: part.removed ? 'rgba(244,67,54,0.15)' : undefined, color: part.removed ? '#d32f2f' : undefined }}>{showRawDebug ? visualizeInvisible(part.value) : part.value}</span>
                                ))}
                              </Box>
                              <Box sx={{ flex: 1, pl: 1 }}>
                                {wordDiff.map((part, idx) => (
                                  <span key={idx} style={{ background: part.added ? 'rgba(76,175,80,0.15)' : undefined, color: part.added ? '#388e3c' : undefined }}>{showRawDebug ? visualizeInvisible(part.value) : part.value}</span>
                                ))}
                              </Box>
                            </Box>
                          );
                        }
                        return null;
                      });
                      if (!hasAnyChange) {
                        return <Typography variant="body2" color="text.secondary">No differences found.</Typography>;
                      }
                      return rendered;
                    }
                    // Line-level diff with context
                    const lineDiff = getLineDiff(originalData.prompt, iterationData.prompt, contextLines);
                    const filtered = lineDiff.filter(part => !showOnlyDiffs || part.added || part.removed);
                    if (filtered.length === 0) {
                      return <Typography variant="body2" color="text.secondary">No differences found.</Typography>;
                    }
                    return filtered.map((part, idx) => (
                      <Box key={idx} sx={{ display: 'flex', gap: 2, mb: 0.5 }}>
                        <Box sx={{ flex: 1, pr: 1, borderRight: '1px solid #eee', bgcolor: part.removed ? 'rgba(244,67,54,0.15)' : part.context ? 'rgba(33,150,243,0.05)' : undefined, color: part.removed ? '#d32f2f' : undefined }}>
                          {showRawDebug ? visualizeInvisible(part.value) : part.value}
                        </Box>
                        <Box sx={{ flex: 1, pl: 1, bgcolor: part.added ? 'rgba(76,175,80,0.15)' : part.context ? 'rgba(33,150,243,0.05)' : undefined, color: part.added ? '#388e3c' : undefined }}>
                          {showRawDebug ? visualizeInvisible(part.value) : part.value}
                        </Box>
                      </Box>
                    ));
                  })()}
                </Box>
              </Box>
            </Grid>
            
            {/* Feedback comparison section */}
            <Grid item xs={12}>
              <Box mt={2}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Feedback Comparison
                </Typography>
                
                <Grid container spacing={2}>
                  {filteredCriteria.map(criterion => {
                    const origFeedback = originalData.scores?.[criterion];
                    const iterFeedback = iterationData.scores?.[criterion];
                    
                    if (!origFeedback || !iterFeedback) return null;
                    
                    // Skip unchanged feedback if showing only diffs
                    if (showOnlyDiffs && 
                        origFeedback.explanation === iterFeedback.explanation && 
                        origFeedback.suggestion === iterFeedback.suggestion) return null;
                    
                    return (
                      <Grid item xs={12} key={criterion}>
                        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom color="primary.main">
                            {criterion}
                          </Typography>
                          
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Typography variant="body2" gutterBottom color="text.secondary">
                                <strong>Original Explanation:</strong>
                              </Typography>
                              <Typography 
                                variant="body2" 
                                paragraph
                                sx={{
                                  bgcolor: origFeedback.explanation !== iterFeedback.explanation ? 
                                    'rgba(255, 152, 0, 0.08)' : 'inherit',
                                  p: origFeedback.explanation !== iterFeedback.explanation ? 1 : 0,
                                  borderRadius: 1
                                }}
                              >
                                {origFeedback.explanation}
                              </Typography>
                              
                              <Typography variant="body2" gutterBottom color="text.secondary">
                                <strong>Original Suggestion:</strong>
                              </Typography>
                              <Typography 
                                variant="body2"
                                sx={{
                                  bgcolor: origFeedback.suggestion !== iterFeedback.suggestion ? 
                                    'rgba(255, 152, 0, 0.08)' : 'inherit',
                                  p: origFeedback.suggestion !== iterFeedback.suggestion ? 1 : 0,
                                  borderRadius: 1
                                }}
                              >
                                {origFeedback.suggestion}
                              </Typography>
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                              <Typography variant="body2" gutterBottom color="text.secondary">
                                <strong>Iteration {comparedIteration} Explanation:</strong>
                              </Typography>
                              <Typography 
                                variant="body2" 
                                paragraph
                                sx={{
                                  bgcolor: origFeedback.explanation !== iterFeedback.explanation ? 
                                    'rgba(76, 175, 80, 0.08)' : 'inherit',
                                  p: origFeedback.explanation !== iterFeedback.explanation ? 1 : 0,
                                  borderRadius: 1
                                }}
                              >
                                {iterFeedback.explanation}
                              </Typography>
                              
                              <Typography variant="body2" gutterBottom color="text.secondary">
                                <strong>Iteration {comparedIteration} Suggestion:</strong>
                              </Typography>
                              <Typography 
                                variant="body2"
                                sx={{
                                  bgcolor: origFeedback.suggestion !== iterFeedback.suggestion ? 
                                    'rgba(76, 175, 80, 0.08)' : 'inherit',
                                  p: origFeedback.suggestion !== iterFeedback.suggestion ? 1 : 0,
                                  borderRadius: 1
                                }}
                              >
                                {iterFeedback.suggestion}
                              </Typography>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => onPromptOptimized(iterationData.prompt)}
            color="primary"
            variant="contained"
            sx={{ mr: 1 }}
          >
            Apply This Prompt
          </Button>
          <Button onClick={closeCompareDialog} color="secondary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Add a debug function to log getActualResponseForSet internals
  const debugLogGetActualResponseForSet = (setKey) => {
    console.group('%c getActualResponseForSet Debug', 'background: #f06; color: white; padding: 2px 5px; border-radius: 3px;');
    
    console.log('Function parameters:', {
      setKey,
      hasValidationResults: !!validationResults,
      availableSets: validationResults ? Object.keys(validationResults) : 'none'
    });
    
    if (!setKey || !validationResults || !validationResults[setKey]) {
      console.warn('No validation results found for this set');
      console.groupEnd();
      return;
    }

    // Helper function to safely display response content
    const debugViewResponse = (response) => {
      if (!response) return 'null';
      if (typeof response !== 'string') {
        try {
          return JSON.stringify(response).substring(0, 150) + '...';
        } catch (e) {
          return 'Non-string value (cannot stringify)';
        }
      }
      return response.substring(0, 150) + (response.length > 150 ? '...' : '');
    };
    
    const data = validationResults[setKey];
    console.log('Data structure:', {
      keys: Object.keys(data),
      hasModelResponse: !!data.modelResponse,
      hasAssistantResponse: !!data.assistantResponse,
      hasEvaluatorPrompt: !!data.evaluatorPrompt,
      hasResponses: !!data.responses,
      modelId: data.model || 'unknown'
    });
    
    // Check for model response locations
    if (data.modelResponse) {
      console.log('Found in data.modelResponse:', debugViewResponse(data.modelResponse));
    }
    
    if (data.assistantResponse) {
      console.log('Found in data.assistantResponse:', debugViewResponse(data.assistantResponse));
    }
    
    if (data.evaluatorPrompt) {
      const match = data.evaluatorPrompt.match(/AI ASSISTANT'S RESPONSE:\s*([\s\S]+?)\s*(?=EVALUATION CRITERIA:|$)/i);
      console.log('Evaluator prompt search:', {
        hasMatch: !!match,
        extractedResponse: match ? debugViewResponse(match[1].trim()) : 'none'
      });
    }
    
    if (data.responses && typeof data.responses === 'object') {
      const modelId = data.model || '';
      console.log('Responses object:', {
        keys: Object.keys(data.responses),
        hasModelIdKey: modelId && !!data.responses[modelId],
        modelIdValue: modelId && data.responses[modelId] ? 
          debugViewResponse(data.responses[modelId]) : 'none'
      });
    }
    
    // Final outcome
    let outcome = 'Using placeholder';
    let responseValue = null;
    let isEvaluationData = true;
    
    if (data.modelResponse) {
      outcome = 'Using data.modelResponse';
      responseValue = data.modelResponse;
      isEvaluationData = false;
    }
    else if (data.assistantResponse) {
      outcome = 'Using data.assistantResponse';
      responseValue = data.assistantResponse;
      isEvaluationData = false;
    }
    else if (data.evaluatorPrompt && data.evaluatorPrompt.match(/AI ASSISTANT'S RESPONSE:\s*([\s\S]+?)\s*(?=EVALUATION CRITERIA:|$)/i)) {
      outcome = 'Using response extracted from evaluatorPrompt';
      responseValue = data.evaluatorPrompt.match(/AI ASSISTANT'S RESPONSE:\s*([\s\S]+?)\s*(?=EVALUATION CRITERIA:|$)/i)[1].trim();
      isEvaluationData = false;
    }
    else if (data.responses && typeof data.responses === 'object' && data.model && data.responses[data.model]) {
      outcome = 'Using response from data.responses[modelId]';
      responseValue = data.responses[data.model];
      isEvaluationData = false;
    } else {
      responseValue = `Note: No actual model response was found in the data. 
This is evaluation data, not the model output.

The system is using evaluation data for optimization purposes.
For more accurate optimization, please ensure model responses are available.`;
    }
    
    console.log('%c FINAL OUTCOME', 'background: #0a4; color: white; padding: 4px 8px; border-radius: 3px; font-weight: bold;');
    console.log('Result:', {
      outcome,
      isEvaluationData,
      responsePreview: debugViewResponse(responseValue)
    });
    
    // Option to view full response
    console.log('Full response (click to expand):', responseValue);
    
    console.groupEnd();
  };

  const getActualResponseForSet = (setKey) => {
    // Try to extract setId and modelId from setKey (e.g., "Set 1-gpt-4o-mini")
    const match = setKey.match(/^(Set \d+)-(.+)$/);
    let setId, modelId;
    if (match) {
      setId = match[1];
      modelId = match[2];
    }

    // Try to get the original model response from responses
    if (
      responses &&
      responses.models &&
      setId &&
      modelId &&
      responses.models[setId] &&
      responses.models[setId][modelId]
    ) {
      const modelResp = responses.models[setId][modelId];
      // Prefer rawResponse, then response, then answer
      let responseText =
        (modelResp.rawResponse && (modelResp.rawResponse.response || modelResp.rawResponse.answer || modelResp.rawResponse)) ||
        modelResp.response ||
        (modelResp.answer && (modelResp.answer.text || modelResp.answer)) ||
        '';
      if (responseText) {
        return { response: typeof responseText === 'string' ? responseText : JSON.stringify(responseText), isEvaluationData: false };
      }
    }

    // Fallback: use the old logic (validationResults)
    console.log(`[getActualResponseForSet] Falling back to validationResults for setKey: ${setKey}`);
    const debugResult = debugLogResponseData(setKey, validationResults);
    return { 
      response: debugResult.response, 
      isEvaluationData: debugResult.isEvaluationData 
    };
  };

  // Add a function to extract the user query from validation results (around line 234, after getActualResponseForSet)
  // Get the actual user query from validation results
  const getUserQueryFromValidationData = (validationResults, setId, propCurrentQuery) => {
    console.warn("===== getUserQueryFromValidationData =====");
    console.warn("Input parameters:", { 
      hasValidationResults: !!validationResults, 
      setId, 
      propCurrentQuery,
      availableSets: validationResults ? Object.keys(validationResults) : 'none'
    });
    
    // If propCurrentQuery is defined, use it directly and skip inference
    if (propCurrentQuery && propCurrentQuery.trim().length > 0) {
      console.warn("Using propCurrentQuery directly:", propCurrentQuery);
      return propCurrentQuery;
    }
    
    // Check if we have valid validation results for this set
    if (!validationResults || !setId || !validationResults[setId]) {
      console.warn("No validation results found for this set. Using fallback query.");
      return propCurrentQuery || "";
    }
    
    const data = validationResults[setId];
    console.warn("Validation data for set:", JSON.stringify(data, null, 2));
    
    // Try to find the user query in the validation data
    let userQuery = null;
    
    // Check common places for the query
    if (data.userQuery) {
      console.warn("Found user query in data.userQuery");
      userQuery = data.userQuery;
    } else if (data.query) {
      console.warn("Found user query in data.query");
      userQuery = data.query;
    } else if (data.request && data.request.userQuery) {
      console.warn("Found user query in data.request.userQuery");
      userQuery = data.request.userQuery;
    } else if (data.request && data.request.query) {
      console.warn("Found user query in data.request.query");
      userQuery = data.request.query;
    } else if (data.input && typeof data.input === 'string') {
      console.warn("Found user query in data.input");
      userQuery = data.input;
    }
    
    // Return the found query or the prop value or default
    if (userQuery) {
      console.warn("Extracted user query:", userQuery);
      return userQuery;
    }
    
    // Only attempt to infer if no direct query is available
    console.warn("No query found in validation data. Using fallback.");
    return propCurrentQuery || "Query not available";
  };
  
  // In validatePrompt, always use the validator model
  const validatePrompt = async (prompt) => {
    try {
      // Always use the validator model for validation
      const llm = createLlmInstance(validatorModel);
      
      // Use the full evaluation criteria text from localStorage or defaults
      const criteriaText = evaluationCriteriaText;
      
      // Create JSON structure template for the expected response
      const jsonStructureTemplate = evaluationCriteria.reduce((acc, criterion) => {
        acc[criterion] = {
          "score": "<number>",
          "explanation": "<explanation>",
          "suggestion": "<suggestion>"
        };
        return acc;
      }, {});
      
      // Extract model ID from selectedSet
      const modelMatch = selectedSet ? selectedSet.match(/-(.*?)$/) : null;
      let targetModel = modelMatch ? modelMatch[1] : null;
      
      // If no model in the set name, use validatorModel or selectedModel as fallback
      if (!targetModel) {
        targetModel = validatorModel || selectedModel || "unknown";
        console.log(`No model found in set name, using fallback for improvement: ${targetModel}`);
      }
      
      // Get the actual user query from validation results if available
      const actualUserQuery = getUserQueryFromValidationData(validationResults, selectedSet, propCurrentQuery);
      // Always prioritize the actual query used in validation or the one passed from the parent component
      const userQuery = actualUserQuery || propCurrentQuery || "";
      
      if (!userQuery) {
        console.warn("No user query found for validation. This may affect optimization quality.");
      } else {
        console.log(`Using user query for validation: ${userQuery}`);
      }
      
      // Get the actual response from validation results if available
      const actualResponse = getActualResponseForSet(selectedSet);
      
      // Use the actual response if available, otherwise set to empty (no default example)
      const responseExample = actualResponse 
        ? actualResponse.response.substring(0, 1000) // Limit to 1000 chars to prevent context overflow
        : ""; 
      
      if (!responseExample) {
        console.warn("No model response found for validation. This may affect optimization quality.");
      } else {
        console.log(`Using model response for validation (${responseExample.length} chars)`, responseExample.substring(0, 100) + "...");
      }
      
      console.log("Final validation prompt components:", {
        userQuery: userQuery || "[No specific user query available for testing]",
        hasResponseExample: !!responseExample,
        responseLength: responseExample ? responseExample.length : 0,
        targetModel
      });
      
      // Ensure we're using the full model name
      console.log(`Using full model name for TARGET MODEL in improvement: ${targetModel}`);
      
      // Create evaluation prompt
      const evaluationPrompt = `
Evaluate the following system prompt for a RAG AI assistant:

SYSTEM PROMPT:
${prompt}

USER QUERY:
${userQuery || "[No specific user query available for testing]"}

MODEL RESPONSE:
${responseExample || "[No model response available]"}

TARGET MODEL: ${targetModel}
This prompt is intended to be used with ${targetModel}. Please evaluate with this model's capabilities in mind.

EVALUATION CRITERIA:
${criteriaText}

SCORING RUBRIC (apply to all criteria):
- Score 10: The criterion is fully met, with no issues found.
- Score 5: The criterion is partially met; some issues are present but the response is not a complete failure.
- Score 1: The criterion is completely missed; the response fails to meet the criterion in a significant way.

Special instructions for "Unclear or Irrelevant Statements":
- If the response contains any unclear or irrelevant statements, score this criterion as 1.
- Only score 5 or above if there are no such statements.
- A score of 5 means the criterion is partially met; a score of 1 means it is completely missed.

For each criterion, provide:
- A score from 1-10
- A brief explanation of the score
- A specific suggestion for improvement

Return ONLY a JSON object with the following structure:
{
  "criteria": ${JSON.stringify(jsonStructureTemplate, null, 4)}
}
`;

      // Get response from LLM
      console.log(`Validating prompt with ${selectedModel} model`);
      const responseText = await llm.generate(evaluationPrompt);
      console.log('Raw response:', responseText);
      
      // Clean and parse the JSON response
      let cleanedResponse = responseText;
      if (cleanedResponse.includes('```json')) {
        cleanedResponse = cleanedResponse.split('```json')[1].split('```')[0].trim();
      } else if (cleanedResponse.includes('```')) {
        cleanedResponse = cleanedResponse.split('```')[1].split('```')[0].trim();
      }
      
      // Parse JSON
      try {
        const parsedResults = JSON.parse(cleanedResponse);
        
        // Validate structure
        if (!parsedResults.criteria) {
          throw new Error('Invalid response format: missing criteria object');
        }
        
        // Convert string scores to numbers if needed
        for (const criterion of evaluationCriteria) {
          if (!parsedResults.criteria[criterion]) {
            throw new Error(`Invalid response format: missing ${criterion} criterion`);
          }
          
          // Handle string scores by converting to numbers
          if (typeof parsedResults.criteria[criterion].score === 'string') {
            const numScore = parseFloat(parsedResults.criteria[criterion].score);
            if (isNaN(numScore)) {
              throw new Error(`Invalid response format: ${criterion} score is not a number`);
            }
            parsedResults.criteria[criterion].score = numScore;
          } else if (typeof parsedResults.criteria[criterion].score !== 'number') {
            throw new Error(`Invalid response format: ${criterion} score is not a number`);
          }
        }
        
        return parsedResults;
      } catch (e) {
        console.error(`JSON parse error for ${selectedModel}:`, e);
        
        // Create a default object if parsing fails using the criteria
        const defaultCriteria = evaluationCriteria.reduce((acc, criterion) => {
          acc[criterion] = { 
            score: 1, 
            explanation: "Failed to parse result", 
            suggestion: "Retry evaluation" 
          };
          return acc;
        }, {});
        
        return {
          criteria: defaultCriteria
        };
      }
    } catch (error) {
      console.error('Validation error:', error);
      throw error;
    }
  };

  // In generateImprovedPrompt, always use the optimization model
  const generateImprovedPrompt = async (currentPrompt, scores) => {
    try {
      // Always use the selected optimization model
      const llm = createLlmInstance(selectedModel);
      
      // Get all criteria scores
      const allCriteria = Object.keys(scores)
        .filter(criterion => evaluationCriteria.includes(criterion))
        .map(criterion => {
          return {
            name: criterion,
            score: scores[criterion].score,
            explanation: scores[criterion].explanation,
            suggestion: scores[criterion].suggestion
          };
        });
      
      // Sort criteria by score (ascending) to find the weakest ones
      const sortedCriteria = [...allCriteria].sort((a, b) => a.score - b.score);
      // Identify the single lowest score
      const lowestCriterion = sortedCriteria[0];
      // Format all scores for reference
      const formattedScores = allCriteria.map(criterion => {
        return `${criterion.name}: Score ${criterion.score}/10 - ${criterion.explanation}\nSuggestion: ${criterion.suggestion}`;
      }).join('\n\n');
      // Format only the lowest score for focus
      const formattedLowestScores = lowestCriterion ?
        `${lowestCriterion.name}: Score ${lowestCriterion.score}/10 - ${lowestCriterion.explanation}\nSuggestion: ${lowestCriterion.suggestion}` :
        '';
      
      // Extract model ID from selectedSet
      const modelMatch = selectedSet ? selectedSet.match(/-(.*?)$/) : null;
      let targetModel = modelMatch ? modelMatch[1] : null;
      
      // If no model in the set name, use validatorModel or selectedModel as fallback
      if (!targetModel) {
        targetModel = validatorModel || selectedModel || "unknown";
        console.log(`No model found in set name, using fallback for improvement: ${targetModel}`);
      }
      
      // Get the actual user query from validation results if available
      const actualUserQuery = getUserQueryFromValidationData(validationResults, selectedSet, propCurrentQuery);
      // Use the exact same approach as validatePrompt for consistency
      const userQuery = actualUserQuery || propCurrentQuery || "";
      
      if (!userQuery) {
        console.warn("No user query found for improvement. This may affect optimization quality.");
      } else {
        console.log(`Using user query for improvement: ${userQuery}`);
      }
      
      // Get the actual response from validation results if available
      const actualResponse = getActualResponseForSet(selectedSet);
      
      // Use the actual response if available, consistent with validatePrompt
      const responseExample = actualResponse 
        ? actualResponse.response.substring(0, 1000) // Limit to 1000 chars to prevent context overflow
        : "";
      
      if (!responseExample) {
        console.warn("No model response found for improvement. This may affect optimization quality.");
      } else {
        console.log(`Using model response for improvement (${responseExample.length} chars)`, responseExample.substring(0, 100) + "...");
      }
      
      console.log("Final improvement prompt components:", {
        userQuery: userQuery || "[No specific user query available for testing]",
        hasResponseExample: !!responseExample,
        responseLength: responseExample ? responseExample.length : 0,
        targetModel
      });
      
      // Ensure we're using the full model name
      console.log(`Using full model name for TARGET MODEL in improvement: ${targetModel}`);
      
      const improvementPrompt = `
Please optimize the system prompt below that is typically used with the provided USER QUERY for the specified TARGET MODEL.

SYSTEM PROMPT:
${currentPrompt}

USER QUERY:
${userQuery || "[No specific user query available for testing]"}

TARGET MODEL: ${targetModel}
This prompt is intended to be used with ${targetModel}.

MODEL RESPONSE:
${responseExample || "[No model response available]"}

EVALUATION RESULT:
${formattedScores}

LOWEST RATED CRITERION (FOCUS HERE):
${formattedLowestScores}

Please create an improved version of this system prompt that addresses ONLY the single lowest-scoring criterion while maintaining the overall effectiveness. Do NOT add or suggest logic that is specific to the user query or any particular example. The system prompt should remain general and applicable to all relevant queries, not just the one shown. Focus on the lowest-rated criterion and incorporate the insights from the evaluation, but do not reference or hard-code user-query-specific details.

The prompt should guide an AI assistant in a RAG (Retrieval Augmented Generation) system to use the provided context effectively when responding to user queries.

Please analyze both the original model response and the evaluation results to understand how the model is currently interpreting the prompt, which will help you make more targeted improvements.

IMPORTANT GUIDELINES:
1. You MUST preserve the exact formatting (line breaks, indentation, paragraph structure) of the original prompt. Only modify the content where necessary to address the lowest-scoring criterion. Do NOT reformat or restructure the prompt unless absolutely required for clarity.
2. DO NOT include any "TARGET MODEL" or model-specific references in your output prompt.
3. Focus on improving ONLY the single lowest-rated criterion in this iteration.
4. Make targeted changes to address that specific problem rather than rewriting the entire prompt.
5. Take into account the original model response to better optimize the prompt.
6. Do NOT add or suggest logic that is specific to the user query or any particular example. The system prompt must remain general.

Return ONLY the improved prompt text without any additional commentary, explanations, or metadata.
`;

      console.log(`Generating improved prompt with ${selectedModel} model...`);
      const response = await llm.generate(improvementPrompt);
      console.log('Improved prompt generated');
      
      // Clean up any target model references that might have been included
      let cleanedResponse = response.trim();
      // Remove any "TARGET MODEL: model" lines
      cleanedResponse = cleanedResponse.replace(/^TARGET MODEL:.*$/gm, '');
      // Remove model name reference if it was included at the top
      cleanedResponse = cleanedResponse.replace(/^This prompt is intended to be used with.*$/gm, '');
      // Clean up any extra newlines that might have been created
      cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
      
      return cleanedResponse.trim();
    } catch (error) {
      console.error('Error generating improved prompt:', error);
      throw error;
    }
  };

  const startOptimization = async () => {
    setIsOptimizing(true);
    setError(null);
    
    console.log("Starting optimization with history:", optimizationHistory);
    console.log("Selected set:", selectedSet);
    console.log("Validation results available:", validationResults ? Object.keys(validationResults) : "none");
    
    // Check if we have actual data
    const actualUserQuery = getUserQueryFromValidationData(validationResults, selectedSet, propCurrentQuery);
    const actualResponse = getActualResponseForSet(selectedSet);
    
    if (!actualUserQuery && !actualResponse.response) {
      console.warn("WARNING: No user query or model response found. Optimization will use placeholder values, which may result in generic improvements rather than ones tailored to your specific use case.");
    } else if (!actualUserQuery) {
      console.warn("WARNING: No user query found. Optimization has limited context about what types of queries this prompt should handle.");
    } else if (!actualResponse.response) {
      console.warn("WARNING: No model response found. Optimization has limited understanding of how your prompt performs in practice.");
    } else {
      console.log("Using actual query and response data for optimization, which should provide the best results.");
    }
    
    // Check if optimization history is empty but we have criteria data
    if (optimizationHistory.length === 0) {
      console.warn("Optimization history is empty, checking for criteria data...");
      
      // Check if we have validation data with criteria
      const data = validationResults?.[selectedSet];
      if (data && data.criteria && Object.keys(data.criteria).length > 0) {
        console.log("Found criteria data in validation results, initializing optimization history");
        
        const prompt = getSystemPromptForSet(selectedSet);
        // Calculate average score from criteria
        const scoreValues = Object.values(data.criteria).map(item => item.score);
        const avgScore = scoreValues.length > 0 ? 
          scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : 0;
        
        // Initialize optimization history
        console.log("Initializing optimization history with validation data");
        const newHistoryItem = {
          iteration: 0,
          prompt: prompt,
          scores: data.criteria,
          averageScore: avgScore
        };
        
        setOptimizationHistory([newHistoryItem]);
        
        // Set a small delay to ensure state updates before continuing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log("Continuing optimization with newly initialized history");
      } else {
        console.error("No validation results available in optimization history");
        setError('No validation results available for the original prompt. Please ensure your validation completed successfully and try selecting the set again or click "Validate Now" to evaluate the current prompt.');
        setIsOptimizing(false);
        return;
      }
    }
    
    // Check if optimization history is still empty after initialization attempt
    if (optimizationHistory.length === 0) {
      console.error("Optimization history is still empty after initialization attempt");
      
      // Even with empty history, let's try to validate the current prompt
      try {
        console.log("Attempting to validate current prompt as fallback");
        const results = await validatePrompt(initialPrompt);
        
        if (results && results.criteria) {
          // Calculate average score
          const scoreValues = Object.values(results.criteria).map(item => item.score);
          const avgScore = scoreValues.length > 0 ? 
            scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : 0;
          
          // Initialize history with validation results
          const newHistoryItem = {
            iteration: 0,
            prompt: initialPrompt,
            scores: results.criteria,
            averageScore: avgScore
          };
          
          console.log("Setting optimization history with new validation results");
          setOptimizationHistory([newHistoryItem]);
          
          // Short delay to allow state to update
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          throw new Error("Validation failed to return valid criteria");
        }
      } catch (error) {
        console.error("Fallback validation failed:", error);
        setError('Could not initialize optimization history. Please manually validate the prompt first using the "Validate Now" button.');
        setIsOptimizing(false);
        return;
      }
    }
    
    // Now use existing optimization history for the process
    // Get the first item (original prompt validation)
    const initialItem = optimizationHistory[0];
    if (!initialItem) {
      console.error("Still unable to get optimization history item");
      setError('Unable to initialize optimization process. Please try again or validate the prompt manually.');
      setIsOptimizing(false);
      return;
    }
    
    let currentPrompt = initialItem.prompt;
    let bestPrompt = initialItem.prompt;
    let bestScore = initialItem.averageScore || 0;
    let currentScores = initialItem.scores;
    
    // Check if initial score already meets threshold
    if (initialItem.averageScore >= scoreThreshold) {
      console.log(`Initial prompt already meets score threshold (${initialItem.averageScore.toFixed(2)} >= ${scoreThreshold}). Stopping optimization.`);
      setBestPrompt(bestPrompt);
      setIsOptimizing(false);
      return;
    }

    try {
      // Optimization loop
      for (let i = 1; i <= maxIterations; i++) {
        setCurrentIteration(i);
        updateProgress('Generating improved prompt', i, maxIterations + 1);

        // Generate improved prompt based on the current prompt and scores
        const improvedPrompt = await generateImprovedPrompt(currentPrompt, currentScores);
        
        // Update current prompt for next iteration
        currentPrompt = improvedPrompt;

        updateProgress('Evaluating improved prompt', i, maxIterations + 1);
        // Validate improved prompt
        const results = await validatePrompt(improvedPrompt);
        
        if (!results || !results.criteria) {
          console.error('Invalid validation results:', results);
          continue;
        }
        
        const scores = results.criteria;
        const scoreValues = Object.values(scores).map(item => item.score);
        const avgScore = scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;

        // Update history
        setOptimizationHistory(prev => [...prev, {
          iteration: i,
          prompt: improvedPrompt,
          scores: scores,
          averageScore: avgScore
        }]);

        // Update best prompt if score improved
        if (avgScore > bestScore) {
          bestScore = avgScore;
          bestPrompt = improvedPrompt;
        }
        
        // Update current scores for the next iteration
        currentScores = scores;

        // Check if we've reached the target score
        if (avgScore >= scoreThreshold) {
          console.log(`Reached score threshold (${avgScore.toFixed(2)} >= ${scoreThreshold}) at iteration ${i}. Stopping.`);
          break;
        }
      }

      setBestPrompt(bestPrompt);
    } catch (error) {
      console.error('Optimization error:', error);
      setError(error.message || 'An error occurred during optimization');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Settings panel for optimization parameters
  const renderSettingsPanel = () => (
    <Box mb={3} p={2} border="1px solid" borderColor="divider" borderRadius={1}>
      <Typography variant="subtitle1" gutterBottom>Optimization Settings</Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Typography id="max-iterations-slider" gutterBottom>
            Maximum Iterations: {maxIterations}
          </Typography>
          <Slider
            value={maxIterations}
            onChange={(_, newValue) => setMaxIterations(newValue)}
            aria-labelledby="max-iterations-slider"
            valueLabelDisplay="auto"
            step={1}
            marks
            min={1}
            max={10}
            disabled={isOptimizing}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography id="score-threshold-slider" gutterBottom>
            Score Threshold: {scoreThreshold}/10
          </Typography>
          <Slider
            value={scoreThreshold}
            onChange={(_, newValue) => setScoreThreshold(newValue)}
            aria-labelledby="score-threshold-slider"
            valueLabelDisplay="auto"
            step={0.5}
            marks
            min={5}
            max={9.5}
            disabled={isOptimizing}
          />
          <Typography variant="body2" color="text.secondary">
            Optimization will stop when this score is reached
          </Typography>
        </Grid>
      </Grid>
      
      <Box mt={2} p={1} bgcolor="rgba(33, 150, 243, 0.08)" borderRadius={1} border="1px dashed" borderColor="info.light">
        <Typography variant="body2" color="info.main">
          <strong>How it works:</strong> The optimizer uses your existing validation results, including actual user queries and original model responses 
          to generate improved prompts by targeting the lowest-scoring criteria. Each iteration is evaluated against the same 
          criteria to track improvements. For best results, make sure your selected set has both a user query and an original model response.
        </Typography>
      </Box>
    </Box>
  );

  // Update the renderDetailedCards function to include the actual response
  const renderDetailedCards = () => {
    console.log("===== USER QUERY TRACKING =====");
    console.log("Selected set:", selectedSet);
    console.log("Current propCurrentQuery value:", propCurrentQuery);
    
    // Call the updated function with all necessary parameters
    const actualUserQuery = getUserQueryFromValidationData(validationResults, selectedSet, propCurrentQuery);
    
    console.log("Final actualUserQuery used for display:", actualUserQuery);
    console.log("============================");
    
    if (optimizationHistory.length === 0) return null;
    
    // Function to get score color
    const getScoreColor = (score) => {
      if (score >= 9) return 'success.main';
      if (score >= 7) return 'success.light';
      if (score >= 5) return '#f0ad4e'; // Warning yellow
      return 'error.main';
    };
    
    // Get the actual response and query from the selected set
    const actualResponse = getActualResponseForSet(selectedSet);
    
    // Determine if we're using actual data or missing data
    const missingQuery = !actualUserQuery;
    const missingResponse = !actualResponse.response;
    
    return (
      <Box mb={3}>
        <Typography variant="h6" component="div" gutterBottom>
          Detailed Optimization Results
        </Typography>
        
        {(missingQuery || missingResponse) && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {missingQuery && missingResponse ? (
              <>
                <Typography fontWeight="bold">Missing user query and model response</Typography>
                <Typography variant="body2">
                  No user query or model response was found for this set. Optimization will be attempting to work with 
                  placeholder data, which may affect results. For best results, first validate responses with real queries.
                </Typography>
              </>
            ) : missingQuery ? (
              <>
                <Typography fontWeight="bold">Missing user query</Typography>
                <Typography variant="body2">
                  No user query was found for validation. Optimization will have limited context about what types of queries 
                  this prompt should handle. For better results, try validating your system with real user queries first.
                </Typography>
              </>
            ) : (
              <>
                <Typography fontWeight="bold">Missing model response</Typography>
                <Typography variant="body2">
                  No model response was found. Optimization will have limited understanding of how your prompt performs in practice.
                  Optimization will be more effective with model responses that show how your model interprets the prompt.
                </Typography>
              </>
            )}
          </Alert>
        )}
        
        {actualUserQuery && (
          <Box mb={2} p={2} border="1px solid" borderColor="primary.light" borderRadius={1}>
            <Typography variant="subtitle1" gutterBottom>
              User Query Being Optimized For:
            </Typography>
            <Box 
              p={1.5} 
              sx={{ 
                bgcolor: 'rgba(25, 118, 210, 0.05)', 
                borderRadius: 1,
                whiteSpace: 'pre-wrap',
                fontSize: '0.9rem',
                fontWeight: 'medium',
                overflowY: 'auto',
                maxHeight: '80px',
                color: 'primary.main',
                border: '1px solid',
                borderColor: 'primary.light'
              }}
            >
              {actualUserQuery}
            </Box>
          </Box>
        )}
        
        {missingQuery && !actualUserQuery && missingResponse && (
          <Box mb={3} p={2} border="1px solid" borderColor="error.light" borderRadius={1} bgcolor="rgba(211, 47, 47, 0.05)">
            <Typography variant="subtitle1" gutterBottom color="error">
              Warning: Limited Optimization Data (No Query or Response Found)
            </Typography>
            <Typography variant="body2" paragraph>
              Optimization is using placeholder values since no user query or model response was found. 
              Results may not be optimal for your specific use case.
            </Typography>
            <Typography variant="body2">
              For best results, please run a validation with actual user queries first, then try optimization.
            </Typography>
          </Box>
        )}
        
        {optimizationHistory.map((item, index) => {
          const isBestScore = item.averageScore === Math.max(...optimizationHistory.map(h => h.averageScore || 0));
          
          // Get the actual response and query from the selected set
          const actualResponse = getActualResponseForSet(selectedSet);
          
          // Determine if we're using actual data or missing data
          const missingQuery = !actualUserQuery;
          const missingResponse = !actualResponse.response;
          
          return (
            <Box 
              key={index} 
              mb={3} 
              p={2} 
              border="1px solid" 
              borderColor={isBestScore ? 'success.main' : 'divider'}
              borderRadius={1}
              sx={{ 
                bgcolor: isBestScore ? 'rgba(76, 175, 80, 0.05)' : 'background.paper'
              }}
            >
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="h6" component="div">
                  {item.iteration === 0 ? "Original Prompt" : `Iteration ${item.iteration}`}
                </Typography>
                <Box display="flex" alignItems="center">
                  <Typography 
                    variant="h6" 
                    component="span" 
                    sx={{ 
                      fontWeight: 'bold',
                      mr: 1,
                      color: getScoreColor(item.averageScore) 
                    }}
                  >
                    {item.averageScore ? item.averageScore.toFixed(2) : 'N/A'}/10
                  </Typography>
                  
                  {isBestScore && (
                    <Typography 
                      variant="body2" 
                      component="span" 
                      sx={{ 
                        bgcolor: 'success.main', 
                        color: 'white', 
                        px: 1, 
                        py: 0.5, 
                        borderRadius: 1,
                        fontSize: '0.7rem',
                        fontWeight: 'bold'
                      }}
                    >
                      BEST
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Show the system prompt and the actual model response for this run */}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Box mb={2}>
                    <Typography variant="subtitle2" gutterBottom>System Prompt Used:</Typography>
                    <Box 
                      p={1.5} 
                      sx={{ 
                        bgcolor: 'background.default', 
                        borderRadius: 1,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        overflowY: 'auto',
                        maxHeight: '200px'
                      }}
                    >
                      {item.prompt}
                    </Box>
                  </Box>
                  <Box mb={2}>
                    <Typography variant="subtitle2" gutterBottom>Model Response:</Typography>
                    <Box 
                      p={1.5} 
                      sx={{ 
                        bgcolor: 'background.default', 
                        borderRadius: 1,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        overflowY: 'auto',
                        maxHeight: '200px'
                      }}
                    >
                      {/* For now, show the actualResponse for the selected set. If you want to show the response for each iteration, you would need to store it in optimizationHistory. */}
                      {actualResponse.response && actualResponse.response.length > 0
                        ? (actualResponse.response.length > 800 ? `${actualResponse.response.substring(0, 800)}...` : actualResponse.response)
                        : <em>No model response found for this run.</em>}
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>Evaluation:</Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Criterion</TableCell>
                          <TableCell>Score</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {evaluationCriteria.map(criterion => (
                          item.scores?.[criterion] && (
                            <TableRow key={criterion}>
                              <TableCell>{criterion}</TableCell>
                              <TableCell>
                                <Box display="flex" alignItems="center">
                                  <Typography 
                                    component="span" 
                                    sx={{ 
                                      color: getScoreColor(item.scores[criterion].score),
                                      fontWeight: 'medium' 
                                    }}
                                  >
                                    {item.scores[criterion].score}
                                  </Typography>
                                  {index > 0 && (
                                    <Typography 
                                      component="span" 
                                      color={
                                        item.scores[criterion].score > optimizationHistory[index-1].scores?.[criterion]?.score ? "success.main" : 
                                        item.scores[criterion].score < optimizationHistory[index-1].scores?.[criterion]?.score ? "error.main" : 
                                        "text.secondary"
                                      }
                                      sx={{ ml: 1, fontSize: '0.85rem' }}
                                    >
                                      {
                                        item.scores[criterion].score > optimizationHistory[index-1].scores?.[criterion]?.score ? "▲" : 
                                        item.scores[criterion].score < optimizationHistory[index-1].scores?.[criterion]?.score ? "▼" : 
                                        "–"
                                      }
                                    </Typography>
                                  )}
                                </Box>
                              </TableCell>
                            </TableRow>
                          )
                        ))}
                        <TableRow sx={{ bgcolor: 'background.default' }}>
                          <TableCell sx={{ fontWeight: 'bold' }}>Average</TableCell>
                          <TableCell>
                            <Typography 
                              component="span" 
                              sx={{ 
                                fontWeight: 'bold',
                                color: getScoreColor(item.averageScore) 
                              }}
                            >
                              {item.averageScore ? item.averageScore.toFixed(2) : 'N/A'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box>
                    <Box display="flex" gap={1}>
                      {item.iteration !== 0 && (
                        <>
                          <Button
                            size="small"
                            onClick={() => {
                              // Log the prompt being applied
                              console.log("Applying prompt from iteration", item.iteration, ":", item.prompt);
                              // Show feedback that the prompt is being applied
                              setStatus(`Applying prompt from iteration ${item.iteration}...`);
                              // Add a small delay before applying to ensure UI feedback
                              setTimeout(() => {
                                onPromptOptimized(item.prompt);
                              }, 300);
                            }}
                            variant="outlined"
                            color="primary"
                          >
                            Use This Prompt
                          </Button>
                          <Tooltip title="Compare with original prompt">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => openCompareDialog(item.iteration)}
                              sx={{ border: '1px solid', borderColor: 'primary.main' }}
                            >
                              <CompareArrowsIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  </Box>
                </Grid>
              </Grid>
              {/* Suggestions and explanations accordion */}
              <Box mt={2}>
                <Typography variant="subtitle2" gutterBottom>Feedback & Suggestions:</Typography>
                <Box sx={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {evaluationCriteria.map(criterion => (
                    item.scores?.[criterion] && (
                      <Box key={criterion} mb={1.5}>
                        <Typography component="div" variant="body2" sx={{ fontWeight: 'medium' }}>
                          {criterion}
                        </Typography>
                        <Typography component="div" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                          <strong>Explanation:</strong> {item.scores[criterion].explanation}
                        </Typography>
                        <Typography component="div" variant="body2" color="primary.main" sx={{ ml: 1 }}>
                          <strong>Suggestion:</strong> {item.scores[criterion].suggestion}
                        </Typography>
                      </Box>
                    )
                  ))}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  };

  // Update the manual validation function with improved error handling and logging (around line 1280)
  const manuallyValidatePrompt = async () => {
    if (!selectedSet || !initialPrompt) {
      setError('Please select a set and ensure the prompt is loaded before validating.');
      return;
    }
    
    setIsOptimizing(true);
    setError(null);
    updateProgress('Validating original prompt', 0, 1);
    
    try {
      // Log that we're manually validating
      console.log(`Manually validating prompt for set ${selectedSet}`);
      console.log("Current prompt being validated:", initialPrompt);
      
      // Validate the initial prompt
      const results = await validatePrompt(initialPrompt);
      
      console.log("Manual validation results:", results);
      
      if (!results || !results.criteria) {
        throw new Error('Invalid validation results received. Make sure all required validation criteria are defined.');
      }
      
      // Log the successful validation
      console.log("Validation successful, criteria found:", Object.keys(results.criteria));
      
      const scores = results.criteria;
      const scoreValues = Object.values(scores).map(item => item.score);
      const avgScore = scoreValues.length > 0 ? 
        scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : 0;
      
      console.log(`Average score from manual validation: ${avgScore}`);
      
      // Update optimization history
      const updatedHistory = [{
        iteration: 0,
        prompt: initialPrompt,
        scores: scores,
        averageScore: avgScore
      }];
      
      console.log("Setting optimization history:", updatedHistory);
      setOptimizationHistory(updatedHistory);
      
      // Set best prompt
      setBestPrompt(initialPrompt);
      
      setError(null);
      
      // Show a success message
      console.log("Manual validation completed successfully");
      
      // NEW: Add a checkpoint to verify the optimization history was set
      setTimeout(() => {
        if (optimizationHistory.length === 0) {
          console.warn("Optimization history is still empty after manual validation. Forcing update.");
          // Force a direct update to ensure history is set
          setOptimizationHistory([{
            iteration: 0,
            prompt: initialPrompt,
            scores: scores,
            averageScore: avgScore
          }]);
        } else {
          console.log("Optimization history successfully updated:", optimizationHistory);
        }
      }, 500);
    } catch (error) {
      console.error('Manual validation error:', error);
      setError(`Validation error: ${error.message || 'An unknown error occurred during validation'}`);
      
      // NEW: If we get an error but have criteria data from prior validations, use that
      const data = validationResults?.[selectedSet];
      if (data && data.criteria && Object.keys(data.criteria).length > 0) {
        console.log(`Falling back to existing criteria data for ${selectedSet}`);
        
        // Calculate average score
        const scoreValues = Object.values(data.criteria).map(item => item.score);
        const avgScore = scoreValues.length > 0 ? 
          scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : 0;
        
        // Update optimization history with existing data
        setOptimizationHistory([{
          iteration: 0,
          prompt: initialPrompt,
          scores: data.criteria,
          averageScore: avgScore
        }]);
        
        setBestPrompt(initialPrompt);
      }
    } finally {
      setIsOptimizing(false);
      updateProgress('', 0, 0);
    }
  };

  // Update the handleSetSelection function to use the new extraction function (around line 1280)
  const handleSetSelection = (newSet) => {
    setSelectedSet(newSet);
    
    // Try to extract validation data
    const validationData = extractValidationData(newSet);
    
    if (validationData && validationData.scores) {
      console.log(`Successfully extracted validation data for set ${newSet}`);
      
      // Calculate average score
      const scoreValues = Object.values(validationData.scores).map(item => item.score);
      const avgScore = scoreValues.length > 0 ? 
        scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : 0;
      
      console.log(`Extracted average score for ${newSet}:`, avgScore);
      
      // Update optimization history
      setOptimizationHistory([{
        iteration: 0,
        prompt: validationData.prompt,
        scores: validationData.scores,
        averageScore: avgScore
      }]);
      
      // Set best prompt
      setBestPrompt(validationData.prompt);
      
      // Clear any previous errors
      setError(null);
    } else {
      // NEW: Check if we have criteria available directly, even if extraction didn't work
      const data = validationResults?.[newSet];
      if (data && data.criteria && Object.keys(data.criteria).length > 0) {
        console.log(`Using direct criteria data for set ${newSet}`);
        
        // Get the prompt
        const prompt = getSystemPromptForSet(newSet);
        
        // Calculate average score
        const scoreValues = Object.values(data.criteria).map(item => item.score);
        const avgScore = scoreValues.length > 0 ? 
          scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : 0;
        
        console.log(`Average score for ${newSet} from direct data:`, avgScore);
        
        // Update optimization history
        setOptimizationHistory([{
          iteration: 0,
          prompt: prompt,
          scores: data.criteria,
          averageScore: avgScore
        }]);
        
        // Set best prompt
        setBestPrompt(prompt);
        
        // Clear any previous errors
        setError(null);
      } else {
        // No validation results available for this set
        console.warn(`Could not extract validation data for set ${newSet}`);
        setError(`No validation data found for set ${newSet}. Please click "Validate Now" to evaluate the current prompt before optimization.`);
        
        // If we had previous optimization history, clear it
        if (optimizationHistory.length > 0) {
          setOptimizationHistory([]);
          setBestPrompt(null);
        }
      }
    }
  };

  // Inside the component, add this useEffect to log validation results when they change
  React.useEffect(() => {
    if (validationResults) {
      console.log("Validation results received:", {
        keys: Object.keys(validationResults),
        selectedSet,
        sampleStructure: validationResults[Object.keys(validationResults)[0]]
          ? Object.keys(validationResults[Object.keys(validationResults)[0]])
          : 'no samples'
      });

      // Check for AI responses in the validation results
      for (const key in validationResults) {
        const data = validationResults[key];
        console.log(`Checking response structure for set ${key}:`, {
          hasResponse: !!data.response,
          responseKeys: data.response ? Object.keys(data.response) : 'none',
          hasResponseText: !!data.responseText,
          hasContent: !!data.content,
          hasText: !!data.text
        });
      }
    }
  }, [validationResults, selectedSet]);

  // Add debug methods to window object for console debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.PromptOptimizerDebug = {
        // Debug function to manually inspect any set
        debugSet: (setKey) => {
          console.group('%c PromptOptimizer Debug', 'background: #06f; color: white; padding: 3px 6px; border-radius: 3px;');
          
          console.log('Available sets:', validationResults ? Object.keys(validationResults) : 'none');
          
          if (setKey) {
            console.log(`Debugging set: ${setKey}`);
            console.log('System prompt:', getSystemPromptForSet(setKey));
            debugLogResponseData(setKey, validationResults);
            
            // Also debug the user query
            console.group('User Query Debug');
            const userQuery = getUserQueryFromValidationData(validationResults, setKey, propCurrentQuery);
            console.log('User query result:', userQuery);
            console.groupEnd();
          } else {
            console.log('Please provide a set key to debug. Available sets:', 
              validationResults ? Object.keys(validationResults) : 'none');
          }
          
          console.groupEnd();
        },
        
        // Helper to list all available sets
        listSets: () => {
          console.log('Available sets:', validationResults ? Object.keys(validationResults) : 'none');
        },
        
        // Debug the current selected set
        debugCurrentSet: () => {
          if (selectedSet) {
            window.PromptOptimizerDebug.debugSet(selectedSet);
          } else {
            console.log('No set currently selected.');
          }
        }
      };
      
      console.log('%c PromptOptimizer Debug Tools Available', 'background: #06f; color: white; padding: 3px 6px; border-radius: 3px;');
      console.log('Usage: window.PromptOptimizerDebug.debugSet("your-set-id")');
      console.log('To list available sets: window.PromptOptimizerDebug.listSets()');
      console.log('To debug current set: window.PromptOptimizerDebug.debugCurrentSet()');
    }
  }, [validationResults, selectedSet, propCurrentQuery]);

  // Log validation results debugging info
  useEffect(() => {
    if (validationResults && selectedSet && validationResults[selectedSet]) {
      const data = validationResults[selectedSet];
      console.log('[Debug] Validation results structure for set:', {
        setKey: selectedSet,
        hasModelResponse: !!data.modelResponse,
        hasAssistantResponse: !!data.assistantResponse,
        hasEvaluatorPrompt: !!data.evaluatorPrompt,
        hasResponses: !!data.responses,
        responsesKeys: data.responses ? Object.keys(data.responses) : 'none',
        hasResponseText: !!data.responseText,
        hasContent: !!data.content,
        hasText: !!data.text
      });
    }
  }, [validationResults, selectedSet]);

  // Add state for whitespace diff toggle
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [diffGranularity, setDiffGranularity] = useState('line');

  const [hitlStatus, setHitlStatus] = useState(null);
  const [hitlPromptId, setHitlPromptId] = useState(null);
  const [hitlLoading, setHitlLoading] = useState(false);
  const [hitlError, setHitlError] = useState('');
  const [hitlSuccess, setHitlSuccess] = useState('');
  const [hitlReview, setHitlReview] = useState(null);

  // Poll for review status if in review
  useEffect(() => {
    let interval;
    if (hitlPromptId && hitlStatus === 'in_review') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/prompts/${hitlPromptId}`);
          const data = await res.json();
          setHitlStatus(data.status);
          setHitlReview(data.review || null);
          if (data.status === 'reviewed') clearInterval(interval);
        } catch (e) {
          // ignore
        }
      }, 3000);
    }
    return () => interval && clearInterval(interval);
  }, [hitlPromptId, hitlStatus]);

  const handleSubmitForReview = async () => {
    setHitlLoading(true);
    setHitlError('');
    setHitlSuccess('');
    setHitlReview(null);
    try {
      const actualResponse = getActualResponseForSet(selectedSet);
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: initialPrompt,
          response: actualResponse?.response || '',
          setKey: selectedSet
        })
      });
      const data = await res.json();
      if (data.success) {
        setHitlPromptId(data.prompt.id);
        setHitlStatus('in_review');
        setHitlSuccess('Prompt submitted for human review!');
      } else {
        setHitlError(data.error || 'Failed to submit for review');
      }
    } catch (e) {
      setHitlError('Failed to submit for review');
    } finally {
      setHitlLoading(false);
    }
  };

  // Add state for debug raw view
  const [showRawDebug, setShowRawDebug] = useState(false);

  // Helper to normalize whitespace for robust comparison
  function normalizeLine(line) {
    return line.replace(/\s+/g, ' ').trim();
  }
  function normalizePrompt(prompt) {
    return prompt.replace(/\r\n|\r|\n/g, '\n').split('\n').map(normalizeLine).join('\n');
  }
  // Helper to visualize invisible characters
  function visualizeInvisible(str) {
    return str
      .replace(/ /g, '·')
      .replace(/\t/g, '→')
      .replace(/\n/g, '⏎\n');
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      {/* Debug log for validation results */}
      {open && console.log('Current validation results structure:', JSON.stringify(validationResults, null, 2))}
      
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6">Prompt Optimizer</Typography>
            <Typography variant="caption" color="text.secondary">
              Using {selectedModel} for optimization
              {validatorModel && (
                <span> | Results validated with {validatorModel}</span>
              )}
            </Typography>
          </Box>
          {bestPrompt && (
            <Box display="flex" alignItems="center">
              <Typography variant="body2" color="text.secondary" mr={1}>
                Best Score: 
              </Typography>
              <Typography 
                variant="body1" 
                component="span" 
                fontWeight="bold" 
                color="success.main"
              >
                {Math.max(...optimizationHistory.map(item => item.averageScore || 0)).toFixed(2)}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box>
          <Box mb={3}>
            <FormControl fullWidth>
              <InputLabel>Select Set to Optimize</InputLabel>
              <Select
                value={selectedSet || ''}
                onChange={(e) => handleSetSelection(e.target.value)}
                label="Select Set to Optimize"
                disabled={isOptimizing}
              >
                {availableSets.map((set) => (
                  <MenuItem key={set} value={set}>{set}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Display user query above system prompt */}
          {(() => {
            const actualUserQuery = getUserQueryFromValidationData(validationResults, selectedSet, propCurrentQuery);
            return (
              <Box mb={3}>
                <Typography variant="subtitle2" gutterBottom>
                  {actualUserQuery ? 'User Query for Analysis (Read-only)' : 
                   propCurrentQuery ? 'Current Query from Parent (Read-only)' :
                   'Example User Query (Read-only)'}
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  value={actualUserQuery || propCurrentQuery || 'No user query found in validation data. Using default values for optimization.'}
                  InputProps={{
                    readOnly: true,
                    sx: { 
                      bgcolor: actualUserQuery ? 'rgba(25, 118, 210, 0.05)' : 
                              propCurrentQuery ? 'rgba(25, 118, 210, 0.05)' : 'rgba(255, 152, 0, 0.05)',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem'
                    }
                  }}
                  variant="outlined"
                />
                <Typography variant="caption" color="text.secondary">
                  {actualUserQuery ? 
                    'This is the actual user query used during validation that will be considered during optimization.' :
                    propCurrentQuery ? 
                    'This is the current query from the parent component.' :
                    'No user query was found in the validation data. This may affect optimization results.'}
                </Typography>
              </Box>
            );
          })()}

          <Box mb={3}>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              label="System Prompt to Optimize"
              variant="outlined"
              disabled={isOptimizing}
            />
          </Box>

          {renderSettingsPanel()}

          <Box mb={3}>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small" disabled>
                  <InputLabel id="validator-model-label">Validation Model</InputLabel>
                  <Select
                    labelId="validator-model-label"
                    value={validatorModel || ''}
                    label="Validation Model"
                    disabled
                  >
                    <MenuItem value={validatorModel || ''}>
                      {models[validatorModel]?.name || validatorModel || 'Unknown'}
                      {models[validatorModel]?.vendor && (
                        <span style={{ marginLeft: '4px', fontSize: '0.7rem', opacity: 0.7 }}>
                          ({models[validatorModel]?.vendor})
                        </span>
                      )}
                    </MenuItem>
                  </Select>
                  <Typography variant="caption" color="text.secondary">
                    Model used for validation
                  </Typography>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="model-select-label">Optimization Model</InputLabel>
                  <Select
                    labelId="model-select-label"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    label="Optimization Model"
                  >
                    {Object.keys(models)
                      .filter(modelId => models[modelId].type === 'chat' || models[modelId].capabilities?.chat)
                      .sort()
                      .map(modelId => (
                        <MenuItem key={modelId} value={modelId}>
                          {models[modelId].name || modelId}
                          {models[modelId].vendor && (
                            <span style={{ marginLeft: '4px', fontSize: '0.7rem', opacity: 0.7 }}>
                              ({models[modelId].vendor})
                            </span>
                          )}
                        </MenuItem>
                      ))
                    }
                    {(!models || Object.keys(models).length === 0) && fallbackModels.map(model => (
                      <MenuItem key={model.id} value={model.id}>
                        {model.name} {model.badge && (
                          <span style={{ marginLeft: '4px', fontSize: '0.7rem', opacity: 0.7 }}>{model.badge}</span>
                        )}
                      </MenuItem>
                    ))}
                  </Select>
                  <Typography variant="caption" color="text.secondary">
                    Model used for generating optimized prompts
                  </Typography>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Box mt={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={startOptimization}
                    disabled={isOptimizing || !initialPrompt.trim() || optimizationHistory.length === 0}
                    size="large"
                    fullWidth
                    sx={{ fontWeight: 'bold', fontSize: '1.1rem', py: 1.5 }}
                  >
                    {isOptimizing ? (
                      <Box display="flex" alignItems="center" justifyContent="center">
                        <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                        Optimizing...
                      </Box>
                    ) : 'Start Optimization'}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Box>

          {optimizationHistory.length === 0 && (
            <Box mb={3}>
              <Alert 
                severity="info"
                action={
                  <Button 
                    color="inherit" 
                    size="small" 
                    onClick={manuallyValidatePrompt}
                    disabled={isOptimizing || !initialPrompt.trim()}
                  >
                    {isOptimizing ? (
                      <Box display="flex" alignItems="center">
                        <CircularProgress size={12} color="inherit" sx={{ mr: 1 }} />
                        Validating...
                      </Box>
                    ) : 'Validate Now'}
                  </Button>
                }
              >
                <Tooltip title="The validation data may exist but couldn't be processed correctly. Try clicking Validate Now to evaluate the current prompt.">
                  <Box>
                    <Typography variant="body2">
                      {validationResults && Object.keys(validationResults).includes(selectedSet) ? 
                        "Validation results were found but couldn't be processed in the expected format." :
                        "No validation results found for this set."}
                      {" "}Click "Validate Now" to evaluate the prompt.
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      (Hover for more info)
                    </Typography>
                  </Box>
                </Tooltip>
              </Alert>
            </Box>
          )}

          {error && (
            <Box mb={3}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}

          {isOptimizing && (
            <Box mb={3}>
              <LinearProgress />
              <Typography variant="body2" component="div" mt={1}>
                {currentStep} ({currentIteration} of {maxIterations})
              </Typography>
            </Box>
          )}

          {/* Show summary table first */}
          {renderSummaryTable()}
          
          {/* Show detailed cards below */}
          {renderDetailedCards()}

          <Box mb={2}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleSubmitForReview}
              disabled={hitlLoading || isOptimizing || !initialPrompt.trim()}
              sx={{ mt: 1 }}
            >
              {hitlLoading ? 'Submitting for Human Review...' : 'Submit for Human Review'}
            </Button>
          </Box>
          {hitlError && <Alert severity="error">{hitlError}</Alert>}
          {hitlSuccess && <Alert severity="success">{hitlSuccess}</Alert>}
          {hitlPromptId && (
            <Box mb={2}>
              <Alert severity={hitlStatus === 'reviewed' ? 'success' : 'info'}>
                Review Status: <b>{hitlStatus}</b>
                {hitlStatus === 'in_review' && ' (waiting for reviewer...)'}
                {hitlStatus === 'reviewed' && hitlReview && (
                  <Box mt={1}>
                    <b>Reviewer Feedback:</b>
                    <ul>
                      {Object.entries(hitlReview.scores || {}).map(([k, v]) => (
                        <li key={k}>{k}: {v}</li>
                      ))}
                    </ul>
                    {hitlReview.comments && <div><b>Comments:</b> {hitlReview.comments}</div>}
                  </Box>
                )}
              </Alert>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary">
          Close
        </Button>
        {bestPrompt && (
          <Button
            onClick={() => onPromptOptimized(bestPrompt)}
            color="primary"
            variant="contained"
          >
            Apply Best Prompt
          </Button>
        )}
      </DialogActions>
      
      {/* Render the comparison dialog */}
      {renderComparisonDialog()}
    </Dialog>
  );
} 