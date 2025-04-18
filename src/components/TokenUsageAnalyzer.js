import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Card, 
  CardContent,
  Stack,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TokenIcon from '@mui/icons-material/Token';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import WarningIcon from '@mui/icons-material/Warning';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { calculateCost } from '../config/llmConfig';

// Utility to estimate token breakdown of a prompt
const estimateTokenBreakdown = (prompt, systemPrompt) => {
  // Simple estimation: ~4 chars per token is a common approximation
  const charsPerToken = 4;
  
  // Extract different parts of the prompt for analysis
  const parts = {
    systemPrompt: systemPrompt || "",
    instructionHeader: "Context information is below.\n---------------------\n",
    context: prompt.split("---------------------\n")[1]?.split("---------------------\n")[0] || "",
    queryInstruction: "Given the context information and not prior knowledge, answer the question: ",
    query: prompt.split("answer the question: ")[1] || ""
  };
  
  // Calculate token estimates for each part
  const tokenEstimates = {};
  let totalTokens = 0;
  
  for (const [partName, partText] of Object.entries(parts)) {
    const tokenCount = Math.ceil(partText.length / charsPerToken);
    tokenEstimates[partName] = tokenCount;
    totalTokens += tokenCount;
  }
  
  // Add additional tokens for formatting, JSON structure, etc.
  const overheadTokens = Math.ceil(totalTokens * 0.1); // ~10% overhead for formatting
  tokenEstimates.overhead = overheadTokens;
  totalTokens += overheadTokens;
  
  return {
    breakdown: tokenEstimates,
    total: totalTokens
  };
};

// Identify potential high-cost sections of the prompt
const identifyExpensiveAreas = (tokenBreakdown) => {
  const warnings = [];
  
  // Check if context is very large (often the biggest token consumer)
  if (tokenBreakdown.breakdown.context > 800) {
    warnings.push({
      type: "context_size",
      message: "Large context size may be increasing token usage significantly",
      section: "context",
      severity: "high"
    });
  }
  
  // Check if system prompt is verbose
  if (tokenBreakdown.breakdown.systemPrompt > 150) {
    warnings.push({
      type: "system_prompt",
      message: "System prompt is quite verbose and could be optimized",
      section: "systemPrompt",
      severity: "medium"
    });
  }
  
  return warnings;
};

