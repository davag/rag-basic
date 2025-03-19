import React, { useState, useRef } from 'react';
import { 
  Typography, 
  Box, 
  Grid, 
  Paper, 
  Chip,
  Divider,
  Card,
  CardContent,
  CardHeader,
  CardActions,
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
  Tab,
  Collapse
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TokenIcon from '@mui/icons-material/Token';
import DescriptionIcon from '@mui/icons-material/Description';
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
  const [expandedSources, setExpandedSources] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  
  // Reference to the file input element
  const fileInputRef = useRef(null);
  
  // Get sources from the first model (they're the same for all models)
  const sources = Object.values(responses)[0]?.sources || [];

  // Add new state variables
  const [showRetrievalEval, setShowRetrievalEval] = useState(false);
  const [showEmbeddingAnalysis, setShowEmbeddingAnalysis] = useState(false);
  const [showSourceAnalysis, setShowSourceAnalysis] = useState(false);
  const [selectedTab, setSelectedTab] = useState('comparison');

  const handleSourcesToggle = () => {
    setExpandedSources(!expandedSources);
  };

  const formatResponseTime = (ms) => {
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
    if (!ms) return '';
    
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
    return 'Unknown';
  };

  // Group sources by namespace
  const getSourcesByNamespace = (sources) => {
    if (!Array.isArray(sources)) return [];
    
    return sources.reduce((acc, source) => {
      const namespace = source.metadata?.namespace || 'default';
      if (!acc.find(ns => ns.name === namespace)) {
        acc.push({
          name: namespace,
          sources: []
        });
      }
      acc.find(ns => ns.name === namespace).sources.push(source);
      return acc;
    }, []);
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
    // Create a new jsPDF instance
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    // Title
    doc.setFontSize(18);
    doc.text('RAG Query Report', margin, 20);
    
    // Query
    doc.setFontSize(14);
    doc.text('Query', margin, 30);
    doc.setFontSize(12);
    const queryLines = doc.splitTextToSize(currentQuery || 'No query provided', contentWidth);
    doc.text(queryLines, margin, 40);
    
    let yPos = 40 + (queryLines.length * 7);
    
    // System Prompts
    if (systemPrompts) {
      yPos += 10;
      doc.setFontSize(14);
      doc.text('System Prompts', margin, yPos);
      yPos += 10;
      doc.setFontSize(12);
      
      Object.entries(systemPrompts).forEach(([model, prompt]) => {
        if (Object.keys(responses).includes(model)) {
          doc.setFontSize(12);
          doc.text(`${model} (${getModelVendor(model)})`, margin, yPos);
          yPos += 7;
          
          const promptLines = doc.splitTextToSize(prompt, contentWidth);
          doc.setFontSize(10);
          doc.text(promptLines, margin, yPos);
          yPos += (promptLines.length * 5) + 10;
          
          // Add a new page if we're getting close to the bottom
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
        }
      });
    }
    
    // Performance Metrics
    doc.addPage();
    yPos = 20;
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
    Object.keys(metrics)
      .filter(key => !['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(key))
      .forEach((model, index) => {
        const cost = calculateCost(model, metrics[model]?.tokenUsage?.total || 0);
        const costText = formatCost(cost);
        
        doc.text(model, margin, yPos);
        const metric = metrics[model] || {};
        doc.text(metrics[model] ? (metrics[model].elapsedTime ? formatElapsedTime(metrics[model].elapsedTime) : metrics[model].responseTime ? formatResponseTime(metrics[model].responseTime) : 'N/A') : 'N/A', margin + 60, yPos);
        doc.text(`${metric.tokenUsage?.estimated ? '~' : ''}${metric.tokenUsage?.total || 'Unknown'} tokens`, margin + 120, yPos);
        doc.text(costText, margin + 180, yPos);
        yPos += 7;
        
        // Draw a light line between rows
        if (index < Object.keys(metrics).length - 1) {
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 3;
        }
      });
    
    yPos += 15;
    
    // Model Responses
    doc.setFontSize(14);
    doc.text('Model Responses', margin, yPos);
    yPos += 10;
    
    Object.keys(responses).forEach((model, index) => {
      // Add a new page for each model response
      if (index > 0 || yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text(`${model} (${getModelVendor(model)})`, margin, yPos);
      yPos += 7;
      
      const answer = typeof responses[model].answer === 'object' && responses[model].answer.text 
        ? responses[model].answer.text 
        : responses[model].answer;
      
      const answerLines = doc.splitTextToSize(answer, contentWidth);
      doc.setFontSize(10);
      doc.text(answerLines, margin, yPos);
      yPos += (answerLines.length * 5) + 15;
    });
    
    // Sources
    if (sources && sources.length > 0) {
      doc.addPage();
      yPos = 20;
      doc.setFontSize(14);
      doc.text(`Source Documents (${sources.length})`, margin, yPos);
      yPos += 10;
      
      const sourcesByNamespace = getSourcesByNamespace(sources);
      
      Object.entries(sourcesByNamespace).forEach(([namespace, namespaceSources]) => {
        // Add a new page if we're getting close to the bottom
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(12);
        doc.text(`Namespace: ${namespace} (${namespaceSources.length} sources)`, margin, yPos);
        yPos += 7;
        
        namespaceSources.forEach((source, idx) => {
          // Add a new page if we're getting close to the bottom
          if (yPos > 250) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.setFontSize(10);
          doc.text(`Source: ${source.source}`, margin, yPos);
          yPos += 5;
          
          const contentLines = doc.splitTextToSize(source.content, contentWidth);
          doc.setFontSize(9);
          doc.text(contentLines, margin, yPos);
          yPos += (contentLines.length * 5) + 10;
        });
      });
    }
    
    // Save the PDF
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    doc.save(`rag-report-${timestamp}.pdf`);
  };

  const handleBackToQuery = () => {
    if (onBackToQuery && typeof onBackToQuery === 'function') {
      onBackToQuery();
    }
  };

  // Add new handlers
  const handleRetrievalEvalComplete = (results) => {
    console.log('Retrieval evaluation complete:', results);
    // Handle results as needed
  };

  const handleEmbeddingAnalysisComplete = (results) => {
    console.log('Embedding analysis complete:', results);
    // Handle results as needed
  };

  const handleSourceAnalysisComplete = (results) => {
    console.log('Source analysis complete:', results);
    // Handle results as needed
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
                  {Object.keys(metrics)
                    .filter(key => !['systemPrompts', 'temperatures', 'retrievalTime', 'query'].includes(key))
                    .map((model) => {
                      const cost = calculateCost(model, metrics[model]?.tokenUsage?.total || 0);
                      return (
                        <TableRow key={model}>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              <Box 
                                width={12} 
                                height={12} 
                                borderRadius="50%" 
                                bgcolor={modelColors[model] || '#888'} 
                                mr={1} 
                              />
                              <Typography variant="body2">
                                {model} ({getModelVendor(model)})
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              <AccessTimeIcon fontSize="small" sx={{ mr: 1 }} />
                              {metrics[model] && metrics[model].responseTime ? formatResponseTime(metrics[model].responseTime) : 'Unknown'}
                              {metrics[model] && metrics[model].elapsedTime && metrics[model].elapsedTime !== metrics[model].responseTime && 
                                <Tooltip title={`Total elapsed time including setup: ${formatElapsedTime(metrics[model].elapsedTime)}`}>
                                  <InfoIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
                                </Tooltip>
                              }
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Tooltip title={`Input: ~${metrics[model]?.tokenUsage?.input || 'Unknown'} tokens, Output: ~${metrics[model]?.tokenUsage?.output || 'Unknown'} tokens`}>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <TokenIcon fontSize="small" />
                                <Typography variant="body2">
                                  {metrics[model]?.tokenUsage?.estimated ? '~' : ''}
                                  {metrics[model]?.tokenUsage?.total || 'Unknown'} tokens
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
                    })}
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
                <Typography variant="subtitle1">View Source Documents</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {getSourcesByNamespace(sources).map((namespace, index) => (
                  <Box key={`${namespace.name}-${index}`} sx={{ mb: 3 }}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                        <FolderIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle' }} />
                        {namespace.name}
                      </Typography>
                      <Box sx={{ pl: 4 }}>
                        {namespace.sources.map((source, sourceIndex) => (
                          <Box 
                            key={`${namespace.name}-${sourceIndex}`}
                            sx={{ 
                              mb: 2,
                              p: 2,
                              bgcolor: 'grey.50',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'grey.200'
                            }}
                          >
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                              {source.content}
                            </Typography>
                            {source.metadata && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Document: {source.metadata.documentName || 'Unknown'}
                                <br />
                                Original File Name: {source.metadata.originalFileName || 'Unknown'}
                                <br />
                                Source: {source.metadata.source || 'Unknown'} 
                                {source.metadata.page && ` (Page ${source.metadata.page})`}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                    </Paper>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>

            {/* Model Responses - Moved to bottom */}
            <Typography variant="h6" gutterBottom>
              Model Responses
            </Typography>
            <Box sx={{ mb: 4 }}>
              <Grid container spacing={3}>
                {Object.keys(responses).map((model) => (
                  <Grid item xs={12} md={6} key={model}>
                    <Card 
                      className="response-card" 
                      variant="outlined"
                      sx={{ 
                        height: '100%',
                        borderLeft: `4px solid ${modelColors[model] || '#888'}`
                      }}
                    >
                      <CardHeader
                        title={
                          <Box display="flex" alignItems="center">
                            <Box 
                              width={16} 
                              height={16} 
                              borderRadius="50%" 
                              bgcolor={modelColors[model] || '#888'} 
                              mr={1} 
                            />
                            {model}
                          </Box>
                        }
                        subheader={`${getModelVendor(model)} - Response time: ${formatResponseTime(metrics[model]?.responseTime)}`}
                        action={
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Tooltip title={`${metrics[model]?.tokenUsage?.total || 'Unknown'} tokens used`}>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <TokenIcon fontSize="small" />
                                <Typography variant="body2">
                                  {metrics[model]?.tokenUsage?.total || 'Unknown'}
                                </Typography>
                              </Stack>
                            </Tooltip>
                            <Tooltip title={`Estimated cost: ${formatCost(calculateCost(model, metrics[model]?.tokenUsage?.total || 0))}`}>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <AttachMoneyIcon fontSize="small" />
                                <Typography variant="body2">
                                  {formatCost(calculateCost(model, metrics[model]?.tokenUsage?.total || 0))}
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
                          {typeof responses[model].answer === 'object' && responses[model].answer.text 
                            ? responses[model].answer.text 
                            : responses[model].answer || responses[model].response}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
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