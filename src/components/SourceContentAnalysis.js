import React, { useState } from 'react';
import { 
  Typography, 
  Box, 
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Button,
  Chip,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  IconButton,
  Stack,
  AlertTitle
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionIcon from '@mui/icons-material/Description';
import SummarizeIcon from '@mui/icons-material/Summarize';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import SpellcheckIcon from '@mui/icons-material/Spellcheck';
import ErrorIcon from '@mui/icons-material/Error';
import { createLlmInstance } from '../utils/apiServices';
import {
  Speed as SpeedIcon,
  Storage as StorageIcon,
  TrendingUp as TrendingUpIcon,
  Build as BuildIcon
} from '@mui/icons-material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

/**
 * SourceContentAnalysis Component
 * 
 * Analyzes the quality of source content in documents:
 * 1. Content completeness check
 * 2. Formatting issues detection
 * 3. Readability analysis
 * 4. Key information identification
 */
const SourceContentAnalysis = ({ 
  documents, 
  availableModels
}) => {
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [expandedDocument, setExpandedDocument] = useState({});

  // Toggle document expansion
  const toggleDocumentExpansion = (index) => {
    setExpandedDocument(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Quality check a single document
  const analyzeDocument = async (document, index) => {
    if (!document || !document.pageContent) {
      return { error: 'Invalid document' };
    }

    try {
      const llm = createLlmInstance(selectedModel, 'You are an expert at analyzing document content quality for RAG systems. Provide objective assessments of text quality, formatting, and information completeness.');
      
      // Take a sample of the document if it's too large
      const contentSample = document.pageContent.length > 5000 
        ? document.pageContent.substring(0, 5000) + '...' 
        : document.pageContent;
      
      const prompt = `Analyze this document content for its quality as a knowledge source in a RAG system. 
      Focus on these aspects:
      
      1. Completeness: Does the content appear to be complete, or are there signs of truncation or missing sections?
      2. Formatting: Are there formatting issues, special characters, or other problems that might affect processing?
      3. Informativeness: How informative is the content? Does it provide substantial information or is it sparse?
      4. Credibility: Are there indicators of credibility such as citations, references, or authoritative sourcing?
      5. Key Information: What are the 3-5 most important pieces of information or concepts in this document?
      
      Format your response as structured JSON:
      {
        "completeness": {
          "score": float (1-10),
          "issues": [list of issues or null],
          "assessment": "brief assessment"
        },
        "formatting": {
          "score": float (1-10),
          "issues": [list of issues or null],
          "assessment": "brief assessment"
        },
        "informativeness": {
          "score": float (1-10),
          "assessment": "brief assessment"
        },
        "credibility": {
          "score": float (1-10),
          "indicators": [list of credibility indicators or null],
          "assessment": "brief assessment"
        },
        "keyInfo": [
          "key point 1",
          "key point 2",
          ...
        ],
        "overallQuality": float (1-10),
        "summarySentence": "one sentence summary of the document content"
      }
      
      Document content (source: ${document.metadata?.source || 'unknown'}):
      ${contentSample}`;
      
      const response = await llm.invoke(prompt);
      
      // Extract the JSON from the response
      const jsonMatch = response.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return {
          ...analysis,
          source: document.metadata?.source || 'unknown',
          fileType: document.metadata?.source ? document.metadata.source.split('.').pop().toLowerCase() : 'unknown',
          namespace: document.metadata?.namespace || 'default',
          documentIndex: index
        };
      }
      
      return { error: 'Failed to parse analysis result' };
      
    } catch (error) {
      console.error(`Error analyzing document:`, error);
      return { 
        error: error.message,
        source: document.metadata?.source || 'unknown'
      };
    }
  };

  // Run the full analysis on all documents
  const runAnalysis = async () => {
    if (!documents || documents.length === 0) {
      alert('No documents available to analyze.');
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisResults(null);
    
    try {
      const results = [];
      // Analyze up to 10 documents max to avoid overloading
      const docsToAnalyze = documents.slice(0, 10);
      
      for (let i = 0; i < docsToAnalyze.length; i++) {
        const result = await analyzeDocument(docsToAnalyze[i], i);
        results.push(result);
      }
      
      // Calculate aggregate scores and stats
      const aggregateMetrics = {
        averageCompleteness: 0,
        averageFormatting: 0,
        averageInformativeness: 0,
        averageCredibility: 0,
        averageOverallQuality: 0,
        documentTypes: {},
        commonIssues: {
          completeness: {},
          formatting: {}
        },
        documentCount: results.length,
        totalDocuments: documents.length,
        lowQualityDocs: 0
      };
      
      // Track scores and calculate averages
      let validResults = 0;
      results.forEach(result => {
        if (!result.error && result.overallQuality) {
          validResults++;
          
          aggregateMetrics.averageCompleteness += result.completeness?.score || 0;
          aggregateMetrics.averageFormatting += result.formatting?.score || 0;
          aggregateMetrics.averageInformativeness += result.informativeness?.score || 0;
          aggregateMetrics.averageCredibility += result.credibility?.score || 0;
          aggregateMetrics.averageOverallQuality += result.overallQuality || 0;
          
          // Count file types
          const fileType = result.fileType || 'unknown';
          aggregateMetrics.documentTypes[fileType] = (aggregateMetrics.documentTypes[fileType] || 0) + 1;
          
          // Track if it's a low quality document
          if (result.overallQuality < 5) {
            aggregateMetrics.lowQualityDocs++;
          }
          
          // Track common issues
          if (result.completeness?.issues) {
            result.completeness.issues.forEach(issue => {
              aggregateMetrics.commonIssues.completeness[issue] = 
                (aggregateMetrics.commonIssues.completeness[issue] || 0) + 1;
            });
          }
          
          if (result.formatting?.issues) {
            result.formatting.issues.forEach(issue => {
              aggregateMetrics.commonIssues.formatting[issue] = 
                (aggregateMetrics.commonIssues.formatting[issue] || 0) + 1;
            });
          }
        }
      });
      
      // Calculate averages
      if (validResults > 0) {
        aggregateMetrics.averageCompleteness /= validResults;
        aggregateMetrics.averageFormatting /= validResults;
        aggregateMetrics.averageInformativeness /= validResults;
        aggregateMetrics.averageCredibility /= validResults;
        aggregateMetrics.averageOverallQuality /= validResults;
      }
      
      // Get top issues
      aggregateMetrics.topCompletenessIssues = Object.entries(aggregateMetrics.commonIssues.completeness)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([issue, count]) => ({ issue, count }));
        
      aggregateMetrics.topFormattingIssues = Object.entries(aggregateMetrics.commonIssues.formatting)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([issue, count]) => ({ issue, count }));
      
      setAnalysisResults({
        documentResults: results,
        aggregateMetrics
      });
      
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisResults({
        error: error.message
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper to get quality level color
  const getQualityLevelColor = (score) => {
    if (score >= 8) return '#4caf50'; // Green
    if (score >= 6) return '#8bc34a'; // Light green
    if (score >= 4) return '#ffc107'; // Yellow/amber
    if (score >= 2) return '#ff9800'; // Orange
    return '#f44336'; // Red
  };

  // Helper to get quality level text
  const getQualityLevelText = (score) => {
    if (score >= 8) return 'Excellent';
    if (score >= 6) return 'Good';
    if (score >= 4) return 'Average';
    if (score >= 2) return 'Poor';
    return 'Very Poor';
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        <DescriptionIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Source Content Analysis
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        <AlertTitle>How to use Document Analysis</AlertTitle>
        <Typography variant="body2">
          This tool helps you evaluate the quality of your documents for RAG applications. It analyzes:
          <Stack component="ul" sx={{ mt: 1, mb: 0 }}>
            <li>Content completeness and coherence</li>
            <li>Formatting issues that might affect processing</li>
            <li>Information density and relevance</li>
            <li>Document credibility and authority</li>
          </Stack>
        </Typography>
      </Alert>
      
      {!documents || documents.length === 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No documents available for analysis. Please upload documents first.
        </Alert>
      ) : (
        <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Box display="flex" alignItems="center">
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="analysis-model-label">Analysis Model</InputLabel>
                  <Select
                    labelId="analysis-model-label"
                    id="analysis-model"
                    value={selectedModel}
                    label="Analysis Model"
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {Object.keys(availableModels || {}).filter(model => 
                      availableModels[model].active && 
                      (model.includes('gpt-4') || model.includes('claude'))
                    ).map(model => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))}
                    <MenuItem value="gpt-4o-mini">gpt-4o-mini</MenuItem>
                    <MenuItem value="gpt-4o">gpt-4o</MenuItem>
                  </Select>
                </FormControl>
                <Tooltip title="GPT-4 and Claude models provide more detailed analysis. Use GPT-4o-mini for faster, basic analysis." arrow>
                  <IconButton size="small" sx={{ ml: 1 }}>
                    <HelpOutlineIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                disabled={isAnalyzing || !documents || documents.length === 0}
                onClick={runAnalysis}
                startIcon={isAnalyzing ? <CircularProgress size={20} /> : <SummarizeIcon />}
              >
                {isAnalyzing ? 'Analyzing...' : `Analyze Documents (${documents.length > 10 ? '10 of ' + documents.length : documents.length})`}
              </Button>
            </Grid>
          </Grid>
        </Paper>
      )}
      
      {analysisResults && !analysisResults.error && (
        <Box mt={3}>
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardHeader 
              title={
                <Box display="flex" alignItems="center">
                  <Typography variant="h6">Source Quality Overview</Typography>
                  <Tooltip title="This overview shows aggregate metrics across all analyzed documents. Higher scores indicate better quality for RAG applications." arrow>
                    <IconButton size="small" sx={{ ml: 1 }}>
                      <HelpOutlineIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="subtitle1" gutterBottom>
                        Overall Quality Score
                      </Typography>
                      <Box display="flex" alignItems="center" justifyContent="center" flexDirection="column" pt={2}>
                        <Typography 
                          variant="h2" 
                          component="div" 
                          color={getQualityLevelColor(analysisResults.aggregateMetrics.averageOverallQuality)}
                        >
                          {analysisResults.aggregateMetrics.averageOverallQuality.toFixed(1)}
                        </Typography>
                        <Chip 
                          label={getQualityLevelText(analysisResults.aggregateMetrics.averageOverallQuality)} 
                          sx={{ 
                            bgcolor: getQualityLevelColor(analysisResults.aggregateMetrics.averageOverallQuality), 
                            color: 'white', 
                            mt: 1 
                          }}
                        />
                        <Typography variant="caption" color="textSecondary" mt={1}>
                          From {analysisResults.aggregateMetrics.documentCount} analyzed documents
                          {analysisResults.aggregateMetrics.totalDocuments > analysisResults.aggregateMetrics.documentCount ? 
                            ` (out of ${analysisResults.aggregateMetrics.totalDocuments} total)` : ''}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={12} md={8}>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Quality Dimension</TableCell>
                          <TableCell align="center">Score</TableCell>
                          <TableCell>Quality Level</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow>
                          <TableCell>Completeness</TableCell>
                          <TableCell align="center">{analysisResults.aggregateMetrics.averageCompleteness.toFixed(1)}</TableCell>
                          <TableCell>
                            <Chip 
                              size="small"
                              label={getQualityLevelText(analysisResults.aggregateMetrics.averageCompleteness)} 
                              sx={{ 
                                bgcolor: getQualityLevelColor(analysisResults.aggregateMetrics.averageCompleteness), 
                                color: 'white' 
                              }}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Formatting</TableCell>
                          <TableCell align="center">{analysisResults.aggregateMetrics.averageFormatting.toFixed(1)}</TableCell>
                          <TableCell>
                            <Chip 
                              size="small"
                              label={getQualityLevelText(analysisResults.aggregateMetrics.averageFormatting)} 
                              sx={{ 
                                bgcolor: getQualityLevelColor(analysisResults.aggregateMetrics.averageFormatting), 
                                color: 'white' 
                              }}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Informativeness</TableCell>
                          <TableCell align="center">{analysisResults.aggregateMetrics.averageInformativeness.toFixed(1)}</TableCell>
                          <TableCell>
                            <Chip 
                              size="small"
                              label={getQualityLevelText(analysisResults.aggregateMetrics.averageInformativeness)} 
                              sx={{ 
                                bgcolor: getQualityLevelColor(analysisResults.aggregateMetrics.averageInformativeness), 
                                color: 'white' 
                              }}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Credibility</TableCell>
                          <TableCell align="center">{analysisResults.aggregateMetrics.averageCredibility.toFixed(1)}</TableCell>
                          <TableCell>
                            <Chip 
                              size="small"
                              label={getQualityLevelText(analysisResults.aggregateMetrics.averageCredibility)} 
                              sx={{ 
                                bgcolor: getQualityLevelColor(analysisResults.aggregateMetrics.averageCredibility), 
                                color: 'white' 
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
                
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" gutterBottom>
                    <PriorityHighIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#ff9800' }} />
                    Common Issues Detected
                  </Typography>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Content Completeness Issues
                        </Typography>
                        {analysisResults.aggregateMetrics.topCompletenessIssues.length > 0 ? (
                          <List dense>
                            {analysisResults.aggregateMetrics.topCompletenessIssues.map((issue, idx) => (
                              <ListItem key={idx}>
                                <ListItemText 
                                  primary={issue.issue} 
                                  secondary={`Found in ${issue.count} document${issue.count !== 1 ? 's' : ''}`} 
                                />
                              </ListItem>
                            ))}
                          </List>
                        ) : (
                          <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                            No major completeness issues detected
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Formatting Issues
                        </Typography>
                        {analysisResults.aggregateMetrics.topFormattingIssues.length > 0 ? (
                          <List dense>
                            {analysisResults.aggregateMetrics.topFormattingIssues.map((issue, idx) => (
                              <ListItem key={idx}>
                                <ListItemText 
                                  primary={issue.issue} 
                                  secondary={`Found in ${issue.count} document${issue.count !== 1 ? 's' : ''}`} 
                                />
                              </ListItem>
                            ))}
                          </List>
                        ) : (
                          <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                            No major formatting issues detected
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                  </Grid>
                </Grid>
                
                <Grid item xs={12}>
                  <Box 
                    mt={1} 
                    p={2} 
                    bgcolor={analysisResults.aggregateMetrics.lowQualityDocs > 0 ? '#fff3e0' : '#e8f5e9'} 
                    borderRadius={1}
                  >
                    {analysisResults.aggregateMetrics.lowQualityDocs > 0 ? (
                      <Box display="flex" alignItems="center">
                        <WarningIcon color="warning" sx={{ mr: 1 }} />
                        <Typography>
                          <strong>{analysisResults.aggregateMetrics.lowQualityDocs}</strong> document
                          {analysisResults.aggregateMetrics.lowQualityDocs !== 1 ? 's' : ''} with 
                          poor quality were detected (score below 5). These may affect your RAG system's performance.
                        </Typography>
                      </Box>
                    ) : (
                      <Box display="flex" alignItems="center">
                        <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                        <Typography>
                          All analyzed documents meet basic quality standards. No critical issues detected.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
          
          <Box display="flex" alignItems="center" mb={2}>
            <Typography variant="h6">
              <SpellcheckIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Individual Document Analysis
            </Typography>
            <Tooltip title="Click on each document to see detailed analysis results and specific recommendations for improvement." arrow>
              <IconButton size="small" sx={{ ml: 1 }}>
                <HelpOutlineIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Understanding the scores:</strong>
              <Stack component="ul" sx={{ mt: 1, mb: 0 }}>
                <li><strong>8-10:</strong> Excellent - Ideal for RAG systems</li>
                <li><strong>6-7.9:</strong> Good - Suitable with minor improvements</li>
                <li><strong>4-5.9:</strong> Average - May need significant improvements</li>
                <li><strong>Below 4:</strong> Poor - Consider revising or replacing content</li>
              </Stack>
            </Typography>
          </Alert>

          {analysisResults.documentResults.map((result, index) => (
            <Accordion 
              key={index} 
              expanded={expandedDocument[index] || false}
              onChange={() => toggleDocumentExpansion(index)}
              sx={{ 
                mb: 2,
                border: result.error ? '1px solid #f44336' : 
                  (result.overallQuality < 5 ? '1px solid #ff9800' : 'none')
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" width="100%">
                  <Typography fontWeight="medium" sx={{ flexGrow: 1 }}>
                    {result.error ? (
                      <Box display="flex" alignItems="center">
                        <ErrorIcon color="error" sx={{ mr: 1 }} />
                        <span>Error analyzing {result.source || `Document ${index + 1}`}</span>
                      </Box>
                    ) : (
                      <Box display="flex" alignItems="center">
                        <span>
                          {result.source || `Document ${index + 1}`}
                        </span>
                        {!result.error && (
                          <Chip 
                            size="small"
                            label={result.overallQuality.toFixed(1)}
                            sx={{ 
                              ml: 2,
                              bgcolor: getQualityLevelColor(result.overallQuality), 
                              color: 'white'
                            }}
                          />
                        )}
                      </Box>
                    )}
                  </Typography>
                  {!result.error && (
                    <Typography variant="body2" color="textSecondary" sx={{ mr: 2 }}>
                      {result.summarySentence}
                    </Typography>
                  )}
                </Box>
              </AccordionSummary>
              
              {!result.error ? (
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                          <Box display="flex" alignItems="center">
                            <Typography variant="subtitle1" gutterBottom>
                              Content Quality Scores
                            </Typography>
                            <Tooltip title="These scores evaluate different aspects of document quality. Hover over each score for specific recommendations." arrow>
                              <IconButton size="small" sx={{ ml: 1 }}>
                                <HelpOutlineIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          <TableContainer>
                            <Table size="small">
                              <TableBody>
                                <TableRow>
                                  <TableCell>
                                    <Tooltip title="Measures whether the content is complete and well-structured" arrow>
                                      <span>Completeness</span>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell>
                                    <Chip 
                                      size="small"
                                      label={result.completeness.score.toFixed(1)}
                                      sx={{ 
                                        bgcolor: getQualityLevelColor(result.completeness.score), 
                                        color: 'white'
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>{result.completeness.assessment}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell>
                                    <Tooltip title="Evaluates the formatting and presentation of the content" arrow>
                                      <span>Formatting</span>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell>
                                    <Chip 
                                      size="small"
                                      label={result.formatting.score.toFixed(1)}
                                      sx={{ 
                                        bgcolor: getQualityLevelColor(result.formatting.score), 
                                        color: 'white'
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>{result.formatting.assessment}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell>
                                    <Tooltip title="Assesses the level of detail and depth of the content" arrow>
                                      <span>Informativeness</span>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell>
                                    <Chip 
                                      size="small"
                                      label={result.informativeness.score.toFixed(1)}
                                      sx={{ 
                                        bgcolor: getQualityLevelColor(result.informativeness.score), 
                                        color: 'white'
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>{result.informativeness.assessment}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell>
                                    <Tooltip title="Evaluates the credibility and trustworthiness of the content" arrow>
                                      <span>Credibility</span>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell>
                                    <Chip 
                                      size="small"
                                      label={result.credibility.score.toFixed(1)}
                                      sx={{ 
                                        bgcolor: getQualityLevelColor(result.credibility.score), 
                                        color: 'white'
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>{result.credibility.assessment}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </CardContent>
                      </Card>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                          <Typography variant="subtitle1" gutterBottom>
                            Key Information
                          </Typography>
                          <List dense>
                            {result.keyInfo.map((info, idx) => (
                              <ListItem key={idx}>
                                <ListItemText primary={info} />
                              </ListItem>
                            ))}
                          </List>
                        </CardContent>
                      </Card>
                    </Grid>
                    
                    {(result.completeness.issues?.length > 0 || result.formatting.issues?.length > 0) && (
                      <Grid item xs={12}>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#fff3e0' }}>
                          <Box display="flex" alignItems="center">
                            <Typography variant="subtitle2" color="warning.main" gutterBottom>
                              <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                              Issues Detected
                            </Typography>
                            <Tooltip title="These issues may affect your RAG system's performance. Consider addressing them to improve results." arrow>
                              <IconButton size="small" sx={{ ml: 1 }}>
                                <HelpOutlineIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          
                          <Grid container spacing={2}>
                            {result.completeness.issues?.length > 0 && (
                              <Grid item xs={12} md={6}>
                                <Typography variant="body2" fontWeight="medium">
                                  Completeness Issues:
                                </Typography>
                                <List dense disablePadding>
                                  {result.completeness.issues.map((issue, idx) => (
                                    <ListItem key={idx} sx={{ py: 0 }}>
                                      <ListItemText 
                                        primary={<Typography variant="body2">• {issue}</Typography>} 
                                      />
                                    </ListItem>
                                  ))}
                                </List>
                              </Grid>
                            )}
                            
                            {result.formatting.issues?.length > 0 && (
                              <Grid item xs={12} md={6}>
                                <Typography variant="body2" fontWeight="medium">
                                  Formatting Issues:
                                </Typography>
                                <List dense disablePadding>
                                  {result.formatting.issues.map((issue, idx) => (
                                    <ListItem key={idx} sx={{ py: 0 }}>
                                      <ListItemText 
                                        primary={<Typography variant="body2">• {issue}</Typography>} 
                                      />
                                    </ListItem>
                                  ))}
                                </List>
                              </Grid>
                            )}
                          </Grid>
                        </Paper>
                      </Grid>
                    )}

                    <Grid item xs={12}>
                      <Alert severity="info">
                        <AlertTitle>Improvement Tips</AlertTitle>
                        <Typography variant="body2">
                          To improve this document's quality:
                          <List dense>
                            {result.completeness.score < 8 && (
                              <ListItem>
                                <ListItemText primary="Completeness: Check for missing sections, incomplete sentences, or abrupt endings." />
                              </ListItem>
                            )}
                            {result.formatting.score < 8 && (
                              <ListItem>
                                <ListItemText primary="Formatting: Fix any irregular spacing, inconsistent formatting, or special character issues." />
                              </ListItem>
                            )}
                            {result.informativeness.score < 8 && (
                              <ListItem>
                                <ListItemText primary="Informativeness: Add more specific details, examples, or explanations to enrich the content." />
                              </ListItem>
                            )}
                            {result.credibility.score < 8 && (
                              <ListItem>
                                <ListItemText primary="Credibility: Include references, citations, or source attributions to enhance authority." />
                              </ListItem>
                            )}
                          </List>
                        </Typography>
                      </Alert>
                    </Grid>
                  </Grid>
                </AccordionDetails>
              ) : (
                <AccordionDetails>
                  <Alert severity="error">
                    {result.error}
                  </Alert>
                </AccordionDetails>
              )}
            </Accordion>
          ))}
        </Box>
      )}
      
      {analysisResults && analysisResults.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Analysis failed: {analysisResults.error}
        </Alert>
      )}
      
      {isAnalyzing && (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
};

export default SourceContentAnalysis; 