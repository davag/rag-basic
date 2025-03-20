import React, { useState, useEffect, useCallback } from 'react';
import { 
  Typography, 
  Box,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  LinearProgress,
  Tooltip,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WindowIcon from '@mui/icons-material/Window';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';

// Model context window sizes in tokens
const MODEL_CONTEXT_SIZES = {
  // OpenAI models
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'o3-mini': 128000,  // New O3 model
  
  // Azure OpenAI models (same sizes as their OpenAI counterparts)
  'azure-gpt-4o': 128000,
  'azure-gpt-4o-mini': 128000,
  'azure-o3-mini': 128000,
  
  // Anthropic models
  'claude-3-5-sonnet-latest': 200000,
  'claude-3-7-sonnet-latest': 200000,
  
  // Ollama models
  'llama3.2:latest': 8192,
  'mistral:latest': 8192,
  'gemma3:12b': 12288,  // Gemma 3 12B has 12K context window
  
  // Default for unknown models
  'default': 8192
};

// Warning thresholds (percentage of context window used)
const WARNING_THRESHOLDS = {
  moderate: 70, // Yellow warning at 70%
  critical: 90   // Red warning at 90%
};

const ContextWindowVisualizer = ({ responses, systemPrompts, currentQuery, metrics }) => {
  const [expanded, setExpanded] = useState(false);
  const [contextUsage, setContextUsage] = useState({});
  
  // Helper function to estimate token count from text
  const estimateTokenCount = useCallback((text) => {
    // Simple estimation: ~4 chars per token is a common approximation
    // This is a rough estimate and could be replaced with a more accurate tokenizer
    // Add null check for text
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }, []);
  
  // Helper to find metrics for a model
  const findModelMetrics = useCallback((metrics, model) => {
    if (!metrics || !model) return null;
    
    // Direct hit - metrics stored directly under the model key
    if (metrics[model]) {
      return metrics[model];
    }
    
    // Check if this is a composite key like "Set 1-gpt-4o-mini"
    if (model.includes('-')) {
      // Try to extract set name and model name
      const setMatch = model.match(/^(Set \d+)-(.+)$/);
      
      if (setMatch) {
        const setName = setMatch[1]; // e.g., "Set 2"
        const modelName = setMatch[2]; // e.g., "gpt-4o-mini"
        
        // Case 1: Nested structure - metrics[setName][modelName]
        if (metrics[setName] && metrics[setName][modelName]) {
          return metrics[setName][modelName];
        }
        
        // Case 2: Just the model name
        if (metrics[modelName]) {
          return metrics[modelName];
        }
        
        // Case 3: Just the set name
        if (metrics[setName]) {
          return metrics[setName];
        }
        
        // Case 4: Dot notation - metrics["Set 1.gpt-4o-mini"]
        const dotKey = `${setName}.${modelName}`;
        if (metrics[dotKey]) {
          return metrics[dotKey];
        }
      }
    }
    
    return null;
  }, []);
  
  // Calculate context window usage
  const calculateContextUsage = useCallback(() => {
    if (!responses) return {}; // Add early return if responses is undefined
    
    const usage = {};
    
    // Process each set in responses
    Object.entries(responses || {}).forEach(([setKey, setResponses]) => {
      // Skip if this is not a set of responses
      if (['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(setKey)) {
        return;
      }
      
      // Process each model in the set
      Object.entries(setResponses || {}).forEach(([model, modelResponse]) => {
        if (!modelResponse || ['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(model)) {
          return;
        }
        
        // Create a composite key for this model in this set
        const modelKey = `${setKey}-${model}`;
        
        // Get the model's context window size
        const windowSize = MODEL_CONTEXT_SIZES[model] || MODEL_CONTEXT_SIZES.default;
        
        // Get system prompt for this model - safely access system prompts
        const systemPrompt = systemPrompts && systemPrompts[modelKey] ? systemPrompts[modelKey] : '';
        const systemPromptTokens = estimateTokenCount(systemPrompt);
        
        // Calculate tokens in context (retrieval chunks)
        const contextSources = modelResponse.sources || [];
        const contextText = contextSources.map(source => source?.content || '').join('\n\n');
        const contextTokens = estimateTokenCount(contextText);
        
        // Calculate tokens in query
        const queryTokens = estimateTokenCount(currentQuery || '');
        
        // Calculate tokens in response
        let responseText = '';
        if (modelResponse.answer) {
          responseText = typeof modelResponse.answer === 'object' ? 
            (modelResponse.answer.text || '') : 
            (modelResponse.answer || '');
        } else if (modelResponse.text) {
          responseText = modelResponse.text;
        }
        const responseTokens = estimateTokenCount(responseText);
        
        // Format instructions and overhead estimation (prompt formatting, JSON structures, etc.)
        // This is an approximate overhead based on common RAG prompt structures
        const instructionsText = "Context information is below.\n---------------------\n\n---------------------\nGiven the context information and not prior knowledge, answer the question:";
        const instructionsTokens = estimateTokenCount(instructionsText);
        const overheadTokens = Math.ceil((systemPromptTokens + contextTokens + queryTokens + instructionsTokens) * 0.1);
        
        // Total tokens used
        const totalTokensUsed = systemPromptTokens + contextTokens + queryTokens + responseTokens + instructionsTokens + overheadTokens;
        
        // Calculate percentage of context window used
        const percentageUsed = Math.round((totalTokensUsed / windowSize) * 100);
        
        // Get metrics for this model
        const modelMetrics = findModelMetrics(metrics, modelKey);
        
        // Store results
        usage[modelKey] = {
          windowSize,
          totalTokensUsed,
          percentageUsed,
          metrics: modelMetrics,
          breakdown: {
            system: systemPromptTokens,
            context: contextTokens,
            query: queryTokens,
            response: responseTokens,
            instructions: instructionsTokens,
            overhead: overheadTokens
          }
        };
      });
    });
    
    return usage;
  }, [responses, systemPrompts, currentQuery, estimateTokenCount, findModelMetrics, metrics]);
  
  // Update context usage whenever relevant props change
  useEffect(() => {
    if (!responses) return; // Add early return if responses is undefined
    
    const usage = calculateContextUsage();
    setContextUsage(usage);
  }, [responses, systemPrompts, currentQuery, calculateContextUsage]);
  
  // Format large numbers with commas
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  // Helper to get color for a percentage value
  const getProgressColor = (percentage) => {
    if (percentage < WARNING_THRESHOLDS.moderate) return "success";
    if (percentage < WARNING_THRESHOLDS.critical) return "warning";
    return "error";
  };
  
  // Check if any model has warnings
  const hasWarnings = () => {
    return Object.values(contextUsage || {}).some(
      usage => usage && usage.percentageUsed >= WARNING_THRESHOLDS.moderate
    );
  };
  
  // Get appropriate warning message based on context usage
  const getWarningMessage = () => {
    const criticalModels = Object.entries(contextUsage || {})
      .filter(([_, usage]) => usage && usage.percentageUsed >= WARNING_THRESHOLDS.critical)
      .map(([model]) => model);
      
    if (criticalModels.length > 0) {
      return `${criticalModels.join(', ')} ${criticalModels.length === 1 ? 'is' : 'are'} near context window limits.`;
    }
    
    return 'Some models are approaching their context window limits.';
  };
  
  // Get color for different segments of the breakdown
  const getSegmentColor = (segmentType) => {
    const colors = {
      system: '#8884d8',
      context: '#82ca9d',
      query: '#ffc658',
      response: '#ff8042',
      instructions: '#0088fe',
      overhead: '#a4a4a4'
    };
    
    return colors[segmentType] || colors.overhead;
  };
  
  // Get display name for segment types
  const getSegmentName = (segmentType) => {
    const names = {
      system: 'System Prompt',
      context: 'Context',
      query: 'Query',
      response: 'Response',
      instructions: 'Instructions',
      overhead: 'Overhead'
    };
    
    return names[segmentType] || segmentType;
  };

  return (
    <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
      <AccordionSummary 
        expandIcon={<ExpandMoreIcon />}
        aria-controls="context-window-content"
        id="context-window-header"
      >
        <Box display="flex" alignItems="center">
          <WindowIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Context Window Usage Analysis</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box>
          <Typography variant="body2" color="text.secondary" paragraph>
            This visualization shows how much of each model's context window is being used by your current query, context, and system prompts.
          </Typography>
          
          {hasWarnings() && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                {getWarningMessage()} Try reducing the number of retrieved documents, simplifying system prompts, 
                or using models with larger context windows.
              </Typography>
            </Alert>
          )}
          
          <Grid container spacing={3}>
            {Object.entries(contextUsage || {}).map(([modelKey, usage]) => {
              if (!usage) return null;
              
              // Extract set and model name from the composite key
              const [setKey, model] = modelKey.split('-');
              
              const breakdownEntries = [];
              let totalPercentage = 0;
              
              // Calculate percentages for each segment based on totalTokensUsed
              if (usage.breakdown) {
                Object.entries(usage.breakdown).forEach(([segment, tokens]) => {
                  const percentage = Math.round((tokens / usage.totalTokensUsed) * 100) || 0;
                  totalPercentage += percentage;
                  breakdownEntries.push({
                    segment,
                    tokens,
                    percentage
                  });
                });
              }
              
              // Adjust percentages to ensure they sum to 100%
              if (totalPercentage !== 100 && breakdownEntries.length > 0) {
                // Find the largest segment to adjust
                const largestSegment = breakdownEntries.reduce((prev, current) => 
                  (current.percentage > prev.percentage) ? current : prev
                );
                
                // Adjust the largest segment to make total 100%
                largestSegment.percentage += (100 - totalPercentage);
              }
              
              return (
                <Grid item xs={12} md={6} key={modelKey}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardHeader
                      title={
                        <Box display="flex" alignItems="center" justifyContent="space-between">
                          <Typography variant="h6">{setKey} - {model}</Typography>
                          <Chip 
                            size="small" 
                            label={`${usage.percentageUsed}% Used`} 
                            color={getProgressColor(usage.percentageUsed)}
                            sx={{ fontWeight: 'bold' }}
                          />
                        </Box>
                      }
                      subheader={
                        <Typography variant="body2" color="text.secondary">
                          {formatNumber(usage.totalTokensUsed)} / {formatNumber(usage.windowSize)} tokens
                        </Typography>
                      }
                    />
                    <Divider />
                    <CardContent>
                      {/* Main progress bar */}
                      <Box sx={{ mb: 2 }}>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min(100, usage.percentageUsed)}
                          color={getProgressColor(usage.percentageUsed)}
                          sx={{ 
                            height: 20, 
                            borderRadius: 1,
                            mb: 1
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Context window: {formatNumber(usage.windowSize)} tokens total
                        </Typography>
                      </Box>
                      
                      {/* Stacked usage breakdown */}
                      <Typography variant="subtitle2" gutterBottom>Token Breakdown</Typography>
                      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ height: 30, display: 'flex', width: '100%', borderRadius: 1, overflow: 'hidden' }}>
                          {breakdownEntries.map(({ segment, percentage }) => (
                            <Tooltip 
                              key={segment} 
                              title={`${getSegmentName(segment)}: ${formatNumber(usage.breakdown[segment])} tokens (${percentage}%)`}
                              arrow
                            >
                              <Box 
                                sx={{ 
                                  width: `${percentage}%`, 
                                  bgcolor: getSegmentColor(segment),
                                  height: '100%',
                                  minWidth: percentage > 0 ? '4px' : '0px'
                                }} 
                              />
                            </Tooltip>
                          ))}
                        </Box>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                          {breakdownEntries.map(({ segment, percentage }) => (
                            <Chip
                              key={segment}
                              size="small"
                              label={`${getSegmentName(segment)}: ${percentage}%`}
                              sx={{ 
                                bgcolor: getSegmentColor(segment),
                                color: 'white',
                                fontSize: '0.7rem'
                              }}
                            />
                          ))}
                        </Stack>
                      </Box>
                      
                      {/* Warnings and recommendations */}
                      {usage.percentageUsed >= WARNING_THRESHOLDS.moderate && (
                        <Alert 
                          severity={usage.percentageUsed >= WARNING_THRESHOLDS.critical ? 'error' : 'warning'}
                          sx={{ mt: 2 }}
                        >
                          <Typography variant="body2">
                            {usage.percentageUsed >= WARNING_THRESHOLDS.critical ? (
                              <>
                                <strong>Critical:</strong> This model is near its context window limit. 
                                Consider reducing context chunks or using a model with a larger context window.
                              </>
                            ) : (
                              <>
                                <strong>Warning:</strong> This model is using {usage.percentageUsed}% of its context window.
                                Monitor usage if adding more content.
                              </>
                            )}
                          </Typography>
                        </Alert>
                      )}
                      
                      {/* Usage statistics */}
                      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">
                          <MemoryIcon sx={{ fontSize: '1rem', verticalAlign: 'middle', mr: 0.5 }} />
                          Total: {formatNumber(usage.totalTokensUsed)} tokens
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <InfoIcon sx={{ fontSize: '1rem', verticalAlign: 'middle', mr: 0.5 }} />
                          {usage.windowSize - usage.totalTokensUsed > 0 ? 
                            `${formatNumber(usage.windowSize - usage.totalTokensUsed)} tokens remaining` : 
                            'Window exceeded'}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default ContextWindowVisualizer; 