import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  Button, 
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  LinearProgress,
  Chip,
  Stack,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import AssessmentIcon from '@mui/icons-material/Assessment';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import BalanceIcon from '@mui/icons-material/Balance';
import EditIcon from '@mui/icons-material/Edit';
import { createLlmInstance, calculateCost } from '../utils/apiServices';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Reusable model dropdown component to avoid duplication
const ModelDropdown = ({ value, onChange, sx = {} }) => (
  <Select
    fullWidth
    value={value}
    onChange={onChange}
    variant="outlined"
    sx={sx}
  >
    <MenuItem disabled>
      <Typography variant="subtitle2">OpenAI Models</Typography>
    </MenuItem>
    <MenuItem value="gpt-4o">GPT-4o</MenuItem>
    <MenuItem value="gpt-4o-mini">GPT-4o Mini</MenuItem>
    <MenuItem value="o3-mini">o3-mini</MenuItem>
    
    <Divider />
    <MenuItem disabled>
      <Typography variant="subtitle2">Azure OpenAI Models</Typography>
    </MenuItem>
    <MenuItem value="azure-gpt-4o">Azure GPT-4o</MenuItem>
    <MenuItem value="azure-gpt-4o-mini">Azure GPT-4o Mini</MenuItem>
    <MenuItem value="azure-o3-mini">Azure o3-mini</MenuItem>
    
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
  </Select>
);

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

// Function to normalize criterion name to title case
const normalizeCriterionName = (criterion) => {
  // Split by colon to handle format like "Accuracy: Description"
  const parts = criterion.split(':');
  const name = parts[0].trim();
  // Convert to title case (first letter uppercase, rest lowercase)
  const normalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  
  // If there was a description after the colon, add it back
  if (parts.length > 1) {
    return `${normalized}: ${parts.slice(1).join(':').trim()}`;
  }
  return normalized;
};

