import React, { useState } from 'react';
import { 
  Typography, 
  Box, 
  Grid, 
  Paper, 
  Card, 
  CardContent, 
  CardHeader,
  Divider, 
  Button, 
  TextField,
  Chip,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { createLlmInstance } from '../utils/apiServices';
import { defaultModels } from '../config/llmConfig';

/**
 * RetrievalEvaluation Component
 * 
 * Evaluates the quality of retrieval results using various metrics:
 * 1. Relevance - How relevant are the retrieved chunks to the query
 * 2. Diversity - How diverse are the retrieved chunks
 * 3. Precision - What percentage of retrieved chunks are actually relevant
 * 4. Recall - Are we missing important chunks that should be retrieved
 */
const RetrievalEvaluation = ({ 
  documents, 
  vectorStore, 
  availableModels,
  onEvaluationComplete 
}) => {
  // Helper function to get default model
  const getDefaultModel = () => {
    // If availableModels is an array
    if (Array.isArray(availableModels) && availableModels.length > 0) {
      // Find the first chat model in the array
      const chatModelId = availableModels.find(modelId => 
        defaultModels[modelId] && defaultModels[modelId].type === 'chat'
      );
      if (chatModelId) {
        return chatModelId;
      }
    }
    // If availableModels is an object
    else if (availableModels && typeof availableModels === 'object' && !Array.isArray(availableModels)) {
      // Find the first active chat model
      const firstActiveChatModel = Object.entries(availableModels)
        .find(([_, config]) => config.active && config.type === 'chat');
      
      if (firstActiveChatModel) {
        return firstActiveChatModel[0];
      }
    }
    
    // Fallback to gpt-4o-mini if nothing else is available
    return 'gpt-4o-mini';
  };

  const [queryText, setQueryText] = useState('');
  const [evaluationResults, setEvaluationResults] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState(['relevance', 'diversity', 'precision']);
  const [numQueries, setNumQueries] = useState(5);
  const [evaluationModel, setEvaluationModel] = useState(getDefaultModel());
  const [reportExpanded, setReportExpanded] = useState({});

  // Generate a set of test queries based on the document content
  const generateTestQueries = async () => {
    if (!documents || documents.length === 0) {
      return [];
    }

    setIsEvaluating(true);
    
    try {
      // Use a LLM to generate test queries based on document content
      const llm = createLlmInstance(evaluationModel, 'You are an expert at generating test queries for a retrieval system. Your goal is to create diverse and challenging queries that will test different aspects of retrieval quality.');
      
      // Get a sample of document content to base queries on
      const sampleDocs = documents.slice(0, 5).map(doc => doc.pageContent.substring(0, 500));
      
      const prompt = `Based on the following document excerpts, create ${numQueries} diverse test queries that would challenge a retrieval system. 
      Create a mix of:
      - Factual queries that have clear answers in the text
      - Queries requiring synthesis of information across documents
      - Edge cases where relevant information might be sparse
      
      Generate queries in this JSON format (just the array):
      [
        "query 1",
        "query 2",
        ...
      ]
      
      Document excerpts:
      ${sampleDocs.join('\n\n---\n\n')}`;
      
      const response = await llm.invoke(prompt);
      
      // Parse the response to extract just the JSON array
      const jsonMatch = response.match(/(\[[\s\S]*\])/);
      if (jsonMatch) {
        const queries = JSON.parse(jsonMatch[0]);
        return queries;
      }
      
      return [];
    } catch (error) {
      console.error("Error generating test queries:", error);
      return [];
    }
  };

  // Evaluate the retrieval quality for a single query
  const evaluateQuery = async (query) => {
    try {
      // Use vectorStore to retrieve relevant chunks
      const retrievalResults = await vectorStore.similaritySearch(query, 5);
      
      // Use LLM to evaluate the quality of these retrieved chunks
      const llm = createLlmInstance(evaluationModel, 'You are an expert at evaluating retrieval quality. Provide objective analysis of how well retrieved chunks match a query.');
      
      const metrics = {};
      
      if (selectedMetrics.includes('relevance')) {
        // Evaluate relevance of each chunk
        const relevancePrompt = `Query: ${query}
        
        Retrieved chunks:
        ${retrievalResults.map((result, i) => `Chunk ${i+1}: ${result.pageContent.substring(0, 300)}...`).join('\n\n')}
        
        On a scale of 1-10, rate the relevance of each chunk to the query. Then provide an overall relevance score and brief explanation.
        Format your response as JSON:
        {
          "chunkScores": [score1, score2, ...],
          "overallScore": float,
          "explanation": "explanation"
        }`;
        
        const relevanceResponse = await llm.invoke(relevancePrompt);
        
        // Extract the JSON from the response
        const relevanceJson = relevanceResponse.match(/(\{[\s\S]*\})/);
        if (relevanceJson) {
          metrics.relevance = JSON.parse(relevanceJson[0]);
        }
      }
      
      if (selectedMetrics.includes('diversity')) {
        // Evaluate diversity of chunks
        const diversityPrompt = `Query: ${query}
        
        Retrieved chunks:
        ${retrievalResults.map((result, i) => `Chunk ${i+1}: ${result.pageContent.substring(0, 200)}...`).join('\n\n')}
        
        Evaluate the diversity of these chunks. Are they providing different information or are they redundant?
        Format your response as JSON:
        {
          "diversityScore": float, 
          "redundancyPairs": [[chunk_i, chunk_j], ...],
          "explanation": "explanation"
        }`;
        
        const diversityResponse = await llm.invoke(diversityPrompt);
        
        // Extract the JSON from the response
        const diversityJson = diversityResponse.match(/(\{[\s\S]*\})/);
        if (diversityJson) {
          metrics.diversity = JSON.parse(diversityJson[0]);
        }
      }
      
      if (selectedMetrics.includes('precision')) {
        // Evaluate precision
        const precisionPrompt = `Query: ${query}
        
        Retrieved chunks:
        ${retrievalResults.map((result, i) => `Chunk ${i+1}: ${result.pageContent.substring(0, 200)}...`).join('\n\n')}
        
        For each chunk, determine if it is actually relevant to answering the query (true/false).
        Format your response as JSON:
        {
          "relevantChunks": [true/false, true/false, ...],
          "precisionScore": float,
          "explanation": "explanation"
        }`;
        
        const precisionResponse = await llm.invoke(precisionPrompt);
        
        // Extract the JSON from the response
        const precisionJson = precisionResponse.match(/(\{[\s\S]*\})/);
        if (precisionJson) {
          metrics.precision = JSON.parse(precisionJson[0]);
        }
      }
      
      return {
        query,
        retrievedChunks: retrievalResults.map(r => ({
          content: r.pageContent.substring(0, 200) + '...',
          metadata: r.metadata
        })),
        metrics
      };
      
    } catch (error) {
      console.error(`Error evaluating query "${query}":`, error);
      return {
        query,
        error: error.message,
        retrievedChunks: [],
        metrics: {}
      };
    }
  };

  // Run the full evaluation
  const runEvaluation = async () => {
    if (!vectorStore) {
      alert('Vector store is not available. Please create one first.');
      return;
    }
    
    setIsEvaluating(true);
    setEvaluationResults(null);
    
    try {
      // Generate test queries if none provided
      let queries = [];
      if (queryText.trim()) {
        // User provided a custom query
        queries = [queryText.trim()];
      } else {
        // Generate test queries
        queries = await generateTestQueries();
      }
      
      if (queries.length === 0) {
        throw new Error('No queries to evaluate');
      }
      
      // Evaluate each query
      const results = [];
      for (const query of queries) {
        const result = await evaluateQuery(query);
        results.push(result);
      }
      
      // Calculate aggregate scores
      const aggregateScores = {
        relevance: 0,
        diversity: 0,
        precision: 0,
        overall: 0,
        queryCount: results.length
      };
      
      let relevanceCount = 0;
      let diversityCount = 0;
      let precisionCount = 0;
      
      for (const result of results) {
        if (result.metrics.relevance) {
          aggregateScores.relevance += result.metrics.relevance.overallScore;
          relevanceCount++;
        }
        
        if (result.metrics.diversity) {
          aggregateScores.diversity += result.metrics.diversity.diversityScore;
          diversityCount++;
        }
        
        if (result.metrics.precision) {
          aggregateScores.precision += result.metrics.precision.precisionScore;
          precisionCount++;
        }
      }
      
      if (relevanceCount > 0) {
        aggregateScores.relevance = aggregateScores.relevance / relevanceCount;
      }
      
      if (diversityCount > 0) {
        aggregateScores.diversity = aggregateScores.diversity / diversityCount;
      }
      
      if (precisionCount > 0) {
        aggregateScores.precision = aggregateScores.precision / precisionCount;
      }
      
      // Calculate overall score (weighted average)
      let overallDivisor = 0;
      let overallSum = 0;
      
      if (relevanceCount > 0) {
        overallSum += aggregateScores.relevance * 0.5;  // Relevance has the highest weight
        overallDivisor += 0.5;
      }
      
      if (diversityCount > 0) {
        overallSum += aggregateScores.diversity * 0.25;
        overallDivisor += 0.25;
      }
      
      if (precisionCount > 0) {
        overallSum += aggregateScores.precision * 0.25;
        overallDivisor += 0.25;
      }
      
      if (overallDivisor > 0) {
        aggregateScores.overall = overallSum / overallDivisor;
      }
      
      setEvaluationResults({
        queries: results,
        aggregateScores
      });
      
      if (onEvaluationComplete) {
        onEvaluationComplete({
          queries: results,
          aggregateScores
        });
      }
      
    } catch (error) {
      console.error('Evaluation error:', error);
      setEvaluationResults({
        error: error.message,
        queries: [],
        aggregateScores: {}
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  // Get quality level text and color based on score
  const getQualityLevel = (score) => {
    if (score >= 8) return { text: 'Excellent', color: '#4caf50' };
    if (score >= 7) return { text: 'Good', color: '#8bc34a' };
    if (score >= 5) return { text: 'Average', color: '#ffc107' };
    if (score >= 3) return { text: 'Poor', color: '#ff9800' };
    return { text: 'Very Poor', color: '#f44336' };
  };

  // Handle toggling report sections
  const toggleReportSection = (index) => {
    setReportExpanded({
      ...reportExpanded,
      [index]: !reportExpanded[index]
    });
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        <AssessmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Retrieval Evaluation
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        Evaluate the quality of your retrieval system using AI-powered metrics.
      </Typography>
      
      {!vectorStore && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Vector store not available. Load documents and create a vector store first.
        </Alert>
      )}
      
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              <TuneIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Evaluation Settings
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Custom Query (optional)"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Enter a specific query to evaluate, or leave blank to auto-generate test queries"
              variant="outlined"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="eval-model-label">Evaluation Model</InputLabel>
              <Select
                labelId="eval-model-label"
                id="eval-model"
                value={evaluationModel}
                label="Evaluation Model"
                onChange={(e) => setEvaluationModel(e.target.value)}
              >
                {/* Handle both array and object formats for availableModels */}
                {availableModels && typeof availableModels === 'object' && !Array.isArray(availableModels) ?
                  // If availableModels is an object with model configurations
                  Object.entries(availableModels)
                    .filter(([_, config]) => 
                      // Only include active chat models
                      config.active && config.type === 'chat'
                    )
                    .map(([model, config]) => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))
                  : 
                  // If availableModels is an array of model IDs
                  Array.isArray(availableModels) ?
                    availableModels
                      .filter(modelId => 
                        // Only include models that exist in defaultModels and are chat models
                        defaultModels[modelId] && defaultModels[modelId].type === 'chat'
                      )
                      .map(modelId => (
                        <MenuItem key={modelId} value={modelId}>
                          {modelId}
                        </MenuItem>
                      ))
                    :
                    // Fallback options if no models are available
                    [
                      <MenuItem key="gpt-4o-mini" value="gpt-4o-mini">gpt-4o-mini</MenuItem>,
                      <MenuItem key="gpt-4o" value="gpt-4o">gpt-4o</MenuItem>
                    ]
                }
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="metrics-label">Evaluation Metrics</InputLabel>
              <Select
                labelId="metrics-label"
                id="metrics-select"
                multiple
                value={selectedMetrics}
                label="Evaluation Metrics"
                onChange={(e) => setSelectedMetrics(e.target.value)}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value.charAt(0).toUpperCase() + value.slice(1)} />
                    ))}
                  </Box>
                )}
              >
                <MenuItem value="relevance">Relevance</MenuItem>
                <MenuItem value="diversity">Diversity</MenuItem>
                <MenuItem value="precision">Precision</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Number of Test Queries"
              type="number"
              value={numQueries}
              onChange={(e) => setNumQueries(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              InputProps={{
                inputProps: { min: 1, max: 10 }
              }}
              helperText="How many test queries to auto-generate (1-10)"
              disabled={!!queryText.trim()}
            />
          </Grid>
          
          <Grid item xs={12}>
            <Button
              variant="contained"
              color="primary"
              disabled={isEvaluating || !vectorStore}
              onClick={runEvaluation}
              startIcon={isEvaluating ? <CircularProgress size={20} /> : <AssessmentIcon />}
              fullWidth
            >
              {isEvaluating ? 'Evaluating...' : 'Run Evaluation'}
            </Button>
          </Grid>
        </Grid>
      </Paper>
      
      {evaluationResults && !evaluationResults.error && (
        <Box mt={3}>
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardHeader 
              title="Overall Retrieval Quality"
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <Box textAlign="center" p={2}>
                    <Typography variant="h2" component="div" gutterBottom sx={{ color: getQualityLevel(evaluationResults.aggregateScores.overall).color }}>
                      {evaluationResults.aggregateScores.overall.toFixed(1)}
                    </Typography>
                    <Typography variant="subtitle1">
                      Overall Score
                    </Typography>
                    <Chip 
                      label={getQualityLevel(evaluationResults.aggregateScores.overall).text} 
                      sx={{ bgcolor: getQualityLevel(evaluationResults.aggregateScores.overall).color, color: 'white', mt: 1 }}
                    />
                  </Box>
                </Grid>
                
                <Grid item xs={12} md={9}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Metric</TableCell>
                          <TableCell align="center">Score</TableCell>
                          <TableCell>Quality</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedMetrics.includes('relevance') && (
                          <TableRow>
                            <TableCell>Relevance</TableCell>
                            <TableCell align="center">{evaluationResults.aggregateScores.relevance.toFixed(2)}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small"
                                label={getQualityLevel(evaluationResults.aggregateScores.relevance).text} 
                                sx={{ bgcolor: getQualityLevel(evaluationResults.aggregateScores.relevance).color, color: 'white' }}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                        
                        {selectedMetrics.includes('diversity') && (
                          <TableRow>
                            <TableCell>Diversity</TableCell>
                            <TableCell align="center">{evaluationResults.aggregateScores.diversity.toFixed(2)}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small"
                                label={getQualityLevel(evaluationResults.aggregateScores.diversity).text} 
                                sx={{ bgcolor: getQualityLevel(evaluationResults.aggregateScores.diversity).color, color: 'white' }}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                        
                        {selectedMetrics.includes('precision') && (
                          <TableRow>
                            <TableCell>Precision</TableCell>
                            <TableCell align="center">{evaluationResults.aggregateScores.precision.toFixed(2)}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small"
                                label={getQualityLevel(evaluationResults.aggregateScores.precision).text} 
                                sx={{ bgcolor: getQualityLevel(evaluationResults.aggregateScores.precision).color, color: 'white' }}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                        
                        <TableRow>
                          <TableCell>Queries Evaluated</TableCell>
                          <TableCell align="center" colSpan={2}>{evaluationResults.aggregateScores.queryCount}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
          
          <Typography variant="h6" gutterBottom>
            Detailed Query Results
          </Typography>
          
          {evaluationResults.queries.map((query, index) => (
            <Accordion 
              key={index} 
              expanded={reportExpanded[index] || false}
              onChange={() => toggleReportSection(index)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
              >
                <Typography fontWeight="medium">
                  Query {index + 1}: {query.query.substring(0, 100)}{query.query.length > 100 ? '...' : ''}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box mb={2}>
                  <Typography variant="subtitle1" gutterBottom>
                    Retrieved Chunks
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>#</TableCell>
                          <TableCell>Content</TableCell>
                          <TableCell>Source</TableCell>
                          {selectedMetrics.includes('relevance') && query.metrics.relevance && (
                            <TableCell align="center">Relevance</TableCell>
                          )}
                          {selectedMetrics.includes('precision') && query.metrics.precision && (
                            <TableCell align="center">Relevant?</TableCell>
                          )}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {query.retrievedChunks.map((chunk, i) => (
                          <TableRow key={i}>
                            <TableCell>{i+1}</TableCell>
                            <TableCell sx={{ maxWidth: '400px', wordBreak: 'break-word' }}>
                              {chunk.content}
                            </TableCell>
                            <TableCell>{chunk.metadata.source}</TableCell>
                            {selectedMetrics.includes('relevance') && query.metrics.relevance && (
                              <TableCell align="center">
                                <Chip 
                                  size="small"
                                  label={query.metrics.relevance.chunkScores[i].toFixed(1)}
                                  sx={{ 
                                    bgcolor: getQualityLevel(query.metrics.relevance.chunkScores[i]).color, 
                                    color: 'white' 
                                  }}
                                />
                              </TableCell>
                            )}
                            {selectedMetrics.includes('precision') && query.metrics.precision && (
                              <TableCell align="center">
                                {query.metrics.precision.relevantChunks[i] ? (
                                  <CheckCircleIcon color="success" />
                                ) : (
                                  <ErrorIcon color="error" />
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
                
                <Grid container spacing={2}>
                  {selectedMetrics.includes('relevance') && query.metrics.relevance && (
                    <Grid item xs={12} md={4}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle1" gutterBottom>
                            Relevance Analysis
                          </Typography>
                          <Box mb={1}>
                            <Typography variant="h4" component="div" sx={{ color: getQualityLevel(query.metrics.relevance.overallScore).color }}>
                              {query.metrics.relevance.overallScore.toFixed(1)}
                            </Typography>
                          </Box>
                          <Typography variant="body2">
                            {query.metrics.relevance.explanation}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                  
                  {selectedMetrics.includes('diversity') && query.metrics.diversity && (
                    <Grid item xs={12} md={4}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle1" gutterBottom>
                            Diversity Analysis
                          </Typography>
                          <Box mb={1}>
                            <Typography variant="h4" component="div" sx={{ color: getQualityLevel(query.metrics.diversity.diversityScore).color }}>
                              {query.metrics.diversity.diversityScore.toFixed(1)}
                            </Typography>
                          </Box>
                          <Typography variant="body2">
                            {query.metrics.diversity.explanation}
                          </Typography>
                          {query.metrics.diversity.redundancyPairs && query.metrics.diversity.redundancyPairs.length > 0 && (
                            <Box mt={1}>
                              <Typography variant="caption">
                                Redundant chunks: 
                                {query.metrics.diversity.redundancyPairs.map((pair, i) => 
                                  ` ${pair[0]+1} & ${pair[1]+1}${i < query.metrics.diversity.redundancyPairs.length - 1 ? ',' : ''}`
                                )}
                              </Typography>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                  
                  {selectedMetrics.includes('precision') && query.metrics.precision && (
                    <Grid item xs={12} md={4}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle1" gutterBottom>
                            Precision Analysis
                          </Typography>
                          <Box mb={1}>
                            <Typography variant="h4" component="div" sx={{ color: getQualityLevel(query.metrics.precision.precisionScore).color }}>
                              {query.metrics.precision.precisionScore.toFixed(1)}
                            </Typography>
                          </Box>
                          <Typography variant="body2">
                            {query.metrics.precision.explanation}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
      
      {evaluationResults && evaluationResults.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Evaluation failed: {evaluationResults.error}
        </Alert>
      )}
    </Box>
  );
};

export default RetrievalEvaluation; 