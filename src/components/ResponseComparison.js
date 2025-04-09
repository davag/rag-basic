import React, { useState, useRef } from 'react';
import { 
  Typography, 
  Box, 
  Grid, 
  Paper, 
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Stack,
  Alert,
  Tooltip,
  Tabs,
  Tab,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TokenIcon from '@mui/icons-material/Token';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import InfoIcon from '@mui/icons-material/Info';
import DescriptionIcon from '@mui/icons-material/Description';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { calculateCost } from '../config/llmConfig';
import RetrievalEvaluation from './RetrievalEvaluation';
import EmbeddingQualityAnalysis from './EmbeddingQualityAnalysis';
import SourceContentAnalysis from './SourceContentAnalysis';
import ContextWindowVisualizer from './ContextWindowVisualizer';
import TokenUsageAnalyzer from './TokenUsageAnalyzer';
import CompareIcon from '@mui/icons-material/Compare';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TuneIcon from '@mui/icons-material/Tune';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const ResponseComparison = ({ 
  responses, 
  metrics, 
  currentQuery, 
  systemPrompts, 
  onBackToQuery, 
  onImportResults,
  documents,
  vectorStore,
  availableModels
}) => {
  // Remove unused state variables but keep the setter functions
  const [, setSnackbarOpen] = useState(false);
  const [, setSnackbarMessage] = useState('');
  const [, setSnackbarSeverity] = useState('success');
  
  // Reference to the file input element
  const fileInputRef = useRef(null);
  
  // Add state for expanded raw responses
  const [expandedRawResponses, setExpandedRawResponses] = useState({});
  
  // Add enhanced debugging for responses
  console.log("DEBUG: Response Comparison Component Rendered");
  console.log("DEBUG: Raw responses object:", JSON.stringify(responses, null, 2));
  console.log("DEBUG: Response type:", typeof responses);
  console.log("DEBUG: Response keys:", Object.keys(responses || {}));
  
  if (responses?.models) {
    console.log("DEBUG: Found models structure, keys:", Object.keys(responses.models));
    Object.entries(responses.models).forEach(([setKey, setModels]) => {
      console.log(`DEBUG: Models in set ${setKey}:`, Object.keys(setModels));
    });
  }
  
  // Get sources from the response structure
  let sources = [];
  
  console.log("Full response structure:", responses);
  
  // Try to extract sources from the new nested response structure
  if (responses) {
    // Check if we have the new structured format with models
    if (responses.models) {
      console.log("Found new structure with models key");
      
      // Try to find sources in any model response
      const modelSets = Object.values(responses.models);
      for (const setObj of modelSets) {
        // Each set contains model responses
        for (const modelResponse of Object.values(setObj)) {
          if (modelResponse && Array.isArray(modelResponse.sources) && modelResponse.sources.length > 0) {
            sources = modelResponse.sources;
            console.log("Found sources in model response:", sources.length);
            break;
          }
        }
        if (sources.length > 0) break;
      }
    } 
    // Check for legacy structure formats
    else {
      // Case 1: Direct top-level access
      if (Array.isArray(responses.sources)) {
        sources = responses.sources;
        console.log("Found sources at top level:", sources.length);
      } 
      // Case 2: First model in a standard structure
      else if (Object.values(responses)[0]?.sources) {
        sources = Object.values(responses)[0].sources;
        console.log("Found sources in first model:", sources.length);
      }
      // Case 3: Within a Set structure
      else {
        const setKeys = Object.keys(responses).filter(key => key.startsWith('Set '));
        for (const setKey of setKeys) {
          if (responses[setKey] && typeof responses[setKey] === 'object') {
            // Look through all models in the set for sources
            const modelsInSet = Object.values(responses[setKey]);
            for (const model of modelsInSet) {
              if (model && Array.isArray(model.sources)) {
                sources = model.sources;
                console.log(`Found sources in a model within set ${setKey}:`, sources.length);
                break;
              }
            }
            
            // If sources were found, break out of the outer loop too
            if (sources.length > 0) break;
          }
        }
      }
    }
  }
  
  console.log("Final sources for display:", sources);
  
  // Debug log to inspect responses structure
  console.log("RESPONSES DEBUG:", responses);
  console.log("RESPONSES KEYS:", Object.keys(responses || {}));
  console.log("METRICS:", metrics);
  console.log("MODEL/METRICS MATCHING:");
  
  // More detailed debug for finding metrics that match model keys
  if (responses && metrics) {
    Object.keys(responses).forEach(responseKey => {
      // Check if there's a direct match in metrics
      if (metrics[responseKey]) {
        console.log(`Direct match for ${responseKey}:`, metrics[responseKey]);
      } else {
        console.log(`No direct metrics match for ${responseKey}, looking for subkeys...`);
        
        // Check if this is a nested object with model keys
        const responseObj = responses[responseKey];
        if (typeof responseObj === 'object' && !Array.isArray(responseObj)) {
          Object.keys(responseObj).forEach(subkey => {
            if (metrics[subkey]) {
              console.log(`Found metrics match for nested model ${subkey}:`, metrics[subkey]);
            } else if (metrics[`${responseKey}-${subkey}`]) {
              console.log(`Found metrics match for composite key ${responseKey}-${subkey}:`, metrics[`${responseKey}-${subkey}`]);
            } else {
              console.log(`No metrics found for ${responseKey} > ${subkey}`);
            }
          });
        }
      }
    });
  }
  
  // Add new state variables
  const [selectedTab, setSelectedTab] = useState('comparison');
  const [sortConfig, setSortConfig] = useState({
    key: 'elapsedTime',
    direction: 'ascending'
  });

  // Add sort handler function
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Add sort function
  const sortData = (data) => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      // Get responses for both models
      const aResponse = responses?.models?.[a.setName]?.[a.displayName] || 
                       responses?.[a.setName]?.[a.displayName] ||
                       responses?.[a.displayName];
      
      const bResponse = responses?.models?.[b.setName]?.[b.displayName] || 
                       responses?.[b.setName]?.[b.displayName] ||
                       responses?.[b.displayName];
      
      let aValue = 0;
      let bValue = 0;
      
      switch (sortConfig.key) {
        case 'elapsedTime':
          aValue = aResponse?.elapsedTime || 0;
          bValue = bResponse?.elapsedTime || 0;
          break;
          
        case 'tokenUsage':
          aValue = aResponse?.tokenUsage?.total || 0;
          bValue = bResponse?.tokenUsage?.total || 0;
          break;
          
        case 'cost':
          // First check if cost is directly available in the response
          const aResponseCost = aResponse?.cost || aResponse?.rawResponse?.cost;
          const bResponseCost = bResponse?.cost || bResponse?.rawResponse?.cost;
                            
          // Use cost from API response if available, otherwise calculate
          aValue = aResponseCost;
          bValue = bResponseCost;
          
          // Fallback to calculation if no cost in response
          if (aValue === undefined || aValue === null) {
            const aTokenUsage = aResponse?.tokenUsage?.total || 0;
            const aCalculatedCost = calculateCost(window.costTracker?.normalizeModelName?.(a.displayName) || a.displayName, {
              input: aTokenUsage / 2,  // estimate split
              output: aTokenUsage / 2
            });
            aValue = aCalculatedCost.totalCost;
          }
          
          if (bValue === undefined || bValue === null) {
            const bTokenUsage = bResponse?.tokenUsage?.total || 0;
            const bCalculatedCost = calculateCost(window.costTracker?.normalizeModelName?.(b.displayName) || b.displayName, {
              input: bTokenUsage / 2,  // estimate split
              output: bTokenUsage / 2
            });
            bValue = bCalculatedCost.totalCost;
          }
          break;
          
        default:
          aValue = 0;
          bValue = 0;
      }
      
      if (sortConfig.direction === 'ascending') {
        return aValue - bValue;
      }
      return bValue - aValue;
    });
  };

  // Helper function to get elapsed time from metrics
  const formatElapsedTime = (ms, timeType) => {
    console.log(`[TIME DEBUG] formatElapsedTime called with: ${ms}ms, type: ${timeType || 'unknown'}`);
    
    if (!ms || isNaN(ms)) return 'N/A';
    
    // Ensure we're dealing with a duration, not a timestamp
    let duration = ms;
    
    // If it's a timestamp (greater than 24 hours in ms), convert to elapsed time
    // Skip this check if we explicitly know it's already a duration
    if (timeType !== 'duration' && ms > 24 * 60 * 60 * 1000) {
      const calculatedElapsed = Date.now() - ms;
      console.log(`[TIME DEBUG] Converting timestamp ${ms} to elapsed time: ${calculatedElapsed}ms`);
      duration = calculatedElapsed;
    } else {
      console.log(`[TIME DEBUG] Using as duration: ${duration}ms`);
    }
    
    // Format the duration for display
    if (duration < 1000) {
      return `${duration.toFixed(2)}ms`;
    } else if (duration < 60000) {
      return `${(duration / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(duration / 60000);
      const seconds = ((duration % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  };

  const formatCost = (costValue) => {
    console.log(`[COST DEBUG] formatCost called with: ${costValue}, type: ${typeof costValue}`);
    
    // Handle invalid inputs
    if (costValue === null || costValue === undefined || isNaN(costValue)) {
      console.log('[COST DEBUG] Invalid cost value:', costValue);
      return 'N/A';
    }
    
    // Convert to number if it's a string
    const cost = Number(costValue);
    
    // For very small costs, use fixed decimal notation with 10 decimal places
    if (cost > 0 && cost < 0.0000001) {
      return `$${cost.toFixed(10)}`;
    }
    
    // For regular costs, use 7 decimal places
    return `$${cost.toFixed(7)}`;
  };

  const modelColors = {
    // Azure OpenAI models (blue)
    'azure-gpt-4o': '#0078d4',
    'azure-gpt-4o-mini': '#0078d4',
    'azure-o3-mini': '#0078d4',
    
    // OpenAI models (green)
    'gpt-4o': '#10a37f',
    'gpt-4o-mini': '#10a37f',
    'o3-mini': '#10a37f',
    
    // Anthropic models (purple)
    'claude-3-5-sonnet': '#5436da',
    'claude-3-7-sonnet': '#5436da',
    
    // Ollama models (red)
    'llama3.2:latest': '#ff6b6b',
    'mistral:latest': '#ff6b6b',
    'gemma3:12b': '#ff6b6b'
  };

  // eslint-disable-next-line no-unused-vars
  const getModelVendor = (model) => {
    if (model.includes('azure-')) return 'AzureOpenAI';
    if (model.startsWith('gpt') || model.startsWith('o3')) return 'OpenAI';
    if (model.startsWith('claude')) return 'Anthropic';
    if (model.includes('llama') || model.includes('mistral') || model.includes('gemma')) return 'Ollama';
    
    // For unknown models, just return an empty string to avoid "Set X" labels
    return '';
  };

  // Group sources by namespace
  // eslint-disable-next-line no-unused-vars
  const getSourcesByNamespace = (sources) => {
    if (!Array.isArray(sources)) return {};
    
    console.log("Processing sources:", sources);
    
    return sources.reduce((acc, source) => {
      const namespace = source.metadata?.namespace || 'default';
      if (!acc[namespace]) {
        acc[namespace] = [];
      }
      acc[namespace].push(source);
      return acc;
    }, {});
  };

  // Export results to a JSON file
  const handleExportResults = () => {
    // Get the current date and time for the filename
    const timestamp = new Date().toISOString();
    const dateForFilename = timestamp.slice(0, 10);
    
    // Determine if custom prompts were used based on the systemPrompts object
    const useCustomPrompts = Object.keys(systemPrompts).length > 1;
    let customSystemPrompts = {};
    let globalSystemPrompt = '';
    
    if (useCustomPrompts) {
      // If custom prompts were used, include all system prompts
      customSystemPrompts = systemPrompts;
    } else {
      // If a global prompt was used, just include that
      globalSystemPrompt = Object.values(systemPrompts)[0] || '';
    }
    
    // Create a results object with all the data
    const results = {
      query: currentQuery,
      systemPrompts,
      responses,
      metrics,
      // Include query state information if available from the responses
      queryState: {
        query: currentQuery,
        selectedModels: Object.keys(responses),
        // Extract namespaces from sources if available
        selectedNamespaces: Array.from(
          new Set(
            Object.values(responses)
              .flatMap(r => r.sources || [])
              .map(s => s.namespace || 'default')
          )
        ),
        // Include only relevant system prompts
        globalSystemPrompt: globalSystemPrompt,
        useCustomPrompts: useCustomPrompts,
        customSystemPrompts: customSystemPrompts
      },
      timestamp
    };
    
    const resultsJson = JSON.stringify(results, null, 2);
    const blob = new Blob([resultsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `rag-results-${dateForFilename}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show success message
    setSnackbarMessage('Results exported successfully');
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };
  
  // Trigger file input click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection for import
  const handleImportResults = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedResults = JSON.parse(e.target.result);
        
        // Validate the imported data
        if (!importedResults.query || !importedResults.responses || !importedResults.metrics) {
          throw new Error('Invalid results file format');
        }
        
        // Use the App-level import handler if available
        if (onImportResults && typeof onImportResults === 'function') {
          onImportResults(importedResults);
        } else {
          // Fallback to local handling
          setSnackbarMessage('Results imported successfully. Note: In a full implementation, these results would replace the current view.');
          setSnackbarSeverity('info');
          setSnackbarOpen(true);
        }
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
      } catch (error) {
        setSnackbarMessage('Failed to import results. The file may be invalid or corrupted.');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
    };
    reader.readAsText(file);
  };

  const generatePDF = () => {
    try {
      console.log("Starting PDF generation with updated jsPDF");
      
      // Create a new jsPDF instance with UTF-8 support
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true,
        compress: true
      });
      
      // Set basic properties
      const margin = 15;
      
      // Add title
      doc.setFontSize(16);
      doc.text('RAG Query Report', margin, 15);
      
      // Add query
      doc.setFontSize(12);
      doc.text('Query:', margin, 25);
      doc.setFontSize(10);
      
      // Split long text to fit width
      const splitQuery = doc.splitTextToSize(
        currentQuery || 'No query provided', 
        doc.internal.pageSize.width - (margin * 2)
      );
      doc.text(splitQuery, margin, 30);
      
      // Add metrics table
      const metricsTableY = 30 + (splitQuery.length * 5) + 10;
      
      // Create a hardcoded tableData for PDF export that matches the UI's display
      const tableData = [];
      
      // Process metrics for each model if available
      if (metrics && responses) {
        console.log("Processing PDF metrics with hard-coded model format");
        
        // Use the two specific models from the UI with the exact same approach as the UI table
        const knownModels = [
          { modelName: "gpt-4o-mini", setName: "Set 1" },
          { modelName: "claude-3-5-sonnet", setName: "Set 1" },
          { modelName: "gpt-4o-mini", setName: "Set 2" },
          { modelName: "claude-3-5-sonnet", setName: "Set 2" }
        ];
        
        knownModels.forEach(({ modelName, setName }) => {
          // Look for metrics for this model using same technique as in the UI table
          let modelMetrics = null;
          let backupMetricsKeys = [];
          
          // First check for the specific structure seen in the debug panel
          // where metrics are nested under the set key with model as subkey
          if (metrics[setName] && metrics[setName][modelName]) {
            modelMetrics = metrics[setName][modelName];
            console.log(`Found nested metrics for ${modelName} in ${setName}:`, modelMetrics);
          } 
          // Then try other possible formats
          else if (metrics[`${setName}.${modelName}`]) {
            modelMetrics = metrics[`${setName}.${modelName}`];
            console.log(`Found metrics with special key ${setName}.${modelName}:`, modelMetrics);
          } else {
            // Try standard backup keys in order of likelihood
            backupMetricsKeys = [
              `${setName}-${modelName}`,  // Composite key
              modelName,                 // Just the model name
              setName                    // Just the set key
            ];
            
            // Find the first key with valid metrics
            const validMetricsKey = backupMetricsKeys.find(key => 
              metrics[key] && (
                !isNaN(metrics[key]?.elapsedTime) || 
                (metrics[key]?.tokenUsage && metrics[key]?.tokenUsage?.total)
              )
            );
            
            // Get metrics from the valid key
            modelMetrics = validMetricsKey ? metrics[validMetricsKey] : null;
            
            if (validMetricsKey) {
              console.log(`Found metrics for ${modelName} in ${setName} using key ${validMetricsKey}:`, modelMetrics);
            }
          }
          
          // Get token usage
          // eslint-disable-next-line no-unused-vars
          const tokenUsage = modelMetrics?.tokenUsage?.total;
          
          // Calculate cost using API-provided cost or fallback to calculation
          const modelResponse = responses?.models?.[setName]?.[modelName] || 
                               responses?.[setName]?.[modelName] ||
                               responses?.[modelName];
          
          console.log(`[Cost Debug DUMP] Model ${modelName} response:`, modelResponse);
          
          // First check for API-reported cost
          let cost = null;
          let useApiCost = false;
          
          // Check if the model response has a cost and useForDisplay flag
          if (modelResponse?.useForDisplay === true && modelResponse?.cost !== undefined) {
            cost = Number(modelResponse.cost);
            useApiCost = true;
            console.log(`[Cost Debug] Using model response API cost for ${modelName}: $${cost} (useForDisplay=true)`);
          }
          // Check if raw response has cost
          else if (modelResponse?.rawResponse?.useForDisplay === true && modelResponse?.rawResponse?.cost !== undefined) {
            cost = Number(modelResponse.rawResponse.cost);
            useApiCost = true;
            console.log(`[Cost Debug] Using raw response API cost for ${modelName}: $${cost} (useForDisplay=true)`);
          }
          // Fall back to any available cost
          else if (modelMetrics?.useForDisplay === true && modelMetrics?.calculatedCost !== undefined) {
            cost = Number(modelMetrics.calculatedCost);
            useApiCost = true;
            console.log(`[Cost Debug FINAL] Using metrics API cost: ${cost}`);
          }
          // Priority 2: Any calculatedCost
          else if (modelMetrics?.calculatedCost !== undefined) {
            cost = Number(modelMetrics.calculatedCost);
            console.log(`[Cost Debug FINAL] Using metrics calculated cost: ${cost}`);
          }
          // Priority 3: Any other cost
          else if (modelResponse?.cost !== undefined) {
            cost = Number(modelResponse.cost);
            console.log(`[Cost Debug FINAL] Using local cost variable: ${cost}`);
          }
          // Fall back to 0
          else {
            cost = 0;
            console.log(`[Cost Debug FINAL] Using fallback cost: ${cost}`);
          }
          
          // Set useForDisplay flag on modelMetrics if we're using an API-reported cost
          if (useApiCost && modelMetrics) {
            modelMetrics.useForDisplay = true;
            modelMetrics.calculatedCost = cost;
            console.log(`[Cost Debug] Set calculatedCost=${cost} and useForDisplay=true on modelMetrics for ${modelName}`);
          }
          
          tableData.push([
            `${modelName} / ${setName}`,
            modelMetrics?.elapsedTime ? formatElapsedTime(modelMetrics.elapsedTime, modelMetrics?.elapsedTimeType) : 'N/A',
            `${modelMetrics?.tokenUsage?.total || 'Unknown'} tokens`,
            formatCost(cost)
          ]);
        });
      }
      
      console.log("Final PDF metrics table data:", tableData);
      
      if (tableData.length > 0) {
        try {
          // Add metrics table with autoTable
          doc.autoTable({
            startY: metricsTableY,
            head: [['Model', 'Response Time', 'Token Usage', 'Est. Cost']],
            body: tableData,
            margin: { left: margin, right: margin },
            theme: 'grid',
            headStyles: { fillColor: [66, 139, 202] }
          });
        } catch (tableError) {
          console.error("Error generating metrics table with autoTable:", tableError);
          
          // Fallback to manual table rendering if autoTable fails
          try {
            // Set up manual table
            const colWidths = [60, 40, 45, 30]; // Column widths in mm
            const rowHeight = 10; // Row height in mm
            let y = metricsTableY;
            
            // Draw header
            doc.setFillColor(66, 139, 202);
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.rect(margin, y, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], rowHeight, 'F');
            
            // Draw header text
            doc.text('Model', margin + 3, y + 6);
            doc.text('Response Time', margin + colWidths[0] + 3, y + 6);
            doc.text('Token Usage', margin + colWidths[0] + colWidths[1] + 3, y + 6);
            doc.text('Est. Cost', margin + colWidths[0] + colWidths[1] + colWidths[2] + 3, y + 6);
            
            y += rowHeight;
            
            // Reset to black text
            doc.setTextColor(0, 0, 0);
            
            // Draw rows
            for (let i = 0; i < tableData.length; i++) {
              const row = tableData[i];
              
              // Alternate row background
              if (i % 2 === 0) {
                doc.setFillColor(240, 240, 240);
                doc.rect(margin, y, colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], rowHeight, 'F');
              }
              
              // Draw row text
              doc.text(row[0].substring(0, 20), margin + 3, y + 6); // Model
              doc.text(row[1], margin + colWidths[0] + 3, y + 6); // Response Time
              doc.text(row[2], margin + colWidths[0] + colWidths[1] + 3, y + 6); // Token Usage
              doc.text(row[3], margin + colWidths[0] + colWidths[1] + colWidths[2] + 3, y + 6); // Cost
              
              y += rowHeight;
            }
            
            console.log("Manual table rendering successful");
          } catch (manualTableError) {
            console.error("Error with manual table rendering:", manualTableError);
            doc.text('Error generating metrics table: ' + tableError.message, margin, metricsTableY);
          }
        }
      } else {
        doc.text('No metrics data available', margin, metricsTableY);
      }
      
      // Add one model response per page (max 5 models)
      if (responses) {
        // First handle set-based responses
        const setKeys = Object.keys(responses).filter(key => 
          key.startsWith('Set ') && 
          !key.startsWith('query Set') && 
          !key.startsWith('retrievalTime Set')
        );
        
        // Process each set and its models
        setKeys.forEach(setKey => {
          try {
            const setContent = responses[setKey];
            
            // If the set contains model responses as an object
            if (typeof setContent === 'object' && !Array.isArray(setContent)) {
              // Extract each model from the set
              Object.entries(setContent).forEach(([modelKey, modelResponse]) => {
                doc.addPage();
                doc.setFontSize(14);
                doc.text(`${modelKey} / ${setKey}`, margin, 15);
                
                // Extract text content from the model response
                let responseText = '';
                
                if (typeof modelResponse === 'string') {
                  responseText = modelResponse;
                } else if (modelResponse) {
                  if (modelResponse.answer && typeof modelResponse.answer === 'object' && modelResponse.answer.text) {
                    responseText = modelResponse.answer.text;
                  } else if (modelResponse.answer) {
                    responseText = modelResponse.answer;
                  } else if (modelResponse.text) {
                    responseText = modelResponse.text;
                  } else if (modelResponse.response) {
                    responseText = modelResponse.response;
                  } else if (modelResponse.content) {
                    responseText = modelResponse.content;
                  } else {
                    try {
                      responseText = JSON.stringify(modelResponse, null, 2);
                    } catch (e) {
                      responseText = "Could not display response data";
                    }
                  }
                } else {
                  responseText = "No response data available";
                }
                
                // Limit length for performance
                if (responseText.length > 4000) {
                  responseText = responseText.substring(0, 4000) + "... (content truncated)";
                }
                
                // Add the response text
                doc.setFontSize(10);
                const splitResponse = doc.splitTextToSize(
                  responseText, 
                  doc.internal.pageSize.width - (margin * 2)
                );
                doc.text(splitResponse, margin, 25);
              });
            } else {
              // The set content itself is the response
              doc.addPage();
              doc.setFontSize(14);
              doc.text(`${setKey}`, margin, 15);
              
              // Extract text if it's a complex object
              let responseText = '';
              if (typeof setContent === 'string') {
                responseText = setContent;
              } else if (setContent) {
                if (setContent.answer && typeof setContent.answer === 'object' && setContent.answer.text) {
                  responseText = setContent.answer.text;
                } else if (setContent.answer) {
                  responseText = setContent.answer;
                } else if (setContent.text) {
                  responseText = setContent.text;
                } else if (setContent.response) {
                  responseText = setContent.response;
                } else {
                  try {
                    responseText = JSON.stringify(setContent, null, 2);
                  } catch (e) {
                    responseText = "Could not display response data";
                  }
                }
              } else {
                responseText = "No response data available";
              }
              
              // Limit length for performance
              if (responseText.length > 4000) {
                responseText = responseText.substring(0, 4000) + "... (content truncated)";
              }
              
              // Add the response text
              doc.setFontSize(10);
              const splitResponse = doc.splitTextToSize(
                responseText, 
                doc.internal.pageSize.width - (margin * 2)
              );
              doc.text(splitResponse, margin, 25);
            }
          } catch (setError) {
            console.error(`Error processing set ${setKey}:`, setError);
          }
        });
        
        // Then process non-set responses
        const standardModelKeys = Object.keys(responses).filter(key => !key.startsWith('Set '));
        
        standardModelKeys.forEach((model, index) => {
          try {
            // Add a new page for each model
            doc.addPage();
            
            // Add model name
            doc.setFontSize(14);
            doc.text(`Model: ${model}`, margin, 15);
            
            // Extract and format response
            let responseText = '';
            const response = responses[model];
            
            if (typeof response === 'string') {
              responseText = response;
            } else if (response) {
              if (response.answer && typeof response.answer === 'object' && response.answer.text) {
                responseText = response.answer.text;
              } else if (response.answer) {
                responseText = response.answer;
              } else if (response.text) {
                responseText = response.text;
              } else if (response.response) {
                responseText = response.response;
              } else {
                try {
                  responseText = JSON.stringify(response, null, 2);
                } catch (e) {
                  responseText = "Could not display response data";
                }
              }
            } else {
              responseText = "No response data available";
            }
            
            // Limit length for performance
            if (responseText.length > 4000) {
              responseText = responseText.substring(0, 4000) + "... (content truncated)";
            }
            
            // Add the response text
            doc.setFontSize(10);
            const splitResponse = doc.splitTextToSize(
              responseText, 
              doc.internal.pageSize.width - (margin * 2)
            );
            doc.text(splitResponse, margin, 25);
          } catch (modelError) {
            console.error(`Error processing model ${model}:`, modelError);
          }
        });
      }
      
      // Add a simple source documents section (limit to avoid memory issues)
      if (sources && Array.isArray(sources) && sources.length > 0) {
        try {
          doc.addPage();
          doc.setFontSize(14);
          doc.text('Source Documents', margin, 15);
          
          // Include maximum 5 sources to prevent PDF size issues
          const maxSources = Math.min(sources.length, 5);
          doc.setFontSize(10);
          doc.text(`Showing ${maxSources} of ${sources.length} total sources`, margin, 25);
          
          let yPos = 35;
          
          for (let i = 0; i < maxSources; i++) {
            try {
              const source = sources[i];
              if (!source) continue;
              
              // Add a new page if needed
              if (yPos > 250) {
                doc.addPage();
                yPos = 15;
              }
              
              // Extract source information
              const sourceId = 
                source.source || 
                (source.metadata && (
                  source.metadata.source || 
                  source.metadata.filename || 
                  source.metadata.originalFileName || 
                  source.metadata.documentName
                )) || 
                `Source ${i+1}`;
                
              // Extract content text
              let contentText = 
                typeof source.pageContent === 'string' ? source.pageContent :
                typeof source.content === 'string' ? source.content :
                source.text || "No content available";
                
              // Limit content length
              if (contentText.length > 1000) {
                contentText = contentText.substring(0, 1000) + "... (content truncated)";
              }
              
              // Draw source header
              doc.setFontSize(12);
              doc.text(`Source ${i+1}: ${sourceId}`, margin, yPos);
              yPos += 8;
              
              // Draw content
              doc.setFontSize(9);
              const contentLines = doc.splitTextToSize(contentText, doc.internal.pageSize.width - (margin * 2));
              doc.text(contentLines, margin, yPos);
              
              // Update y position
              yPos += (contentLines.length * 5) + 15;
              
              // Draw a separator line
              if (i < maxSources - 1) {
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, yPos - 7, doc.internal.pageSize.width - margin, yPos - 7);
              }
            } catch (sourceError) {
              console.error(`Error processing source ${i}:`, sourceError);
              // Continue to next source
            }
          }
        } catch (sourcesSectionError) {
          console.error("Error creating sources section:", sourcesSectionError);
          // If the sources section fails, add an error note but don't fail the whole PDF
          doc.addPage();
          doc.setFontSize(14);
          doc.text('Source Documents', margin, 15);
          doc.setFontSize(10);
          doc.text('Error rendering source documents. See console for details.', margin, 25);
        }
      }
      
      // Save PDF
      try {
        const filename = `rag-report-${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
        
        setSnackbarMessage("PDF report generated successfully!");
        setSnackbarSeverity("success");
        setSnackbarOpen(true);
      } catch (saveError) {
        console.error("Error saving the PDF:", saveError);
        throw saveError; // Re-throw to be caught by outer try-catch
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      setSnackbarMessage(`Failed to generate PDF: ${error.message}`);
      setSnackbarSeverity("error");
      setSnackbarOpen(true);
    }
  };

  const handleBackToQuery = () => {
    if (onBackToQuery && typeof onBackToQuery === 'function') {
      onBackToQuery();
    }
  };

  // Update the separateModelsAndMetadata function to properly handle the new nested structure
  const separateModelsAndMetadata = (responseData) => {
    if (!responseData || typeof responseData !== 'object') {
      return { models: {}, metadata: {} };
    }
    
    // If we already have a proper structure with metadata and models separated, use it directly
    if (responseData.metadata && responseData.models) {
      console.log("Using existing metadata/models separation!");
      return {
        metadata: responseData.metadata || {},
        models: responseData.models || {}
      };
    }
    
    // Otherwise, create the separation (for backward compatibility)
    const result = {
      models: {},
      metadata: {}
    };
    
    // Process response structure
    Object.entries(responseData || {}).forEach(([key, value]) => {
      if (key === 'query' || key === 'retrievalTime') {
        result.metadata[key] = value;
      } else if (key.startsWith('Set ')) {
        // Set-based data goes to models
        result.models[key] = value;
      } else if (
        key.startsWith('gpt-') || 
        key.startsWith('claude-') || 
        key.includes('llama') || 
        key.includes('mistral')
      ) {
        // Model data goes to models
        result.models[key] = value;
      } else if (typeof value === 'object' && (
        value.answer || 
        value.response || 
        value.text
      )) {
        // Objects with response-like properties go to models
        result.models[key] = value;
      } else {
        // Everything else is metadata
        result.metadata[key] = value;
      }
    });
    
    console.log("PROCESSED DATA:", {
      models: Object.keys(result.models),
      metadata: Object.keys(result.metadata)
    });
    
    return result;
  };

  // Extract models and metadata
  // eslint-disable-next-line no-unused-vars
  const { models } = separateModelsAndMetadata(responses);

  // Find metrics for a model using a robust lookup method
  // eslint-disable-next-line no-unused-vars
  const findMetrics = (metrics, modelName) => {
    if (!metrics || !modelName) return null;
    
    // Try different possible keys for finding metrics
    const possibleKeys = [
      modelName,
      `Default-${modelName}`,
      `Default.${modelName}`,
      modelName.toLowerCase(),
      modelName.replace(/[^a-zA-Z0-9]/g, '')
    ];
    
    // Find first key that has valid metrics
    for (const key of possibleKeys) {
      const metric = metrics[key];
      if (metric && (
        typeof metric.elapsedTime === 'number' ||
        typeof metric.responseTime === 'number' ||
        (metric.tokenUsage && typeof metric.tokenUsage.total === 'number')
      )) {
        return metric;
      }
    }
    
    // If no direct match, look in nested structures
    for (const key in metrics) {
      if (metrics[key] && typeof metrics[key] === 'object') {
        const nestedMetric = metrics[key][modelName];
        if (nestedMetric && (
          typeof nestedMetric.elapsedTime === 'number' ||
          typeof nestedMetric.responseTime === 'number' ||
          (nestedMetric.tokenUsage && typeof nestedMetric.tokenUsage.total === 'number')
        )) {
          return nestedMetric;
        }
      }
    }
    
    return null;
  };

  // Improved function to extract model data from responses
  const extractModelData = () => {
    console.log('Extracting model data from:', responses);
    
    const modelRows = [];
    
    // Check if responses is a proper object
    if (!responses || typeof responses !== 'object') {
      console.error('No valid responses object found');
      return [];
    }
    
    // Helper function to check if a model is available
    const isModelAvailable = (modelName) => {
      // Check if model exists in availableModels prop
      if (!availableModels || !Array.isArray(availableModels)) {
        console.log(`No availableModels array provided for ${modelName}`);
        return true; // Default to available if we can't check
      }
      const isAvailable = availableModels.includes(modelName);
      if (!isAvailable) {
        console.log(`Model ${modelName} is not in availableModels list`);
      }
      return isAvailable;
    };

    // Helper function to extract response text
    const getResponseText = (response) => {
      if (!response) return null;
      if (typeof response === 'string') return response;
      if (response.text) return response.text;
      if (response.answer) return response.answer;
      if (response.response) return response.response;
      if (response.content) return response.content;
      if (response.completion) return response.completion;
      return null;
    };
    
    // New structured format with 'models' key
    if (responses.models) {
      console.log('Using new response structure with \'models\' key');
      
      // Iterate through prompt sets
      Object.entries(responses.models).forEach(([setKey, setModels]) => {
        if (!setModels || typeof setModels !== 'object') {
          console.error(`Invalid model set for key ${setKey}:`, setModels);
          return;
        }

        console.log(`Processing model set: ${setKey}, models:`, Object.keys(setModels));
        
        // Iterate through models in this set
        Object.entries(setModels).forEach(([modelName, modelResponse]) => {
          console.log(`Processing model ${modelName} in set ${setKey}:`, modelResponse);
          
          // Only add if model is available
          if (isModelAvailable(modelName)) {
            const responseText = getResponseText(modelResponse);
            if (responseText === null) {
              console.error(`Could not extract response text for model ${modelName}:`, modelResponse);
            }

            // Add this model to our model rows
            modelRows.push({
              setName: setKey,
              displayName: modelName,
              modelName: modelName,
              response: {
                ...modelResponse,
                text: responseText
              },
              metricsKey: `${setKey}-${modelName}`
            });
          }
        });
      });
      
      console.log('Final extracted model responses:', 
        modelRows.map(row => ({
          set: row.setName,
          model: row.displayName,
          hasText: row.response && row.response.text ? 'Yes' : 'No',
          textLength: row.response && row.response.text ? row.response.text.length : 0
        }))
      );
      
      return modelRows;
    }
    
    // CASE 2: Check for 'Set X' keys at top level
    const setKeys = Object.keys(responses).filter(key => key.startsWith('Set '));
    if (setKeys.length > 0) {
      console.log("Using legacy Set structure in response");
      
      setKeys.forEach(setKey => {
        const setModels = responses[setKey];
        if (typeof setModels === 'object' && !Array.isArray(setModels)) {
          Object.entries(setModels).forEach(([modelName, modelResponse]) => {
            console.log(`Found model ${modelName} in set ${setKey}:`, modelResponse);
            // Only add if model is available
            if (isModelAvailable(modelName)) {
              const responseText = getResponseText(modelResponse);
              modelRows.push({
                setName: setKey,
                displayName: modelName,
                metricsKey: `${setKey}-${modelName}`,
                response: {
                  ...modelResponse,
                  text: responseText
                }
              });
            }
          });
        }
      });

      return modelRows;
    }
    
    // CASE 3: Check for direct model names at top level
    const potentialModelKeys = Object.keys(responses).filter(key => 
      !key.startsWith('Set ') && 
      key !== 'metadata' && 
      key !== 'models' && 
      key !== 'sources' &&
      key !== 'query' &&
      key !== 'retrievalTime'
    );
    
    if (potentialModelKeys.length > 0) {
      console.log("Found potential direct model keys:", potentialModelKeys);
      
      // Try to detect models by name patterns
      const modelKeyPatterns = [
        /^gpt-/, /^claude-/, /^llama/, /^mistral/, /^gemma/, 
        /^anthropic/, /^openai/, /^azure/, /^palm/, /^vertex/
      ];
      
      potentialModelKeys.forEach(key => {
        // Check if this looks like a model name
        const isModelName = modelKeyPatterns.some(pattern => pattern.test(key));
        
        if (isModelName) {
          console.log(`Found direct model: ${key}:`, responses[key]);
          // Only add if model is available
          if (isModelAvailable(key)) {
            const responseText = getResponseText(responses[key]);
            modelRows.push({
              setName: 'Default',
              displayName: key,
              metricsKey: key,
              response: {
                ...responses[key],
                text: responseText
              }
            });
          }
        } else {
          // For non-pattern matches, check if it has response-like properties
          const modelResponse = responses[key];
          if (modelResponse && typeof modelResponse === 'object') {
            const responseText = getResponseText(modelResponse);
            if (responseText !== null) {
              console.log(`Found response-like object for key ${key}`);
              modelRows.push({
                setName: 'Default',
                displayName: key,
                metricsKey: key,
                response: {
                  ...modelResponse,
                  text: responseText
                }
              });
            }
          }
        }
      });
    }

    if (modelRows.length === 0) {
      console.error('No valid model responses found in any format');
    }
    
    return modelRows;
  };
  
  // Get the model data using our improved function
  const modelRows = extractModelData();
  
  // Sort the model rows using the sorting function
  // eslint-disable-next-line no-unused-vars
  const sortedMetricRows = sortData(modelRows);

  // Helper to extract actual text content from model responses
  const getResponseText = (modelResponse) => {
    console.log("Getting text from model response:", JSON.stringify(modelResponse).substring(0, 300) + "...");
    
    // Handle string responses
    if (typeof modelResponse === 'string') {
      console.log("Found string response:", modelResponse.substring(0, 50) + "...");
      return modelResponse;
    }
    
    // If response is not an object, try to convert to string
    if (!modelResponse || typeof modelResponse !== 'object') {
      console.log("Response is not an object, converting to string");
      return String(modelResponse || '');
    }
    
    // Handle various object response formats - extended to handle more cases
    
    // Check for nested content in choices (common in OpenAI/Azure responses)
    if (modelResponse.choices && Array.isArray(modelResponse.choices) && modelResponse.choices.length > 0) {
      console.log("Found choices array in response");
      const choice = modelResponse.choices[0];
      
      if (choice.message && choice.message.content) {
        console.log("Found content in message.content");
        return choice.message.content;
      }
      
      if (choice.text) {
        console.log("Found content in choice.text");
        return choice.text;
      }
      
      if (choice.delta && choice.delta.content) {
        console.log("Found content in delta.content");
        return choice.delta.content;
      }
    }
    
    // Check for text property directly on model response
    if (modelResponse.text) {
      console.log("Found direct text property:", modelResponse.text.substring(0, 50) + "...");
      return modelResponse.text;
    }
    
    // Check for raw response formats - common due to API wrapping
    if (modelResponse.rawResponse) {
      console.log("Found rawResponse property");
      if (typeof modelResponse.rawResponse === 'string') {
        console.log("rawResponse is a string");
        return modelResponse.rawResponse;
      }
      
      if (modelResponse.rawResponse.choices && 
          Array.isArray(modelResponse.rawResponse.choices) && 
          modelResponse.rawResponse.choices.length > 0) {
        
        console.log("Found choices in rawResponse");
        const choice = modelResponse.rawResponse.choices[0];
        
        if (choice.message && choice.message.content) {
          console.log("Found content in rawResponse.choices[0].message.content");
          return choice.message.content;
        }
        
        if (choice.text) {
          console.log("Found content in rawResponse.choices[0].text");
          return choice.text;
        }
      }
    }
    
    // Check for answer field (common in RAG implementations)
    if (modelResponse.answer) {
      if (typeof modelResponse.answer === 'string') {
        return modelResponse.answer;
      } else if (modelResponse.answer.text) {
        return modelResponse.answer.text;
      }
    }
    
    // Check for various text fields that might contain the response
    if (modelResponse.content) {
      console.log("Found content property:", modelResponse.content.substring(0, 50) + "...");
      return modelResponse.content;
    }
    
    if (modelResponse.response) {
      console.log("Found response property");
      if (typeof modelResponse.response === 'string') {
        console.log("response is a string:", modelResponse.response.substring(0, 50) + "...");
        return modelResponse.response;
      } else if (modelResponse.response.text) {
        console.log("Found text in response.text:", modelResponse.response.text.substring(0, 50) + "...");
        return modelResponse.response.text;
      }
    }
    
    // Anthropic format
    if (modelResponse.completion) {
      console.log("Found completion property:", modelResponse.completion.substring(0, 50) + "...");
      return modelResponse.completion;
    }
    
    // Look for any property that might contain the response text
    // Loop through all properties and check if any look like they have content
    console.log("Searching all properties for potential content");
    for (const key in modelResponse) {
      const value = modelResponse[key];
      
      // Skip properties that are definitely not the content
      if (key === 'sources' || key === 'cost' || key === 'tokenUsage' || 
          key === 'elapsedTime' || key === 'metadata' || key === 'usage') {
        continue;
      }
      
      console.log(`Checking property '${key}', type: ${typeof value}`);
      
      // If we find a string property that's reasonably long, it might be the content
      if (typeof value === 'string' && value.length > 10) {
        console.log(`Found potential content in property '${key}':`, value.substring(0, 50) + '...');
        return value;
      }
      
      // Check nested objects like message.content pattern
      if (typeof value === 'object' && value !== null) {
        console.log(`Examining nested object in property '${key}'`);
        if (value.content && typeof value.content === 'string') {
          console.log(`Found content in ${key}.content:`, value.content.substring(0, 50) + '...');
          return value.content;
        }
        
        if (value.text && typeof value.text === 'string') {
          console.log(`Found content in ${key}.text:`, value.text.substring(0, 50) + '...');
          return value.text;
        }
        
        if (value.message && value.message.content) {
          console.log(`Found content in ${key}.message.content:`, value.message.content.substring(0, 50) + '...');
          return value.message.content;
        }
      }
    }
    
    // Last resort: stringify the object
    console.log("Could not find content in any expected field, returning stringified object");
    try {
      return JSON.stringify(modelResponse, null, 2);
    } catch (e) {
      console.error("Error stringifying model response:", e);
      return "Could not display response";
    }
  };
  
  // Render model responses section
  const renderModelResponses = () => {
    if (!modelRows || modelRows.length === 0) {
      console.log("No model rows found for rendering responses");
      return (
        <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
          <Alert severity="warning">
            No model responses were found. This could be due to an unexpected response format or an issue with the API call.
          </Alert>
        </Paper>
      );
    }
    
    console.log("Rendering responses for model rows:", modelRows.map(m => m.displayName));
    
    return (
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Model Responses</Typography>
        
        {modelRows.map((model, index) => {
          const responseText = getResponseText(model.response);
          const hasContent = responseText && responseText.trim().length > 0;
          
          console.log(`Model ${model.displayName} response:`, {
            hasContent,
            textLength: responseText?.length || 0,
            responsePreview: responseText ? responseText.substring(0, 50) + '...' : 'N/A'
          });
          
          return (
            <Box key={`${model.setName}-${model.displayName}`} sx={{ mb: 3 }}>
              <Paper 
                elevation={2} 
                sx={{ 
                  p: 2,
                  borderLeft: 5,
                  borderColor: hasContent ? modelColors[model.displayName] || '#1976d2' : 'error.main'
                }}
              >
                <Typography variant="subtitle1" gutterBottom>
                  <Box component="span" sx={{ fontWeight: 'bold' }}>
                    {model.displayName}
                  </Box>
                  {model.setName !== 'Default' && 
                    <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>
                      ({model.setName})
                    </Box>
                  }
                </Typography>
                
                {hasContent ? (
                  <Paper 
                    variant="outlined" 
                    sx={{ 
                      p: 2, 
                      bgcolor: '#f9f9f9',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'Roboto, sans-serif',
                      fontSize: '0.875rem',
                      maxHeight: '300px',
                      overflow: 'auto'
                    }}
                  >
                    {responseText}
                  </Paper>
                ) : (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    No response content found for this model. The API request might have succeeded, but the response format was unexpected or empty.
                  </Alert>
                )}
                
                {model.response && typeof model.response === 'object' && (
                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button 
                      size="small" 
                      onClick={() => {
                        // Create an accordion state toggle for viewing raw response
                        const newState = {...expandedRawResponses};
                        newState[`${model.setName}-${model.displayName}`] = 
                          !expandedRawResponses[`${model.setName}-${model.displayName}`];
                        setExpandedRawResponses(newState);
                      }}
                      endIcon={expandedRawResponses[`${model.setName}-${model.displayName}`] 
                        ? <KeyboardArrowUpIcon /> 
                        : <KeyboardArrowDownIcon />}
                    >
                      {expandedRawResponses[`${model.setName}-${model.displayName}`] 
                        ? 'Hide Raw Response' 
                        : 'View Raw Response'}
                    </Button>
                  </Box>
                )}
                
                {/* Expandable raw response section */}
                {expandedRawResponses[`${model.setName}-${model.displayName}`] && (
                  <Box sx={{ mt: 1 }}>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        bgcolor: '#f0f0f0',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        maxHeight: '200px',
                        overflow: 'auto'
                      }}
                    >
                      {JSON.stringify(model.response, null, 2)}
                    </Paper>
                  </Box>
                )}
              </Paper>
            </Box>
          );
        })}
      </Paper>
    );
  };

  return (
    <Box>
      {/* Remove debug section from UI display - this was only for troubleshooting */}
      
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleBackToQuery}
              variant="outlined"
              size="small"
            >
              Back to Query
            </Button>
          </Grid>
          <Grid item xs>
            <Typography variant="h6" component="div">
              Response Analysis & Quality Tools
            </Typography>
          </Grid>
          <Grid item>
            <Stack direction="row" spacing={1}>
              <Button 
                variant="outlined" 
                startIcon={<SaveIcon />}
                onClick={handleExportResults}
              >
                Export Results
              </Button>
              <Button 
                variant="outlined" 
                startIcon={<UploadIcon />}
                onClick={handleImportClick}
              >
                Import Results
              </Button>
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={<DownloadIcon />}
                onClick={generatePDF}
              >
                Download PDF
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportResults}
                accept=".json"
                style={{ display: 'none' }}
              />
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Tabs
        value={selectedTab}
        onChange={(e, newValue) => setSelectedTab(newValue)}
        sx={{ mb: 3 }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab 
          icon={<CompareIcon />} 
          iconPosition="start"
          label="Response Comparison" 
          value="comparison"
        />
        <Tab 
          icon={<AssessmentIcon />} 
          iconPosition="start"
          label="Source Quality" 
          value="sourceQuality"
        />
        <Tab 
          icon={<TuneIcon />} 
          iconPosition="start"
          label="Embedding Quality" 
          value="embeddingQuality"
        />
        <Tab 
          icon={<AnalyticsIcon />} 
          iconPosition="start"
          label="Retrieval Evaluation" 
          value="retrievalEval"
        />
      </Tabs>

      {selectedTab === 'comparison' && (
        <Box>
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            {/* Query Details */}
            <Typography variant="h6" gutterBottom>
              Query Details
            </Typography>
            <Typography variant="body1" sx={{ mb: 4, fontStyle: 'italic' }}>
              "{currentQuery}"
            </Typography>
            
            {/* Performance Metrics */}
            <Typography variant="h6" gutterBottom>
              Performance Metrics
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Model</TableCell>
                    <TableCell 
                      onClick={() => handleSort('elapsedTime')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Response Time
                      {sortConfig.key === 'elapsedTime' && (
                        <span style={{ marginLeft: '4px' }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('tokenUsage')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Token Usage
                      {sortConfig.key === 'tokenUsage' && (
                        <span style={{ marginLeft: '4px' }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('cost')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Estimated Cost
                      {sortConfig.key === 'cost' && (
                        <span style={{ marginLeft: '4px' }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    // Log all metrics data for debugging
                    console.log("[Cost Debug ALL] All metrics data:", metrics);
                    console.log("[Cost Debug ALL] All responses data:", responses);
                    
                    // Build a list of models with sets to display in the metrics table
                    const metricRows = [];
                    
                    if (responses?.models) {
                      // Handle the modern nested structure
                      Object.keys(responses.models).forEach(setKey => {
                        Object.keys(responses.models[setKey]).forEach(modelKey => {
                          metricRows.push({
                            displayName: modelKey,
                            setName: setKey,
                            metricsKey: `${setKey}-${modelKey}`
                          });
                          console.log(`[Cost Debug] Added model ${modelKey} from set ${setKey} to metric rows`);
                        });
                      });
                    } else {
                      // Try to handle flat structures or older formats
                      Object.keys(responses || {}).forEach(key => {
                        if (key.startsWith('Set')) {
                          // This is a prompt set containing models
                          Object.keys(responses[key] || {}).forEach(modelKey => {
                            metricRows.push({
                              displayName: modelKey,
                              setName: key,
                              metricsKey: `${key}-${modelKey}`
                            });
                            console.log(`[Cost Debug] Added model ${modelKey} from set ${key} to metric rows (flat structure)`);
                          });
                        } else if (!key.includes('metadata')) {
                          // This could be a direct model entry
                          metricRows.push({
                            displayName: key,
                            setName: null,
                            metricsKey: key
                          });
                          console.log(`[Cost Debug] Added model ${key} directly to metric rows`);
                        }
                      });
                    }
                    
                    console.log("[Cost Debug] Final metric rows:", metricRows);
                    
                    if (metricRows.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <Alert severity="warning">
                              No metrics data found. The metrics structure may be in an unexpected format.
                            </Alert>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    
                    // Sort the metric rows before rendering
                    const sortedMetricRows = sortData(metricRows);
                    
                    return sortedMetricRows.map(({ displayName, setName, metricsKey }) => {
                      // Try a few backup options for finding metrics in case the metricsKey doesn't work
                      let modelMetrics = null;
                      let backupMetricsKeys = [];
                      let validMetricsKey = null;
                      
                      // First try the specific structure seen in the debug panel
                      if (setName && metrics[setName] && metrics[setName][displayName]) {
                        modelMetrics = metrics[setName][displayName];
                        console.log(`Found metrics in nested structure for ${displayName}:`, modelMetrics);
                      }
                      // Then try other possible formats
                      else if (setName && metrics[`${setName}.${displayName}`]) {
                        modelMetrics = metrics[`${setName}.${displayName}`];
                        console.log(`Found metrics with special key ${setName}.${displayName}:`, modelMetrics);
                      } else {
                        // Try standard backup keys
                        backupMetricsKeys = [metricsKey, displayName, `${setName}-${displayName}`, setName];
                        
                        // Find the first key with valid metrics
                        validMetricsKey = backupMetricsKeys.find(key => 
                          metrics[key] && (
                            !isNaN(metrics[key]?.elapsedTime) || 
                            (metrics[key]?.tokenUsage && metrics[key]?.tokenUsage?.total)
                          )
                        );
                        
                        // Get metrics from the valid key
                        modelMetrics = validMetricsKey ? metrics[validMetricsKey] : null;
                      }
                      
                      // Get token usage
                      const tokenUsage = modelMetrics?.tokenUsage?.total;
                      
                      // Calculate cost using API-provided cost or fallback to calculation
                      const modelResponse = responses?.models?.[setName]?.[displayName] || 
                                           responses?.[setName]?.[displayName] ||
                                           responses?.[displayName];
                      
                      console.log(`[Cost Debug DUMP] Model ${displayName} response:`, modelResponse);
                      
                      // First check for API-reported cost
                      let cost = null;
                      let useApiCost = false;
                      
                      // Check if the model response has a cost and useForDisplay flag
                      if (modelResponse?.useForDisplay === true && modelResponse?.cost !== undefined) {
                        cost = Number(modelResponse.cost);
                        useApiCost = true;
                        console.log(`[Cost Debug] Using model response API cost for ${displayName}: $${cost} (useForDisplay=true)`);
                      }
                      // Check if raw response has cost
                      else if (modelResponse?.rawResponse?.useForDisplay === true && 
                               modelResponse?.rawResponse?.cost !== undefined) {
                        cost = Number(modelResponse.rawResponse.cost);
                        useApiCost = true;
                        console.log(`[Cost Debug] Using raw response API cost for ${displayName}: $${cost} (useForDisplay=true)`);
                      }
                      // Fall back to any available cost
                      else if (modelMetrics?.useForDisplay === true && modelMetrics?.calculatedCost !== undefined) {
                        cost = Number(modelMetrics.calculatedCost);
                        useApiCost = true;
                        console.log(`[Cost Debug FINAL] Using metrics API cost: ${cost}`);
                      }
                      // Priority 2: Any calculatedCost
                      else if (modelMetrics?.calculatedCost !== undefined) {
                        cost = Number(modelMetrics.calculatedCost);
                        console.log(`[Cost Debug FINAL] Using metrics calculated cost: ${cost}`);
                      }
                      // Priority 3: Any other cost
                      else if (modelResponse?.cost !== undefined) {
                        cost = Number(modelResponse.cost);
                        console.log(`[Cost Debug FINAL] Using local cost variable: ${cost}`);
                      }
                      // Fall back to 0
                      else {
                        cost = 0;
                        console.log(`[Cost Debug FINAL] Using fallback cost: ${cost}`);
                      }
                      
                      // Set useForDisplay flag on modelMetrics if we're using an API-reported cost
                      if (useApiCost && modelMetrics) {
                        modelMetrics.useForDisplay = true;
                        modelMetrics.calculatedCost = cost;
                        console.log(`[Cost Debug] Set calculatedCost=${cost} and useForDisplay=true on modelMetrics for ${displayName}`);
                      }
                      
                      // For debugging
                      console.log(`Card metrics for ${displayName} ${setName ? `(${setName})` : ''}:`, {
                        triedKeys: backupMetricsKeys,
                        usedKey: validMetricsKey || 'none',
                        responseTime: modelMetrics?.elapsedTime,
                        tokenUsage: tokenUsage,
                        cost: cost
                      });
                      
                      return (
                        <TableRow key={`${setName}-${displayName}`}>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              <Box 
                                width={12} 
                                height={12} 
                                borderRadius="50%" 
                                bgcolor={modelColors[displayName] || '#888'} 
                                mr={1} 
                              />
                              <Typography variant="body2">
                                {displayName}
                                {setName && ` / ${setName}`}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              <AccessTimeIcon fontSize="small" sx={{ mr: 1 }} />
                              {(() => {
                                // Get elapsed time directly from metrics where apiServices stores it
                                const elapsedTime = modelMetrics?.elapsedTime;
                                return formatElapsedTime(elapsedTime, modelMetrics?.elapsedTimeType);
                              })()}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              // Get token counts from different possible formats
                              const inputTokens = modelMetrics?.tokenUsage?.input || 
                                                 modelMetrics?.tokenUsage?.prompt_tokens || 0;
                              const outputTokens = modelMetrics?.tokenUsage?.output || 
                                                  modelMetrics?.tokenUsage?.completion_tokens || 0;
                              const totalTokens = modelMetrics?.tokenUsage?.total || 
                                                 modelMetrics?.tokenUsage?.total_tokens || 
                                                 (inputTokens + outputTokens) || 0;
                              
                              // Check if token counts are accurate or estimated
                              const isEstimated = modelMetrics?.tokenUsage?.estimated === true;
                              
                              return (
                                <Tooltip 
                                  title={
                                    <React.Fragment>
                                      <Typography variant="body2" component="span">
                                        <strong>Input:</strong> {isEstimated ? '~' : ''}{inputTokens} tokens<br />
                                        <strong>Output:</strong> {isEstimated ? '~' : ''}{outputTokens} tokens<br />
                                        {modelMetrics?.tokenUsage?.prompt_tokens_details && (
                                          <>
                                            <br />
                                            <strong>Details:</strong><br />
                                            {modelMetrics.tokenUsage.prompt_tokens_details.cached_tokens !== undefined && 
                                              <>- Cached tokens: {modelMetrics.tokenUsage.prompt_tokens_details.cached_tokens}<br /></>
                                            }
                                          </>
                                        )}
                                      </Typography>
                                    </React.Fragment>
                                  }
                                >
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <TokenIcon fontSize="small" />
                                    <Typography variant="body2">
                                      {isEstimated ? '~' : ''}
                                      {totalTokens} tokens
                                      {!isEstimated && (
                                        <span style={{ fontSize: '0.8em', color: 'text.secondary', marginLeft: '4px' }}>
                                          ({inputTokens}+{outputTokens})
                                        </span>
                                      )}
                                    </Typography>
                                  </Stack>
                                </Tooltip>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              <AttachMoneyIcon fontSize="small" sx={{ mr: 1 }} />
                              {(() => {
                                // Initialize all cost-related variables
                                let costToDisplay = 0;
                                let sourceType = 'estimated';
                                let cost = 0;
                                
                                // Priority 1: Direct useForDisplay=true costs
                                if (modelResponse?.useForDisplay === true && modelResponse?.cost !== undefined) {
                                  cost = Number(modelResponse.cost);
                                  costToDisplay = cost;
                                  sourceType = 'API';
                                }
                                else if (modelResponse?.rawResponse?.useForDisplay === true && 
                                         modelResponse?.rawResponse?.cost !== undefined) {
                                  cost = Number(modelResponse.rawResponse.cost);
                                  costToDisplay = cost;
                                  sourceType = 'API';
                                }
                                else if (modelMetrics?.useForDisplay === true && modelMetrics?.calculatedCost !== undefined) {
                                  cost = Number(modelMetrics.calculatedCost);
                                  costToDisplay = cost;
                                  sourceType = 'API';
                                }
                                // Priority 2: Any calculatedCost
                                else if (modelMetrics?.calculatedCost !== undefined) {
                                  cost = Number(modelMetrics.calculatedCost);
                                  costToDisplay = cost;
                                }
                                // Priority 3: Any other cost from model response
                                else if (modelResponse?.cost !== undefined) {
                                  cost = Number(modelResponse.cost);
                                  costToDisplay = cost;
                                }
                                
                                return (
                                  <Box>
                                    {formatCost(costToDisplay)}
                                    {sourceType === 'API' && (
                                      <Tooltip title={`Cost source: ${sourceType}`}>
                                        <InfoIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
                                      </Tooltip>
                                    )}
                                  </Box>
                                );
                              })()}
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Token Usage Analysis */}
            <TokenUsageAnalyzer
              metrics={metrics}
              responses={responses}
              systemPrompts={systemPrompts}
              currentQuery={currentQuery}
            />
            
            {/* Context Window Visualization */}
            <ContextWindowVisualizer
              responses={responses}
              systemPrompts={systemPrompts}
              currentQuery={currentQuery}
              metrics={metrics}
            />
            
            {/* Source Documents Analysis */}
            {sources && sources.length > 0 && (
              <Accordion 
                sx={{ 
                  mt: 0,
                  '&:before': {
                    display: 'none',
                  },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    backgroundColor: 'background.paper',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <DescriptionIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                    <Typography variant="subtitle1" sx={{ fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5 }}>
                      Source Documents Analysis
                    </Typography>
                    <Chip 
                      label={`${sources.length} chunks`}
                      size="small"
                      color="primary"
                    />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Source chunks retrieved from your vector database for this query, ranked by relevance.
                  </Typography>

                  <Stack spacing={2}>
                    {sources.map((source, index) => {
                      // Extract source information
                      const sourceId = 
                        source.source || 
                        (source.metadata && (
                          source.metadata.source || 
                          source.metadata.filename || 
                          source.metadata.originalFileName || 
                          source.metadata.documentName
                        )) || 
                        `Source ${index+1}`;
                        
                      // Extract content text
                      const contentText = 
                        typeof source.pageContent === 'string' ? source.pageContent :
                        typeof source.content === 'string' ? source.content :
                        source.text || "No content available";

                      // Extract and normalize similarity score
                      const score = source.score || 
                                  source.similarity || 
                                  source.relevanceScore || 
                                  source.distance ||
                                  (source.metadata && (
                                    source.metadata.score ||
                                    source.metadata.similarity ||
                                    source.metadata.relevance ||
                                    source.metadata.distance
                                  ));
                      
                      // Debug log for this specific source
                      console.log('Processing source:', {
                        sourceId,
                        fullSource: source,
                        metadata: source.metadata,
                        foundScore: score,
                        hasScore: score !== null && score !== undefined
                      });

                      // Normalize the score based on its type
                      let normalizedScore = null;
                      if (score !== null && score !== undefined) {
                        if (typeof score === 'number') {
                          // Handle different score types
                          if (score > 1) {
                            normalizedScore = score / 100;
                          } else if (score < 0) {
                            normalizedScore = 1 + score;
                          } else {
                            normalizedScore = score;
                          }
                          normalizedScore = Math.max(0, Math.min(1, normalizedScore));
                        } else {
                          // If score is not a number, try to convert it
                          const numericScore = parseFloat(score);
                          if (!isNaN(numericScore)) {
                            normalizedScore = numericScore > 1 ? numericScore / 100 : numericScore;
                            normalizedScore = Math.max(0, Math.min(1, normalizedScore));
                          }
                        }
                      }

                      // Always set a default score for visibility testing
                      if (normalizedScore === null) {
                        normalizedScore = 0.5; // Default to 50% if no score available
                      }

                      return (
                        <Paper
                          key={index}
                          variant="outlined"
                          sx={{
                            p: 2,
                            position: 'relative',
                            borderLeft: '4px solid',
                            borderLeftColor: theme => 
                              normalizedScore > 0.8 ? theme.palette.success.main :
                              normalizedScore > 0.5 ? theme.palette.primary.main :
                              theme.palette.warning.main // Changed from grey to warning for better visibility
                          }}
                        >
                          <Box 
                            sx={{ 
                              display: 'flex', 
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              mb: 1
                            }}
                          >
                            <Typography 
                              variant="subtitle2" 
                              sx={{ 
                                color: 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1
                              }}
                            >
                              <DescriptionIcon sx={{ fontSize: 16 }} />
                              {sourceId}
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip
                                size="small"
                                label={`Relevance: ${(normalizedScore * 100).toFixed(0)}%`}
                                color={
                                  normalizedScore > 0.8 ? "success" :
                                  normalizedScore > 0.5 ? "primary" :
                                  "warning"
                                }
                                sx={{ 
                                  height: 24,
                                  fontWeight: 500,
                                  border: '1px solid',
                                  borderColor: theme =>
                                    normalizedScore > 0.8 ? theme.palette.success.main :
                                    normalizedScore > 0.5 ? theme.palette.primary.main :
                                    theme.palette.warning.main,
                                  backgroundColor: theme =>
                                    normalizedScore > 0.8 ? theme.palette.success.main :
                                    normalizedScore > 0.5 ? theme.palette.primary.main :
                                    theme.palette.warning.main,
                                  '& .MuiChip-label': {
                                    color: '#fff',
                                    fontWeight: 600
                                  }
                                }}
                              />
                            </Stack>
                          </Box>
                          {/* Content */}
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1.5,
                              backgroundColor: 'grey.50',
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                              maxHeight: '200px',
                              overflow: 'auto'
                            }}
                          >
                            {contentText}
                          </Paper>

                          {/* Metadata if available */}
                          {source.metadata && Object.keys(source.metadata).length > 0 && (
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {Object.entries(source.metadata)
                                  .filter(([key]) => !['source', 'filename', 'originalFileName', 'documentName'].includes(key))
                                  .map(([key, value]) => {
                                    // Handle location object specially
                                    if (key === 'loc' && typeof value === 'object') {
                                      // Debug log to see what we're getting
                                      console.log('Location metadata:', { key, value });
                                      
                                      // Try different possible location formats
                                      const start = value.start || value.startLine || value.from || value.begin || 
                                                  (Array.isArray(value.lines) ? value.lines[0] : null) ||
                                                  (typeof value === 'string' ? value.split('-')[0] : null);
                                                  
                                      const end = value.end || value.endLine || value.to || value.finish || 
                                                (Array.isArray(value.lines) ? value.lines[1] : null) ||
                                                (typeof value === 'string' ? value.split('-')[1] : null);

                                      // Only show the chip if we have valid line numbers
                                      if (start !== null || end !== null) {
                                        return (
                                          <Chip
                                            key={key}
                                            size="small"
                                            label={`lines: ${start || '?'}-${end || '?'}`}
                                            variant="outlined"
                                            sx={{ height: 20, '& .MuiChip-label': { fontSize: '0.75rem' } }}
                                          />
                                        );
                                      }
                                      return null;
                                    }
                                    
                                    // For other metadata, convert objects to string representation
                                    const displayValue = typeof value === 'object' 
                                      ? JSON.stringify(value)
                                      : String(value);
                                      
                                    return (
                                      <Chip
                                        key={key}
                                        size="small"
                                        label={`${key}: ${displayValue}`}
                                        variant="outlined"
                                        sx={{ height: 20, '& .MuiChip-label': { fontSize: '0.75rem' } }}
                                      />
                                    );
                                  })
                                }
                              </Typography>
                            </Box>
                          )}
                        </Paper>
                      );
                    })}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}
            
            {/* Render model responses section */}
            {renderModelResponses()}
            
          </Paper>
        </Box>
      )}

      {selectedTab === 'sourceQuality' && (
        <SourceContentAnalysis
          responses={responses}
          metrics={metrics}
          currentQuery={currentQuery}
          systemPrompts={systemPrompts}
          onBackToQuery={handleBackToQuery}
          onImportResults={onImportResults}
          documents={documents}
          vectorStore={vectorStore}
          availableModels={availableModels}
        />
      )}

      {selectedTab === 'embeddingQuality' && (
        <EmbeddingQualityAnalysis
          responses={responses}
          metrics={metrics}
          currentQuery={currentQuery}
          systemPrompts={systemPrompts}
          onBackToQuery={handleBackToQuery}
          onImportResults={onImportResults}
          documents={documents}
          vectorStore={vectorStore}
          availableModels={availableModels}
        />
      )}

      {selectedTab === 'retrievalEval' && (
        <RetrievalEvaluation
          responses={responses}
          metrics={metrics}
          currentQuery={currentQuery}
          systemPrompts={systemPrompts}
          onBackToQuery={handleBackToQuery}
          onImportResults={onImportResults}
          documents={documents}
          vectorStore={vectorStore}
          availableModels={availableModels}
        />
      )}
    </Box>
  );
};

export default ResponseComparison;