const ResponseValidation = ({ 
  responses, 
  metrics, 
  currentQuery, 
  systemPrompts, 
  sources,
  onValidationComplete,
  validationResults,
  isProcessing,
  setIsProcessing
}) => {
  const [validatorModel, setValidatorModel] = useState('gpt-4o');
  const [customCriteria, setCustomCriteria] = useState(
    'Accuracy: Does the response correctly answer the query based on the provided context?\n' +
    'Completeness: Does the response address all aspects of the query?\n' +
    'Relevance: Is the information in the response relevant to the query?\n' +
    'Conciseness: Is the response appropriately concise without omitting important information?\n' +
    'Clarity: Is the response clear, well-structured, and easy to understand?\n' +
    'Exception handling: Only if the output is code then check exceptions paths'
  );
  const [expandedCriteria, setExpandedCriteria] = useState(false);
  const [currentValidatingModel, setCurrentValidatingModel] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'overallScore', direction: 'descending' });
  const [editCriteriaOpen, setEditCriteriaOpen] = useState(false);

  // Load validator model from localStorage on component mount
  useEffect(() => {
    const savedValidatorModel = localStorage.getItem('responseValidatorModel');
    if (savedValidatorModel) {
      setValidatorModel(savedValidatorModel);
    }
    
    // Load default evaluation criteria from localStorage
    const savedCriteria = localStorage.getItem('defaultEvaluationCriteria');
    if (savedCriteria) {
      setCustomCriteria(savedCriteria);
    }
  }, []);

  // Reset validation state only when component is first mounted, not on re-renders
  useEffect(() => {
    // Only reset if there are no validation results yet
    if (Object.keys(validationResults).length === 0) {
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
  }, [isProcessing, setIsProcessing, validationResults]); // Include the missing dependencies

  const validateResponses = async () => {
    setIsProcessing(true);
    
    const results = {};
    
    try {
      // Get validator model from localStorage (or use current state as fallback)
      const validatorModelToUse = localStorage.getItem('responseValidatorModel') || validatorModel;
      
      // Create LLM instance for validation
      const llm = createLlmInstance(validatorModelToUse, '', {
        temperature: 0 // Use deterministic output for evaluation
      });
      
      // Format source documents for the prompt
      const contextText = sources.map(source => 
        `Source: ${source.source}\nContent: ${source.content}`
      ).join('\n\n');
      
      // Process each model response
      for (const model of Object.keys(responses)) {
        setCurrentValidatingModel(model);
        
        const response = responses[model];
        const answer = typeof response.answer === 'object' ? response.answer.text : response.answer;
        
        // Create the evaluation prompt
        const prompt = `
You are an expert evaluator of RAG (Retrieval-Augmented Generation) systems. Your task is to evaluate the quality of an AI assistant's response to a user query.

USER QUERY:
${currentQuery}

CONTEXT PROVIDED TO THE AI ASSISTANT:
${contextText}

AI ASSISTANT RESPONSE (from ${model}):
${answer}

EVALUATION CRITERIA:
${customCriteria}

Please evaluate the response on a scale of 1-100 for each criterion, and provide a brief explanation for each score.
Then, calculate an overall score (1-100) that represents the overall quality of the response.

Format your response as a JSON object with the following structure:
{
  "criteria": {
    "Criterion1": {
      "score": number,
      "explanation": "string"
    },
    ...
  },
  "overall": {
    "score": number,
    "explanation": "string"
  }
}

IMPORTANT: Use consistent Title Case for all criteria names (first letter capitalized, rest lowercase).
For example, use "Accuracy" not "accuracy" or "ACCURACY".
`;
        
        // Call the LLM for evaluation
        const evaluationResult = await llm.invoke(prompt);
        
        // Parse the JSON response
        try {
          // Extract JSON from the response (in case the LLM adds any text before or after the JSON)
          const jsonMatch = evaluationResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsedResult = JSON.parse(jsonMatch[0]);
            results[model] = parsedResult;
          } else {
            throw new Error('Could not extract JSON from the response');
          }
        } catch (parseError) {
          window.console.error('Error parsing evaluation result:', parseError);
          results[model] = {
            error: 'Failed to parse evaluation result',
            rawResponse: evaluationResult
          };
        }
      }
      
      setCurrentValidatingModel(null);
      // Update the validation results
      onValidationComplete(results);
      
    } catch (err) {
      window.console.error('Error validating responses:', err);
    } finally {
      setIsProcessing(false);
      setCurrentValidatingModel(null);
    }
  };

  const formatCost = (cost) => {
    if (cost === 0) return 'Free';
    return cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;
  };

  const formatResponseTime = (ms) => {
    if (!ms) return 'N/A';
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const generatePDF = () => {
    // Create a new jsPDF instance
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    // Title
    doc.setFontSize(18);
    doc.text('RAG Response Validation Report', margin, 20);
    
    // Query
    doc.setFontSize(14);
    doc.text('Query', margin, 30);
    doc.setFontSize(12);
    const queryLines = doc.splitTextToSize(currentQuery || 'No query provided', contentWidth);
    doc.text(queryLines, margin, 40);
    
    let yPos = 40 + (queryLines.length * 7);
    
    // Validation Criteria
    yPos += 10;
    doc.setFontSize(14);
    doc.text('Validation Criteria', margin, yPos);
    yPos += 10;
    doc.setFontSize(10);
    const criteriaLines = doc.splitTextToSize(customCriteria, contentWidth);
    doc.text(criteriaLines, margin, yPos);
    yPos += (criteriaLines.length * 5) + 10;
    
    // Performance Metrics
    yPos += 10;
    doc.setFontSize(14);
    doc.text('Performance Metrics', margin, yPos);
    yPos += 10;
    
    // Create a simple table for metrics
    doc.setFontSize(11);
    doc.text('Model', margin, yPos);
    doc.text('Response Time', margin + 60, yPos);
    doc.text('Token Usage', margin + 120, yPos);
    doc.text('Est. Cost', margin + 180, yPos);
    yPos += 7;
    
    // Draw a line under headers
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;
    
    // Table rows
    doc.setFontSize(10);
    Object.keys(metrics).forEach((model, index) => {
      const metric = metrics[model];
      const cost = calculateCost(model, metric.tokenUsage.total);
      const costText = formatCost(cost);
      
      doc.text(model, margin, yPos);
      doc.text(formatResponseTime(metric.responseTime), margin + 60, yPos);
      doc.text(`${metric.tokenUsage.estimated ? '~' : ''}${metric.tokenUsage.total} tokens`, margin + 120, yPos);
      doc.text(costText, margin + 180, yPos);
      yPos += 7;
      
      // Draw a light line between rows
      if (index < Object.keys(metrics).length - 1) {
        doc.setDrawColor(230, 230, 230);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 3;
      }
    });
    
    // Add a new page for validation results
    doc.addPage();
    yPos = 20;
    
    // Performance Efficiency Analysis
    if (effectivenessData && effectivenessData.mostEffectiveModel) {
      doc.setFontSize(14);
      doc.text('Performance Efficiency Analysis', margin, yPos);
      yPos += 10;
      
      // Best Overall Performance
      doc.setFontSize(12);
      doc.text('Best Overall Performance:', margin, yPos);
      yPos += 7;
      doc.setFontSize(10);
      doc.text(`Model: ${effectivenessData.mostEffectiveModel}`, margin + 5, yPos);
      yPos += 5;
      doc.text(`Quality Score: ${effectivenessData.modelScores[effectivenessData.mostEffectiveModel]}/100`, margin + 5, yPos);
      yPos += 5;
      doc.text(`Cost: ${formatCost(effectivenessData.modelCosts[effectivenessData.mostEffectiveModel])}`, margin + 5, yPos);
      yPos += 5;
      doc.text(`Response Time: ${formatResponseTime(metrics[effectivenessData.mostEffectiveModel].responseTime)}`, margin + 5, yPos);
      yPos += 5;
      doc.text(`Efficiency Score: ${formatEffectivenessScore(effectivenessData.effectivenessScores[effectivenessData.mostEffectiveModel])}`, margin + 5, yPos);
      yPos += 10;
      
      // Highest Quality
      doc.setFontSize(12);
      doc.text('Highest Quality:', margin, yPos);
      yPos += 7;
      doc.setFontSize(10);
      doc.text(`Model: ${effectivenessData.highestScoringModel}`, margin + 5, yPos);
      yPos += 5;
      doc.text(`Quality Score: ${effectivenessData.modelScores[effectivenessData.highestScoringModel]}/100`, margin + 5, yPos);
      yPos += 5;
      doc.text(`Cost: ${formatCost(effectivenessData.modelCosts[effectivenessData.highestScoringModel])}`, margin + 5, yPos);
      yPos += 5;
      doc.text(`Response Time: ${formatResponseTime(metrics[effectivenessData.highestScoringModel].responseTime)}`, margin + 5, yPos);
      yPos += 10;
      
      // Add some space
      yPos += 5;
    }
    
    // Validation Results
    doc.setFontSize(14);
    doc.text('Validation Results', margin, yPos);
    yPos += 10;
    
    // Process each model's validation results
    Object.keys(validationResults).forEach((model, index) => {
      if (index > 0) {
        // Add a new page for each model after the first
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text(`Model: ${model}`, margin, yPos);
      yPos += 10;
      
      const result = validationResults[model];
      
      if (result.error) {
        doc.setTextColor(255, 0, 0);
        doc.text(`Error: ${result.error}`, margin, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 10;
        return;
      }
      
      // Overall score
      if (result.overall) {
        doc.setFontSize(12);
        doc.text(`Overall Score: ${result.overall.score}/100`, margin, yPos);
        yPos += 7;
        
        doc.setFontSize(10);
        const overallExplanationLines = doc.splitTextToSize(result.overall.explanation, contentWidth);
        doc.text(overallExplanationLines, margin, yPos);
        yPos += (overallExplanationLines.length * 5) + 10;
      }
      
      // Individual criteria
      if (result.criteria) {
        doc.setFontSize(12);
        doc.text('Criteria Scores:', margin, yPos);
        yPos += 10;
        
        Object.entries(result.criteria).forEach(([criterion, details]) => {
          doc.setFontSize(11);
          doc.text(`${criterion}: ${details.score}/100`, margin, yPos);
          yPos += 7;
          
          doc.setFontSize(9);
          const explanationLines = doc.splitTextToSize(details.explanation, contentWidth - 10);
          doc.text(explanationLines, margin + 5, yPos);
          yPos += (explanationLines.length * 5) + 7;
        });
      }
      
      // Add model response
      yPos += 5;
      doc.setFontSize(12);
      doc.text('Model Response:', margin, yPos);
      yPos += 7;
      
      const answer = typeof responses[model].answer === 'object' ? 
        responses[model].answer.text : 
        responses[model].answer;
      
      doc.setFontSize(9);
      const responseLines = doc.splitTextToSize(answer, contentWidth - 10);
      doc.text(responseLines, margin + 5, yPos);
      yPos += (responseLines.length * 5) + 10;
      
      // Add cost information
      if (metrics[model]) {
        const cost = calculateCost(model, metrics[model].tokenUsage.total);
        doc.setFontSize(11);
        doc.text(`Estimated Cost: ${formatCost(cost)}`, margin, yPos);
        yPos += 7;
        
        doc.setFontSize(9);
        doc.text(`(Based on ${metrics[model].tokenUsage.total} tokens)`, margin + 5, yPos);
        yPos += 7;
      }
    });
    
    // Add source documents on a new page
    doc.addPage();
    yPos = 20;
    doc.setFontSize(14);
    doc.text('Source Documents', margin, yPos);
    yPos += 10;
    
    sources.forEach((source, index) => {
      // Add a new page if we're getting close to the bottom
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(11);
      doc.text(`Source ${index + 1}: ${source.source}`, margin, yPos);
      yPos += 7;
      
      doc.setFontSize(9);
      // Truncate very long source content for the PDF
      const contentToShow = source.content.length > 2000 ? 
        source.content.substring(0, 2000) + '... (truncated)' : 
        source.content;
      
      const contentLines = doc.splitTextToSize(contentToShow, contentWidth - 5);
      doc.text(contentLines, margin + 5, yPos);
      yPos += (contentLines.length * 5) + 10;
    });
    
    // Save the PDF
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    doc.save(`rag-validation-report-${timestamp}.pdf`);
  };

  // Helper function to render a score with a colored bar
  const renderScore = (score) => {
    let color = '#f44336'; // red
    if (score >= 80) color = '#4caf50'; // green
    else if (score >= 60) color = '#ff9800'; // orange
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Box sx={{ width: '100%', mr: 1 }}>
          <LinearProgress 
            variant="determinate" 
            value={score} 
            sx={{ 
              height: 10, 
              borderRadius: 5,
              backgroundColor: '#e0e0e0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: color
              }
            }} 
          />
        </Box>
        <Box sx={{ minWidth: 35 }}>
          <Typography variant="body2" color="text.secondary">{score}/100</Typography>
        </Box>
      </Box>
    );
  };

  // Calculate performance efficiency score (cost and response time)
  const calculateEffectivenessScore = (validationResults, metrics) => {
    if (!validationResults || Object.keys(validationResults).length === 0) return {};

    // Calculate costs for each model
    const modelCosts = {};
    const modelScores = {};
    const modelResponseTimes = {};
    
    Object.keys(validationResults).forEach(model => {
      if (!metrics[model]) return;
      
      // Get the cost
      const cost = calculateCost(model, metrics[model].tokenUsage.total);
      modelCosts[model] = cost;
      
      // Get the response time
      const responseTime = metrics[model].responseTime || 0;
      modelResponseTimes[model] = responseTime;
      
      // Get the overall score
      const result = validationResults[model];
      if (result?.overall?.score) {
        modelScores[model] = result.overall.score;
      }
    });
    
    // Find best raw score, lowest cost, and fastest response time
    const bestScore = Math.max(...Object.values(modelScores), 0);
    const lowestCost = Math.min(...Object.values(modelCosts).filter(cost => cost > 0), Infinity);
    const fastestTime = Math.min(...Object.values(modelResponseTimes).filter(time => time > 0), Infinity);
    
    // Calculate a performance efficiency score for each model
    // Formula: (model_score / best_score) / ((model_cost / lowest_cost) * 0.5 + (model_time / fastest_time) * 0.5)
    // Higher is better, normalized to 100
    // Weighting: 50% cost, 50% speed
    const rawEffectivenessScores = {};
    
    Object.keys(modelScores).forEach(model => {
      if (modelCosts[model] === 0) {
        // Free models get a special indicator but we still consider response time
        const timeRatio = modelResponseTimes[model] / fastestTime;
        // For free models, we only consider speed (with a high base score)
        rawEffectivenessScores[model] = (90 / timeRatio) * 100;
      } else {
        const scoreRatio = modelScores[model] / bestScore;
        const costRatio = modelCosts[model] / lowestCost;
        const timeRatio = modelResponseTimes[model] / fastestTime;
        // Combined metric that weights speed more heavily than cost (75% speed, 25% cost)
        const efficiencyRatio = (costRatio * 0.25) + (timeRatio * 0.75);
        rawEffectivenessScores[model] = (scoreRatio / efficiencyRatio) * 100;
      }
    });
    
    // Find the most efficient model
    let mostEffectiveModel = null;
    let highestEffectiveness = -1;
    
    Object.entries(rawEffectivenessScores).forEach(([model, score]) => {
      if (score > highestEffectiveness) {
        mostEffectiveModel = model;
        highestEffectiveness = score;
      }
    });
    
    // Determine the highest scoring model
    const sortedModels = Object.entries(modelScores)
      .sort((a, b) => b[1] - a[1]);
    
    // Get the highest score
    const highestScore = sortedModels[0]?.[1] || 0;
    
    // Filter models with the highest score
    const topScoringModels = sortedModels
      .filter((entry) => entry[1] === highestScore);
    
    const highestScoringModel = topScoringModels[0]?.[0];
    
    // Determine the cheapest model with a good score (at least 70)
    const goodModels = Object.entries(modelScores)
      .filter(([_, score]) => score >= 70)
      .map(([model]) => model);
    
    const cheapestGoodModel = goodModels.length > 0 ? 
      goodModels.reduce((cheapest, model) => 
        (modelCosts[model] < modelCosts[cheapest]) ? model : cheapest, 
        goodModels[0]
      ) : null;
    
    return {
      modelCosts,
      modelScores,
      effectivenessScores: rawEffectivenessScores,
      mostEffectiveModel,
      highestScoringModel,
      cheapestGoodModel
    };
  };

  const formatEffectivenessScore = (score) => {
    if (!score) return 'N/A';
    if (score === Infinity) return "∞ (Free)";
    return score.toFixed(1);
  };

  const renderEffectivenessSummary = (effectivenessData) => {
    if (!effectivenessData || !effectivenessData.mostEffectiveModel) return null;
    
    return (
      <Paper elevation={2} sx={{ p: 3, mb: 4, bgcolor: '#f9f9fa', border: '1px solid #e0e0e0' }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <BalanceIcon sx={{ mr: 1, color: 'primary.main' }} />
          Performance Efficiency Analysis
        </Typography>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%', bgcolor: effectivenessData.mostEffectiveModel ? '#f0f7ff' : 'inherit', border: '1px solid #bbdefb' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', color: 'primary.main', mb: 1 }}>
                  <BalanceIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                  Best Overall Performance
                </Typography>
                
                {effectivenessData.mostEffectiveModel ? (
                  <>
                    <Typography variant="h6">{effectivenessData.mostEffectiveModel}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Quality Score: {effectivenessData.modelScores[effectivenessData.mostEffectiveModel]}/100
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Cost: {effectivenessData.modelCosts[effectivenessData.mostEffectiveModel] === 0 ? 
                        'Free' : 
                        `$${effectivenessData.modelCosts[effectivenessData.mostEffectiveModel].toFixed(6)}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Speed: {formatResponseTime(metrics[effectivenessData.mostEffectiveModel].responseTime)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Efficiency Score: {formatEffectivenessScore(effectivenessData.effectivenessScores[effectivenessData.mostEffectiveModel])}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      Best balance of quality, cost, and speed (with higher weight on speed)
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Insufficient data to determine
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%', bgcolor: effectivenessData.highestScoringModel ? '#f1f8e9' : 'inherit', border: '1px solid #c5e1a5' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', color: 'success.main', mb: 1 }}>
                  <EmojiEventsIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                  Highest Quality
                </Typography>
                
                {effectivenessData.highestScoringModel ? (
                  <>
                    <Typography variant="h6">{effectivenessData.highestScoringModel}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Score: {effectivenessData.modelScores[effectivenessData.highestScoringModel]}/100
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Cost: {effectivenessData.modelCosts[effectivenessData.highestScoringModel] === 0 ? 
                        'Free' : 
                        `$${effectivenessData.modelCosts[effectivenessData.highestScoringModel].toFixed(6)}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Speed: {formatResponseTime(metrics[effectivenessData.highestScoringModel].responseTime)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      Best raw quality score regardless of cost or speed
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Insufficient data to determine
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%', bgcolor: effectivenessData.cheapestGoodModel ? '#fff8e1' : 'inherit', border: '1px solid #ffe082' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', color: '#ff8f00', mb: 1 }}>
                  <MoneyOffIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                  Budget Choice
                </Typography>
                
                {effectivenessData.cheapestGoodModel ? (
                  <>
                    <Typography variant="h6">{effectivenessData.cheapestGoodModel}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Score: {effectivenessData.modelScores[effectivenessData.cheapestGoodModel]}/100
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Cost: {effectivenessData.modelCosts[effectivenessData.cheapestGoodModel] === 0 ? 
                        'Free' : 
                        `$${effectivenessData.modelCosts[effectivenessData.cheapestGoodModel].toFixed(6)}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Speed: {formatResponseTime(metrics[effectivenessData.cheapestGoodModel].responseTime)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      Lowest cost with a score of at least 70
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No models with sufficient quality
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>
    );
  };

  // Calculate effectiveness when validation results or metrics change
  const effectivenessData = Object.keys(validationResults).length > 0 ? 
    calculateEffectivenessScore(validationResults, metrics) : 
    null;

  // Sort function for table data
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">
          Response Validation
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<DownloadIcon />}
          onClick={generatePDF}
          disabled={!Object.keys(validationResults).length || isProcessing}
        >
          Download Report
        </Button>
      </Box>

      {isProcessing ? (
        <Box textAlign="center" py={4}>
          <CircularProgress />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Validating Responses... {currentValidatingModel && `(Processing ${currentValidatingModel})`}
          </Typography>
        </Box>
      ) : !Object.keys(validationResults).length ? (
        <Box>
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Validation Options
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Validate the responses from different models to assess their quality and accuracy. This helps identify which models perform best with your specific data and queries.
            </Typography>
            
            <Typography variant="subtitle2" gutterBottom>
              Validation Model
            </Typography>
            <Box sx={{ mb: 2 }}>
              <ModelDropdown 
                value={validatorModel}
                onChange={(e) => setValidatorModel(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Typography variant="body2" color="textSecondary">
                This model will evaluate the responses from all the models in your comparison. For best results, choose a strong model that can provide insightful analysis.
              </Typography>
            </Box>
            
            <Accordion 
              expanded={expandedCriteria}
              onChange={() => setExpandedCriteria(!expandedCriteria)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Evaluation Criteria</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <CriteriaTextArea
                  value={customCriteria}
                  onChange={(e) => setCustomCriteria(e.target.value)}
                />
              </AccordionDetails>
            </Accordion>
            
            <Button
              variant="contained"
              color="primary"
              startIcon={<AssessmentIcon />}
              onClick={validateResponses}
              disabled={!Object.keys(responses).length || isProcessing}
              fullWidth
            >
              Validate Responses
            </Button>
          </Paper>
        </Box>
      ) : (
        <>
          {/* Show Performance Efficiency Analysis first */}
          {renderEffectivenessSummary(effectivenessData)}

          {/* Add Edit Criteria button above validation results */}
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button 
              variant="contained" 
              color="secondary"
              onClick={() => setEditCriteriaOpen(true)}
              startIcon={<EditIcon />}
              sx={{ mb: 2 }}
            >
              Edit Criteria
            </Button>
          </Box>

          {/* Then show the Validation Results table */}
          <Box mb={4}>
            <Paper elevation={1} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Validation Results
              </Typography>
              
              <Typography variant="body2" color="textSecondary" paragraph>
                These scores assess how well each model response aligns with the evaluation criteria. Higher scores indicate better quality responses.
                <i style={{ display: 'block', marginTop: '8px', color: '#666' }}>💡 Tip: Click on any column header to sort the table.</i>
              </Typography>
              
              <Box sx={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                  <thead>
                    <tr>
                      <th 
                        style={{ 
                          textAlign: 'left', 
                          padding: '8px', 
                          borderBottom: '1px solid #ddd', 
                          cursor: 'pointer',
                          backgroundColor: sortConfig.key === 'model' ? '#f5f5f5' : 'transparent',
                          position: 'relative',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => requestSort('model')}
                      >
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          '&:hover': { opacity: 0.8 }
                        }}>
                          Model
                          {sortConfig.key === 'model' && (
                            <span style={{ marginLeft: '4px' }}>
                              {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                            </span>
                          )}
                        </Box>
                      </th>
                      <th 
                        style={{ 
                          textAlign: 'center', 
                          padding: '8px', 
                          borderBottom: '1px solid #ddd',
                          cursor: 'pointer',
                          backgroundColor: sortConfig.key === 'overallScore' ? '#f5f5f5' : 'transparent',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => requestSort('overallScore')}
                      >
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          '&:hover': { opacity: 0.8 }
                        }}>
                          Overall Score
                          {sortConfig.key === 'overallScore' && (
                            <span style={{ marginLeft: '4px' }}>
                              {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                            </span>
                          )}
                        </Box>
                      </th>
                      {/* Get all unique criteria across all models */}
                      {Object.keys(validationResults).length > 0 && 
                        Object.values(validationResults).some(result => result.criteria) &&
                        (() => {
                          // Use a Map to store criteria with normalized keys
                          const criteriaMap = new Map();
                          
                          Object.values(validationResults).forEach(result => {
                            if (result.criteria) {
                              Object.keys(result.criteria).forEach(criterion => {
                                const normalizedKey = normalizeCriterionName(criterion);
                                criteriaMap.set(normalizedKey, true);
                              });
                            }
                          });
                          
                          return Array.from(criteriaMap.keys()).map(criterion => (
                            <th 
                              key={criterion} 
                              style={{ 
                                textAlign: 'center', 
                                padding: '8px', 
                                borderBottom: '1px solid #ddd',
                                cursor: 'pointer',
                                backgroundColor: sortConfig.key === `criterion_${criterion}` ? '#f5f5f5' : 'transparent',
                                transition: 'background-color 0.2s'
                              }}
                              onClick={() => requestSort(`criterion_${criterion}`)}
                            >
                              <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                '&:hover': { opacity: 0.8 }
                              }}>
                                {criterion}
                                {sortConfig.key === `criterion_${criterion}` && (
                                  <span style={{ marginLeft: '4px' }}>
                                    {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                                  </span>
                                )}
                              </Box>
                            </th>
                          ));
                        })()
                      }
                      <th 
                        style={{ 
                          textAlign: 'right', 
                          padding: '8px', 
                          borderBottom: '1px solid #ddd',
                          cursor: 'pointer',
                          backgroundColor: sortConfig.key === 'responseTime' ? '#f5f5f5' : 'transparent',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => requestSort('responseTime')}
                      >
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          '&:hover': { opacity: 0.8 }
                        }}>
                          Response Time
                          {sortConfig.key === 'responseTime' && (
                            <span style={{ marginLeft: '4px' }}>
                              {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                            </span>
                          )}
                        </Box>
                      </th>
                      <th 
                        style={{ 
                          textAlign: 'right', 
                          padding: '8px', 
                          borderBottom: '1px solid #ddd',
                          cursor: 'pointer',
                          backgroundColor: sortConfig.key === 'cost' ? '#f5f5f5' : 'transparent',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => requestSort('cost')}
                      >
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          '&:hover': { opacity: 0.8 }
                        }}>
                          Cost
                          {sortConfig.key === 'cost' && (
                            <span style={{ marginLeft: '4px' }}>
                              {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                            </span>
                          )}
                        </Box>
                      </th>
                      <th 
                        style={{ 
                          textAlign: 'right', 
                          padding: '8px', 
                          borderBottom: '1px solid #ddd',
                          cursor: 'pointer',
                          backgroundColor: sortConfig.key === 'efficiencyScore' ? '#f5f5f5' : 'transparent',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => requestSort('efficiencyScore')}
                      >
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          '&:hover': { opacity: 0.8 }
                        }}>
                          Efficiency Score
                          {sortConfig.key === 'efficiencyScore' && (
                            <span style={{ marginLeft: '4px' }}>
                              {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                            </span>
                          )}
                        </Box>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Calculate the cheapest model cost for comparison
                      const modelCosts = {};
                      Object.keys(validationResults).forEach(model => {
                        if (metrics[model]) {
                          modelCosts[model] = calculateCost(model, metrics[model].tokenUsage.total);
                        }
                      });
                      
                      // Get all unique criteria
                      // Use a Map to store criteria with normalized keys
                      const criteriaMap = new Map();
                      
                      Object.values(validationResults).forEach(result => {
                        if (result.criteria) {
                          Object.keys(result.criteria).forEach(criterion => {
                            const normalizedKey = normalizeCriterionName(criterion);
                            criteriaMap.set(normalizedKey, criterion); // Store original key as value
                          });
                        }
                      });
                      
                      const criteriaArray = Array.from(criteriaMap.keys());
                      
                      // Helper function to find criterion value regardless of case
                      const findCriterionValue = (criteria, normalizedKey) => {
                        if (!criteria) return null;
                        
                        // First try direct lookup with normalized key
                        if (criteria[normalizedKey]) return criteria[normalizedKey];
                        
                        // If not found, search case-insensitively
                        const criterionKey = Object.keys(criteria).find(key => 
                          normalizeCriterionName(key) === normalizedKey
                        );
                        
                        return criterionKey ? criteria[criterionKey] : null;
                      };
                      
                      // Get color based on score
                      const getScoreColor = (score) => {
                        if (score >= 80) return '#4caf50';
                        if (score >= 60) return '#ff9800';
                        return '#f44336';
                      };
                      
                      // Build table data array for sorting
                      const tableData = Object.keys(validationResults).map(model => {
                        const result = validationResults[model];
                        const cost = modelCosts[model] || 0;
                        const efficiencyScore = effectivenessData.effectivenessScores[model];
                        const responseTime = metrics[model].responseTime || 0;
                        const overallScore = result.overall ? result.overall.score : 0;
                        
                        // Build a data object with all needed values
                        const rowData = {
                          model,
                          result,
                          cost,
                          efficiencyScore,
                          responseTime,
                          overallScore
                        };
                        
                        // Add criteria scores
                        criteriaArray.forEach(criterion => {
                          const criterionValue = findCriterionValue(result.criteria, criterion);
                          rowData[`criterion_${criterion}`] = criterionValue ? criterionValue.score : 0;
                        });
                        
                        return rowData;
                      });
                      
                      // Sort the data
                      const sortedData = [...tableData].sort((a, b) => {
                        if (sortConfig.key === null) return 0;
                        
                        let aValue = a[sortConfig.key];
                        let bValue = b[sortConfig.key];
                        
                        // For special cases like model names
                        if (sortConfig.key === 'model') {
                          aValue = String(aValue).toLowerCase();
                          bValue = String(bValue).toLowerCase();
                        }
                        
                        // Handle numeric comparison
                        if (typeof aValue === 'number' && typeof bValue === 'number') {
                          if (sortConfig.direction === 'ascending') {
                            return aValue - bValue;
                          } else {
                            return bValue - aValue;
                          }
                        }
                        
                        // Handle string comparison
                        if (sortConfig.direction === 'ascending') {
                          return aValue > bValue ? 1 : -1;
                        } else {
                          return bValue > aValue ? 1 : -1;
                        }
                      });
                      
                      return sortedData.map(rowData => {
                        const { model, result, cost, efficiencyScore } = rowData;
                        
                        return (
                          <tr key={model}>
                            <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>{model}</td>
                            <td style={{ 
                              textAlign: 'center', 
                              padding: '8px', 
                              borderBottom: '1px solid #ddd',
                              color: result.overall ? getScoreColor(result.overall.score) : 'inherit',
                              fontWeight: 'bold'
                            }}>
                              {result.overall ? `${result.overall.score}/100` : 'N/A'}
                            </td>
                            {criteriaArray.map(normalizedCriterion => {
                              const criterionValue = findCriterionValue(result.criteria, normalizedCriterion);
                              return (
                                <td key={normalizedCriterion} style={{ 
                                  textAlign: 'center', 
                                  padding: '8px', 
                                  borderBottom: '1px solid #ddd',
                                  color: criterionValue ? 
                                    getScoreColor(criterionValue.score) : 'inherit'
                                }}>
                                  {criterionValue ? 
                                    `${criterionValue.score}/100` : 'N/A'}
                                </td>
                              );
                            })}
                            <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>
                              {formatResponseTime(metrics[model].responseTime)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>
                              {formatCost(cost)}
                            </td>
                            <td style={{ 
                              textAlign: 'right', 
                              padding: '8px', 
                              borderBottom: '1px solid #ddd',
                              color: model === effectivenessData.mostEffectiveModel ? '#4caf50' : (efficiencyScore >= 80 ? '#8bc34a' : (efficiencyScore >= 50 ? '#ffc107' : '#f44336')),
                              fontWeight: model === effectivenessData.mostEffectiveModel ? 'bold' : 'normal'
                            }}>
                              {formatEffectivenessScore(efficiencyScore)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </Box>
            </Paper>
          </Box>

          {/* Finally show the detailed model cards */}
          <Grid container spacing={3}>
            {Object.keys(validationResults).map((model) => {
              const result = validationResults[model];
              
              if (result.error) {
                return (
                  <Grid item xs={12} key={model}>
                    <Alert severity="error">
                      Error validating {model}: {result.error}
                    </Alert>
                  </Grid>
                );
              }
              
              return (
                <Grid item xs={12} md={6} key={model}>
                  <Card variant="outlined">
                    <CardHeader
                      title={model}
                      subheader={
                        result.overall ? 
                          `Overall Score: ${result.overall.score}/100` : 
                          'Validation Complete'
                      }
                      action={
                        <Chip 
                          label={`${result.overall?.score || 0}/100`}
                          color={
                            result.overall?.score >= 80 ? 'success' : 
                            result.overall?.score >= 60 ? 'warning' : 
                            'error'
                          }
                        />
                      }
                    />
                    <Divider />
                    <CardContent>
                      {result.overall && (
                        <Box mb={3}>
                          <Typography variant="subtitle1" gutterBottom>
                            Overall Assessment
                          </Typography>
                          <Typography variant="body2" paragraph>
                            {result.overall.explanation}
                          </Typography>
                          {renderScore(result.overall.score)}
                        </Box>
                      )}
                      
                      {result.criteria && (
                        <Box>
                          <Typography variant="subtitle1" gutterBottom>
                            Criteria Breakdown
                          </Typography>
                          <Stack spacing={2}>
                            {Object.entries(result.criteria).map(([criterion, details]) => (
                              <Box key={criterion}>
                                <Typography variant="body2" fontWeight="bold">
                                  {normalizeCriterionName(criterion)}
                                </Typography>
                                <Typography variant="body2" paragraph>
                                  {details.explanation}
                                </Typography>
                                {renderScore(details.score)}
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}

      {/* Edit Criteria Dialog */}
      <Dialog
        open={editCriteriaOpen}
        onClose={() => setEditCriteriaOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Edit Evaluation Criteria
        </DialogTitle>
        <DialogContent>
          <CriteriaTextArea
            value={customCriteria}
            onChange={(e) => setCustomCriteria(e.target.value)}
            rows={10}
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle2" gutterBottom>
            Validation Model
          </Typography>
          <ModelDropdown 
            value={validatorModel}
            onChange={(e) => setValidatorModel(e.target.value)}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCriteriaOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={() => {
              setEditCriteriaOpen(false);
              // Save to localStorage
              localStorage.setItem('defaultEvaluationCriteria', customCriteria);
              localStorage.setItem('responseValidatorModel', validatorModel);
              // Clear validation results and run validation again
              setIsProcessing(true);
              onValidationComplete({});
              validateResponses();
            }}
            startIcon={<AssessmentIcon />}
          >
            Re-validate with New Criteria
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ResponseValidation; 