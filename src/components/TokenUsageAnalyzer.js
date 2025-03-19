import React, { useState, useEffect } from 'react';
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
  AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TokenIcon from '@mui/icons-material/Token';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import WarningIcon from '@mui/icons-material/Warning';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { calculateCost } from '../utils/apiServices';

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
  
  useEffect(() => {
    // Calculate token breakdowns for each model
    const breakdowns = {};
    const modelWarnings = {};
    
    // For each model response, estimate the token breakdown
    Object.entries(responses || {}).forEach(([model, response]) => {
      if (!response || !response.sources) {
        return; // Skip this model if response or sources is undefined
      }
      
      // Reconstruct the full prompt that was sent (similar to what's in QueryInterface submitQuery)
      const context = (response.sources || []).map(s => s?.content || '').join('\n\n');
      const prompt = `
Context information is below.
---------------------
${context}
---------------------
Given the context information and not prior knowledge, answer the question: ${currentQuery || ''}
`;
      
      // Get the system prompt used for this model - safely access system prompts
      const systemPrompt = systemPrompts && systemPrompts[model] ? systemPrompts[model] : "";
      
      // Estimate token breakdown
      const breakdown = estimateTokenBreakdown(prompt, systemPrompt);
      breakdowns[model] = breakdown;
      
      // Identify potential expensive areas
      modelWarnings[model] = identifyExpensiveAreas(breakdown);
    });
    
    setTokenBreakdowns(breakdowns);
    setWarnings(modelWarnings);
  }, [responses, systemPrompts, currentQuery]);
  
  // Helper to calculate percentage of token usage
  const calculatePercentage = (part, total) => {
    return Math.round((part / total) * 100);
  };
  
  // Format large numbers with commas
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  // Format elapsed time in a readable format
  const formatElapsedTime = (ms) => {
    if (!ms) return 'N/A';
    
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
            {Object.entries(responses || {}).map(([model, response]) => {
              // Skip if model key is not an actual model in metrics
              if (!metrics || !metrics[model] || ['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(model)) {
                return null;
              }
              
              const modelMetrics = metrics[model] || {};
              const tokenUsage = modelMetrics.tokenUsage || { input: 0, output: 0, total: 0 };
              const breakdown = tokenBreakdowns[model];
              const modelWarnings = warnings[model] || [];
              
              // Get cost for this model
              const modelCost = calculateCost(model, 
                tokenUsage.input / 1000, 
                tokenUsage.output / 1000
              );
                
              if (!breakdown) return null;
              
              return (
                <Grid item xs={12} md={6} key={model}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>{model}</Typography>
                      
                      {/* Token Summary */}
                      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                        <Chip 
                          icon={<TokenIcon />} 
                          label={`${formatNumber(tokenUsage.total)} Total Tokens`} 
                          color="primary"
                        />
                        <Chip 
                          icon={<AttachMoneyIcon />} 
                          label={`$${modelCost.toFixed(6)}`} 
                          color="secondary"
                        />
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
                      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Box sx={{ width: `${calculatePercentage(tokenUsage.input, tokenUsage.total)}%`, bgcolor: 'primary.main', height: 10, borderRadius: '4px 0 0 4px' }} />
                            <Box sx={{ width: `${calculatePercentage(tokenUsage.output, tokenUsage.total)}%`, bgcolor: 'secondary.main', height: 10, borderRadius: '0 4px 4px 0' }} />
                          </Box>
                        </Box>
                        <Box sx={{ ml: 2, display: 'flex', fontSize: '0.75rem' }}>
                          <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', mr: 1 }}>
                            <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main', borderRadius: 1, mr: 0.5 }} />
                            Input {calculatePercentage(tokenUsage.input, tokenUsage.total)}%
                          </Box>
                          <Box sx={{ color: 'secondary.main', display: 'flex', alignItems: 'center' }}>
                            <Box sx={{ width: 8, height: 8, bgcolor: 'secondary.main', borderRadius: 1, mr: 0.5 }} />
                            Output {calculatePercentage(tokenUsage.output, tokenUsage.total)}%
                          </Box>
                        </Box>
                      </Box>
                      
                      {/* Detailed Prompt Breakdown */}
                      <Typography variant="subtitle2" gutterBottom>Prompt Breakdown</Typography>
                      <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Component</TableCell>
                              <TableCell align="right">Est. Tokens</TableCell>
                              <TableCell align="right">% of Input</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {breakdown && breakdown.breakdown && Object.entries(breakdown.breakdown || {}).map(([part, tokens]) => {
                              const percentage = calculatePercentage(tokens, tokenUsage.input);
                              return (
                                <TableRow key={part}>
                                  <TableCell component="th" scope="row">
                                    {part.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                  </TableCell>
                                  <TableCell align="right">{formatNumber(tokens)}</TableCell>
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
                      {modelWarnings && modelWarnings.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>
                              <WarningIcon fontSize="small" sx={{ mr: 0.5, color: 'warning.main' }} />
                              Optimization Opportunities
                            </Box>
                          </Typography>
                          {modelWarnings.map((warning, index) => (
                            <Typography 
                              key={index} 
                              variant="body2" 
                              color={warning.severity === 'high' ? 'error' : 'warning.main'}
                              sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}
                            >
                              • {warning.message}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
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