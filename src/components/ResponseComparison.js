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
  TableRow
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TokenIcon from '@mui/icons-material/Token';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';

const ResponseComparison = ({ responses, metrics }) => {
  const [expandedSources, setExpandedSources] = useState({});

  const handleSourcesToggle = (model) => {
    setExpandedSources(prev => ({
      ...prev,
      [model]: !prev[model]
    }));
  };

  const formatResponseTime = (ms) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const modelColors = {
    'gpt-3.5-turbo': '#10a37f', // OpenAI green
    'gpt-4-turbo': '#10a37f',
    'claude-3-haiku-20240307': '#5436da', // Anthropic purple
    'claude-3-sonnet-20240229': '#5436da',
    'claude-3-opus-20240229': '#5436da',
    'llama3:8b': '#ff6b6b', // Ollama red
    'llama3:70b': '#ff6b6b',
    'mistral:7b': '#ff6b6b'
  };

  const getModelVendor = (model) => {
    if (model.startsWith('gpt')) {
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

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Response Comparison
      </Typography>

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
                  {responses[model].answer}
                </Typography>
                
                <Accordion 
                  expanded={!!expandedSources[model]}
                  onChange={() => handleSourcesToggle(model)}
                  sx={{ mt: 2 }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center">
                      <DescriptionIcon fontSize="small" sx={{ mr: 1 }} />
                      <Typography>Source Documents ({responses[model].sources.length})</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {Object.entries(getSourcesByNamespace(responses[model].sources)).map(([namespace, sources]) => (
                      <Box key={namespace} mb={2}>
                        <Box display="flex" alignItems="center" mb={1}>
                          <FolderIcon fontSize="small" sx={{ mr: 1 }} />
                          <Typography variant="subtitle2">
                            Namespace: {namespace} ({sources.length} sources)
                          </Typography>
                        </Box>
                        
                        {sources.map((source, idx) => (
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