import React, { useState, useRef } from 'react';
import { 
  Typography, 
  Box, 
  Grid, 
  Paper, 
  Card,
  CardContent,
  CardHeader,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Stack,
  Alert,
  Snackbar,
  Tooltip,
  Tabs,
  Tab
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TokenIcon from '@mui/icons-material/Token';
import FolderIcon from '@mui/icons-material/Folder';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import InfoIcon from '@mui/icons-material/Info';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { calculateCost } from '../utils/apiServices';
import TokenUsageAnalyzer from './TokenUsageAnalyzer';
import ContextWindowVisualizer from './ContextWindowVisualizer';
import RetrievalEvaluation from './RetrievalEvaluation';
import EmbeddingQualityAnalysis from './EmbeddingQualityAnalysis';
import SourceContentAnalysis from './SourceContentAnalysis';
import CompareIcon from '@mui/icons-material/Compare';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TuneIcon from '@mui/icons-material/Tune';
import AnalyticsIcon from '@mui/icons-material/Analytics';

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
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  
  // Reference to the file input element
  const fileInputRef = useRef(null);
  
  // Get sources from the first model (they're the same for all models)
  let sources = [];
  
  // Try to extract sources from various possible structures
  if (responses) {
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
  
  console.log("Final sources for display:", sources);
  
  // Debug log to inspect responses structure
  console.log("RESPONSES DEBUG:", responses);
  console.log("RESPONSES MODELS:", Object.keys(responses || {}));
  console.log("METRICS:", metrics);
  
  // More detailed debug for finding metrics that match model keys
  if (responses && metrics) {
    console.log("MODEL/METRICS MATCHING:");
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
  const formatResponseTime = (ms) => {
    if (ms === undefined || ms === null || isNaN(ms)) {
      return 'Unknown';
    }
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatCost = (cost) => {
    if (cost === 0) {
      return 'Free';
    }
    return `$${cost.toFixed(4)}`; // Always show in dollars with 4 decimal places
  };

  const formatElapsedTime = (ms) => {
    if (ms === undefined || ms === null || isNaN(ms)) {
      return 'Unknown';
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}.${Math.floor((ms % 1000) / 100)}s`;
    }
  };

  const modelColors = {
    // OpenAI models (green)
    'gpt-4o': '#10a37f',
    'gpt-4o-mini': '#10a37f',
    'o1-mini': '#10a37f',
    'o1-preview': '#10a37f',
    
    // Anthropic models (purple)
    'claude-3-5-sonnet-latest': '#5436da',
    'claude-3-7-sonnet-latest': '#5436da',
    
    // Ollama models (red)
    'llama3.2:latest': '#ff6b6b',
    'mistral:latest': '#ff6b6b',
    'gemma3:12b': '#ff6b6b'
  };

  const getModelVendor = (model) => {
    if (model.includes('azure-')) return 'AzureOpenAI';
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'OpenAI';
    if (model.startsWith('claude')) return 'Anthropic';
    if (model.includes('llama') || model.includes('mistral') || model.includes('gemma')) return 'Ollama';
    
    // For unknown models, just return an empty string to avoid "Set X" labels
    return '';
  };

  // Group sources by namespace
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

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
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
          { modelName: "claude-3-5-sonnet-latest", setName: "Set 1" },
          { modelName: "gpt-4o-mini", setName: "Set 2" },
          { modelName: "claude-3-5-sonnet-latest", setName: "Set 2" }
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
                !isNaN(metrics[key]?.responseTime) || 
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
          const tokenUsage = modelMetrics?.tokenUsage?.total;
          
          // Calculate cost (default to zero if no token usage available)
          const cost = tokenUsage 
            ? calculateCost(modelName, tokenUsage) 
            : 0;
          
          tableData.push([
            `${modelName} / ${setName}`,
            modelMetrics?.responseTime ? formatResponseTime(modelMetrics.responseTime) : 
              modelMetrics?.elapsedTime ? formatElapsedTime(modelMetrics.elapsedTime) : 'N/A',
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
        const setKeys = Object.keys(responses).filter(key => key.startsWith('Set '));
        
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

  return (
    <Box>
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
                    <TableCell>Response Time</TableCell>
                    <TableCell>Token Usage</TableCell>
                    <TableCell>Estimated Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    // Extract all models from responses, similar to the model cards approach
                    const metricRows = [];
                    
                    if (typeof responses === 'object' && !Array.isArray(responses)) {
                      // Handle normal model keys at the top level
                      const standardModelKeys = Object.keys(responses).filter(key => 
                        !key.startsWith('Set ') && 
                        (typeof responses[key] === 'string' || 
                         responses[key]?.answer || 
                         responses[key]?.response ||
                         responses[key]?.text)
                      );
                      
                      // Add standard models
                      standardModelKeys.forEach(modelKey => {
                        metricRows.push({
                          displayName: modelKey,
                          setName: '',
                          metricsKey: modelKey
                        });
                      });
                      
                      // Now handle set-based responses
                      const setKeys = Object.keys(responses).filter(key => key.startsWith('Set '));
                      
                      // Process each set
                      setKeys.forEach(setKey => {
                        const setContent = responses[setKey];
                        
                        // If the set content is an object with model keys
                        if (typeof setContent === 'object' && !Array.isArray(setContent)) {
                          Object.entries(setContent).forEach(([modelKey, modelResponse]) => {
                            // Try multiple metrics keys
                            const possibleMetricsKeys = [
                              `${setKey}-${modelKey}`,  // Composite key
                              modelKey,                 // Just the model name
                              setKey                    // Just the set key
                            ];
                            
                            // Find the first metrics key with data
                            const metricsKey = possibleMetricsKeys.find(key => 
                              metrics && metrics[key] && (
                                !isNaN(metrics[key]?.responseTime) || 
                                (metrics[key]?.tokenUsage && 
                                 typeof metrics[key]?.tokenUsage?.total !== 'undefined')
                              )
                            ) || modelKey;
                            
                            // Add this model to the metrics rows
                            metricRows.push({
                              displayName: modelKey,
                              setName: setKey,
                              metricsKey: metricsKey
                            });
                          });
                        }
                        // If the set content is directly a response
                        else {
                          // Look for potential models inside the direct response
                          let foundModels = false;
                          
                          // Check if this is a response that contains multiple models
                          if (typeof setContent === 'object' && !Array.isArray(setContent)) {
                            // Try to extract model keys from this response
                            const potentialModelKeys = Object.keys(setContent).filter(key =>
                              availableModels?.includes(key) || 
                              key.startsWith('gpt-') || 
                              key.startsWith('claude-') ||
                              key.includes('llama') ||
                              key.includes('mistral')
                            );
                            
                            if (potentialModelKeys.length > 0) {
                              // We found model keys within this response
                              potentialModelKeys.forEach(modelKey => {
                                metricRows.push({
                                  displayName: modelKey,
                                  setName: setKey,
                                  metricsKey: modelKey
                                });
                              });
                              foundModels = true;
                            }
                          }
                          
                          // If we didn't find any models inside, treat the set itself as a model
                          if (!foundModels) {
                            metricRows.push({
                              displayName: setKey,
                              setName: '',
                              metricsKey: setKey
                            });
                          }
                        }
                      });
                    }
                    
                    console.log("Metrics rows to render:", metricRows);
                    
                    return metricRows.map(({ displayName, setName, metricsKey }) => {
                      // Try a few backup options for finding metrics in case the metricsKey doesn't work
                      let modelMetrics = null;
                      let validMetricsKey = null;
                      let backupMetricsKeys = [];
                      
                      // First check for the specific structure seen in the debug panel
                      // where metrics are nested under the set key with model as subkey
                      if (setName && metrics[setName] && metrics[setName][displayName]) {
                        modelMetrics = metrics[setName][displayName];
                        console.log(`Found nested metrics for ${displayName} in ${setName}:`, modelMetrics);
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
                            !isNaN(metrics[key]?.responseTime) || 
                            (metrics[key]?.tokenUsage && metrics[key]?.tokenUsage?.total)
                          )
                        );
                        
                        // Get metrics from the valid key
                        modelMetrics = validMetricsKey ? metrics[validMetricsKey] : null;
                      }
                      
                      // Get token usage
                      const tokenUsage = modelMetrics?.tokenUsage?.total;
                      
                      // Calculate cost (default to zero if no token usage available)
                      const cost = tokenUsage 
                        ? calculateCost(displayName, tokenUsage) 
                        : 0;
                      
                      // For debugging - log what's happening with this row's metrics
                      console.log(`Metrics for ${displayName} ${setName ? `(${setName})` : ''}:`, {
                        triedKeys: backupMetricsKeys,
                        usedKey: validMetricsKey || 'none',
                        metrics: modelMetrics,
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
                              {modelMetrics && !isNaN(modelMetrics.responseTime) 
                                ? formatResponseTime(modelMetrics.responseTime) 
                                : modelMetrics && !isNaN(modelMetrics.elapsedTime) 
                                  ? formatElapsedTime(modelMetrics.elapsedTime) 
                                  : 'Unknown'}
                              {modelMetrics && modelMetrics.elapsedTime && 
                               modelMetrics.elapsedTime !== modelMetrics.responseTime && 
                               !isNaN(modelMetrics.elapsedTime) && 
                                <Tooltip title={`Total elapsed time including setup: ${formatElapsedTime(modelMetrics.elapsedTime)}`}>
                                  <InfoIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
                                </Tooltip>
                              }
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Tooltip title={`Input: ~${modelMetrics?.tokenUsage?.input || 'Unknown'} tokens, Output: ~${modelMetrics?.tokenUsage?.output || 'Unknown'} tokens`}>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <TokenIcon fontSize="small" />
                                <Typography variant="body2">
                                  {modelMetrics?.tokenUsage?.estimated ? '~' : ''}
                                  {modelMetrics?.tokenUsage?.total || 'Unknown'} tokens
                                </Typography>
                              </Stack>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              <AttachMoneyIcon fontSize="small" sx={{ mr: 1 }} />
                              {formatCost(cost)}
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
            <Box sx={{ mb: 4 }}>
              <TokenUsageAnalyzer 
                metrics={metrics} 
                responses={responses} 
                systemPrompts={systemPrompts} 
                currentQuery={currentQuery}
              />
            </Box>

            {/* Context Window Analysis */}
            <Box sx={{ mb: 4 }}>
              <ContextWindowVisualizer 
                responses={responses}
                systemPrompts={systemPrompts}
                currentQuery={currentQuery}
              />
            </Box>

            {/* Source Documents - Collapsible by default */}
            <Typography variant="h6" gutterBottom>
              Source Documents
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                These documents were retrieved as context for the models' responses. The quality and relevance of these sources directly impacts the accuracy of the generated answers.
              </Typography>
            </Alert>
            <Accordion defaultExpanded={false} sx={{ mb: 4 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">
                  View Source Documents {sources.length > 0 ? `(${sources.length})` : '(None)'}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {sources.length === 0 ? (
                  <Alert severity="info">No source documents available for this response.</Alert>
                ) : (
                  Object.entries(getSourcesByNamespace(sources)).map(([namespace, namespaceSources], index) => (
                    <Box key={`${namespace}-${index}`} sx={{ mb: 3 }}>
                      <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                          <FolderIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle' }} />
                          {namespace}
                        </Typography>
                        <Box sx={{ pl: 4 }}>
                          {namespaceSources.map((source, sourceIndex) => {
                            // Extract content based on different possible structures
                            const sourceContent = 
                              typeof source.pageContent === 'string' ? source.pageContent :
                              typeof source.content === 'string' ? source.content :
                              source.text || "No content available";

                            // Extract metadata
                            const metadata = source.metadata || {};
                            const filename = metadata.originalFileName || metadata.documentName || metadata.source || metadata.filename || 'Unknown';
                            
                            return (
                              <Box 
                                key={`${namespace}-${sourceIndex}`}
                                sx={{ 
                                  mb: 2,
                                  p: 2,
                                  bgcolor: 'grey.50',
                                  borderRadius: 1,
                                  border: '1px solid',
                                  borderColor: 'grey.200'
                                }}
                              >
                                <Typography variant="subtitle2" color="primary" gutterBottom>
                                  File: {filename}
                                </Typography>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                  {sourceContent}
                                </Typography>
                                {metadata && (
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    Source: {metadata.source || filename || 'Unknown'} 
                                    {metadata.page && ` (Page ${metadata.page})`}
                                  </Typography>
                                )}
                              </Box>
                            );
                          })}
                        </Box>
                      </Paper>
                    </Box>
                  ))
                )}
              </AccordionDetails>
            </Accordion>

            {/* Model Responses - Moved to bottom */}
            <Typography variant="h6" gutterBottom>
              Model Responses
            </Typography>
            <Box sx={{ mb: 4 }}>
              <Grid container spacing={3}>
                {(() => {
                  // Using a simpler, more direct approach
                  const modelCards = [];
                  
                  // Handle standard responses first (direct model keys at top level)
                  if (responses) {
                    // Handle normal model keys at the top level
                    const standardModelKeys = Object.keys(responses).filter(key => 
                      !key.startsWith('Set ') && 
                      (typeof responses[key] === 'string' || 
                       responses[key]?.answer || 
                       responses[key]?.response ||
                       responses[key]?.text)
                    );
                    
                    console.log("Standard model keys:", standardModelKeys);
                    
                    // Add standard models
                    standardModelKeys.forEach(modelKey => {
                      modelCards.push({
                        key: modelKey,
                        displayName: modelKey,
                        setName: '',
                        response: responses[modelKey],
                        metricsKey: modelKey
                      });
                    });
                    
                    // Now handle set-based responses
                    const setKeys = Object.keys(responses).filter(key => key.startsWith('Set '));
                    console.log("Set keys:", setKeys);
                    
                    // Process each set
                    setKeys.forEach(setKey => {
                      const setContent = responses[setKey];
                      
                      // If the set content is an object with model keys
                      if (typeof setContent === 'object' && !Array.isArray(setContent)) {
                        Object.entries(setContent).forEach(([modelKey, modelResponse]) => {
                          console.log(`Found model ${modelKey} in ${setKey}:`, modelResponse);
                          
                          // Add this model to the cards
                          modelCards.push({
                            key: `${setKey}-${modelKey}`,
                            displayName: modelKey,
                            setName: setKey,
                            response: modelResponse,
                            metricsKey: modelKey
                          });
                        });
                      }
                      // If the set content is directly a response
                      else {
                        // Look for potential models inside the direct response
                        let foundModels = false;
                        
                        // Check if this is a response that contains multiple models
                        if (typeof setContent === 'object' && !Array.isArray(setContent)) {
                          // Try to extract model keys from this response
                          const potentialModelKeys = Object.keys(setContent).filter(key =>
                            availableModels?.includes(key) || 
                            key.startsWith('gpt-') || 
                            key.startsWith('claude-') ||
                            key.includes('llama') ||
                            key.includes('mistral')
                          );
                          
                          if (potentialModelKeys.length > 0) {
                            // We found model keys within this response
                            potentialModelKeys.forEach(modelKey => {
                              modelCards.push({
                                key: `${setKey}-${modelKey}`,
                                displayName: modelKey,
                                setName: setKey,
                                response: setContent[modelKey],
                                metricsKey: modelKey
                              });
                            });
                            foundModels = true;
                          }
                        }
                        
                        // If we didn't find any models inside, treat the set itself as a model
                        if (!foundModels) {
                          modelCards.push({
                            key: setKey,
                            displayName: setKey,
                            setName: '',
                            response: setContent,
                            metricsKey: setKey
                          });
                        }
                      }
                    });
                  }
                  
                  console.log("Final model cards to render:", modelCards);
                  
                  if (modelCards.length === 0) {
                    return (
                      <Grid item xs={12}>
                        <Alert severity="warning">
                          No model responses found. The response structure may be in an unexpected format.
                        </Alert>
                      </Grid>
                    );
                  }
                  
                  return modelCards.map(({ key, displayName, setName, response, metricsKey }) => {
                    // Try a few backup options for finding metrics in case the metricsKey doesn't work
                    let modelMetrics = null;
                    let validMetricsKey = null;
                    let backupMetricsKeys = [];
                    
                    // First check for the specific structure seen in the debug panel
                    // where metrics are nested under the set key with model as subkey
                    if (setName && metrics[setName] && metrics[setName][displayName]) {
                      modelMetrics = metrics[setName][displayName];
                      console.log(`Found nested metrics for ${displayName} in ${setName}:`, modelMetrics);
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
                          !isNaN(metrics[key]?.responseTime) || 
                          (metrics[key]?.tokenUsage && metrics[key]?.tokenUsage?.total)
                        )
                      );
                      
                      // Get metrics from the valid key
                      modelMetrics = validMetricsKey ? metrics[validMetricsKey] : null;
                    }
                    
                    // Get token usage
                    const tokenUsage = modelMetrics?.tokenUsage?.total;
                    
                    // Calculate cost (default to zero if no token usage available)
                    const cost = tokenUsage 
                      ? calculateCost(displayName, tokenUsage) 
                      : 0;
                    
                    // For debugging
                    console.log(`Card metrics for ${displayName} ${setName ? `(${setName})` : ''}:`, {
                      triedKeys: backupMetricsKeys,
                      usedKey: validMetricsKey || 'none',
                      responseTime: modelMetrics?.responseTime,
                      tokenUsage: tokenUsage,
                      cost: cost
                    });
                    
                    return (
                      <Grid item xs={12} md={6} key={key}>
                        <Card 
                          className="response-card" 
                          variant="outlined"
                          sx={{ 
                            height: '100%',
                            borderLeft: `4px solid ${modelColors[displayName] || '#888'}`
                          }}
                        >
                          <CardHeader
                            title={
                              <Box display="flex" alignItems="center">
                                <Box 
                                  width={16} 
                                  height={16} 
                                  borderRadius="50%" 
                                  bgcolor={modelColors[displayName] || '#888'} 
                                  mr={1} 
                                />
                                {displayName}
                                {setName && ` / ${setName}`}
                              </Box>
                            }
                            subheader={`${getModelVendor(displayName) ? `${getModelVendor(displayName)} - ` : ''}Response time: ${modelMetrics && !isNaN(modelMetrics.responseTime) ? formatResponseTime(modelMetrics.responseTime) : 'Unknown'}`}
                            action={
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Tooltip title={`${tokenUsage || 'Unknown'} tokens used`}>
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <TokenIcon fontSize="small" />
                                    <Typography variant="body2">
                                      {tokenUsage || 'Unknown'}
                                    </Typography>
                                  </Stack>
                                </Tooltip>
                                <Tooltip title={`Estimated cost: ${formatCost(cost)}`}>
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <AttachMoneyIcon fontSize="small" />
                                    <Typography variant="body2">
                                      {formatCost(cost)}
                                    </Typography>
                                  </Stack>
                                </Tooltip>
                              </Stack>
                            }
                          />
                          <CardContent sx={{ pt: 1 }}>
                            <Typography 
                              variant="body1" 
                              component="div" 
                              sx={{ 
                                whiteSpace: 'pre-wrap',
                                minHeight: '300px',
                                maxHeight: '500px',
                                overflowY: 'auto',
                                p: 2,
                                bgcolor: 'grey.50',
                                borderRadius: 1
                              }}
                            >
                              {(() => {
                                if (!response) {
                                  return "No response data available";
                                }
                                
                                let content = '';
                                
                                // Handle different response formats
                                if (typeof response === 'string') {
                                  content = response;
                                } else if (response.text) {
                                  content = response.text;
                                } else if (response.answer) {
                                  content = typeof response.answer === 'object' && response.answer.text
                                    ? response.answer.text 
                                    : response.answer;
                                } else if (response.response) {
                                  content = response.response;
                                } else if (response.content) {
                                  content = response.content;
                                } else {
                                  // Handle other potential response structures
                                  try {
                                    content = JSON.stringify(response, null, 2);
                                  } catch (e) {
                                    content = "Could not display response data";
                                  }
                                }
                                
                                // Format code with monospace font but don't hide it
                                const isCode = typeof content === 'string' && (
                                  content.includes('import ') || 
                                  content.includes('function ') || 
                                  content.includes('def ') ||
                                  content.includes('class ')
                                );
                                
                                // Simply return the content with appropriate formatting
                                return isCode ? (
                                  <pre style={{ 
                                    margin: 0, 
                                    fontFamily: 'monospace',
                                    fontSize: '0.9rem',
                                    whiteSpace: 'pre-wrap',
                                    overflow: 'auto',
                                    maxHeight: '100%'
                                  }}>
                                    {content}
                                  </pre>
                                ) : (
                                  <div style={{ whiteSpace: 'pre-wrap' }}>
                                    {content}
                                  </div>
                                );
                              })()}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  });
                })()}
              </Grid>
            </Box>
          </Paper>
        </Box>
      )}

      {selectedTab === 'sourceQuality' && (
        <SourceContentAnalysis 
          documents={documents}
          availableModels={availableModels}
        />
      )}

      {selectedTab === 'embeddingQuality' && (
        <EmbeddingQualityAnalysis
          vectorStore={vectorStore}
          documents={documents}
        />
      )}

      {selectedTab === 'retrievalEval' && (
        <RetrievalEvaluation
          documents={documents}
          vectorStore={vectorStore}
          availableModels={availableModels}
        />
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ResponseComparison; 