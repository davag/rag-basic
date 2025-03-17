import React, { useState } from 'react';
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
  Button
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TokenIcon from '@mui/icons-material/Token';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import DownloadIcon from '@mui/icons-material/Download';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const ResponseComparison = ({ responses, metrics, currentQuery, systemPrompts }) => {
  const [expandedSources, setExpandedSources] = useState(false);
  
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
    
    // Create a simple table manually instead of using autoTable
    const metricsData = Object.keys(metrics).map(model => [
      `${model} (${getModelVendor(model)})`,
      formatResponseTime(metrics[model].responseTime),
      `${metrics[model].tokenUsage.estimated ? '~' : ''}${metrics[model].tokenUsage.total} tokens`
    ]);
    
    // Table headers
    doc.setFontSize(11);
    doc.text('Model', margin, yPos);
    doc.text('Response Time', margin + 80, yPos);
    doc.text('Token Usage', margin + 150, yPos);
    yPos += 7;
    
    // Draw a line under headers
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;
    
    // Table rows
    doc.setFontSize(10);
    metricsData.forEach((row, index) => {
      doc.text(row[0], margin, yPos);
      doc.text(row[1], margin + 80, yPos);
      doc.text(row[2], margin + 150, yPos);
      yPos += 7;
      
      // Draw a light line between rows
      if (index < metricsData.length - 1) {
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

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">
          Response Comparison
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<DownloadIcon />}
          onClick={generatePDF}
        >
          Download Report
        </Button>
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
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.keys(metrics).map((model) => (
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
                    <Box display="flex" alignItems="center">
                      <TokenIcon fontSize="small" sx={{ mr: 1 }} />
                      {metrics[model].tokenUsage.estimated ? '~' : ''}
                      {metrics[model].tokenUsage.total} tokens
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

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
                These source documents were used as context for all model responses.
              </Typography>
              
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
                      <Typography variant="body2">
                        {source.content}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

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
    </Box>
  );
};

export default ResponseComparison; 