const TokenUsageAnalyzer = ({ metrics, responses, systemPrompts, currentQuery }) => {
  const [tokenBreakdowns, setTokenBreakdowns] = useState({});
  const [expanded, setExpanded] = useState(false);
  const [warnings, setWarnings] = useState({});
  
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
  
  // Helper to normalize token usage data from different LLM providers
  const normalizeTokenUsage = useCallback((tokenUsage) => {
    if (!tokenUsage) return { input: 0, output: 0, total: 0 };
    
    // Handle standard format with input/output
    if (tokenUsage.input !== undefined && tokenUsage.output !== undefined) {
      return {
        input: tokenUsage.input || 0,
        output: tokenUsage.output || 0,
        total: tokenUsage.total || (tokenUsage.input || 0) + (tokenUsage.output || 0),
        estimated: tokenUsage.estimated || false,
        details: tokenUsage.details || null,
        rawUsage: tokenUsage // Keep the original data for reference
      };
    }
    
    // Handle Azure/OpenAI format with prompt_tokens/completion_tokens
    if (tokenUsage.prompt_tokens !== undefined || tokenUsage.completion_tokens !== undefined) {
      return {
        input: tokenUsage.prompt_tokens || 0,
        output: tokenUsage.completion_tokens || 0,
        total: tokenUsage.total_tokens || (tokenUsage.prompt_tokens || 0) + (tokenUsage.completion_tokens || 0),
        estimated: false, // API provided counts are not estimated
        details: {
          prompt_tokens_details: tokenUsage.prompt_tokens_details || null,
          completion_tokens_details: tokenUsage.completion_tokens_details || null
        },
        rawUsage: tokenUsage // Keep the original data for reference
      };
    }
    
    // If we somehow have only 'total', make a reasonable guess
    if (tokenUsage.total) {
      return {
        input: Math.floor(tokenUsage.total * 0.6), // Estimate 60% input
        output: Math.floor(tokenUsage.total * 0.4), // Estimate 40% output
        total: tokenUsage.total
      };
    }
    
    return { input: 0, output: 0, total: 0 };
  }, []);
  
  useEffect(() => {
    // Calculate token breakdowns for each model
    const breakdowns = {};
    const modelWarnings = {};
    
    console.log("TokenUsageAnalyzer - Calculating breakdown for responses:", responses);
    console.log("TokenUsageAnalyzer - Available metrics:", metrics);
    
    // Handle new response structure with 'models' key
    if (responses && responses.models) {
      console.log("TokenUsageAnalyzer - Using new structure with models key");
      
      // Process each set in responses.models
      Object.entries(responses.models).forEach(([setKey, setResponses]) => {
        // Process each model in the set
        Object.entries(setResponses).forEach(([model, modelResponse]) => {
          if (!modelResponse || !modelResponse.sources) {
            console.log(`TokenUsageAnalyzer - Skipping model ${model} in set ${setKey} (no response or sources)`);
            return;
          }
          
          // Create a composite key for this model in this set
          const modelKey = `${setKey}-${model}`;
          console.log(`TokenUsageAnalyzer - Processing model ${model} in set ${setKey}`);
          
          // Get metrics for this model
          const modelMetrics = findModelMetrics(metrics, modelKey) || findModelMetrics(metrics, model);
          console.log(`TokenUsageAnalyzer - Model metrics for ${modelKey}:`, modelMetrics);
          
          // If we have actual token usage from metrics, use that
          if (modelMetrics && modelMetrics.tokenUsage && modelMetrics.tokenUsage.total) {
            const tokenUsage = normalizeTokenUsage(modelMetrics.tokenUsage);
            console.log(`TokenUsageAnalyzer - Using actual token counts for ${model}:`, tokenUsage);
            
            // Create a breakdown based on the actual usage
            breakdowns[modelKey] = {
              total: tokenUsage.total,
              breakdown: {
                input: tokenUsage.input,
                output: tokenUsage.output
              },
              actualMetrics: true
            };
          } else {
            // Fall back to estimating from response
            console.log(`TokenUsageAnalyzer - No metrics found for ${modelKey}, estimating from response`);
            
            // Reconstruct the full prompt that was sent
            const context = (modelResponse.sources || []).map(s => s?.content || '').join('\n\n');
            const prompt = `
Context information is below.
---------------------
${context}
---------------------
Given the context information and not prior knowledge, answer the question: ${currentQuery || ''}
`;
            
            // Get the system prompt used for this model
            const systemPrompt = systemPrompts && systemPrompts[modelKey] ? systemPrompts[modelKey] : "";
            
            // Estimate token breakdown
            const breakdown = estimateTokenBreakdown(prompt, systemPrompt);
            breakdowns[modelKey] = breakdown;
          }
          
          // Identify potential expensive areas
          modelWarnings[modelKey] = identifyExpensiveAreas(breakdowns[modelKey]);
        });
      });
    } else {
      // Legacy structure handling
      console.log("TokenUsageAnalyzer - Using legacy response structure");
      
      // Process each set in responses
      Object.entries(responses || {}).forEach(([setKey, setResponses]) => {
        // Skip if this is not a set of responses
        if (['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(setKey)) {
          return;
        }
        
        // Process each model in the set
        Object.entries(setResponses || {}).forEach(([model, response]) => {
          if (!response || !response.sources) {
            return; // Skip this model if response or sources is undefined
          }
          
          // Create a composite key for this model in this set
          const modelKey = `${setKey}-${model}`;
          
          // Get metrics for this model
          const modelMetrics = findModelMetrics(metrics, modelKey);
          
          // If we have actual token usage from metrics, use that
          if (modelMetrics && modelMetrics.tokenUsage && modelMetrics.tokenUsage.total) {
            const tokenUsage = normalizeTokenUsage(modelMetrics.tokenUsage);
            
            // Create a breakdown based on the actual usage
            breakdowns[modelKey] = {
              total: tokenUsage.total,
              breakdown: {
                input: tokenUsage.input,
                output: tokenUsage.output
              },
              actualMetrics: true
            };
          } else {
            // Fall back to estimating from response
            
            // Reconstruct the full prompt that was sent
            const context = (response.sources || []).map(s => s?.content || '').join('\n\n');
            const prompt = `
Context information is below.
---------------------
${context}
---------------------
Given the context information and not prior knowledge, answer the question: ${currentQuery || ''}
`;
            
            // Get the system prompt used for this model
            const systemPrompt = systemPrompts && systemPrompts[modelKey] ? systemPrompts[modelKey] : "";
            
            // Estimate token breakdown
            const breakdown = estimateTokenBreakdown(prompt, systemPrompt);
            breakdowns[modelKey] = breakdown;
          }
          
          // Identify potential expensive areas
          modelWarnings[modelKey] = identifyExpensiveAreas(breakdowns[modelKey]);
        });
      });
    }
    
    console.log("TokenUsageAnalyzer - Final breakdowns:", breakdowns);
    console.log("TokenUsageAnalyzer - Model warnings:", modelWarnings);
    
    setTokenBreakdowns(breakdowns);
    setWarnings(modelWarnings);
  }, [responses, systemPrompts, currentQuery, findModelMetrics, normalizeTokenUsage, metrics]);
  
  // Helper to calculate percentage of token usage
  const calculatePercentage = (part, total) => {
    if (!part || !total) return 0;
    return Math.round((part / total) * 100);
  };
  
  // Format large numbers with commas
  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  // Format elapsed time in a readable format
  const formatElapsedTime = (ms) => {
    if (!ms) return 'N/A';
    
    // Some timestamps are already in seconds rather than milliseconds
    // If the value is extremely large (like 1743154740000), it's likely a timestamp rather than a duration
    if (ms > 1000000000000) {
      // Convert to readable date if it's a full timestamp
      const date = new Date(ms);
      return `${date.toLocaleTimeString()}`;
    }

    // If the value is still quite large but less than a typical timestamp, it might be seconds since epoch
    if (ms > 1000000000) {
      return `${(ms/1000).toFixed(2)}s total`;
    }
    
    // Handle actual durations
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}.${Math.floor((ms % 1000) / 100)}s`;
    }
  };
  
  // Helper to get color for a percentage value
  const getColorForPercentage = (percentage) => {
    if (percentage < 33) return "success.main";
    if (percentage < 66) return "warning.main";
    return "error.main";
  };

  return (
    <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
      <AccordionSummary 
        expandIcon={<ExpandMoreIcon />}
        aria-controls="token-usage-content"
        id="token-usage-header"
      >
        <Box display="flex" alignItems="center">
          <TokenIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Detailed Token Usage Analysis</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box>
          <Typography variant="body2" color="text.secondary" paragraph>
            This analysis provides a detailed breakdown of token usage for each model. Understanding token consumption helps optimize costs and improve response times.
          </Typography>
          
          <Grid container spacing={3}>
            {responses && responses.models ? (
              // Handle new response structure with 'models' key
              Object.entries(responses.models).map(([setKey, setResponses]) => 
                Object.entries(setResponses).map(([model, modelResponse]) => {
                  if (!modelResponse) return null;
                  
                  // Create a composite key for this model in this set
                  const modelKey = `${setKey}-${model}`;
                  
                  // Extract model name properly
                  const setNameMatch = modelKey.match(/^(Set \d+)-(.+)$/);
                  const modelDisplay = setNameMatch ? setNameMatch[2] : model;
                  const setKeyDisplay = setNameMatch ? setNameMatch[1] : setKey;
                  
                  const modelMetrics = findModelMetrics(metrics, modelKey) || findModelMetrics(metrics, model) || {};
                  const tokenUsage = normalizeTokenUsage(modelMetrics.tokenUsage || {});
                  
                  const breakdown = tokenBreakdowns[modelKey];
                  const modelWarnings = warnings[modelKey] || [];
                  
                  let modelCost = 0;
                  if (modelMetrics && modelMetrics.calculatedCost !== undefined) {
                    // Use API-provided cost if available
                    modelCost = Number(modelMetrics.calculatedCost);
                  } else if (tokenUsage && tokenUsage.total) {
                    // Use the unified cost calculation through window.costTracker if available
                    if (window.costTracker) {
                      const costInfo = window.costTracker.computeCost(model, tokenUsage);
                      modelCost = costInfo.cost;
                    } else {
                      // Fallback to the standard calculation method
                      const costResult = calculateCost(model, { 
                        input: tokenUsage.input || tokenUsage.total / 2, 
                        output: tokenUsage.output || tokenUsage.total / 2 
                      });
                      modelCost = costResult.totalCost || 0;
                    }
                  }
                    
                  if (!breakdown) return null;
                  
                  return (
                    <Grid item xs={12} md={6} key={modelKey}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            {modelDisplay} ({setKeyDisplay})
                          </Typography>
                          
                          {/* Token Summary */}
                          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                            <Chip 
                              icon={<TokenIcon />} 
                              label={`${formatNumber(tokenUsage.total)} Total Tokens`} 
                              color="primary"
                            />
                            <Chip 
                              icon={<AttachMoneyIcon />} 
                              label={modelCost === 0 ? 'Free' : modelCost < 0.0000001 && modelCost > 0 ? `$${Number(modelCost).toFixed(10)}` : `$${Number(modelCost).toFixed(7)}`} 
                              color="secondary"
                            />
                            {modelMetrics.calculatedCost !== undefined && modelMetrics.calculatedCost !== null && (
                              <Tooltip title="This cost is reported directly by the API provider and represents the actual charge for this request">
                                <Chip
                                  variant="outlined"
                                  label="Actual Cost from API"
                                  color="info"
                                  sx={{ ml: 0.5 }}
                                />
                              </Tooltip>
                            )}
                            {modelMetrics.elapsedTime && (
                              <Chip
                                icon={<AccessTimeIcon />}
                                label={`${formatElapsedTime(modelMetrics.elapsedTime)}`}
                                color="info"
                              />
                            )}
                          </Stack>
                          
                          {/* Input/Output Breakdown */}
                          <Typography variant="subtitle2" gutterBottom>Input/Output Split</Typography>
                          <Box sx={{ mb: 2 }}>
                            <LinearProgress
                              variant="determinate"
                              value={tokenUsage.total ? (tokenUsage.input / tokenUsage.total) * 100 : 0}
                              sx={{
                                height: 10,
                                borderRadius: 1,
                                backgroundColor: 'secondary.light',
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: 'primary.main',
                                }
                              }}
                            />
                            
                            <Box sx={{ ml: 2, display: 'flex', fontSize: '0.75rem' }}>
                              <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', mr: 1 }}>
                                <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main', borderRadius: 1, mr: 0.5 }} />
                                Input: {formatNumber(tokenUsage.input)} tokens ({tokenUsage.total ? Math.round((tokenUsage.input / tokenUsage.total) * 100) : 0}%)
                              </Box>
                              <Box sx={{ color: 'secondary.main', display: 'flex', alignItems: 'center' }}>
                                <Box sx={{ width: 8, height: 8, bgcolor: 'secondary.main', borderRadius: 1, mr: 0.5 }} />
                                Output: {formatNumber(tokenUsage.output)} tokens ({tokenUsage.total ? Math.round((tokenUsage.output / tokenUsage.total) * 100) : 0}%)
                              </Box>
                            </Box>
                          </Box>
                          
                          {/* Token Usage Details - only show if available */}
                          {tokenUsage.details && (
                            <>
                              <Typography variant="subtitle2" gutterBottom>Additional Token Details</Typography>
                              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Detail</TableCell>
                                      <TableCell align="right">Value</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {/* Prompt token details */}
                                    {tokenUsage.details?.prompt_tokens_details?.cached_tokens !== undefined && (
                                      <TableRow>
                                        <TableCell>Cached Input Tokens</TableCell>
                                        <TableCell align="right">{tokenUsage.details.prompt_tokens_details.cached_tokens}</TableCell>
                                      </TableRow>
                                    )}
                                    
                                    {/* Completion token details */}
                                    {tokenUsage.details?.completion_tokens_details?.reasoning_tokens !== undefined && (
                                      <TableRow>
                                        <TableCell>Reasoning Tokens</TableCell>
                                        <TableCell align="right">{tokenUsage.details.completion_tokens_details.reasoning_tokens}</TableCell>
                                      </TableRow>
                                    )}
                                    
                                    {/* Display source if known */}
                                    {!tokenUsage.estimated && (
                                      <TableRow>
                                        <TableCell>Token Count Source</TableCell>
                                        <TableCell align="right">API Reported</TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </TableContainer>
                            </>
                          )}
                          
                          {/* Detailed Prompt Breakdown */}
                          <Typography variant="subtitle2" gutterBottom>Prompt Breakdown</Typography>
                          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Component</TableCell>
                                  <TableCell align="right">Est. Tokens</TableCell>
                                  <TableCell align="right">% of Total</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {breakdown && breakdown.breakdown && Object.entries(breakdown.breakdown || {}).map(([part, tokens]) => {
                                  // Ensure tokens is a valid number
                                  const tokenValue = Number.isFinite(tokens) ? tokens : 0;
                                  // Calculate percentage of total tokens, not just input tokens
                                  const totalTokens = tokenUsage.total || 1;
                                  const percentage = calculatePercentage(tokenValue, totalTokens);
                                  return (
                                    <TableRow key={part}>
                                      <TableCell component="th" scope="row">
                                        {part.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                      </TableCell>
                                      <TableCell align="right">{formatNumber(tokenValue)}</TableCell>
                                      <TableCell 
                                        align="right"
                                        sx={{ 
                                          color: getColorForPercentage(percentage),
                                          fontWeight: percentage > 30 ? 'bold' : 'normal'
                                        }}
                                      >
                                        {percentage}%
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          
                          {/* Optimization Warnings */}
                          {modelWarnings.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                              <Typography variant="subtitle2" gutterBottom color="warning.main">
                                <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                Optimization Suggestions
                              </Typography>
                              <Box component="ul" sx={{ pl: 2 }}>
                                {modelWarnings.map((warning, index) => (
                                  <Box component="li" key={index}>
                                    <Typography variant="body2" color="text.secondary">
                                      {warning.message}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })
              )
            ) : (
              // Legacy structure handling
              Object.entries(responses || {}).map(([setKey, setResponses]) => {
              // Skip if this is not a set of responses
              if (['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(setKey)) {
                return null;
              }
              
              return Object.entries(setResponses || {}).map(([model, response]) => {
                if (!response || !response.sources) {
                  return null;
                }
                
                // Create a composite key for this model in this set
                const modelKey = `${setKey}-${model}`;
                  
                  // Extract set and model name from the composite key - handle model names with dashes
                  const setNameMatch = modelKey.match(/^(Set \d+)-(.+)$/);
                  const setKeyDisplay = setNameMatch ? setNameMatch[1] : setKey;
                  const modelDisplay = setNameMatch ? setNameMatch[2] : model;
                
                const modelMetrics = findModelMetrics(metrics, modelKey) || {};
                const tokenUsage = normalizeTokenUsage(modelMetrics.tokenUsage || {});
                
                const breakdown = tokenBreakdowns[modelKey];
                const modelWarnings = warnings[modelKey] || [];
                
                let modelCost = 0;
                if (modelMetrics && modelMetrics.calculatedCost !== undefined) {
                  // Use API-provided cost if available
                  modelCost = Number(modelMetrics.calculatedCost);
                } else if (tokenUsage && tokenUsage.total) {
                  // Use the unified cost calculation through window.costTracker if available
                  if (window.costTracker) {
                    const costInfo = window.costTracker.computeCost(model, tokenUsage);
                    modelCost = costInfo.cost;
                  } else {
                    // Fallback to the standard calculation method
                    const costResult = calculateCost(model, { 
                      input: tokenUsage.input || tokenUsage.total / 2, 
                      output: tokenUsage.output || tokenUsage.total / 2 
                    });
                    modelCost = costResult.totalCost || 0;
                  }
                }
                  
                if (!breakdown) return null;
                
                return (
                  <Grid item xs={12} md={6} key={modelKey}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                            {modelDisplay} ({setKeyDisplay})
                        </Typography>
                        
                        {/* Token Summary */}
                        <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                          <Chip 
                            icon={<TokenIcon />} 
                            label={`${formatNumber(tokenUsage.total)} Total Tokens`} 
                            color="primary"
                          />
                          <Chip 
                            icon={<AttachMoneyIcon />} 
                            label={modelCost === 0 ? 'Free' : modelCost < 0.0000001 && modelCost > 0 ? `$${Number(modelCost).toFixed(10)}` : `$${Number(modelCost).toFixed(7)}`} 
                            color="secondary"
                          />
                          {modelMetrics.calculatedCost !== undefined && modelMetrics.calculatedCost !== null && (
                              <Tooltip title="This cost is reported directly by the API provider and represents the actual charge for this request">
                              <Chip
                                variant="outlined"
                                  label="Actual Cost from API"
                                color="info"
                                sx={{ ml: 0.5 }}
                              />
                            </Tooltip>
                          )}
                          {modelMetrics.elapsedTime && (
                            <Chip
                              icon={<AccessTimeIcon />}
                              label={`${formatElapsedTime(modelMetrics.elapsedTime)}`}
                              color="info"
                            />
                          )}
                        </Stack>
                        
                        {/* Input/Output Breakdown */}
                        <Typography variant="subtitle2" gutterBottom>Input/Output Split</Typography>
                        <Box sx={{ mb: 2 }}>
                          <LinearProgress
                            variant="determinate"
                            value={tokenUsage.total ? (tokenUsage.input / tokenUsage.total) * 100 : 0}
                            sx={{
                              height: 10,
                              borderRadius: 1,
                              backgroundColor: 'secondary.light',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: 'primary.main',
                              }
                            }}
                          />
                          
                          <Box sx={{ ml: 2, display: 'flex', fontSize: '0.75rem' }}>
                            <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', mr: 1 }}>
                              <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main', borderRadius: 1, mr: 0.5 }} />
                                Input: {formatNumber(tokenUsage.input)} tokens ({tokenUsage.total ? Math.round((tokenUsage.input / tokenUsage.total) * 100) : 0}%)
                            </Box>
                            <Box sx={{ color: 'secondary.main', display: 'flex', alignItems: 'center' }}>
                              <Box sx={{ width: 8, height: 8, bgcolor: 'secondary.main', borderRadius: 1, mr: 0.5 }} />
                                Output: {formatNumber(tokenUsage.output)} tokens ({tokenUsage.total ? Math.round((tokenUsage.output / tokenUsage.total) * 100) : 0}%)
                              </Box>
                          </Box>
                        </Box>
                        
                        {/* Token Usage Details - only show if available */}
                        {tokenUsage.details && (
                          <>
                            <Typography variant="subtitle2" gutterBottom>Additional Token Details</Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Detail</TableCell>
                                    <TableCell align="right">Value</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {/* Prompt token details */}
                                  {tokenUsage.details?.prompt_tokens_details?.cached_tokens !== undefined && (
                                    <TableRow>
                                      <TableCell>Cached Input Tokens</TableCell>
                                      <TableCell align="right">{tokenUsage.details.prompt_tokens_details.cached_tokens}</TableCell>
                                    </TableRow>
                                  )}
                                  
                                  {/* Completion token details */}
                                  {tokenUsage.details?.completion_tokens_details?.reasoning_tokens !== undefined && (
                                    <TableRow>
                                      <TableCell>Reasoning Tokens</TableCell>
                                      <TableCell align="right">{tokenUsage.details.completion_tokens_details.reasoning_tokens}</TableCell>
                                    </TableRow>
                                  )}
                                  
                                  {/* Display source if known */}
                                  {!tokenUsage.estimated && (
                                    <TableRow>
                                      <TableCell>Token Count Source</TableCell>
                                      <TableCell align="right">API Reported</TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </>
                        )}
                        
                        {/* Detailed Prompt Breakdown */}
                        <Typography variant="subtitle2" gutterBottom>Prompt Breakdown</Typography>
                        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Component</TableCell>
                                <TableCell align="right">Est. Tokens</TableCell>
                                  <TableCell align="right">% of Total</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {breakdown && breakdown.breakdown && Object.entries(breakdown.breakdown || {}).map(([part, tokens]) => {
                                // Ensure tokens is a valid number
                                const tokenValue = Number.isFinite(tokens) ? tokens : 0;
                                  // Calculate percentage of total tokens, not just input tokens
                                  const totalTokens = tokenUsage.total || 1;
                                  const percentage = calculatePercentage(tokenValue, totalTokens);
                                return (
                                  <TableRow key={part}>
                                    <TableCell component="th" scope="row">
                                      {part.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                    </TableCell>
                                    <TableCell align="right">{formatNumber(tokenValue)}</TableCell>
                                    <TableCell 
                                      align="right"
                                      sx={{ 
                                        color: getColorForPercentage(percentage),
                                        fontWeight: percentage > 30 ? 'bold' : 'normal'
                                      }}
                                    >
                                      {percentage}%
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        
                        {/* Optimization Warnings */}
                        {modelWarnings.length > 0 && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom color="warning.main">
                              <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                              Optimization Suggestions
                            </Typography>
                            <Box component="ul" sx={{ pl: 2 }}>
                              {modelWarnings.map((warning, index) => (
                                <Box component="li" key={index}>
                                  <Typography variant="body2" color="text.secondary">
                                    {warning.message}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              });
              })
            )}
          </Grid>
          
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>Tips to Reduce Token Usage</Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Box component="li">
                <Typography variant="body2">
                  Optimize system prompts to be clear but concise
                </Typography>
              </Box>
              <Box component="li">
                <Typography variant="body2">
                  Consider retrieving fewer context chunks when possible (currently retrieving 4)
                </Typography>
              </Box>
              <Box component="li">
                <Typography variant="body2">
                  For complex queries, break them into smaller, more focused questions
                </Typography>
              </Box>
              <Box component="li">
                <Typography variant="body2">
                  Balance between quality and token usage by choosing appropriate models
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default TokenUsageAnalyzer; 