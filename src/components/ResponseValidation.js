import React, { useState, useEffect, useCallback } from 'react';
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
import EditIcon from '@mui/icons-material/Edit';
import { validateResponsesInParallel } from '../utils/parallelValidationProcessor';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Function to calculate cost based on model and token usage
const calculateCost = (model, tokens) => {
  // Default to lowest cost if model not found
  if (!tokens) return 0;
  
  const costs = {
    // OpenAI models
    'gpt-4o': 0.00003,
    'gpt-4o-mini': 0.00002,
    'o3-mini': 0.00002,
    // Azure models
    'azure-gpt-4o': 0.000025,
    'azure-gpt-4o-mini': 0.000015,
    'azure-o3-mini': 0.000015,
    // Anthropic models
    'claude-3-5-sonnet-latest': 0.00002,
    'claude-3-7-sonnet-latest': 0.000025,
    // Ollama models are free
    'llama3.2:latest': 0,
    'gemma3:12b': 0,
    'mistral:latest': 0
  };

  // Get base model name without Set prefix
  const baseModel = model.replace(/^Set \d+-/, '');
  
  // Get cost per token, default to lowest cost if model not found
  const costPerToken = costs[baseModel] || Math.min(...Object.values(costs));
  
  return tokens * costPerToken;
};

