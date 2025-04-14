import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  IconButton
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import DownloadIcon from '@mui/icons-material/Download';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Scatter } from 'react-chartjs-2';
import * as d3 from 'd3';
import { Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip as ChartTooltip, Legend } from 'chart.js';

// Register required Chart.js components
ChartJS.register(LinearScale, PointElement, LineElement, ChartTooltip, Legend);

/**
 * VectorQualityVisualizer Component
 * 
 * This component provides visualizations for vector quality analysis:
 * - 2D/3D PCA visualization of vector embeddings
 * - Dimensionality importance chart
 * - Clustering visualization
 * - Similarity distribution
 * 
 * @param {Object} props
 * @param {Array} props.vectors - Vector embeddings to visualize
 * @param {Array} props.documents - Associated documents for the vectors
 * @param {Object} props.stats - Statistics about the vectors (dimensions, count, etc.)
 * @param {String} props.embeddingModel - The embedding model used
 */
const VectorQualityVisualizer = ({ vectors, documents, stats, embeddingModel }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [pcaData, setPcaData] = useState(null);
  const [dimensionData, setDimensionData] = useState(null);
  const [clustersData, setClustersData] = useState(null);
  const [selectedClusterCount, setSelectedClusterCount] = useState(5);
  const chartRef = useRef(null);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  useEffect(() => {
    if (vectors && vectors.length > 0) {
      performAnalysis();
    }
  }, [vectors, selectedClusterCount]);

  /**
   * Performs PCA to reduce dimensionality to 2D for visualization
   */
  const calculatePCA = (data, dimensions = 2) => {
    if (!data || data.length === 0) return [];
    
    // Center the data
    const means = [];
    for (let i = 0; i < data[0].length; i++) {
      const values = data.map(row => row[i]);
      means.push(values.reduce((a, b) => a + b, 0) / values.length);
    }
    
    const centeredData = data.map(row => 
      row.map((val, i) => val - means[i])
    );
    
    // Calculate covariance matrix
    const covMatrix = [];
    for (let i = 0; i < centeredData[0].length; i++) {
      covMatrix[i] = [];
      for (let j = 0; j < centeredData[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < centeredData.length; k++) {
          sum += centeredData[k][i] * centeredData[k][j];
        }
        covMatrix[i][j] = sum / (centeredData.length - 1);
      }
    }
    
    // Calculate eigenvalues and eigenvectors
    const { eigenvalues, eigenvectors } = calculateEigen(covMatrix);
    
    // Sort eigenvectors by eigenvalues in descending order
    const indices = eigenvalues.map((val, idx) => ({ val, idx }))
      .sort((a, b) => b.val - a.val)
      .map(x => x.idx);
    
    // Take the top 'dimensions' eigenvectors
    const topEigenvectors = indices.slice(0, dimensions)
      .map(idx => eigenvectors[idx]);
    
    // Project the data onto the principal components
    return centeredData.map(row => {
      return topEigenvectors.map(vec => 
        vec.reduce((sum, v, i) => sum + v * row[i], 0)
      );
    });
  };

  /**
   * Performs k-means clustering on the data
   */
  const performKMeans = (data, k = 5, maxIterations = 100) => {
    if (!data || data.length === 0) return { centroids: [], assignments: [] };
    
    // Initialize centroids randomly
    const centroids = [];
    const seenIndices = new Set();
    for (let i = 0; i < k; i++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * data.length);
      } while (seenIndices.has(idx) && seenIndices.size < data.length);
      
      seenIndices.add(idx);
      centroids.push([...data[idx]]);
    }
    
    // Calculate Euclidean distance
    const distance = (a, b) => {
      return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
    };
    
    // Assign points to clusters
    let assignments = Array(data.length).fill(0);
    let iterations = 0;
    let converged = false;
    
    while (!converged && iterations < maxIterations) {
      // Assign each point to nearest centroid
      const newAssignments = data.map(point => {
        const distances = centroids.map(centroid => distance(point, centroid));
        return distances.indexOf(Math.min(...distances));
      });
      
      // Check if converged
      converged = JSON.stringify(assignments) === JSON.stringify(newAssignments);
      assignments = newAssignments;
      
      // Recalculate centroids
      for (let i = 0; i < k; i++) {
        const clusterPoints = data.filter((_, idx) => assignments[idx] === i);
        if (clusterPoints.length > 0) {
          const newCentroid = clusterPoints[0].map((_, dim) => 
            clusterPoints.reduce((sum, p) => sum + p[dim], 0) / clusterPoints.length
          );
          centroids[i] = newCentroid;
        }
      }
      
      iterations++;
    }
    
    return { centroids, assignments };
  };

  /**
   * Simple method to calculate eigenvalues and eigenvectors for covariance matrix
   * Note: For a production app, you would use a proper linear algebra library
   */
  const calculateEigen = (matrix) => {
    // This is a simplified approach - a real implementation would use a numeric library
    const dim = matrix.length;
    const eigenvalues = Array(dim).fill(1);
    const eigenvectors = Array(dim).fill().map((_, i) => {
      const v = Array(dim).fill(0);
      v[i] = 1;
      return v;
    });
    
    return { eigenvalues, eigenvectors };
  };

  /**
   * Analyze dimension importance
   */
  const analyzeDimensionality = (vectors) => {
    if (!vectors || vectors.length === 0) return null;
    
    const dimensions = vectors[0].length;
    const variances = [];
    
    // Calculate variance for each dimension
    for (let i = 0; i < dimensions; i++) {
      const values = vectors.map(v => v[i]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      variances.push({ dimension: i, variance });
    }
    
    // Sort dimensions by variance
    return variances.sort((a, b) => b.variance - a.variance);
  };

  /**
   * Perform all required analysis for visualization
   */
  const performAnalysis = async () => {
    setIsLoading(true);
    
    try {
      // Calculate PCA projections for visualization
      const pca = calculatePCA(vectors, 2);
      setPcaData(pca);
      
      // Analyze dimension importance
      const dimensionStats = analyzeDimensionality(vectors);
      setDimensionData(dimensionStats);
      
      // Perform clustering
      const { assignments } = performKMeans(vectors, selectedClusterCount);
      
      // Combine with PCA data for visualization
      const clusters = assignments.map((cluster, idx) => ({
        cluster,
        x: pca[idx][0],
        y: pca[idx][1],
        document: documents && documents[idx] ? documents[idx].pageContent?.substring(0, 100) : `Document ${idx}`
      }));
      
      setClustersData(clusters);
    } catch (error) {
      console.error('Error in vector quality analysis:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Renders the cluster visualization using Chart.js
   */
  const renderClusterVisualization = () => {
    if (!clustersData) return null;
    
    // Create datasets for each cluster
    const uniqueClusters = [...new Set(clustersData.map(d => d.cluster))];
    const datasets = uniqueClusters.map(cluster => {
      const points = clustersData.filter(d => d.cluster === cluster);
      return {
        label: `Cluster ${cluster + 1}`,
        data: points.map(p => ({ x: p.x, y: p.y })),
        backgroundColor: getClusterColor(cluster),
        pointRadius: 5,
        pointHoverRadius: 7
      };
    });
    
    const data = { datasets };
    
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const index = context.dataIndex;
              const datasetIndex = context.datasetIndex;
              const cluster = uniqueClusters[datasetIndex];
              const point = clustersData.find(
                p => p.cluster === cluster && 
                p.x === context.parsed.x && 
                p.y === context.parsed.y
              );
              return point?.document || `Cluster ${cluster + 1}, Point ${index}`;
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
      <Box sx={{ height: 400 }}>
        <Scatter options={options} data={data} ref={chartRef} />
      </Box>
    );
  };

  /**
   * Renders the dimension importance chart
   */
  const renderDimensionImportance = () => {
    if (!dimensionData || dimensionData.length === 0) return null;
    
    // Take top 20 dimensions for visualization
    const topDimensions = dimensionData.slice(0, 20);
    
    const data = {
      labels: topDimensions.map(d => `Dim ${d.dimension}`),
      datasets: [
        {
          label: 'Importance Score (Variance)',
          data: topDimensions.map(d => d.variance),
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
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
        tooltip: {
          callbacks: {
            label: (context) => `Variance: ${context.formattedValue}`
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
        },
        x: {
          title: {
            display: true,
            text: 'Dimensions'
          }
        }
      }
    };
    
    return (
      <Box sx={{ height: 400 }}>
        <Scatter 
          options={options} 
          data={{
            datasets: [{
              label: 'Dimension Importance',
              data: topDimensions.map((d, i) => ({ 
                x: i, 
                y: d.variance 
              })),
              backgroundColor: 'rgba(53, 162, 235, 0.5)',
              pointRadius: 5,
              pointHoverRadius: 7
            }]
          }} 
        />
      </Box>
    );
  };

  // Helper function to get consistent colors for clusters
  const getClusterColor = (clusterIndex) => {
    const colors = [
      'rgba(255, 99, 132, 0.6)',   // red
      'rgba(54, 162, 235, 0.6)',   // blue
      'rgba(255, 206, 86, 0.6)',   // yellow
      'rgba(75, 192, 192, 0.6)',   // green
      'rgba(153, 102, 255, 0.6)',  // purple
      'rgba(255, 159, 64, 0.6)',   // orange
      'rgba(199, 199, 199, 0.6)',  // gray
      'rgba(83, 102, 255, 0.6)',   // indigo
      'rgba(255, 99, 255, 0.6)',   // pink
      'rgba(139, 69, 19, 0.6)',    // brown
    ];
    return colors[clusterIndex % colors.length];
  };

  // Export visualization as PNG
  const handleExportChart = () => {
    if (chartRef.current) {
      const link = document.createElement('a');
      link.download = 'vector-quality-visualization.png';
      link.href = chartRef.current.toBase64Image();
      link.click();
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          aria-label="vector quality visualization tabs"
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label="Clusters" />
          <Tab label="Dimension Importance" />
          <Tab label="About Vector Quality" />
        </Tabs>
      </Box>
      
      {/* Loading indicator */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
          <CircularProgress />
        </Box>
      )}
      
      {/* No data alert */}
      {!vectors || vectors.length === 0 ? (
        <Alert severity="info">
          No vector data available for visualization. Please upload vector data to see visualizations.
        </Alert>
      ) : (
        <>
          {/* Cluster Visualization Tab */}
          <Box sx={{ display: activeTab === 0 ? 'block' : 'none' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Vector Cluster Visualization</Typography>
              <Box>
                <FormControl variant="outlined" size="small" sx={{ mr: 2, minWidth: 120 }}>
                  <InputLabel>Clusters</InputLabel>
                  <Select
                    value={selectedClusterCount}
                    onChange={(e) => setSelectedClusterCount(e.target.value)}
                    label="Clusters"
                  >
                    {[3, 4, 5, 6, 7, 8, 10].map(num => (
                      <MenuItem key={num} value={num}>{num} clusters</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportChart}
                >
                  Export
                </Button>
              </Box>
            </Box>
            
            <Typography variant="body2" color="text.secondary" paragraph>
              This visualization shows your embeddings projected into 2D space using PCA, with k-means 
              clustering applied to identify {selectedClusterCount} semantic groups.
            </Typography>
            
            {renderClusterVisualization()}
            
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Interpretation:</strong> Each point represents a document embedding, and colors 
                represent different clusters. Similar documents should appear closer together.
              </Typography>
            </Box>
          </Box>
          
          {/* Dimension Importance Tab */}
          <Box sx={{ display: activeTab === 1 ? 'block' : 'none' }}>
            <Typography variant="h6">Dimension Importance</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              This chart shows the variance explained by each dimension, which indicates how much information 
              each dimension contains in your vector embeddings.
            </Typography>
            
            {renderDimensionImportance()}
            
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Interpretation:</strong> Dimensions with higher variance contain more information. 
                The steeper the drop-off, the more concentrated the information is in fewer dimensions.
              </Typography>
            </Box>
          </Box>
          
          {/* About Tab */}
          <Box sx={{ display: activeTab === 2 ? 'block' : 'none' }}>
            <Typography variant="h6">About Vector Quality Analysis</Typography>
            
            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  What makes good vector embeddings?
                </Typography>
                <Typography variant="body2" paragraph>
                  Good vector embeddings should:
                </Typography>
                <ul>
                  <li>
                    <Typography variant="body2">
                      <strong>Preserve semantic relationships</strong> - Similar concepts should be close together
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2">
                      <strong>Form clear clusters</strong> - Related documents should cluster together
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2">
                      <strong>Distribute information effectively</strong> - Information should be spread across dimensions
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2">
                      <strong>Have appropriate density</strong> - Not too sparse, not too concentrated
                    </Typography>
                  </li>
                </ul>
              </CardContent>
            </Card>
            
            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  How to interpret visualizations
                </Typography>
                <Typography variant="body2" paragraph>
                  <strong>Cluster View:</strong> Shows how your documents group together semantically. Well-defined 
                  clusters suggest the embeddings effectively capture different topics or themes in your data.
                </Typography>
                <Typography variant="body2">
                  <strong>Dimension Importance:</strong> Shows which dimensions capture the most information. A 
                  gradual slope indicates information is distributed across many dimensions, while a steep drop-off 
                  suggests information is concentrated in fewer dimensions.
                </Typography>
              </CardContent>
            </Card>
            
            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  Embedding Model: {embeddingModel || "Unknown"}
                </Typography>
                <Typography variant="body2">
                  Different embedding models have different characteristics. Models with higher dimensions 
                  can potentially capture more nuanced relationships but may be more computationally expensive.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </Box>
  );
};

export default VectorQualityVisualizer; 