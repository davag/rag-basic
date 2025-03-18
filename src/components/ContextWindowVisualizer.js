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
import WarningIcon from '@mui/icons-material/Warning';
import WindowIcon from '@mui/icons-material/Window';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';

// Model context window sizes in tokens
const MODEL_CONTEXT_SIZES = {
  // OpenAI models
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'o1-mini': 128000,
  'o1-preview': 128000,
  
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

const ContextWindowVisualizer = ({ responses, systemPrompts, currentQuery }) => {
  const [expanded, setExpanded] = useState(false);
  const [contextUsage, setContextUsage] = useState({});
  
  // Helper function to estimate token count from text
  const estimateTokenCount = useCallback((text) => {
    // Simple estimation: ~4 chars per token is a common approximation
    // This is a rough estimate and could be replaced with a more accurate tokenizer
    return Math.ceil(text.length / 4);
  }, []);
  
  // Calculate context window usage
  const calculateContextUsage = useCallback(() => {
    const usage = {};
    
    Object.entries(responses).forEach(([model, modelResponse]) => {
      // Skip if model key is a reserved system property
      if (['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(model)) {
        return;
      }
      
      // Get the model's context window size
      const windowSize = MODEL_CONTEXT_SIZES[model] || MODEL_CONTEXT_SIZES.default;
      
      // Get system prompt for this model - safely access system prompts
      const systemPrompt = systemPrompts && systemPrompts[model] ? systemPrompts[model] : '';
      const systemPromptTokens = estimateTokenCount(systemPrompt);
      
      // Calculate tokens in context (retrieval chunks)
      const contextSources = modelResponse.sources || [];
      const contextText = contextSources.map(source => source.content).join('\n\n');
      const contextTokens = estimateTokenCount(contextText);
      
      // Calculate tokens in query
      const queryTokens = estimateTokenCount(currentQuery);
      
      // Calculate tokens in response
      const responseText = typeof modelResponse.answer === 'object' ? 
        modelResponse.answer.text : 
        modelResponse.answer;
      const responseTokens = estimateTokenCount(responseText);
      
      // Format instructions and overhead estimation (prompt formatting, JSON structures, etc.)
      // This is an approximate overhead based on common RAG prompt structures
      const instructionsText = "Context information is below.\n---------------------\n\n---------------------\nGiven the context information and not prior knowledge, answer the question:";
      const instructionsTokens = estimateTokenCount(instructionsText);
      const overheadTokens = Math.ceil((systemPromptTokens + contextTokens + queryTokens + instructionsTokens) * 0.1); // ~10% overhead
      
      // Total tokens used
      const totalTokensUsed = systemPromptTokens + contextTokens + queryTokens + responseTokens + instructionsTokens + overheadTokens;
      
      // Calculate percentage of context window used
      const percentageUsed = Math.min(100, Math.round((totalTokensUsed / windowSize) * 100));
      
      // Determine warning level
      let warningLevel = 'none';
      if (percentageUsed >= WARNING_THRESHOLDS.critical) {
        warningLevel = 'critical';
      } else if (percentageUsed >= WARNING_THRESHOLDS.moderate) {
        warningLevel = 'moderate';
      }
      
      // Build the usage object
      usage[model] = {
        windowSize,
        systemPromptTokens,
        contextTokens,
        queryTokens,
        responseTokens,
        instructionsTokens,
        overheadTokens,
        totalTokensUsed,
        percentageUsed,
        warningLevel,
        breakdown: {
          systemPrompt: {
            tokens: systemPromptTokens,
            percentage: Math.round((systemPromptTokens / totalTokensUsed) * 100)
          },
          context: {
            tokens: contextTokens,
            percentage: Math.round((contextTokens / totalTokensUsed) * 100)
          },
          query: {
            tokens: queryTokens,
            percentage: Math.round((queryTokens / totalTokensUsed) * 100)
          },
          instructions: {
            tokens: instructionsTokens,
            percentage: Math.round((instructionsTokens / totalTokensUsed) * 100)
          },
          overhead: {
            tokens: overheadTokens,
            percentage: Math.round((overheadTokens / totalTokensUsed) * 100)
          },
          response: {
            tokens: responseTokens,
            percentage: Math.round((responseTokens / totalTokensUsed) * 100)
          }
        }
      };
    });
    
    setContextUsage(usage);
  }, [responses, systemPrompts, currentQuery, estimateTokenCount]);
  
  // Calculate context usage when responses, systemPrompts, or currentQuery changes
  useEffect(() => {
    if (Object.keys(responses).length > 0) {
      calculateContextUsage();
    }
  }, [responses, systemPrompts, currentQuery, calculateContextUsage]);
  
  // Format large numbers with commas
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  // Get progress color
  const getProgressColor = (percentage) => {
    if (percentage >= WARNING_THRESHOLDS.critical) return 'error';
    if (percentage >= WARNING_THRESHOLDS.moderate) return 'warning';
    return 'primary';
  };
  
  // Check if any models have warning or critical usage levels
  const hasWarnings = () => {
    return Object.values(contextUsage).some(usage => 
      usage.warningLevel === 'moderate' || usage.warningLevel === 'critical'
    );
  };
  
  // Get message for warning chip
  const getWarningMessage = () => {
    const criticalCount = Object.values(contextUsage).filter(u => u.warningLevel === 'critical').length;
    const warningCount = Object.values(contextUsage).filter(u => u.warningLevel === 'moderate').length;
    
    if (criticalCount > 0) {
      return `${criticalCount} critical, ${warningCount} warning`;
    } else if (warningCount > 0) {
      return `${warningCount} warnings`;
    } else {
      return 'All good';
    }
  };
  
  // Get segment colors for the stacked progress bar
  const getSegmentColor = (segmentType) => {
    const colors = {
      systemPrompt: '#4caf50', // green
      context: '#2196f3',      // blue
      query: '#9c27b0',        // purple
      instructions: '#ff9800', // orange
      overhead: '#795548',     // brown
      response: '#f44336'      // red
    };
    
    return colors[segmentType] || '#888888';
  };
  
  // Get readable segment name
  const getSegmentName = (segmentType) => {
    const names = {
      systemPrompt: 'System Prompt',
      context: 'Context Chunks',
      query: 'User Query',
      instructions: 'Instructions',
      overhead: 'Formatting Overhead',
      response: 'Model Response'
    };
    
    return names[segmentType] || segmentType;
  };

  return (
    <Accordion 
      expanded={expanded} 
      onChange={() => setExpanded(!expanded)}
      sx={{ 
        backgroundColor: hasWarnings() ? '#fff8e1' : 'inherit',
        '&.Mui-expanded': {
          backgroundColor: hasWarnings() ? '#fff8e1' : 'inherit'
        }
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" alignItems="center">
          <WindowIcon sx={{ mr: 1, color: hasWarnings() ? 'warning.main' : 'text.secondary' }} />
          <Typography variant="h6">
            Context Window Analysis
            {hasWarnings() && (
              <Chip 
                size="small" 
                icon={<WarningIcon />} 
                label={getWarningMessage()} 
                color="warning"
                sx={{ ml: 2, fontWeight: 'bold' }}
              />
            )}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" paragraph>
          This visualization shows how much of each model's context window is being utilized. 
          The context window is the maximum number of tokens a model can process, including system prompts, 
          retrieved context, user query, and the generated response.
        </Typography>
        
        {hasWarnings() && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Warning:</strong> Some models are approaching their context window limits. 
              Consider reducing the number of retrieved chunks, simplifying your system prompt, 
              or using models with larger context windows.
            </Typography>
          </Alert>
        )}
        
        <Grid container spacing={3}>
          {Object.entries(contextUsage).map(([model, usage]) => (
            <Grid item xs={12} md={6} key={model}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardHeader
                  title={
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Typography variant="h6">{model}</Typography>
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
                      value={usage.percentageUsed}
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
                      {Object.entries(usage.breakdown).map(([segment, data]) => (
                        <Tooltip 
                          key={segment} 
                          title={`${getSegmentName(segment)}: ${formatNumber(data.tokens)} tokens (${data.percentage}%)`}
                          arrow
                        >
                          <Box 
                            sx={{ 
                              width: `${data.percentage}%`, 
                              bgcolor: getSegmentColor(segment),
                              height: '100%',
                              minWidth: data.percentage > 0 ? '4px' : '0px'
                            }} 
                          />
                        </Tooltip>
                      ))}
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                      {Object.entries(usage.breakdown).map(([segment, data]) => (
                        <Chip
                          key={segment}
                          size="small"
                          label={`${getSegmentName(segment)}: ${data.percentage}%`}
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
                  {usage.warningLevel !== 'none' && (
                    <Alert 
                      severity={usage.warningLevel === 'critical' ? 'error' : 'warning'}
                      sx={{ mt: 2 }}
                    >
                      <Typography variant="body2">
                        {usage.warningLevel === 'critical' ? (
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
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
};

export default ContextWindowVisualizer; 