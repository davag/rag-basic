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
import { Scatter } from 'react-chartjs-2';
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

  // Helper function to calculate cosine similarity
  const calculateCosineSimilarity = (vector1, vector2) => {
    const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
    const norm1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
    const norm2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (norm1 * norm2);
  };

  // Analyze semantic coherence of embeddings
  const analyzeSemanticCoherence = async (embeddings) => {
    try {
      if (!documents || documents.length === 0) {
        console.error('No documents available for semantic coherence analysis');
        return {
          coherenceScore: 0,
          strengths: ['Unable to analyze semantic coherence: No documents available'],
          weaknesses: ['Document data is missing or empty'],
          recommendations: ['Load documents before analyzing embeddings']
        };
      }
      
      const llm = createLlmInstance(analysisModel, 'You are an expert at analyzing semantic relationships in embeddings. Evaluate how well the embeddings capture semantic meaning.');
      
      // Create pairs of related and unrelated content
      const pairs = [];
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          const similarity = calculateCosineSimilarity(embeddings[i], embeddings[j]);
          pairs.push({
            i,
            j,
            similarity,
            content1: documents[i]?.pageContent?.substring(0, 200) || 'No content available',
            content2: documents[j]?.pageContent?.substring(0, 200) || 'No content available'
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

  // Analyze a single vector
  const analyzeVector = async (vector) => {
    if (!vector || !Array.isArray(vector)) {
      throw new Error('Invalid vector format');
    }
    
    // Calculate basic statistics
    const mean = vector.reduce((sum, val) => sum + val, 0) / vector.length;
    const variance = vector.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / vector.length;
    const std = Math.sqrt(variance);
    
    // Calculate sparsity (percentage of near-zero values)
    const epsilon = 1e-6;
    const sparsity = vector.filter(val => Math.abs(val) < epsilon).length / vector.length;
    
    // Calculate magnitude
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    return {
      mean,
      variance,
      std,
      sparsity,
      magnitude,
      dimension: vector.length
    };
  };

  // Analyze clustering quality
  const analyzeClustering = async (vectors) => {
    const results = [];
    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      const analysis = await analyzeVector(vector);
      results.push(analysis);
    }
    return results;
  };

  // Save results for comparison
  useEffect(() => {
    if (analysisResults && !analysisResults.error) {
      setPreviousResults(analysisResults);
    }
  }, [analysisResults]);

  // Generate actionable insights
  const generateInsights = (results) => {
    if (!results) {
      return {
        optimization: [{ title: 'No data', description: 'No analysis results available', action: 'Run an analysis first', impact: 'high' }],
        quality: [{ title: 'No data', description: 'No analysis results available', action: 'Run an analysis first', impact: 'high' }],
        performance: [{ title: 'No data', description: 'No analysis results available', action: 'Run an analysis first', impact: 'high' }]
      };
    }
    
    const insights = {
      optimization: [],
      quality: [],
      performance: []
    };
    
    // Process semantic analysis results
    if (results.semantic) {
      // Add quality insights based on semantic coherence score
      if (results.semantic.coherenceScore < 6) {
        insights.quality.push({
          title: 'Low Semantic Coherence',
          description: 'Embeddings are not capturing semantic relationships effectively',
          action: 'Consider using a more advanced embedding model or fine-tuning',
          impact: 'high'
        });
      }
      
      // Add weaknesses as optimization insights
      if (results.semantic.weaknesses && results.semantic.weaknesses.length > 0) {
        results.semantic.weaknesses.forEach(weakness => {
          insights.optimization.push({
            title: 'Semantic Weakness',
            description: weakness,
            action: 'Address this specific weakness in your embeddings',
            impact: 'medium'
          });
        });
      }
      
      // Add recommendations as performance insights
      if (results.semantic.recommendations && results.semantic.recommendations.length > 0) {
        results.semantic.recommendations.forEach(rec => {
          insights.performance.push({
            title: 'Recommendation',
            description: rec,
            action: 'Follow this recommendation to improve embedding quality',
            impact: 'medium'
          });
        });
      }
    }
    
    // Add default insights if categories are empty
    if (insights.optimization.length === 0) {
      insights.optimization.push({
        title: 'No optimization insights',
        description: 'No specific optimization issues were identified',
        action: 'Continue monitoring embedding quality',
        impact: 'low'
      });
    }
    
    if (insights.quality.length === 0) {
      insights.quality.push({
        title: 'No quality issues',
        description: 'Embeddings appear to be of acceptable quality',
        action: 'Consider fine-tuning for domain-specific improvements',
        impact: 'low'
      });
    }
    
    if (insights.performance.length === 0) {
      insights.performance.push({
        title: 'No performance insights',
        description: 'No specific performance issues were identified',
        action: 'Continue monitoring embedding performance',
        impact: 'low'
      });
    }
    
    return insights;
  };

  // Compare with previous results
  const compareResults = (current, previous) => {
    if (!current || !previous) {
      return {
        summary: [
          {
            metric: 'No Comparison Available',
            change: 'N/A',
            impact: 'low'
          }
        ]
      };
    }

    const comparison = {
      semantic: null,
      dimensionality: null,
      clustering: null,
      summary: []
    };

    // Compare semantic coherence
    if (current.semantic && previous.semantic && 
        typeof current.semantic.coherenceScore === 'number' && 
        typeof previous.semantic.coherenceScore === 'number') {
      
      const diff = current.semantic.coherenceScore - previous.semantic.coherenceScore;
      const percentChange = previous.semantic.coherenceScore !== 0 
        ? (diff / previous.semantic.coherenceScore) * 100 
        : 0;
        
      comparison.semantic = {
        scoreDiff: diff,
        improved: diff > 0,
        percentChange: percentChange
      };
      
      comparison.summary.push({
        metric: 'Semantic Coherence',
        change: `${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${percentChange.toFixed(1)}%)`,
        impact: Math.abs(diff) > 1 ? 'high' : 'low'
      });
    }

    // Compare dimensionality
    if (current.dimensionality?.metrics?.avgVariance !== undefined && 
        previous.dimensionality?.metrics?.avgVariance !== undefined) {
        
      const currentAvgVar = current.dimensionality.metrics.avgVariance;
      const previousAvgVar = previous.dimensionality.metrics.avgVariance;
      const diff = currentAvgVar - previousAvgVar;
      const percentChange = previousAvgVar !== 0 
        ? (diff / previousAvgVar) * 100 
        : 0;
      
      comparison.dimensionality = {
        varianceDiff: diff,
        improved: diff > 0,
        percentChange: percentChange
      };
      
      comparison.summary.push({
        metric: 'Information Distribution',
        change: `${diff > 0 ? '+' : ''}${diff.toFixed(4)} (${percentChange.toFixed(1)}%)`,
        impact: Math.abs(percentChange) > 10 ? 'high' : 'low'
      });
    }

    // Compare clustering
    if (current.clustering?.clusterQualityScore !== undefined && 
        previous.clustering?.clusterQualityScore !== undefined) {
        
      const diff = current.clustering.clusterQualityScore - previous.clustering.clusterQualityScore;
      const percentChange = previous.clustering.clusterQualityScore !== 0 
        ? (diff / previous.clustering.clusterQualityScore) * 100 
        : 0;
        
      comparison.clustering = {
        scoreDiff: diff,
        improved: diff > 0,
        percentChange: percentChange
      };
      
      comparison.summary.push({
        metric: 'Clustering Quality',
        change: `${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${percentChange.toFixed(1)}%)`,
        impact: Math.abs(diff) > 1 ? 'high' : 'low'
      });
    }
    
    // If no comparisons were made, add a default summary item
    if (comparison.summary.length === 0) {
      comparison.summary.push({
        metric: 'No Comparable Metrics',
        change: 'N/A',
        impact: 'low'
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
      try {
        if (selectedMetric === 'semantic') {
          results.semantic = await analyzeSemanticCoherence(embeddings);
        }
      } catch (error) {
        console.error('Error in semantic analysis:', error);
        results.semantic = { 
          coherenceScore: 0,
          strengths: ['Error during analysis'],
          weaknesses: [error.message],
          recommendations: ['Try with fewer documents or a different analysis approach']
        };
      }
      
      try {
        if (selectedMetric === 'dimensionality') {
          results.dimensionality = analyzeDimensionality(embeddings);
        }
      } catch (error) {
        console.error('Error in dimensionality analysis:', error);
        results.dimensionality = {
          metrics: { avgVariance: 0, varianceRatio: 0, dimensions: embeddings[0].length },
          dimensionStats: []
        };
      }
      
      try {
        if (selectedMetric === 'clustering') {
          results.clustering = await analyzeClustering(embeddings);
        }
      } catch (error) {
        console.error('Error in clustering analysis:', error);
        results.clustering = {
          clusterQualityScore: 0,
          clusterSizes: [0, 0, 0, 0, 0],
          coherence: [0, 0, 0, 0, 0],
          recommendations: ['Error during analysis: ' + error.message],
          clusters: []
        };
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
  const renderClusterVisualization = (embeddings, clusters) => {
    if (!embeddings || !clusters) {
      return <Typography color="error">No cluster data available</Typography>;
    }

    // Create a copy of the vectors for safe reference
    const processedVectors = embeddings.map(v => {
      if (Array.isArray(v)) return [...v];
      if (v && typeof v === 'object') {
        if (Array.isArray(v.vector)) return [...v.vector];
        if (Array.isArray(v.embedding)) return [...v.embedding];
        if (Array.isArray(v.values)) return [...v.values];
      }
      return null;
    }).filter(Boolean);

    const projectedData = calculatePCA(processedVectors, 2);
    
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

  // Add calculateEigen function with safe vector handling
  const calculateEigen = (matrix) => {
    const n = matrix.length;
    const initialVector = Array(n).fill(1);
    let vector = [...initialVector];
    let eigenvalue = 0;
    
    // Normalize vector - moved outside the loop
    const normalize = (v) => {
      const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      return v.map(x => x / norm);
    };
    
    // Power iteration with safe vector handling
    for (let iter = 0; iter < 50; iter++) {
      // Create new vector for this iteration
      const newVector = Array(n).fill(0);
      
      // Matrix-vector multiplication
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += matrix[i][j] * vector[j];
        }
        newVector[i] = sum;
      }
      
      // Update eigenvalue and normalize vector
      const normalizedVector = normalize(newVector);
      vector = normalizedVector;
      eigenvalue = newVector.reduce((sum, x, i) => sum + x * vector[i], 0);
    }
    
    return {
      eigenvalues: [eigenvalue],
      eigenvectors: [vector]
    };
  };

  // Add renderDimensionImportance function
  const renderDimensionImportance = (dimensionStats) => {
    if (!dimensionStats || dimensionStats.length === 0) {
      return <Typography color="error">No dimension data available</Typography>;
    }



    return (
      <Box sx={{ height: 300, mb: 3 }}>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          This chart shows the distribution of variance across dimensions.
          Higher variance indicates more important dimensions.
        </Typography>
      </Box>
    );
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
                {availableModels && typeof availableModels === 'object' ? 
                  Object.keys(availableModels).filter(model => 
                    availableModels[model]?.active && 
                    (model.includes('gpt-4') || model.includes('claude'))
                  ).map(model => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))
                : null}
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
                          {analysisResults.semantic?.strengths?.map((strength, i) => (
                            <ListItem key={i}>
                              <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                              <ListItemText primary={strength} />
                            </ListItem>
                          )) || <ListItem><ListItemText primary="No strengths data available" /></ListItem>}
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
                          {analysisResults.semantic?.weaknesses?.map((weakness, i) => (
                            <ListItem key={i}>
                              <ErrorIcon color="error" sx={{ mr: 1 }} />
                              <ListItemText primary={weakness} />
                            </ListItem>
                          )) || <ListItem><ListItemText primary="No weaknesses data available" /></ListItem>}
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
                          {analysisResults.semantic?.recommendations?.map((rec, i) => (
                            <ListItem key={i}>
                              <LoopIcon sx={{ mr: 1, color: 'primary.main' }} />
                              <ListItemText primary={rec} />
                            </ListItem>
                          )) || <ListItem><ListItemText primary="No recommendations available" /></ListItem>}
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
                              {analysisResults.clustering?.clusterSizes?.map((size, i) => (
                                <TableRow key={i}>
                                  <TableCell>{i + 1}</TableCell>
                                  <TableCell align="right">{size}</TableCell>
                                  <TableCell>
                                    <Chip 
                                      size="small"
                                      label={getQualityLevel(analysisResults.clustering?.coherence?.[i] || 0).text} 
                                      sx={{ bgcolor: getQualityLevel(analysisResults.clustering?.coherence?.[i] || 0).color, color: 'white' }}
                                    />
                                  </TableCell>
                                </TableRow>
                              )) || <TableRow><TableCell colSpan={3}>No cluster size data available</TableCell></TableRow>}
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
                          {analysisResults.clustering?.recommendations?.map((rec, i) => (
                            <ListItem key={i}>
                              <LoopIcon sx={{ mr: 1, color: 'primary.main' }} />
                              <ListItemText primary={rec} />
                            </ListItem>
                          )) || <ListItem><ListItemText primary="No recommendations available" /></ListItem>}
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
                          {vectorStore?.memoryVectors && documents ? renderClusterVisualization(
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
                          ) : (
                            <Alert severity="info">
                              Unable to render cluster visualization. Vector data or documents not available.
                            </Alert>
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
                {analysisResults.insights && ['optimization', 'quality', 'performance'].map(category => (
                  <Grid item xs={12} md={4} key={category}>
                    <Typography variant="subtitle1" gutterBottom sx={{ textTransform: 'capitalize' }}>
                      {category} Insights
                    </Typography>
                    <List dense>
                      {analysisResults.insights[category]?.map((insight, idx) => (
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
                      )) || <ListItem><ListItemText primary={`No ${category} insights available`} /></ListItem>}
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
                      {analysisResults.comparison?.summary?.map((item, idx) => (
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
                      )) || <TableRow><TableCell colSpan={3}>No comparison data available</TableCell></TableRow>}
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