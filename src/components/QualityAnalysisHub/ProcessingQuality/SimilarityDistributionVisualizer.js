import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Slider,
  Alert,
  Chip,
  Card,
  CardContent,
  Tooltip,
  IconButton
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import DownloadIcon from '@mui/icons-material/Download';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register required Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend);

/**
 * SimilarityDistributionVisualizer Component
 * 
 * This component visualizes the distribution of similarities between vectors in a vector store.
 * It helps users understand how closely related their documents are to each other.
 * 
 * @param {Object} props
 * @param {Array} props.vectors - Vector embeddings to analyze
 * @param {Array} props.documents - Associated documents for the vectors
 * @param {String} props.embeddingModel - The embedding model used
 */
const SimilarityDistributionVisualizer = ({ vectors, documents, embeddingModel }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [similarityData, setSimilarityData] = useState(null);
  const [sampleSize, setSampleSize] = useState(100);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.75);
  const [visualizationType, setVisualizationType] = useState('histogram');
  const chartRef = useRef(null);

  useEffect(() => {
    if (vectors && vectors.length > 0) {
      calculateSimilarities();
    }
  }, [vectors, sampleSize]);

  /**
   * Calculate cosine similarity between two vectors
   */
  const calculateCosineSimilarity = (vector1, vector2) => {
    if (!vector1 || !vector2 || !Array.isArray(vector1) || !Array.isArray(vector2)) {
      return 0;
    }
    
    // Use only elements that are present in both vectors
    const minLength = Math.min(vector1.length, vector2.length);
    const v1 = vector1.slice(0, minLength);
    const v2 = vector2.slice(0, minLength);
    
    const dotProduct = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
    const norm1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
    const norm2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
    
    // Avoid division by zero
    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (norm1 * norm2);
  };

  /**
   * Calculate similarities between all vectors (or a sample)
   */
  const calculateSimilarities = () => {
    if (!vectors || vectors.length < 2) return;
    
    setIsLoading(true);
    
    try {
      // For performance, limit to a sample if vectors array is large
      const effectiveSampleSize = Math.min(sampleSize, vectors.length);
      const sampleIndices = new Set();
      
      // Randomly select sample indices
      while (sampleIndices.size < effectiveSampleSize) {
        sampleIndices.add(Math.floor(Math.random() * vectors.length));
      }
      
      const sampledVectors = Array.from(sampleIndices).map(idx => ({
        vector: vectors[idx],
        document: documents && documents[idx] ? documents[idx] : null
      }));
      
      // Calculate pairwise similarities
      const similarities = [];
      const similarDocumentPairs = [];
      
      for (let i = 0; i < sampledVectors.length; i++) {
        for (let j = i + 1; j < sampledVectors.length; j++) {
          const similarity = calculateCosineSimilarity(
            sampledVectors[i].vector,
            sampledVectors[j].vector
          );
          
          similarities.push(similarity);
          
          // Record similar document pairs exceeding threshold
          if (similarity > similarityThreshold) {
            similarDocumentPairs.push({
              doc1: sampledVectors[i].document,
              doc2: sampledVectors[j].document,
              similarity
            });
          }
        }
      }
      
      // Generate histogram data
      const histogramBuckets = 20;
      const histogram = Array(histogramBuckets).fill(0);
      
      similarities.forEach(sim => {
        // Map similarity from [-1, 1] to [0, histogramBuckets-1]
        // In practice, most values will be positive for embeddings
        const bucketIndex = Math.min(
          histogramBuckets - 1,
          Math.max(0, Math.floor((sim + 1) / 2 * histogramBuckets))
        );
        histogram[bucketIndex]++;
      });
      
      // Sort similar pairs by similarity (descending)
      similarDocumentPairs.sort((a, b) => b.similarity - a.similarity);
      
      // Calculate statistics
      const stats = {
        mean: similarities.reduce((sum, val) => sum + val, 0) / similarities.length,
        median: similarities.sort((a, b) => a - b)[Math.floor(similarities.length / 2)],
        min: Math.min(...similarities),
        max: Math.max(...similarities),
        count: similarities.length,
        similarPairsCount: similarDocumentPairs.length
      };
      
      setSimilarityData({
        similarities,
        histogram,
        stats,
        similarPairs: similarDocumentPairs.slice(0, 10), // Keep only top 10 for display
        sampleSize: effectiveSampleSize
      });
    } catch (error) {
      console.error('Error calculating similarities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update similarity threshold
   */
  const handleThresholdChange = (event, newValue) => {
    setSimilarityThreshold(newValue);
    
    if (similarityData && similarityData.similarities) {
      // Recalculate similar pairs without recomputing all similarities
      const similarPairs = [];
      let pairIndex = 0;
      
      // This is a simplified approximation - in a real app we'd track the indices
      for (let i = 0; i < similarityData.sampleSize; i++) {
        for (let j = i + 1; j < similarityData.sampleSize; j++) {
          if (pairIndex < similarityData.similarities.length) {
            const similarity = similarityData.similarities[pairIndex];
            
            if (similarity > newValue) {
              similarPairs.push({
                doc1: documents && documents[i] ? documents[i] : { text: `Document ${i}` },
                doc2: documents && documents[j] ? documents[j] : { text: `Document ${j}` },
                similarity
              });
            }
            
            pairIndex++;
          }
        }
      }
      
      // Sort by similarity (descending)
      similarPairs.sort((a, b) => b.similarity - a.similarity);
      
      setSimilarityData(prev => ({
        ...prev,
        similarPairs: similarPairs.slice(0, 10),
        stats: {
          ...prev.stats,
          similarPairsCount: similarPairs.length
        }
      }));
    }
  };

  /**
   * Update sample size and recalculate
   */
  const handleSampleSizeChange = (event) => {
    setSampleSize(event.target.value);
  };

  /**
   * Render histogram visualization
   */
  const renderHistogram = () => {
    if (!similarityData) return null;
    
    const { histogram } = similarityData;
    
    // Generate labels for bins
    const labels = histogram.map((_, index) => {
      const start = -1 + (index * (2 / histogram.length));
      const end = -1 + ((index + 1) * (2 / histogram.length));
      return `${start.toFixed(1)}-${end.toFixed(1)}`;
    });
    
    const data = {
      labels,
      datasets: [
        {
          label: 'Similarity Distribution',
          data: histogram,
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
          borderColor: 'rgba(53, 162, 235, 1)',
          borderWidth: 1,
        },
      ],
    };
    
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Distribution of Vector Similarities',
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (!items || items.length === 0) return '';
              return `Similarity: ${items[0].label}`;
            },
            label: (context) => {
              return `Count: ${context.raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Similarity Range'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Count'
          },
          beginAtZero: true
        }
      }
    };
    
    return (
      <Box sx={{ height: 350 }}>
        <Bar options={options} data={data} ref={chartRef} />
      </Box>
    );
  };

  /**
   * Render similar document pairs
   */
  const renderSimilarPairs = () => {
    if (!similarityData || !similarityData.similarPairs) return null;
    
    const { similarPairs } = similarityData;
    
    if (similarPairs.length === 0) {
      return (
        <Alert severity="info" sx={{ mt: 2 }}>
          No document pairs found above the similarity threshold ({similarityThreshold.toFixed(2)}).
          Try lowering the threshold.
        </Alert>
      );
    }
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Most Similar Document Pairs (Above {similarityThreshold.toFixed(2)} threshold):
        </Typography>
        
        <Box sx={{ maxHeight: 250, overflow: 'auto' }}>
          {similarPairs.map((pair, idx) => (
            <Card key={idx} variant="outlined" sx={{ mb: 1, bgcolor: '#f8f9fa' }}>
              <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Pair #{idx + 1}
                  </Typography>
                  <Chip 
                    label={`Similarity: ${pair.similarity.toFixed(3)}`} 
                    size="small" 
                    color={pair.similarity > 0.9 ? "primary" : "default"}
                  />
                </Box>
                <Typography variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
                  <strong>Doc 1:</strong> {pair.doc1?.text?.substring(0, 80) || 'No text'}...
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                  <strong>Doc 2:</strong> {pair.doc2?.text?.substring(0, 80) || 'No text'}...
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    );
  };

  /**
   * Export visualization as PNG
   */
  const handleExportChart = () => {
    if (chartRef.current) {
      const link = document.createElement('a');
      link.download = 'similarity-distribution.png';
      link.href = chartRef.current.toBase64Image();
      link.click();
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Similarity Distribution Analysis</Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleExportChart}
            disabled={!similarityData}
          >
            Export Chart
          </Button>
        </Box>
        
        <Typography variant="body2" color="text.secondary" paragraph>
          This visualization shows how similar your vectors are to each other, which helps identify 
          content duplication and semantic relationships in your dataset.
        </Typography>
      </Box>
      
      {/* Controls */}
      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Sample Size</InputLabel>
          <Select
            value={sampleSize}
            label="Sample Size"
            onChange={handleSampleSizeChange}
          >
            <MenuItem value={50}>50 vectors</MenuItem>
            <MenuItem value={100}>100 vectors</MenuItem>
            <MenuItem value={200}>200 vectors</MenuItem>
            <MenuItem value={500}>500 vectors</MenuItem>
          </Select>
        </FormControl>
        
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>View Type</InputLabel>
          <Select
            value={visualizationType}
            label="View Type"
            onChange={(e) => setVisualizationType(e.target.value)}
          >
            <MenuItem value="histogram">Histogram</MenuItem>
            <MenuItem value="pairs">Similar Pairs</MenuItem>
          </Select>
        </FormControl>
        
        <Button
          variant="contained"
          size="small"
          onClick={calculateSimilarities}
          disabled={isLoading || !vectors || vectors.length < 2}
        >
          {isLoading ? 'Calculating...' : 'Calculate Similarities'}
        </Button>
      </Box>
      
      {/* Loading indicator */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
          <CircularProgress />
        </Box>
      )}
      
      {/* No data alert */}
      {!vectors || vectors.length < 2 ? (
        <Alert severity="info">
          At least two vectors are required to calculate similarities. 
          Please upload vector data with multiple documents.
        </Alert>
      ) : !similarityData ? (
        <Alert severity="info">
          Click "Calculate Similarities" to analyze vector relationships.
        </Alert>
      ) : (
        <>
          {/* Similarity statistics */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Similarity Statistics:
            </Typography>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip 
                label={`Mean: ${similarityData.stats.mean.toFixed(3)}`} 
                variant="outlined" 
                size="small" 
              />
              <Chip 
                label={`Median: ${similarityData.stats.median.toFixed(3)}`} 
                variant="outlined" 
                size="small" 
              />
              <Chip 
                label={`Min: ${similarityData.stats.min.toFixed(3)}`} 
                variant="outlined" 
                size="small" 
              />
              <Chip 
                label={`Max: ${similarityData.stats.max.toFixed(3)}`} 
                variant="outlined" 
                size="small" 
              />
              <Chip 
                label={`Pairs analyzed: ${similarityData.stats.count}`} 
                variant="outlined" 
                size="small" 
              />
            </Box>
          </Box>
          
          {/* Histogram visualization */}
          {visualizationType === 'histogram' && renderHistogram()}
          
          {/* Similarity threshold slider */}
          <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Similarity Threshold: {similarityThreshold.toFixed(2)}
              <Tooltip title="Documents with similarity above this threshold are considered significantly similar">
                <IconButton size="small">
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Typography>
            <Slider
              value={similarityThreshold}
              onChange={handleThresholdChange}
              min={0}
              max={1}
              step={0.01}
              valueLabelDisplay="auto"
            />
            <Typography variant="body2" color="text.secondary">
              {similarityData.stats.similarPairsCount} pairs above threshold 
              ({((similarityData.stats.similarPairsCount / similarityData.stats.count) * 100).toFixed(1)}% of pairs)
            </Typography>
          </Box>
          
          {/* Similar pairs visualization */}
          {visualizationType === 'pairs' && renderSimilarPairs()}
          
          {/* Embedding model info */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="caption" display="block" color="text.secondary">
              Analysis based on {similarityData.sampleSize} vectors using {embeddingModel || "Unknown"} embedding model.
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
};

export default SimilarityDistributionVisualizer; 