// Helper function to find metrics for any model regardless of storage pattern
const findMetrics = (metrics, modelKey) => {
  if (!metrics || !modelKey) return null;
  
  // Direct hit - metrics stored directly under the model key
  if (metrics[modelKey]) {
    console.log(`Found direct metrics for ${modelKey}`);
    return metrics[modelKey];
  }
  
  // Check if this is a composite key like "Set 1-gpt-4o-mini"
  if (modelKey.includes('-')) {
    // Try to extract set name and model name
    const setMatch = modelKey.match(/^(Set \d+)-(.+)$/);
    
    if (setMatch) {
      const setName = setMatch[1]; // e.g., "Set 2"
      const modelName = setMatch[2]; // e.g., "gpt-4o-mini"
      
      // Case 1: Nested structure - metrics[setName][modelName]
      if (metrics[setName] && metrics[setName][modelName]) {
        console.log(`Found nested metrics for ${modelName} in ${setName}`);
        return metrics[setName][modelName];
      }
      
      // Case 2: Just the model name
      if (metrics[modelName]) {
        console.log(`Found metrics by model name ${modelName}`);
        return metrics[modelName];
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
      
      // Case 5: Check special sets that might contain this model
      const commonSets = ["Set 1", "Set 2", "Set 3", "Set 4", "Set 5"];
      for (const set of commonSets) {
        if (metrics[set] && metrics[set][modelName]) {
          console.log(`Found metrics in ${set} for ${modelName}`);
          return metrics[set][modelName];
        }
      }
      
      // Case 6: For hyphenated model names like "gpt-4o-mini", try base model
      if (modelName.includes('-')) {
        const baseParts = modelName.split('-');
        // Try various combinations of the base model name
        for (let i = 1; i < baseParts.length; i++) {
          const baseModel = baseParts.slice(0, i+1).join('-');
          
          // Try base model in the set
          if (metrics[setName] && metrics[setName][baseModel]) {
            console.log(`Found metrics for base model ${baseModel} in ${setName}`);
            return metrics[setName][baseModel];
          }
          
          // Try base model directly
          if (metrics[baseModel]) {
            console.log(`Found metrics for base model ${baseModel}`);
            return metrics[baseModel];
          }
        }
      }
    }
  }
  
  // If all else fails, log but return null
  console.warn(`Could not find metrics for ${modelKey} in any expected location`);
  return null;
};

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
    
    <Divider />
    <MenuItem disabled>
      <Typography variant="subtitle2">Azure OpenAI Models</Typography>
    </MenuItem>
    <MenuItem value="azure-gpt-4o">Azure GPT-4o</MenuItem>
    <MenuItem value="azure-gpt-4o-mini">Azure GPT-4o Mini</MenuItem>
    
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

// Function to get a suitable validation model that will work reliably 
const getReliableValidatorModel = (preferredModel) => {
  // Define a list of models known to work well for validation
  const reliableModels = [
    'gpt-4o',       // Most reliable but most expensive 
    'gpt-4o-mini',  // Good balance
    'claude-3-5-sonnet-latest', // Good alternative
    'azure-gpt-4o', // Azure option
    'azure-gpt-4o-mini' // Azure alternative
  ];
  
  // Avoid using problematic models for validation
  const problematicModels = ['o3-mini'];
  
  // Check if preferred model is problematic
  if (preferredModel && problematicModels.includes(preferredModel)) {
    console.warn(`Model ${preferredModel} is known to have issues with validation. Using a more reliable alternative.`);
    return reliableModels[0];
  }
  
  // If preferred model is in reliable list, use it
  if (preferredModel && reliableModels.includes(preferredModel)) {
    return preferredModel;
  }
  
  // Otherwise, return the first reliable model
  return reliableModels[0];
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
  
  // Additional state for parallel processing UI
  const [parallelProgress, setParallelProgress] = useState({
    completed: 0,
    pending: 0,
    total: 0,
    models: {}
  });

  // Load validator model from localStorage on component mount
  useEffect(() => {
    const savedValidatorModel = localStorage.getItem('responseValidatorModel');
    if (savedValidatorModel) {
      // Make sure we're using a reliable model, even for saved preferences
      const reliableModel = getReliableValidatorModel(savedValidatorModel);
      setValidatorModel(reliableModel);
      
      // If the reliable model differs from the saved one, update localStorage
      if (reliableModel !== savedValidatorModel) {
        console.log(`Updated stored validator model from ${savedValidatorModel} to more reliable ${reliableModel}`);
        localStorage.setItem('responseValidatorModel', reliableModel);
      }
    } else {
      // If no saved model, set a default reliable model
      const defaultModel = getReliableValidatorModel('gpt-4o-mini');
      setValidatorModel(defaultModel);
      localStorage.setItem('responseValidatorModel', defaultModel);
    }
    
    // Load default evaluation criteria from localStorage
    const savedCriteria = localStorage.getItem('defaultEvaluationCriteria');
    if (savedCriteria) {
      setCustomCriteria(savedCriteria);
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
  }, [isProcessing, setIsProcessing, validationResults]);

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

      return {
        ...prev,
        completed: completedCount,
        models: newModels
      };
    });
  }, []);

  const validateResponses = async () => {
    if (!responses || Object.keys(responses || {}).length === 0) {
      console.error("No responses to validate");
      return;
    }
    
    setIsProcessing(true);
    setCurrentValidatingModel(null);
    setParallelProgress({
      completed: 0,
      pending: Object.keys(responses).length,
      total: Object.keys(responses).length,
      models: {}
    });

    try {
      // Get the validator model to use
      const validatorModelToUse = getReliableValidatorModel(validatorModel);
      console.log(`Using validator model: ${validatorModelToUse}`);
      
      // Get the validation preference from localStorage
      const useParallelValidation = localStorage.getItem('useParallelProcessing') === 'true';
      console.log(`Parallel validation preference: ${useParallelValidation ? 'ENABLED' : 'DISABLED'}`);
      
      if (useParallelValidation) {
        console.log("Starting parallel validation processing");
        
        // Process all validations in parallel
        const parallelResults = await validateResponsesInParallel(
          responses,
          currentQuery,
          customCriteria,
          validatorModelToUse,
          handleParallelProgress
        );
        
        console.log("Parallel validation finished, results:", Object.keys(parallelResults).length);
        
        // Normalize the parallel validation results
        const normalizedParallelResults = {};
        Object.keys(parallelResults).forEach(key => {
          normalizedParallelResults[key] = normalizeValidationResult(parallelResults[key]);
        });
        
        // Update the validation results through the parent component
        onValidationComplete(normalizedParallelResults);
        console.log("Parallel validation completed successfully with results:", Object.keys(normalizedParallelResults));
      } else {
        // ... existing sequential validation code ...
      }
    } catch (error) {
      console.error('Error during validation:', error);
      onValidationComplete({});
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
    if (ms === undefined || ms === null || isNaN(ms)) {
      return 'Unknown';
    }
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const generatePDF = () => {
    try {
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
      Object.keys(metrics || {}).forEach((model, index) => {
        if (metrics[model]) {
          const cost = calculateCost(model, metrics[model]?.tokenUsage?.total || 0);
          const costText = formatCost(cost);
          
          doc.text(model, margin, yPos);
          doc.text(formatResponseTime(metrics[model]?.responseTime || 0), margin + 60, yPos);
          doc.text(`${metrics[model]?.tokenUsage?.estimated ? '~' : ''}${metrics[model]?.tokenUsage?.total || 0} tokens`, margin + 120, yPos);
          doc.text(costText, margin + 180, yPos);
          yPos += 7;
          
          // Draw a light line between rows
          if (index < Object.keys(metrics).length - 1) {
            doc.setDrawColor(230, 230, 230);
            doc.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 3;
          }
        }
      });
      
      // Add a new page for validation results
      doc.addPage();
      yPos = 20;
      
      // Performance Efficiency Analysis
      if (effectivenessData && !effectivenessData.error && effectivenessData.mostEffectiveModel) {
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
        const modelQualityScore = effectivenessData.modelData?.[effectivenessData.mostEffectiveModel]?.qualityScore || 0;
        doc.text(`Quality Score: ${modelQualityScore}/100`, margin + 5, yPos);
        yPos += 5;
        const modelCost = effectivenessData.modelData?.[effectivenessData.mostEffectiveModel]?.cost || 0;
        doc.text(`Cost: ${formatCost(modelCost)}`, margin + 5, yPos);
        yPos += 5;
        doc.text(`Response Time: ${formatResponseTime(effectivenessData.mostEffectiveResponseTime)}`, margin + 5, yPos);
        yPos += 5;
        doc.text(`Efficiency Score: ${formatEffectivenessScore(effectivenessData.mostEffectiveScore)}`, margin + 5, yPos);
        yPos += 10;
        
        // Fastest Model
        if (effectivenessData.fastestModel) {
          doc.setFontSize(12);
          doc.text('Fastest Model:', margin, yPos);
          yPos += 7;
          doc.setFontSize(10);
          doc.text(`Model: ${effectivenessData.fastestModel}`, margin + 5, yPos);
          yPos += 5;
          doc.text(`Response time: ${formatResponseTime(effectivenessData.fastestResponseTime)}`, margin + 5, yPos);
          yPos += 5;
          doc.text(`Quality Score: ${effectivenessData.fastestScore}/100`, margin + 5, yPos);
          yPos += 10;
        }
        
        // Best Value Model
        if (effectivenessData.bestValueModel) {
          doc.setFontSize(12);
          doc.text('Best Value Model:', margin, yPos);
          yPos += 7;
          doc.setFontSize(10);
          doc.text(`Model: ${effectivenessData.bestValueModel}`, margin + 5, yPos);
          yPos += 5;
          doc.text(`Efficiency: ${formatEffectivenessScore(effectivenessData.bestValueEfficiency)}`, margin + 5, yPos);
          yPos += 10;
        }
        
        // Add some space
        yPos += 5;
      } else if (effectivenessData && effectivenessData.error) {
        doc.setFontSize(14);
        doc.text('Performance Efficiency Analysis', margin, yPos);
        yPos += 10;
        
        doc.setFontSize(12);
        doc.setTextColor(255, 0, 0);
        doc.text(`Error: ${effectivenessData.error}`, margin, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 10;
      }
      
      // Validation Results
      doc.setFontSize(14);
      doc.text('Validation Results', margin, yPos);
      yPos += 10;
      
      // Process each model's validation results
      Object.keys(validationResults || {}).forEach((model, index) => {
        if (index > 0) {
          // Add a new page for each model after the first
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(12);
        doc.text(`Model: ${model}`, margin, yPos);
        yPos += 10;
        
        const result = validationResults[model];
        
        if (!result || result.error) {
          doc.setTextColor(255, 0, 0);
          doc.text(`Error: ${result?.error || 'Unknown error'}`, margin, yPos);
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
        
        if (responses && responses[model]) {
          const answer = typeof responses[model].answer === 'object' ? 
            responses[model].answer.text : 
            responses[model].answer;
          
          doc.setFontSize(9);
          const responseLines = doc.splitTextToSize(answer, contentWidth - 10);
          doc.text(responseLines, margin + 5, yPos);
          yPos += (responseLines.length * 5) + 10;
          
          // Add cost information
          if (metrics && metrics[model]) {
            const cost = calculateCost(model, metrics[model]?.tokenUsage?.total || 0);
            doc.setFontSize(11);
            doc.text(`Estimated Cost: ${formatCost(cost)}`, margin, yPos);
            yPos += 7;
            
            doc.setFontSize(9);
            doc.text(`(Based on ${metrics[model]?.tokenUsage?.total || 0} tokens)`, margin + 5, yPos);
            yPos += 7;
          }
        } else {
          doc.setFontSize(9);
          doc.text("Response data not available", margin + 5, yPos);
          yPos += 10;
        }
      });
      
      // Add source documents on a new page
      doc.addPage();
      yPos = 20;
      doc.setFontSize(14);
      doc.text('Source Documents', margin, yPos);
      yPos += 10;
      
      if (sources && sources.length > 0) {
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
      } else {
        doc.setFontSize(10);
        doc.text("No source documents available", margin, yPos);
      }
      
      // Save the PDF
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      doc.save(`rag-validation-report-${timestamp}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF report. Check console for details.");
    }
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

  // Calculate effectiveness score for the model
  const calculateEffectivenessScore = (validationResults, metrics) => {
    if (!validationResults || !metrics) {
      return { error: "Missing validation results or metrics" };
    }
    
    try {
      // Make sure we have validation results
      if (Object.keys(validationResults || {}).length === 0) {
        return { error: "No validation results available" };
      }
      
      const results = {};
      
      Object.entries(validationResults || {}).forEach(([model, validation]) => {
        // Skip if there's an error with this validation
        if (!validation || validation.error || !validation.overall) {
          console.warn(`Skipping model ${model} due to missing or errored validation`);
          return;
        }
        
        const score = validation.overall.score;
        
        // Get response time and token usage from metrics
        let responseTime = 0;
        let tokenUsage = 0;
        
        // Find metrics using our robust lookup helper
        const modelMetrics = findMetrics(metrics, model);
        
        if (modelMetrics) {
          responseTime = modelMetrics.responseTime || 0;
          tokenUsage = modelMetrics.tokenUsage?.total || 0;
          console.log(`Found metrics for ${model}: responseTime=${responseTime}, tokenUsage=${tokenUsage}`);
        } else {
          console.warn(`No metrics found for ${model}`);
        }
        
        // Extract the base model name for cost calculation
        let modelForCost = model;
        if (model.includes('-')) {
          const match = model.match(/^(?:Set \d+-)?(.+)$/);
          if (match) {
            modelForCost = match[1]; // Extract the base model name without the Set prefix
          }
        }
        
        // Calculate cost
        const cost = calculateCost(modelForCost, tokenUsage);
        console.log(`Calculated cost for ${model} (${modelForCost}): ${cost} based on ${tokenUsage} tokens`);
        
        // Calculate a speed factor (inverse of response time, normalized)
        // The faster, the higher the factor - with a maximum value
        const speedFactor = responseTime > 0 ? Math.min(10000 / responseTime, 10) : 10;
        
        // Calculate a cost factor (inverse of cost, normalized)
        // The cheaper, the higher the factor - with a maximum value
        // Cost-free models (like Ollama) get a fixed bonus value
        const costFactor = cost > 0 ? Math.min(0.01 / cost, 10) : 10;
        
        // Calculate an efficiency score that balances quality, speed, and cost
        // Quality is the primary factor, multiplied by speed and cost bonuses
        const efficiencyScore = score * (1 + (speedFactor / 20) + (costFactor / 20));
        
        results[model] = {
          qualityScore: score,
          responseTime: responseTime,
          cost: cost,
          speedFactor: speedFactor,
          costFactor: costFactor,
          efficiencyScore: efficiencyScore
        };
      });
      
      // Check if we have any valid results
      if (Object.keys(results || {}).length === 0) {
        console.error('No valid results after processing validations');
        return { error: 'Could not calculate valid effectiveness scores from validations' };
      }
      
      // Find the most effective model (highest efficiency score)
      let mostEffectiveModel = '';
      let mostEffectiveScore = 0;
      let mostEffectiveResponseTime = 0;
      
      // Find the best value model (consider efficiency with cost)
      let bestValueModel = '';
      let bestValueEfficiency = 0;
      
      // Find the fastest model
      let fastestModel = '';
      let fastestResponseTime = Infinity;
      let fastestScore = 0;
      
      Object.entries(results || {}).forEach(([model, data]) => {
        // Most effective model
        if (data && data.efficiencyScore > mostEffectiveScore) {
          mostEffectiveModel = model;
          mostEffectiveScore = data.efficiencyScore;
          mostEffectiveResponseTime = data.responseTime;
        }
        
        // Best value model (consider efficiency with cost)
        if (data) {
          const valueMetric = data.efficiencyScore * data.costFactor;
          if (valueMetric > bestValueEfficiency) {
            bestValueModel = model;
            bestValueEfficiency = valueMetric;
          }
        }
        
        // Fastest model
        if (data && data.responseTime < fastestResponseTime) {
          fastestModel = model;
          fastestResponseTime = data.responseTime;
          fastestScore = data.qualityScore;
        }
      });
      
      // Return the calculated results
      return {
        mostEffectiveModel,
        mostEffectiveScore,
        mostEffectiveResponseTime,
        bestValueModel,
        bestValueEfficiency,
        fastestModel,
        fastestResponseTime,
        fastestScore,
        modelData: results
      };
    } catch (error) {
      console.error('Error calculating effectiveness score:', error);
      return { error: `Error calculating effectiveness score: ${error.message}` };
    }
  };

  const formatEffectivenessScore = (score) => {
    if (!score) return 'N/A';
    if (score === Infinity) return "∞ (Free)";
    return score.toFixed(1);
  };

  const renderEffectivenessSummary = (effectivenessData) => {
    // Display a message if there was an error in effectiveness calculation
    if (effectivenessData.error) {
      return (
        <Alert severity="error" sx={{ mb: 3 }}>
          {effectivenessData.error}
        </Alert>
      );
    }
    
    if (!effectivenessData.mostEffectiveModel) {
      return (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No valid model effectiveness data available.
        </Alert>
      );
    }
    
    return (
      <Grid container spacing={2} alignItems="stretch" sx={{ mb: 3 }}>
        {/* Most Effective Model Card */}
        <Grid item xs={12} md={4}>
          <Card 
            variant="outlined" 
            sx={{
              height: '100%',
              borderColor: '#4caf50',
              borderWidth: 2,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <CardContent sx={{ flex: '1 0 auto' }}>
              <Typography variant="h6" component="div" gutterBottom align="center">
                Most Effective Model
              </Typography>
              <Typography variant="h5" component="div" gutterBottom align="center" color="primary">
                {effectivenessData.mostEffectiveModel} 
                <Typography variant="body2" color="text.secondary" component="div">
                  {getModelVendor(effectivenessData.mostEffectiveModel)}
                </Typography>
              </Typography>
              <Typography variant="body1" align="center">
                Score: <strong>{formatEffectivenessScore(effectivenessData.mostEffectiveScore)}</strong>
              </Typography>
              <Typography variant="body2" align="center" color="text.secondary">
                Response time: {formatResponseTime(effectivenessData.mostEffectiveResponseTime)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Best Value Model Card */}
        <Grid item xs={12} md={4}>
          <Card 
            variant="outlined" 
            sx={{
              height: '100%',
              borderColor: '#2196f3',
              borderWidth: 2,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <CardContent sx={{ flex: '1 0 auto' }}>
              <Typography variant="h6" component="div" gutterBottom align="center">
                Best Value Model
              </Typography>
              <Typography variant="h5" component="div" gutterBottom align="center" color="primary">
                {effectivenessData.bestValueModel}
                <Typography variant="body2" color="text.secondary" component="div">
                  {getModelVendor(effectivenessData.bestValueModel)}
                </Typography>
              </Typography>
              <Typography variant="body1" align="center">
                Efficiency: <strong>{formatEffectivenessScore(effectivenessData.bestValueEfficiency)}</strong>
              </Typography>
              <Typography variant="body2" align="center" color="text.secondary">
                Balances quality vs. cost
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Fastest Model Card */}
        <Grid item xs={12} md={4}>
          <Card 
            variant="outlined" 
            sx={{
              height: '100%',
              borderColor: '#ff9800',
              borderWidth: 2,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <CardContent sx={{ flex: '1 0 auto' }}>
              <Typography variant="h6" component="div" gutterBottom align="center">
                Fastest Model
              </Typography>
              <Typography variant="h5" component="div" gutterBottom align="center" color="primary">
                {effectivenessData.fastestModel}
                <Typography variant="body2" color="text.secondary" component="div">
                  {getModelVendor(effectivenessData.fastestModel)}
                </Typography>
              </Typography>
              <Typography variant="body1" align="center">
                Response time: <strong>{formatResponseTime(effectivenessData.fastestResponseTime)}</strong>
              </Typography>
              <Typography variant="body2" align="center" color="text.secondary">
                Speed score: {formatEffectivenessScore(effectivenessData.fastestScore)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  // Calculate effectiveness when validation results or metrics change
  const effectivenessData = (validationResults && Object.keys(validationResults || {}).length > 0 && metrics) ? 
    calculateEffectivenessScore(validationResults, metrics) : 
    { error: "No validation results available yet" };

  // Sort function for table data
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Function to normalize validation results
  const normalizeValidationResult = (result) => {
    if (!result || typeof result !== 'object' || result.error) {
      return result;
    }
    
    // Ensure criteria object exists
    if (!result.criteria || typeof result.criteria !== 'object') {
      result.criteria = {};
    }
    
    // Normalize criteria scores to ensure they're in the proper format
    if (result.criteria) {
      Object.keys(result.criteria).forEach(key => {
        const value = result.criteria[key];
        
        // If it's already an object with a score property, just normalize the score
        if (value && typeof value === 'object' && 'score' in value) {
          if (value.score === undefined || value.score === null || isNaN(value.score)) {
            value.score = 5;
          } else {
            // Convert score to number in 0-10 range
            value.score = Math.max(0, Math.min(10, Number(value.score)));
            // Scale to 0-100 for display
            value.score = Math.round(value.score * 10);
          }
          
          // Ensure explanation is meaningful
          if (!value.explanation || value.explanation === `Normalized score for ${key}`) {
            const score = value.score;
            let explanation = '';
            
            if (score >= 90) {
              explanation = `Excellent performance in ${key.toLowerCase()}. The response demonstrates mastery of this criterion.`;
            } else if (score >= 80) {
              explanation = `Strong performance in ${key.toLowerCase()}. The response shows good understanding and execution.`;
            } else if (score >= 70) {
              explanation = `Good performance in ${key.toLowerCase()}. The response meets most requirements with some room for improvement.`;
            } else if (score >= 60) {
              explanation = `Adequate performance in ${key.toLowerCase()}. The response meets basic requirements but could be enhanced.`;
            } else if (score >= 50) {
              explanation = `Moderate performance in ${key.toLowerCase()}. The response shows some understanding but needs significant improvement.`;
            } else {
              explanation = `Needs improvement in ${key.toLowerCase()}. The response falls short of expected standards.`;
            }
            
            value.explanation = explanation;
          }
        } else {
          // If it's a direct score value or not in the right format
          let score = 5; // Default score
          
          if (value !== undefined && value !== null && !isNaN(Number(value))) {
            // It's a direct numeric score, normalize it to 0-10
            score = Math.max(0, Math.min(10, Number(value)));
            // Scale to 0-100 for display
            score = Math.round(score * 10);
          }
          
          // Create meaningful explanation based on score
          let explanation = '';
          if (score >= 90) {
            explanation = `Excellent performance in ${key.toLowerCase()}. The response demonstrates mastery of this criterion.`;
          } else if (score >= 80) {
            explanation = `Strong performance in ${key.toLowerCase()}. The response shows good understanding and execution.`;
          } else if (score >= 70) {
            explanation = `Good performance in ${key.toLowerCase()}. The response meets most requirements with some room for improvement.`;
          } else if (score >= 60) {
            explanation = `Adequate performance in ${key.toLowerCase()}. The response meets basic requirements but could be enhanced.`;
          } else if (score >= 50) {
            explanation = `Moderate performance in ${key.toLowerCase()}. The response shows some understanding but needs significant improvement.`;
          } else {
            explanation = `Needs improvement in ${key.toLowerCase()}. The response falls short of expected standards.`;
          }
          
          // Replace with a proper object
          result.criteria[key] = {
            score: score,
            explanation: explanation
          };
        }
      });
      
      // Ensure common criteria fields exist
      const commonCriteria = ['accuracy', 'completeness', 'relevance', 'conciseness', 'clarity'];
      commonCriteria.forEach(criterion => {
        // Look for the criterion with various casing and formatting
        const criterionKey = Object.keys(result.criteria).find(key => 
          key.toLowerCase() === criterion.toLowerCase() || 
          key.toLowerCase().includes(criterion.toLowerCase())
        );
        
        if (!criterionKey) {
          // If criterion doesn't exist, add it with a default score of 50
          result.criteria[criterion] = {
            score: 50,
            explanation: `Moderate performance in ${criterion}. The response shows some understanding but needs significant improvement.`
          };
        } else if (criterionKey !== criterion) {
          // If criterion exists but with different casing, normalize the key
          result.criteria[criterion] = result.criteria[criterionKey];
          delete result.criteria[criterionKey];
        }
      });
    }
    
    // Create overall object if it doesn't exist
    if (!result.overall || typeof result.overall !== 'object') {
      result.overall = {};
    }
    
    // Ensure overall.score is a valid number
    if (result.overall.score === undefined || result.overall.score === null || isNaN(result.overall.score)) {
      // Use overall_score if available
      if (result.overall_score !== undefined && result.overall_score !== null && !isNaN(result.overall_score)) {
        result.overall.score = Math.round(Math.max(0, Math.min(10, Number(result.overall_score))) * 10);
      }
      // Otherwise calculate from criteria
      else if (result.criteria && Object.keys(result.criteria).length > 0) {
        const scores = Object.values(result.criteria).map(c => c.score).filter(score => !isNaN(Number(score)));
        result.overall.score = scores.length > 0 
          ? Math.round(scores.reduce((sum, score) => sum + Number(score), 0) / scores.length)
          : 50;
      } else {
        result.overall.score = 50;
      }
    } else {
      // Convert to number and ensure it's in 0-100 range
      result.overall.score = Math.round(Math.max(0, Math.min(100, Number(result.overall.score))));
    }
    
    // Add meaningful overall explanation if missing
    if (!result.overall.explanation) {
      const score = result.overall.score;
      if (score >= 90) {
        result.overall.explanation = "The response demonstrates exceptional quality across all evaluation criteria.";
      } else if (score >= 80) {
        result.overall.explanation = "The response shows strong overall performance with minor areas for improvement.";
      } else if (score >= 70) {
        result.overall.explanation = "The response is generally good but has some areas that could be enhanced.";
      } else if (score >= 60) {
        result.overall.explanation = "The response meets basic requirements but needs significant improvement in several areas.";
      } else if (score >= 50) {
        result.overall.explanation = "The response shows moderate performance but requires substantial improvement.";
      } else {
        result.overall.explanation = "The response needs significant improvement to meet quality standards.";
      }
    }
    
    // Ensure arrays exist
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.weaknesses)) result.weaknesses = [];
    
    return result;
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

      {isProcessing && (
        <Box p={3} display="flex" flexDirection="column" alignItems="center">
          <CircularProgress />
          <Typography variant="h6" mt={2}>
            {currentValidatingModel ? `Validating ${currentValidatingModel}` : 'Preparing validation...'}
          </Typography>
          <Typography variant="body2" color="textSecondary" mt={1}>
            {currentValidatingModel 
              ? `Using ${validatorModel} as validator` 
              : (localStorage.getItem('useParallelProcessing') === 'true' 
                  ? 'Validating all responses in parallel...' 
                  : 'Processing sequentially...')}
          </Typography>
          
          {localStorage.getItem('useParallelProcessing') === 'true' && (
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
                <span role="img" aria-label="Parallel">⚡</span> Parallel Validation Active
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                {parallelProgress.completed > 0 
                  ? `${parallelProgress.completed} of ${parallelProgress.total} models validated simultaneously`
                  : 'All model responses are being validated simultaneously for faster results.'}
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
              
              {/* Model validation status chips */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, maxHeight: 120, overflowY: 'auto' }}>
                {/* Remove duplicates by using a Set for model names */}
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
          )}
        </Box>
      )}

      {!Object.keys(validationResults).length ? (
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
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="contained" 
              color="primary"
              onClick={validateResponses}
              startIcon={<AssessmentIcon />}
              disabled={isProcessing}
              sx={{ mb: 2 }}
            >
              Revalidate
            </Button>
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
                                // Normalize each criterion name for consistent matching
                                const normalizedKey = normalizeCriterionName(criterion);
                                // Store with normalized key for later retrieval
                                criteriaMap.set(normalizedKey, criterion); // Store original key as value
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
                      // Log the metrics structure for debugging
                      console.log("METRICS STRUCTURE:", {
                        keys: Object.keys(metrics || {}),
                        fullObject: metrics,
                        setKeys: Object.keys(metrics || {}).filter(k => k.startsWith('Set ')),
                        modelKeys: Object.keys(metrics || {}).filter(k => !k.startsWith('Set '))
                      });
                      
                      // Calculate the cheapest model cost for comparison
                      const modelCosts = {};
                      Object.keys(validationResults).forEach(model => {
                        // Find metrics using our robust lookup helper
                        const modelMetrics = findMetrics(metrics, model);
                        let tokenUsage = 0;
                        
                        if (modelMetrics) {
                          tokenUsage = modelMetrics.tokenUsage?.total || 0;
                          console.log(`Found token usage for ${model}: ${tokenUsage}`);
                        } else {
                          console.warn(`No metrics found for ${model}, using default token usage`);
                        }
                        
                        // Extract the base model name for cost calculation
                        let modelForCost = model;
                        if (model.includes('-')) {
                          const match = model.match(/^(?:Set \d+-)?(.+)$/);
                          if (match) {
                            modelForCost = match[1]; // Extract the base model name without Set prefix
                          }
                        }
                        
                        // Calculate cost
                        modelCosts[model] = calculateCost(modelForCost, tokenUsage);
                        console.log(`Cost for ${model} (${modelForCost}): ${modelCosts[model]} based on ${tokenUsage} tokens`);
                      });
                      
                      // Get all unique criteria
                      // Use a Map to store criteria with normalized keys
                      const criteriaMap = new Map();
                      
                      Object.values(validationResults).forEach(result => {
                        if (result.criteria) {
                          Object.keys(result.criteria).forEach(criterion => {
                            // Normalize each criterion name for consistent matching
                            const normalizedKey = normalizeCriterionName(criterion);
                            // Store with normalized key for later retrieval
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
                        
                        // Get the cost we calculated earlier
                        const cost = modelCosts[model] || 0;
                        
                        // Find metrics using our robust lookup helper
                        const modelMetrics = findMetrics(metrics, model);
                        let responseTime = 0;
                        
                        if (modelMetrics) {
                          responseTime = modelMetrics.responseTime || 0;
                          console.log(`Found response time for ${model}: ${responseTime}`);
                        } else {
                          console.warn(`No metrics found for ${model}, response time will be 0`);
                        }
                        
                        // Get efficiency score from the effectiveness data
                        const efficiencyScore = effectivenessData?.modelData?.[model]?.efficiencyScore ?? 0;
                        // Get the overall score from the result
                        const overallScore = result.overall && result.overall.score !== undefined 
                          ? result.overall.score 
                          : (result.overall_score ? Math.round(result.overall_score * 10) : 0);
                        
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
                          // Store the entire criterion object for later reference
                          rowData[`criterion_${criterion}`] = criterionValue;
                          // Also store just the score for sorting
                          rowData[criterion] = criterionValue ? criterionValue.score : 0;
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
                      
                      return sortedData.map((rowData, index) => {
                        const cellStyle = { padding: '8px', borderBottom: '1px solid #ddd' };
                        
                        return (
                          <tr key={rowData.model} style={{ 
                            backgroundColor: index % 2 === 0 ? '#f9f9f9' : 'transparent',
                            border: '1px solid #ddd',
                          }}>
                            <td style={cellStyle}>
                              <div style={{fontWeight: 'bold'}}>{rowData.model}</div>
                              <div style={{fontSize: '0.8rem', color: '#666'}}>{getModelVendor(rowData.model)}</div>
                            </td>
                            <td style={{...cellStyle, textAlign: 'center'}}>
                              <div style={{
                                fontWeight: 'bold', 
                                fontSize: '1.1rem', 
                                color: getScoreColor(rowData.overallScore)
                              }}>
                                {rowData.overallScore}
                              </div>
                            </td>
                            {criteriaArray.map(normalizedCriterion => {
                              const criterionValue = findCriterionValue(rowData.result.criteria, normalizedCriterion);
                              return (
                                <td key={normalizedCriterion} style={{ 
                                  textAlign: 'center', 
                                  padding: '8px', 
                                  borderBottom: '1px solid #ddd',
                                  color: criterionValue && criterionValue.score ? 
                                    getScoreColor(criterionValue.score) : 'inherit'
                                }}>
                                  {criterionValue && criterionValue.score ? 
                                    `${criterionValue.score}/100` : 'N/A'}
                                </td>
                              );
                            })}
                            <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>
                              {formatResponseTime(rowData.responseTime)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>
                              {formatCost(rowData.cost)}
                            </td>
                            <td style={{ 
                              textAlign: 'right', 
                              padding: '8px', 
                              borderBottom: '1px solid #ddd',
                              color: rowData.model === effectivenessData.mostEffectiveModel ? '#4caf50' : (rowData.efficiencyScore >= 80 ? '#8bc34a' : (rowData.efficiencyScore >= 50 ? '#ffc107' : '#f44336')),
                              fontWeight: rowData.model === effectivenessData.mostEffectiveModel ? 'bold' : 'normal'
                            }}>
                              {formatEffectivenessScore(rowData.efficiencyScore)}
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
                          `${getModelVendor(model)} - Overall Score: ${result.overall.score}/100` : 
                          `${getModelVendor(model)} - Validation Complete`
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
                      
                      {/* Display the model response */}
                      <Box mb={3}>
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography>View Model Response</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Box 
                              sx={{ 
                                p: 2, 
                                bgcolor: 'grey.50', 
                                borderRadius: 1,
                                maxHeight: '300px',
                                overflow: 'auto'
                              }}
                            >
                              {(() => {
                                // Get answer content from response
                                let answer = '';
                                
                                // Extract set name and base model name
                                const setMatch = model.match(/^(Set \d+)-(.+)$/);
                                let response = null;
                                
                                if (setMatch) {
                                  const setName = setMatch[1]; // e.g., "Set 1"
                                  const baseModel = setMatch[2]; // e.g., "gpt-4o-mini"
                                  
                                  // Try to get response from nested structure
                                  if (responses && responses[setName] && responses[setName][baseModel]) {
                                    response = responses[setName][baseModel];
                                    console.log(`Found response in ${setName} for ${baseModel}`);
                                  }
                                  // Fallback to direct lookup with full model name
                                  else if (responses && responses[model]) {
                                    response = responses[model];
                                    console.log(`Found response with full model name ${model}`);
                                  }
                                  // Fallback to base model name
                                  else if (responses && responses[baseModel]) {
                                    response = responses[baseModel];
                                    console.log(`Found response with base model name ${baseModel}`);
                                  }
                                  // Try dot notation
                                  else if (responses && responses[`${setName}.${baseModel}`]) {
                                    response = responses[`${setName}.${baseModel}`];
                                    console.log(`Found response with dot notation ${setName}.${baseModel}`);
                                  }
                                } else {
                                  // Try direct lookup if no Set prefix
                                  response = responses && responses[model];
                                  console.log(`Attempting direct lookup for ${model}`);
                                }
                                
                                // Log the response object for debugging
                                console.log(`Response lookup for model ${model}:`, {
                                  fullModel: model,
                                  setMatch: setMatch,
                                  response: response,
                                  responsesKeys: responses ? Object.keys(responses) : []
                                });
                                
                                if (!response) {
                                  console.warn(`No response found for model ${model}`);
                                  return "No response available";
                                }

                                // Handle different response formats
                                if (typeof response === 'object') {
                                  // Case 1: Direct answer object with text
                                  if (response?.answer?.text) {
                                    console.log('Found response in answer.text');
                                    answer = response.answer.text;
                                  }
                                  // Case 2: Direct answer string
                                  else if (response?.answer) {
                                    console.log('Found response in answer');
                                    answer = typeof response.answer === 'string' 
                                      ? response.answer 
                                      : JSON.stringify(response.answer, null, 2);
                                  }
                                  // Case 3: Response object with text
                                  else if (response?.response?.text) {
                                    console.log('Found response in response.text');
                                    answer = response.response.text;
                                  }
                                  // Case 4: Direct response string
                                  else if (response?.response) {
                                    console.log('Found response in response');
                                    answer = typeof response.response === 'string'
                                      ? response.response
                                      : JSON.stringify(response.response, null, 2);
                                  }
                                  // Case 5: Direct text field
                                  else if (response?.text) {
                                    console.log('Found response in text');
                                    answer = response.text;
                                  }
                                  // Case 6: Try to stringify the entire object
                                  else {
                                    console.log('Attempting to stringify entire response object');
                                    try {
                                      answer = JSON.stringify(response, null, 2);
                                    } catch (e) {
                                      console.error('Error stringifying response:', e);
                                      answer = "Could not display response";
                                    }
                                  }
                                } else if (typeof response === 'string') {
                                  console.log('Response is a string');
                                  answer = response;
                                } else {
                                  console.warn('Response is of unknown type:', typeof response);
                                  answer = "No response available";
                                }

                                // If answer is empty after all attempts, show a message
                                if (!answer || answer.trim() === '') {
                                  console.warn('No answer content found after processing');
                                  return "No response content available";
                                }

                                // Check if it looks like code
                                const isCode = answer.includes('import ') || 
                                              answer.includes('function ') || 
                                              answer.includes('def ') ||
                                              answer.includes('class ');

                                // Check if it's JSON
                                const isJson = answer.trim().startsWith('{') && answer.trim().endsWith('}');

                                if (isCode || isJson) {
                                  return (
                                    <pre style={{ 
                                      margin: 0, 
                                      fontFamily: 'monospace',
                                      fontSize: '0.85rem',
                                      whiteSpace: 'pre-wrap'
                                    }}>
                                      {answer}
                                    </pre>
                                  );
                                }

                                return (
                                  <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {answer}
                                  </Typography>
                                );
                              })()}
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      </Box>
                      
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
            onClick={async () => {
              setEditCriteriaOpen(false);
              // Save to localStorage
              localStorage.setItem('defaultEvaluationCriteria', customCriteria);
              localStorage.setItem('responseValidatorModel', validatorModel);
              
              // Check if we have responses to validate
              if (!responses || Object.keys(responses).length === 0) {
                console.error("No responses available to validate");
                alert("No responses available to validate. Please run a query first.");
                return;
              }
              
              // Clear validation results and run validation again
              setIsProcessing(true);
              onValidationComplete({});
              try {
                console.log("Re-validating with new criteria:", customCriteria);
                await validateResponses();
              } catch (error) {
                console.error("Error during revalidation:", error);
                setIsProcessing(false);
              }
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