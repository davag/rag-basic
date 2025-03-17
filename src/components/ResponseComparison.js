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
  Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TokenIcon from '@mui/icons-material/Token';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { calculateCost } from '../utils/apiServices';
import TokenUsageAnalyzer from './TokenUsageAnalyzer';
import ErrorPatternRecognition from './ErrorPatternRecognition';

const ResponseComparison = ({ responses, metrics, currentQuery, systemPrompts, onBackToQuery, onImportResults }) => {
  const [expandedSources, setExpandedSources] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  
  // Reference to the file input element
  const fileInputRef = useRef(null);
  
  // Get sources from the first model (they're the same for all models)
  const sources = Object.values(responses)[0]?.sources || [];

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
    'mistral:latest': '#ff6b6b'
  };

  const getModelVendor = (model) => {
    if (model.startsWith('gpt') || model.startsWith('o1')) {
      return 'OpenAI';
    } else if (model.startsWith('claude')) {
      return 'Anthropic';
    } else if (model.includes('llama') || model.includes('mistral')) {
      return 'Ollama';
    }
    return 'Unknown';
  };

  // Group sources by namespace
  const getSourcesByNamespace = (sources) => {
    const byNamespace = {};
    sources.forEach(source => {
      const namespace = source.namespace || 'default';
      if (!byNamespace[namespace]) {
        byNamespace[namespace] = [];
      }
      byNamespace[namespace].push(source);
    });
    return byNamespace;
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
          window.console.log('Imported results:', importedResults);
        }
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
      } catch (error) {
        window.console.error('Error importing results:', error);
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

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center">
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<ArrowBackIcon />}
            onClick={handleBackToQuery}
            sx={{ mr: 2 }}
          >
            Back to Query
          </Button>
          <Typography variant="h5">
            Response Comparison
          </Typography>
        </Box>
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
      </Box>

      <Box mb={4}>
        <Typography variant="h6" gutterBottom>
          Performance Metrics
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell>Response Time</TableCell>
                <TableCell>Token Usage</TableCell>
                <TableCell>Estimated Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.keys(metrics).map((model) => {
                const cost = calculateCost(model, metrics[model].tokenUsage.total);
                return (
                  <TableRow key={model}>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Box 
                          width={16} 
                          height={16} 
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
                        {formatResponseTime(metrics[model].responseTime)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={`Input: ~${metrics[model].tokenUsage.input} tokens, Output: ~${metrics[model].tokenUsage.output} tokens`}>
                        <Box display="flex" alignItems="center">
                          <TokenIcon fontSize="small" sx={{ mr: 1 }} />
                          {metrics[model].tokenUsage.estimated ? '~' : ''}
                          {metrics[model].tokenUsage.total} tokens
                        </Box>
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
      </Box>

      {/* Token Usage Analyzer */}
      <Box mb={4}>
        <TokenUsageAnalyzer 
          metrics={metrics} 
          responses={responses} 
          systemPrompts={systemPrompts} 
          currentQuery={currentQuery}
        />
      </Box>

      {/* Error Pattern Recognition */}
      <Box mb={4}>
        <ErrorPatternRecognition 
          responses={responses}
          currentQuery={currentQuery}
          systemPrompts={systemPrompts}
        />
      </Box>

      <Typography variant="h6" gutterBottom>
        Model Responses
      </Typography>
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
                title={model}
                subheader={getModelVendor(model)}
                sx={{ pb: 1 }}
              />
              <Divider />
              <CardContent sx={{ pt: 2, pb: 1 }}>
                <Typography 
                  variant="body2" 
                  className="response-content"
                  sx={{ 
                    whiteSpace: 'pre-wrap',
                    mb: 2,
                    minHeight: '200px'
                  }}
                >
                  {typeof responses[model].answer === 'object' && responses[model].answer.text 
                    ? responses[model].answer.text 
                    : responses[model].answer}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'space-between', px: 2, pt: 0 }}>
                <Box>
                  <Chip 
                    icon={<AccessTimeIcon />} 
                    label={formatResponseTime(metrics[model].responseTime)} 
                    size="small"
                    className="metrics-chip"
                  />
                  <Chip 
                    icon={<TokenIcon />} 
                    label={`${metrics[model].tokenUsage.estimated ? '~' : ''}${metrics[model].tokenUsage.total} tokens`} 
                    size="small"
                    className="metrics-chip"
                  />
                </Box>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Source Documents Section - Shared across all models */}
      {sources.length > 0 && (
        <Box mb={4}>
          <Accordion 
            expanded={expandedSources}
            onChange={handleSourcesToggle}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center">
                <DescriptionIcon fontSize="small" sx={{ mr: 1 }} />
                <Typography variant="h6">Source Documents ({sources.length})</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="textSecondary" paragraph>
                These source documents were retrieved from the vector store based on their relevance to your query. 
                The complete text shown below was provided as context to all models to generate their responses. 
                Understanding this context is crucial for evaluating the quality of the responses and for creating 
                effective datasets for RAG applications.
              </Typography>
              
              <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  <strong>How RAG works:</strong> The system finds the most semantically similar documents to your query, 
                  combines them into a context window, and instructs the LLM to answer based only on this provided information. 
                  The quality of responses depends heavily on whether the relevant information is contained in these documents.
                </Typography>
              </Alert>
              
              {Object.entries(getSourcesByNamespace(sources)).map(([namespace, namespaceSources]) => (
                <Box key={namespace} mb={3}>
                  <Box display="flex" alignItems="center" mb={1}>
                    <FolderIcon fontSize="small" sx={{ mr: 1 }} />
                    <Typography variant="subtitle1">
                      Namespace: {namespace} ({namespaceSources.length} sources)
                    </Typography>
                  </Box>
                  
                  {namespaceSources.map((source, idx) => (
                    <Paper 
                      key={idx} 
                      variant="outlined" 
                      sx={{ p: 2, mb: 2, backgroundColor: '#f9f9f9' }}
                    >
                      <Typography variant="subtitle2" gutterBottom>
                        Source: {source.source}
                      </Typography>
                      <Divider sx={{ mb: 2 }} />
                      <Box 
                        sx={{ 
                          maxHeight: '300px', 
                          overflowY: 'auto', 
                          p: 1, 
                          backgroundColor: '#fff',
                          border: '1px solid #eee',
                          borderRadius: 1
                        }}
                      >
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace'
                          }}
                        >
                          {source.content}
                        </Typography>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        </Box>
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