import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  Grid, 
  Paper, 
  Card, 
  CardContent, 
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
  MenuItem,
  List,
  ListItem,
  ListItemText,
  TablePagination,
  Tooltip,
  IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import LoopIcon from '@mui/icons-material/Loop';
import InfoIcon from '@mui/icons-material/Info';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import CompareIcon from '@mui/icons-material/Compare';
import { createLlmInstance } from '../utils/apiServices';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import * as d3 from 'd3';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend
);

/**
 * EmbeddingQualityAnalysis Component
 * 
 * Analyzes the quality of embeddings using various metrics:
 * 1. Semantic Coherence - How well the embeddings capture semantic relationships
 * 2. Dimensionality Analysis - Distribution of information across dimensions
 * 3. Clustering Quality - How well the embeddings cluster related content
 * 4. Distance Distribution - Analysis of embedding distances
 */
const EmbeddingQualityAnalysis = ({ 
  documents, 
  vectorStore, 
  availableModels,
  onAnalysisComplete 
}) => {
  const [loading, setLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState('semantic');
  const [analysisModel, setAnalysisModel] = useState('gpt-4o-mini');
  const [reportExpanded, setReportExpanded] = useState({});
  const [sampleSize, setSampleSize] = useState(100);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [previousResults, setPreviousResults] = useState(null);

  // Calculate cosine similarity between two vectors
  const cosineSimilarity = (vec1, vec2) => {
    const dotProduct = vec1.reduce((acc, val, i) => acc + val * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((acc, val) => acc + val * val, 0));
    const norm2 = Math.sqrt(vec2.reduce((acc, val) => acc + val * val, 0));
    return dotProduct / (norm1 * norm2);
  };

  // Analyze semantic coherence of embeddings
  const analyzeSemanticCoherence = async (embeddings) => {
    try {
      const llm = createLlmInstance(analysisModel, 'You are an expert at analyzing semantic relationships in embeddings. Evaluate how well the embeddings capture semantic meaning.');
      
      // Create pairs of related and unrelated content
      const pairs = [];
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
          pairs.push({
            i,
            j,
            similarity,
            content1: documents[i].pageContent.substring(0, 200),
            content2: documents[j].pageContent.substring(0, 200)
          });
        }
      }
      
      // Sort pairs by similarity
      pairs.sort((a, b) => b.similarity - a.similarity);
      
      // Take top and bottom pairs for analysis
      const topPairs = pairs.slice(0, 5);
      const bottomPairs = pairs.slice(-5);
      
      const prompt = `Analyze these pairs of content and their embedding similarities:
      
      High Similarity Pairs:
      ${topPairs.map((pair, i) => `
      Pair ${i+1} (Similarity: ${pair.similarity.toFixed(3)}):
      Content 1: ${pair.content1}
      Content 2: ${pair.content2}
      `).join('\n')}
      
      Low Similarity Pairs:
      ${bottomPairs.map((pair, i) => `
      Pair ${i+1} (Similarity: ${pair.similarity.toFixed(3)}):
      Content 1: ${pair.content1}
      Content 2: ${pair.content2}
      `).join('\n')}
      
      Evaluate how well the embeddings capture semantic relationships. Format your response as JSON:
      {
        "coherenceScore": float,
        "strengths": ["strength1", "strength2", ...],
        "weaknesses": ["weakness1", "weakness2", ...],
        "recommendations": ["rec1", "rec2", ...]
      }`;
      
      const response = await llm.invoke(prompt);
      
      // Extract the JSON from the response
      const jsonMatch = response.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.weaknesses && result.weaknesses.length > 0) {
          // Use weaknesses in insights generation
          generateInsights({ semantic: result });
        }
        return result;
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing semantic coherence:', error);
      return null;
    }
  };

  // Analyze dimensionality distribution
  const analyzeDimensionality = (embeddings) => {
    if (!embeddings || embeddings.length === 0) {
      throw new Error('No embeddings provided for dimensionality analysis');
    }

    if (!embeddings[0] || !Array.isArray(embeddings[0])) {
      throw new Error('Invalid embedding format: expected array of vectors');
    }

    const dimensions = embeddings[0].length;
    const dimensionStats = Array(dimensions).fill(0).map(() => ({
      mean: 0,
      stdDev: 0,
      variance: 0,
      min: Infinity,
      max: -Infinity
    }));
    
    // Calculate statistics for each dimension
    embeddings.forEach(embedding => {
      if (!Array.isArray(embedding) || embedding.length !== dimensions) {
        throw new Error('Inconsistent embedding dimensions');
      }
      embedding.forEach((value, dim) => {
        dimensionStats[dim].mean += value;
        dimensionStats[dim].min = Math.min(dimensionStats[dim].min, value);
        dimensionStats[dim].max = Math.max(dimensionStats[dim].max, value);
      });
    });
    
    // Calculate means
    dimensionStats.forEach(stat => {
      stat.mean /= embeddings.length;
    });
    
    // Calculate variance and standard deviation
    embeddings.forEach(embedding => {
      embedding.forEach((value, dim) => {
        const diff = value - dimensionStats[dim].mean;
        dimensionStats[dim].variance += diff * diff;
      });
    });
    
    dimensionStats.forEach(stat => {
      stat.variance /= embeddings.length;
      stat.stdDev = Math.sqrt(stat.variance);
    });
    
    // Calculate overall metrics
    const avgVariance = dimensionStats.reduce((acc, stat) => acc + stat.variance, 0) / dimensions;
    const varianceRatio = Math.max(...dimensionStats.map(stat => stat.variance)) / 
                         Math.min(...dimensionStats.map(stat => stat.variance));
    
    return {
      dimensionStats,
      metrics: {
        avgVariance,
        varianceRatio,
        dimensions
      }
    };
  };

  // Analyze clustering quality
  const analyzeClustering = async (embeddings) => {
    try {
      const llm = createLlmInstance(analysisModel, 'You are an expert at analyzing clustering quality in embeddings. Evaluate how well the embeddings group related content.');
      
      // Perform simple k-means clustering
      const k = 5;
      const clusters = Array(k).fill().map(() => []);
      const centroids = embeddings.slice(0, k);
      
      // Assign points to clusters
      embeddings.forEach((embedding, i) => {
        let minDist = Infinity;
        let clusterIndex = 0;
        
        centroids.forEach((centroid, j) => {
          const dist = cosineSimilarity(embedding, centroid);
          if (dist < minDist) {
            minDist = dist;
            clusterIndex = j;
          }
        });
        
        clusters[clusterIndex].push(i);
      });
      
      // Get sample content from each cluster
      const clusterSamples = clusters.map(cluster => 
        cluster.slice(0, 3).map(i => documents[i].pageContent.substring(0, 200))
      );
      
      const prompt = `Analyze these clusters of content:
      
      ${clusterSamples.map((cluster, i) => `
      Cluster ${i+1} (${cluster.length} items):
      ${cluster.join('\n\n')}
      `).join('\n\n')}
      
      Evaluate the quality of these clusters. Format your response as JSON:
      {
        "clusterQualityScore": float,
        "clusterSizes": [size1, size2, ...],
        "coherence": ["coherence1", "coherence2", ...],
        "recommendations": ["rec1", "rec2", ...]
      }`;
      
      const response = await llm.invoke(prompt);
      
      // Extract the JSON from the response
      const jsonMatch = response.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.coherence) {
          // Use coherence in visualization
          renderClusterVisualization(embeddings, result.clusters);
        }
        return result;
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing clustering:', error);
      return null;
    }
  };

  // Save results for comparison
  useEffect(() => {
    if (analysisResults && !analysisResults.error) {
      setPreviousResults(analysisResults);
    }
  }, [analysisResults]);

  // Generate actionable insights
  const generateInsights = (results) => {
    const { metrics, weaknesses, coherence } = results;
    let insights = [];

    if (metrics) {
      // Add insights based on metrics
      if (metrics.accuracy < 0.8) {
        insights.push("Model accuracy is below target threshold of 80%");
      }
      if (metrics.latency > 200) {
        insights.push("Response times are higher than expected");
      }
    }

    if (weaknesses && weaknesses.length > 0) {
      // Add insights from identified weaknesses
      insights.push(...weaknesses.map(w => `Identified weakness: ${w}`));
    }

    if (coherence) {
      // Add insights about semantic coherence
      if (coherence < 0.7) {
        insights.push("Low semantic coherence detected in embeddings");
      } else if (coherence > 0.9) {
        insights.push("High semantic coherence observed");
      }
    }

    return insights;
  };

  // Compare with previous results
  const compareResults = (current, previous) => {
    if (!current || !previous) return null;

    const comparison = {
      semantic: null,
      dimensionality: null,
      clustering: null,
      summary: []
    };

    // Compare semantic coherence
    if (current.semantic && previous.semantic) {
      const diff = current.semantic.coherenceScore - previous.semantic.coherenceScore;
      comparison.semantic = {
        scoreDiff: diff,
        improved: diff > 0,
        percentChange: (diff / previous.semantic.coherenceScore) * 100
      };
      comparison.summary.push({
        metric: 'Semantic Coherence',
        change: `${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${comparison.semantic.percentChange.toFixed(1)}%)`,
        impact: Math.abs(diff) > 1 ? 'high' : 'low'
      });
    }

    // Compare dimensionality
    if (current.dimensionality && previous.dimensionality) {
      const currentAvgVar = current.dimensionality.metrics.avgVariance;
      const previousAvgVar = previous.dimensionality.metrics.avgVariance;
      const diff = currentAvgVar - previousAvgVar;
      
      comparison.dimensionality = {
        varianceDiff: diff,
        improved: diff > 0,
        percentChange: (diff / previousAvgVar) * 100
      };
      comparison.summary.push({
        metric: 'Information Distribution',
        change: `${diff > 0 ? '+' : ''}${diff.toFixed(4)} (${comparison.dimensionality.percentChange.toFixed(1)}%)`,
        impact: Math.abs(comparison.dimensionality.percentChange) > 10 ? 'high' : 'low'
      });
    }

    // Compare clustering
    if (current.clustering && previous.clustering) {
      const diff = current.clustering.clusterQualityScore - previous.clustering.clusterQualityScore;
      comparison.clustering = {
        scoreDiff: diff,
        improved: diff > 0,
        percentChange: (diff / previous.clustering.clusterQualityScore) * 100
      };
      comparison.summary.push({
        metric: 'Clustering Quality',
        change: `${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${comparison.clustering.percentChange.toFixed(1)}%)`,
        impact: Math.abs(diff) > 1 ? 'high' : 'low'
      });
    }

    return comparison;
  };

  // Run the full analysis
  const runAnalysis = async () => {
    if (!vectorStore || !vectorStore.memoryVectors) {
      alert('Vector store not available. Load documents and create a vector store first.');
      return;
    }
    
    setLoading(true);
    setAnalysisResults(null);
    
    try {
      // Get embeddings from vector store
      const embeddings = vectorStore.memoryVectors
        .slice(0, sampleSize)
        .map(vector => {
          // Handle different possible vector formats
          if (Array.isArray(vector)) {
            return vector;
          }
          if (vector && typeof vector === 'object') {
            if (Array.isArray(vector.vector)) {
              return vector.vector;
            }
            if (Array.isArray(vector.embedding)) {
              return vector.embedding;
            }
            if (Array.isArray(vector.values)) {
              return vector.values;
            }
          }
          throw new Error(`Invalid vector format: ${JSON.stringify(vector)}`);
        });
      
      if (embeddings.length === 0) {
        throw new Error('No embeddings found in vector store');
      }

      if (!Array.isArray(embeddings[0])) {
        throw new Error('Invalid embedding format: expected array of vectors');
      }
      
      const results = {
        semantic: null,
        dimensionality: null,
        clustering: null
      };
      
      // Run selected analyses
      if (selectedMetric === 'semantic') {
        results.semantic = await analyzeSemanticCoherence(embeddings);
      }
      
      if (selectedMetric === 'dimensionality') {
        results.dimensionality = analyzeDimensionality(embeddings);
      }
      
      if (selectedMetric === 'clustering') {
        results.clustering = await analyzeClustering(embeddings);
      }
      
      // Generate insights and comparison
      const insights = generateInsights(results);
      const comparison = compareResults(results, previousResults);
      
      setAnalysisResults({
        ...results,
        insights,
        comparison
      });
      
      if (onAnalysisComplete) {
        onAnalysisComplete(results);
      }
      
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisResults({
        error: error.message
      });
    } finally {
      setLoading(false);
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
  const toggleReportSection = (section) => {
    setReportExpanded({
      ...reportExpanded,
      [section]: !reportExpanded[section]
    });
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Update PCA calculation to use eigenvalues
  const calculatePCA = (data, dimensions = 2) => {
    // Center the data
    const means = data[0].map((_, colIndex) => 
      data.reduce((sum, row) => sum + row[colIndex], 0) / data.length
    );
    
    const centered = data.map(row =>
      row.map((val, i) => val - means[i])
    );
    
    // Calculate covariance matrix
    const covarianceMatrix = means.map((_, i) => 
      means.map((_, j) => {
        return centered.reduce((sum, row) => 
          sum + (row[i] * row[j]) / (data.length - 1), 0
        );
      })
    );
    
    // Get eigenvalues and eigenvectors
    const { eigenvalues, eigenvectors } = calculateEigen(covarianceMatrix);
    
    // Use eigenvalues to determine explained variance
    const totalVariance = eigenvalues.reduce((sum, val) => sum + val, 0);
    const explainedVariance = eigenvalues.slice(0, dimensions).reduce((sum, val) => sum + val, 0) / totalVariance;
    
    if (explainedVariance < 0.8) {
      console.warn(`PCA explains only ${(explainedVariance * 100).toFixed(1)}% of variance`);
    }

    // Project data onto principal components
    const projectedData = centered.map(row => {
      return eigenvectors.slice(0, dimensions).map(eigenvector => 
        row.reduce((sum, val, i) => sum + val * eigenvector[i], 0)
      );
    });

    return projectedData;
  };

  // Fix unsafe loop reference
  const calculatePairwiseSimilarities = (vectors) => {
    return vectors.reduce((similarities, vector1, i) => {
      const remainingVectors = vectors.slice(i + 1);
      const newSimilarities = remainingVectors.map(vector2 => 
        cosineSimilarity(vector1, vector2)
      );
      return [...similarities, ...newSimilarities];
    }, []);
  };

  // Add visualization components
  const renderDimensionImportance = (dimensionStats) => {
    const data = {
      labels: dimensionStats.map((_, i) => `Dim ${i + 1}`),
      datasets: [{
        label: 'Variance (Importance)',
        data: dimensionStats.map(stat => stat.variance),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    };

    const options = {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Dimension Importance Distribution'
        },
        tooltip: {
          callbacks: {
            label: (context) => `Variance: ${context.raw.toFixed(4)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Variance'
          }
        }
      }
    };

    return (
      <Box sx={{ height: 300, mb: 3 }}>
        <Bar data={data} options={options} />
      </Box>
    );
  };

  const renderClusterVisualization = (embeddings, clusters) => {
    if (!embeddings || !clusters) {
      return <Typography color="error">No cluster data available</Typography>;
    }

    // Create a copy of the vector for safe reference
    const projectedData = calculatePCA(embeddings.map(v => Array.isArray(v) ? [...v] : 
      v && typeof v === 'object' ? 
        (Array.isArray(v.vector) ? [...v.vector] : 
         Array.isArray(v.embedding) ? [...v.embedding] : 
         Array.isArray(v.values) ? [...v.values] : null) 
      : null).filter(Boolean), 2);
    
    const data = {
      datasets: clusters.map((cluster, i) => ({
        label: `Cluster ${i + 1}`,
        data: cluster.map(idx => ({
          x: projectedData[idx][0],
          y: projectedData[idx][1]
        })),
        backgroundColor: d3.schemeCategory10[i],
      }))
    };

    const options = {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Document Clusters (2D Projection)'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const idx = clusters[context.datasetIndex][context.dataIndex];
              return documents[idx].pageContent.substring(0, 50) + '...';
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Principal Component 1'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Principal Component 2'
          }
        }
      }
    };

    return (
      <Box sx={{ height: 400, mb: 3 }}>
        <Scatter data={data} options={options} />
      </Box>
    );
  };

  // Add calculateEigen function
  const calculateEigen = (matrix) => {
    // Simple power iteration method for dominant eigenvalue/vector
    const n = matrix.length;
    let vector = Array(n).fill(1);
    let eigenvalue = 0;
    
    // Normalize vector
    const normalize = (v) => {
      const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      return v.map(x => x / norm);
    };
    
    // Power iteration
    for (let iter = 0; iter < 50; iter++) {
      // Matrix-vector multiplication
      const newVector = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          newVector[i] += matrix[i][j] * vector[j];
        }
      }
      
      // Update eigenvalue and normalize vector
      vector = normalize(newVector);
      eigenvalue = newVector.reduce((sum, x, i) => sum + x * vector[i], 0);
    }
    
    return {
      eigenvalues: [eigenvalue],
      eigenvectors: [vector]
    };
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        <AssessmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Embedding Quality Analysis
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        Analyze the quality of your embeddings using various metrics and visualizations.
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
              Analysis Settings
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="analysis-model-label">Analysis Model</InputLabel>
              <Select
                labelId="analysis-model-label"
                id="analysis-model"
                value={analysisModel}
                label="Analysis Model"
                onChange={(e) => setAnalysisModel(e.target.value)}
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
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="metrics-label">Analysis Metrics</InputLabel>
              <Select
                labelId="metrics-label"
                id="metrics-select"
                value={selectedMetric}
                label="Analysis Metrics"
                onChange={(e) => setSelectedMetric(e.target.value)}
              >
                <MenuItem value="semantic">Semantic Coherence</MenuItem>
                <MenuItem value="dimensionality">Dimensionality Analysis</MenuItem>
                <MenuItem value="clustering">Clustering Quality</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Sample Size"
              type="number"
              value={sampleSize}
              onChange={(e) => setSampleSize(Math.max(10, Math.min(1000, parseInt(e.target.value) || 100)))}
              InputProps={{
                inputProps: { min: 10, max: 1000 }
              }}
              helperText="Number of embeddings to analyze (10-1000)"
            />
          </Grid>
          
          <Grid item xs={12}>
            <Button
              variant="contained"
              color="primary"
              disabled={loading || !vectorStore}
              onClick={runAnalysis}
              startIcon={loading ? <CircularProgress size={20} /> : <AssessmentIcon />}
              fullWidth
            >
              {loading ? 'Analyzing...' : 'Run Analysis'}
            </Button>
          </Grid>
        </Grid>
      </Paper>
      
      {analysisResults && !analysisResults.error && (
        <Box mt={3}>
          <Typography variant="h6" gutterBottom>
            Analysis Results
          </Typography>
          
          {selectedMetric === 'semantic' && analysisResults.semantic && (
            <Accordion 
              expanded={reportExpanded.semantic || false}
              onChange={() => toggleReportSection('semantic')}
              sx={{ mb: 2 }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
              >
                <Box display="flex" alignItems="center" width="100%">
                  <Typography fontWeight="medium">
                    Semantic Coherence Analysis
                  </Typography>
                  <Box ml={2}>
                    <Chip 
                      label={getQualityLevel(analysisResults.semantic.coherenceScore).text} 
                      sx={{ bgcolor: getQualityLevel(analysisResults.semantic.coherenceScore).color, color: 'white' }}
                    />
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Strengths
                        </Typography>
                        <List>
                          {analysisResults.semantic.strengths.map((strength, i) => (
                            <ListItem key={i}>
                              <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                              <ListItemText primary={strength} />
                            </ListItem>
                          ))}
                        </List>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Weaknesses
                        </Typography>
                        <List>
                          {analysisResults.semantic.weaknesses.map((weakness, i) => (
                            <ListItem key={i}>
                              <ErrorIcon color="error" sx={{ mr: 1 }} />
                              <ListItemText primary={weakness} />
                            </ListItem>
                          ))}
                        </List>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Recommendations
                        </Typography>
                        <List>
                          {analysisResults.semantic.recommendations.map((rec, i) => (
                            <ListItem key={i}>
                              <LoopIcon sx={{ mr: 1, color: 'primary.main' }} />
                              <ListItemText primary={rec} />
                            </ListItem>
                          ))}
                        </List>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}
          
          {selectedMetric === 'dimensionality' && analysisResults.dimensionality && (
            <Accordion 
              expanded={reportExpanded.dimensionality || false}
              onChange={() => toggleReportSection('dimensionality')}
              sx={{ mb: 2 }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
              >
                <Box display="flex" alignItems="center" width="100%">
                  <Typography fontWeight="medium">
                    Dimensionality Analysis
                  </Typography>
                  <Box ml={2}>
                    <Chip 
                      label={`${analysisResults.dimensionality.metrics.dimensions} dimensions`}
                      color="primary"
                    />
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Average Variance
                        </Typography>
                        <Typography variant="h4" component="div">
                          {analysisResults.dimensionality.metrics.avgVariance.toFixed(4)}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Higher values indicate more information spread across dimensions
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Variance Ratio
                        </Typography>
                        <Typography variant="h4" component="div">
                          {analysisResults.dimensionality.metrics.varianceRatio.toFixed(2)}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Ratio of highest to lowest dimension variance
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                          <Typography variant="subtitle1" gutterBottom>
                            Dimension Statistics
                          </Typography>
                          <Tooltip title="This table shows how information is distributed across embedding dimensions. High variance indicates important features, while low variance suggests redundant or less informative dimensions. Use this to optimize your embedding model by identifying and potentially removing less important dimensions.">
                            <IconButton size="small">
                              <InfoIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Dimension</TableCell>
                                <TableCell align="right">Mean</TableCell>
                                <TableCell align="right">Std Dev</TableCell>
                                <TableCell align="right">Min</TableCell>
                                <TableCell align="right">Max</TableCell>
                                <TableCell align="right">Variance</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {analysisResults.dimensionality.dimensionStats
                                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                                .map((stat, i) => (
                                  <TableRow key={i}>
                                    <TableCell>{page * rowsPerPage + i + 1}</TableCell>
                                    <TableCell align="right">{stat.mean.toFixed(4)}</TableCell>
                                    <TableCell align="right">{stat.stdDev.toFixed(4)}</TableCell>
                                    <TableCell align="right">{stat.min.toFixed(4)}</TableCell>
                                    <TableCell align="right">{stat.max.toFixed(4)}</TableCell>
                                    <TableCell align="right">{stat.variance.toFixed(4)}</TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        <TablePagination
                          component="div"
                          count={analysisResults.dimensionality.dimensionStats.length}
                          page={page}
                          onPageChange={handleChangePage}
                          rowsPerPage={rowsPerPage}
                          onRowsPerPageChange={handleChangeRowsPerPage}
                          rowsPerPageOptions={[5, 10, 25, 50]}
                        />
                        <Box mt={2}>
                          <Typography variant="body2" color="textSecondary" gutterBottom>
                            How to use this information:
                          </Typography>
                          <List dense>
                            <ListItem>
                              <ListItemText 
                                primary="Model Optimization"
                                secondary="Identify dimensions with very low variance - these might be redundant and could be removed to reduce model size"
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText 
                                primary="Quality Assessment"
                                secondary="High variance across dimensions indicates good feature distribution. Very uneven distribution might suggest poor embedding quality"
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText 
                                primary="Performance Tuning"
                                secondary="Use variance ratios to identify potential bottlenecks in your embedding model"
                              />
                            </ListItem>
                          </List>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Dimension Importance Visualization
                        </Typography>
                        {renderDimensionImportance(analysisResults.dimensionality.dimensionStats)}
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}
          
          {selectedMetric === 'clustering' && analysisResults.clustering && (
            <Accordion 
              expanded={reportExpanded.clustering || false}
              onChange={() => toggleReportSection('clustering')}
              sx={{ mb: 2 }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
              >
                <Box display="flex" alignItems="center" width="100%">
                  <Typography fontWeight="medium">
                    Clustering Quality Analysis
                  </Typography>
                  <Box ml={2}>
                    <Chip 
                      label={getQualityLevel(analysisResults.clustering.clusterQualityScore).text} 
                      sx={{ bgcolor: getQualityLevel(analysisResults.clustering.clusterQualityScore).color, color: 'white' }}
                    />
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Cluster Sizes
                        </Typography>
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Cluster</TableCell>
                                <TableCell align="right">Size</TableCell>
                                <TableCell>Coherence</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {analysisResults.clustering.clusterSizes.map((size, i) => (
                                <TableRow key={i}>
                                  <TableCell>{i + 1}</TableCell>
                                  <TableCell align="right">{size}</TableCell>
                                  <TableCell>
                                    <Chip 
                                      size="small"
                                      label={getQualityLevel(analysisResults.clustering.coherence[i]).text} 
                                      sx={{ bgcolor: getQualityLevel(analysisResults.clustering.coherence[i]).color, color: 'white' }}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          Recommendations
                        </Typography>
                        <List>
                          {analysisResults.clustering.recommendations.map((rec, i) => (
                            <ListItem key={i}>
                              <LoopIcon sx={{ mr: 1, color: 'primary.main' }} />
                              <ListItemText primary={rec} />
                            </ListItem>
                          ))}
                        </List>
                      </CardContent>
                    </Card>
                  </Grid>

                  {selectedMetric === 'clustering' && (
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle1" gutterBottom>
                            Cluster Visualization
                          </Typography>
                          {renderClusterVisualization(
                            vectorStore.memoryVectors
                              .slice(0, sampleSize)
                              .map(vector => {
                                if (Array.isArray(vector)) return vector;
                                if (vector && typeof vector === 'object') {
                                  if (Array.isArray(vector.vector)) return vector.vector;
                                  if (Array.isArray(vector.embedding)) return vector.embedding;
                                  if (Array.isArray(vector.values)) return vector.values;
                                }
                                return null;
                              })
                              .filter(Boolean),
                            analysisResults.clustering.clusters
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Add Insights Section */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <LightbulbIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Actionable Insights
              </Typography>
              
              <Grid container spacing={2}>
                {['optimization', 'quality', 'performance'].map(category => (
                  <Grid item xs={12} md={4} key={category}>
                    <Typography variant="subtitle1" gutterBottom sx={{ textTransform: 'capitalize' }}>
                      {category} Insights
                    </Typography>
                    <List dense>
                      {analysisResults.insights[category].map((insight, idx) => (
                        <ListItem key={idx}>
                          <ListItemText
                            primary={insight.title}
                            secondary={
                              <React.Fragment>
                                <Typography variant="body2" color="textSecondary" gutterBottom>
                                  {insight.description}
                                </Typography>
                                <Typography variant="body2" color="primary">
                                  Action: {insight.action}
                                </Typography>
                              </React.Fragment>
                            }
                          />
                          <Chip 
                            size="small" 
                            label={insight.impact.toUpperCase()} 
                            color={insight.impact === 'high' ? 'error' : insight.impact === 'medium' ? 'warning' : 'info'}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>

          {/* Add Comparison Section */}
          {analysisResults.comparison && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <CompareIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Comparison with Previous Analysis
                </Typography>
                
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Metric</TableCell>
                        <TableCell align="right">Change</TableCell>
                        <TableCell>Impact</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analysisResults.comparison.summary.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.metric}</TableCell>
                          <TableCell align="right">
                            <Typography
                              color={item.change.startsWith('+') ? 'success.main' : 'error.main'}
                            >
                              {item.change}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              size="small" 
                              label={item.impact.toUpperCase()} 
                              color={item.impact === 'high' ? 'error' : 'info'}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </Box>
      )}
      
      {analysisResults && analysisResults.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Analysis failed: {analysisResults.error}
        </Alert>
      )}
    </Box>
  );
};

export default EmbeddingQualityAnalysis; 