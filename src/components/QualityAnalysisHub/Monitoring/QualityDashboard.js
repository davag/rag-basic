import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Info as InfoIcon,
  PlayArrow as PlayArrowIcon,
  TrendingFlat as TrendingFlatIcon
} from '@mui/icons-material';
import { Line } from 'react-chartjs-2';

// Mock LLM instance for quality checks
const createLlmInstance = (model, systemPrompt) => {
  return {
    invoke: async (prompt) => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Return mock analysis results
      if (prompt.includes('Analyze this document for RAG quality')) {
        return JSON.stringify({
          completeness: Math.random() * 3 + 7,
          formatting: Math.random() * 3 + 7,
          informativeness: Math.random() * 3 + 7,
          credibility: Math.random() * 3 + 7
        });
      }
      
      if (prompt.includes('Analyze these embedding pairs for semantic coherence')) {
        return JSON.stringify({
          coherenceScore: Math.random() * 3 + 7,
          strengths: ['Good semantic relationships', 'Consistent embeddings'],
          weaknesses: ['Some outliers in the distribution'],
          recommendations: ['Consider fine-tuning for specific domain']
        });
      }
      
      return JSON.stringify({ score: Math.random() * 3 + 7 });
    }
  };
};

// Helper function to get color based on score
const getScoreColor = (score) => {
  if (score >= 80) return '#4caf50'; // Green
  if (score >= 60) return '#8bc34a'; // Light green
  if (score >= 40) return '#ffc107'; // Yellow/amber
  if (score >= 20) return '#ff9800'; // Orange
  return '#f44336'; // Red
};

// Helper function to get trend icon
const getTrendIcon = (trend) => {
  if (trend > 5) return <TrendingUpIcon color="success" />;
  if (trend < -5) return <TrendingDownIcon color="error" />;
  return <TrendingFlatIcon color="action" />;
};

const QualityDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [runningChecks, setRunningChecks] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({
    timestamp: new Date().toISOString(),
    overall: {
      score: 0,
      trend: 0,
      issues: 0
    },
    components: {
      documents: {
        score: 0,
        trend: 0,
        issues: 0,
        details: {
          total: 0,
          processed: 0,
          failed: 0
        }
      },
      embeddings: {
        score: 0,
        trend: 0,
        issues: 0,
        details: {
          total: 0,
          optimized: 0,
          degraded: 0
        }
      },
      retrieval: {
        score: 0,
        trend: 0,
        issues: 0,
        details: {
          queries: 0,
          successful: 0,
          failed: 0
        }
      },
      storage: {
        score: 0,
        trend: 0,
        issues: 0,
        details: {
          size: '0GB',
          indices: 0,
          fragmentation: '0%'
        }
      }
    },
    recentIssues: [],
    history: {
      labels: [],
      datasets: {
        overall: [],
        documents: [],
        embeddings: [],
        retrieval: []
      }
    }
  });
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [editingIssue, setEditingIssue] = useState(null);
  const [issueForm, setIssueForm] = useState({
    component: '',
    severity: 'info',
    message: ''
  });

  const refreshMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Get quality check results from localStorage or your backend
      const qualityResults = JSON.parse(localStorage.getItem('qualityCheckResults') || '{}');
      
      // Update metrics based on quality check results
      const newMetrics = {
        ...metrics,
        timestamp: new Date().toISOString(),
        overall: {
          score: qualityResults.overallScore || 0,
          trend: qualityResults.overallTrend || 0,
          issues: qualityResults.totalIssues || 0
        },
        components: {
          documents: {
            score: qualityResults.documentScore || 0,
            trend: qualityResults.documentTrend || 0,
            issues: qualityResults.documentIssues || 0,
            details: {
              total: qualityResults.totalDocuments || 0,
              processed: qualityResults.processedDocuments || 0,
              failed: qualityResults.failedDocuments || 0
            }
          },
          embeddings: {
            score: qualityResults.embeddingScore || 0,
            trend: qualityResults.embeddingTrend || 0,
            issues: qualityResults.embeddingIssues || 0,
            details: {
              total: qualityResults.totalEmbeddings || 0,
              optimized: qualityResults.optimizedEmbeddings || 0,
              degraded: qualityResults.degradedEmbeddings || 0
            }
          },
          retrieval: {
            score: qualityResults.retrievalScore || 0,
            trend: qualityResults.retrievalTrend || 0,
            issues: qualityResults.retrievalIssues || 0,
            details: {
              queries: qualityResults.totalQueries || 0,
              successful: qualityResults.successfulQueries || 0,
              failed: qualityResults.failedQueries || 0
            }
          },
          storage: {
            score: qualityResults.storageScore || 0,
            trend: qualityResults.storageTrend || 0,
            issues: qualityResults.storageIssues || 0,
            details: {
              size: qualityResults.storageSize || '0GB',
              indices: qualityResults.storageIndices || 0,
              fragmentation: qualityResults.storageFragmentation || '0%'
            }
          }
        },
        recentIssues: qualityResults.recentIssues || [],
        history: {
          labels: qualityResults.historyLabels || [],
          datasets: {
            overall: qualityResults.historyOverall || [],
            documents: qualityResults.historyDocuments || [],
            embeddings: qualityResults.historyEmbeddings || [],
            retrieval: qualityResults.historyRetrieval || []
          }
        }
      };

      setMetrics(newMetrics);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      setError('Failed to fetch metrics: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [metrics]);

  const runQualityChecks = async () => {
    setRunningChecks(true);
    try {
      // Get current documents and vector store from localStorage
      const documents = JSON.parse(localStorage.getItem('documents') || '[]');
      const vectorStoreData = JSON.parse(localStorage.getItem('vectorStore') || '{}');
      
      // Create LLM instance for analysis
      const llm = createLlmInstance('gpt-4o-mini', 'You are an expert at analyzing RAG system quality.');
      
      // 1. Document Quality Analysis
      const documentResults = {
        totalDocuments: documents.length,
        processedDocuments: documents.filter(doc => doc.processed).length,
        failedDocuments: documents.filter(doc => doc.error).length,
        qualityScores: {
          completeness: 0,
          formatting: 0,
          informativeness: 0,
          credibility: 0
        }
      };

      // Analyze a sample of documents
      const sampleSize = Math.min(10, documents.length);
      const sampleDocs = documents.slice(0, sampleSize);
      
      for (const doc of sampleDocs) {
        const prompt = `Analyze this document for RAG quality:
          ${doc.pageContent.substring(0, 1000)}
          
          Return a JSON object with scores (0-10) for:
          - completeness (how complete is the information)
          - formatting (how well structured is the content)
          - informativeness (how valuable is the information)
          - credibility (how reliable is the source)
          
          No markdown formatting, just the JSON object.`;
        
        const response = await llm.invoke(prompt);
        const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const scores = JSON.parse(cleanResponse);
        
        documentResults.qualityScores.completeness += scores.completeness;
        documentResults.qualityScores.formatting += scores.formatting;
        documentResults.qualityScores.informativeness += scores.informativeness;
        documentResults.qualityScores.credibility += scores.credibility;
      }

      // Calculate average scores
      if (sampleSize > 0) {
        documentResults.qualityScores.completeness /= sampleSize;
        documentResults.qualityScores.formatting /= sampleSize;
        documentResults.qualityScores.informativeness /= sampleSize;
        documentResults.qualityScores.credibility /= sampleSize;
      }

      // 2. Embedding Quality Analysis
      const embeddingResults = {
        totalEmbeddings: vectorStoreData.memoryVectors?.length || 0,
        optimizedEmbeddings: 0,
        degradedEmbeddings: 0,
        qualityScores: {
          semantic: 0
        }
      };

      if (vectorStoreData.memoryVectors?.length > 0) {
        // Analyze semantic coherence
        const semanticPrompt = `Analyze these embedding pairs for semantic coherence:
          ${vectorStoreData.memoryVectors.slice(0, 5).map(v => 
            v.content?.substring(0, 200) || 'No content'
          ).join('\n\n')}
          
          Return a JSON object with:
          - coherenceScore (0-10)
          - strengths (array of strengths)
          - weaknesses (array of weaknesses)
          
          No markdown formatting, just the JSON object.`;
        
        const semanticResponse = await llm.invoke(semanticPrompt);
        const cleanSemanticResponse = semanticResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const semanticResults = JSON.parse(cleanSemanticResponse);
        
        embeddingResults.qualityScores.semantic = semanticResults.coherenceScore;
        embeddingResults.optimizedEmbeddings = Math.floor(embeddingResults.totalEmbeddings * (semanticResults.coherenceScore / 10));
        embeddingResults.degradedEmbeddings = embeddingResults.totalEmbeddings - embeddingResults.optimizedEmbeddings;
      }

      // 3. Retrieval Performance Analysis
      const retrievalResults = {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        averageLatency: 0,
        qualityScores: {
          relevance: 0,
          completeness: 0,
          consistency: 0
        }
      };

      // Get query history from localStorage
      const queryHistory = JSON.parse(localStorage.getItem('queryHistory') || '[]');
      
      if (queryHistory.length > 0) {
        retrievalResults.totalQueries = queryHistory.length;
        retrievalResults.successfulQueries = queryHistory.filter(q => q.success).length;
        retrievalResults.failedQueries = queryHistory.filter(q => !q.success).length;
        
        // Calculate average latency
        const latencies = queryHistory
          .filter(q => q.latency)
          .map(q => q.latency);
        retrievalResults.averageLatency = latencies.length > 0 
          ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
          : 0;

        // Calculate quality scores from successful queries
        const successfulQueries = queryHistory.filter(q => q.success);
        if (successfulQueries.length > 0) {
          retrievalResults.qualityScores = {
            relevance: successfulQueries.reduce((acc, q) => acc + (q.relevanceScore || 0), 0) / successfulQueries.length,
            completeness: successfulQueries.reduce((acc, q) => acc + (q.completenessScore || 0), 0) / successfulQueries.length,
            consistency: successfulQueries.reduce((acc, q) => acc + (q.consistencyScore || 0), 0) / successfulQueries.length
          };
        }
      } else {
        // Set default values when no queries exist
        retrievalResults.totalQueries = 0;
        retrievalResults.successfulQueries = 0;
        retrievalResults.failedQueries = 0;
        retrievalResults.averageLatency = 0;
        retrievalResults.qualityScores = {
          relevance: 0,
          completeness: 0,
          consistency: 0
        };
      }

      // 4. Storage Analysis
      const storageResults = {
        size: `${(JSON.stringify(vectorStoreData).length / (1024 * 1024)).toFixed(2)}MB`,
        indices: Object.keys(vectorStoreData).length,
        fragmentation: '0%' // This would need actual storage analysis
      };

      // Calculate overall metrics
      const documentScore = Math.round((
        documentResults.qualityScores.completeness +
        documentResults.qualityScores.formatting +
        documentResults.qualityScores.informativeness +
        documentResults.qualityScores.credibility
      ) / 4 * 100) / 100;

      const embeddingScore = Math.round(embeddingResults.qualityScores.semantic * 100) / 100;

      const retrievalScore = Math.round((retrievalResults.successfulQueries / retrievalResults.totalQueries) * 10000) / 100;

      const storageScore = 100; // This would need actual storage health metrics

      const overallScore = Math.round((
        documentScore +
        embeddingScore +
        retrievalScore +
        storageScore
      ) / 4 * 100) / 100;

      // Get previous results for trend calculation
      const previousResults = JSON.parse(localStorage.getItem('qualityCheckResults') || '{}');
      
      // Calculate trends
      const calculateTrend = (current, previous) => {
        if (!previous) return 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      // Prepare quality check results
      const qualityResults = {
        timestamp: new Date().toISOString(),
        overallScore,
        overallTrend: calculateTrend(overallScore, previousResults.overallScore),
        totalIssues: documentResults.failedDocuments + embeddingResults.degradedEmbeddings + retrievalResults.failedQueries,
        
        // Document metrics
        documentScore,
        documentTrend: calculateTrend(documentScore, previousResults.documentScore),
        documentIssues: documentResults.failedDocuments,
        totalDocuments: documentResults.totalDocuments,
        processedDocuments: documentResults.processedDocuments,
        failedDocuments: documentResults.failedDocuments,
        
        // Embedding metrics
        embeddingScore,
        embeddingTrend: calculateTrend(embeddingScore, previousResults.embeddingScore),
        embeddingIssues: embeddingResults.degradedEmbeddings,
        totalEmbeddings: embeddingResults.totalEmbeddings,
        optimizedEmbeddings: embeddingResults.optimizedEmbeddings,
        degradedEmbeddings: embeddingResults.degradedEmbeddings,
        
        // Retrieval metrics
        retrievalScore,
        retrievalTrend: calculateTrend(retrievalScore, previousResults.retrievalScore),
        retrievalIssues: retrievalResults.failedQueries,
        totalQueries: retrievalResults.totalQueries,
        successfulQueries: retrievalResults.successfulQueries,
        failedQueries: retrievalResults.failedQueries,
        
        // Storage metrics
        storageScore,
        storageTrend: calculateTrend(storageScore, previousResults.storageScore),
        storageIssues: 0,
        storageSize: storageResults.size,
        storageIndices: storageResults.indices,
        storageFragmentation: storageResults.fragmentation,
        
        // Recent issues
        recentIssues: [
          ...(documentResults.failedDocuments > 0 ? [{
            id: Date.now(),
            timestamp: new Date().toISOString(),
            component: 'Documents',
            severity: 'warning',
            message: `${documentResults.failedDocuments} documents failed processing`
          }] : []),
          ...(embeddingResults.degradedEmbeddings > 0 ? [{
            id: Date.now() + 1,
            timestamp: new Date().toISOString(),
            component: 'Embeddings',
            severity: 'warning',
            message: `${embeddingResults.degradedEmbeddings} embeddings show reduced quality`
          }] : []),
          ...(retrievalResults.failedQueries > 0 ? [{
            id: Date.now() + 2,
            timestamp: new Date().toISOString(),
            component: 'Retrieval',
            severity: 'warning',
            message: `${retrievalResults.failedQueries} queries failed`
          }] : [])
        ],
        
        // History
        historyLabels: Array.from({ length: 24 }, (_, i) => `${23-i}h ago`),
        historyOverall: [...(previousResults.historyOverall || []).slice(1), overallScore],
        historyDocuments: [...(previousResults.historyDocuments || []).slice(1), documentScore],
        historyEmbeddings: [...(previousResults.historyEmbeddings || []).slice(1), embeddingScore],
        historyRetrieval: [...(previousResults.historyRetrieval || []).slice(1), retrievalScore]
      };

      // Save results to localStorage
      localStorage.setItem('qualityCheckResults', JSON.stringify(qualityResults));
      
      // Update metrics state
      setMetrics({
        ...metrics,
        timestamp: qualityResults.timestamp,
        overall: {
          score: qualityResults.overallScore,
          trend: qualityResults.overallTrend,
          issues: qualityResults.totalIssues
        },
        components: {
          documents: {
            score: qualityResults.documentScore,
            trend: qualityResults.documentTrend,
            issues: qualityResults.documentIssues,
            details: {
              total: qualityResults.totalDocuments,
              processed: qualityResults.processedDocuments,
              failed: qualityResults.failedDocuments
            }
          },
          embeddings: {
            score: qualityResults.embeddingScore,
            trend: qualityResults.embeddingTrend,
            issues: qualityResults.embeddingIssues,
            details: {
              total: qualityResults.totalEmbeddings,
              optimized: qualityResults.optimizedEmbeddings,
              degraded: qualityResults.degradedEmbeddings
            }
          },
          retrieval: {
            score: qualityResults.retrievalScore,
            trend: qualityResults.retrievalTrend,
            issues: qualityResults.retrievalIssues,
            details: {
              queries: qualityResults.totalQueries,
              successful: qualityResults.successfulQueries,
              failed: qualityResults.failedQueries
            }
          },
          storage: {
            score: qualityResults.storageScore,
            trend: qualityResults.storageTrend,
            issues: qualityResults.storageIssues,
            details: {
              size: qualityResults.storageSize,
              indices: qualityResults.storageIndices,
              fragmentation: qualityResults.storageFragmentation
            }
          }
        },
        recentIssues: qualityResults.recentIssues,
        history: {
          labels: qualityResults.historyLabels,
          datasets: {
            overall: qualityResults.historyOverall,
            documents: qualityResults.historyDocuments,
            embeddings: qualityResults.historyEmbeddings,
            retrieval: qualityResults.historyRetrieval
          }
        }
      });

    } catch (error) {
      console.error('Error running quality checks:', error);
      setError('Failed to run quality checks: ' + error.message);
    } finally {
      setRunningChecks(false);
    }
  };

  useEffect(() => {
    refreshMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(refreshMetrics, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshMetrics]);

  const handleAddIssue = () => {
    setEditingIssue(null);
    setIssueForm({
      component: '',
      severity: 'info',
      message: ''
    });
    setShowIssueDialog(true);
  };

  const handleEditIssue = (issue) => {
    setEditingIssue(issue);
    setIssueForm({
      component: issue.component,
      severity: issue.severity,
      message: issue.message
    });
    setShowIssueDialog(true);
  };

  const handleDeleteIssue = (issueId) => {
    const newMetrics = {
      ...metrics,
      recentIssues: metrics.recentIssues.filter(issue => issue.id !== issueId)
    };
    setMetrics(newMetrics);
    
    // Update localStorage
    const qualityResults = JSON.parse(localStorage.getItem('qualityCheckResults') || '{}');
    qualityResults.recentIssues = newMetrics.recentIssues;
    localStorage.setItem('qualityCheckResults', JSON.stringify(qualityResults));
  };

  const handleSaveIssue = () => {
    const newIssue = {
      id: editingIssue ? editingIssue.id : Date.now(),
      timestamp: new Date().toISOString(),
      ...issueForm
    };

    const newMetrics = {
      ...metrics,
      recentIssues: editingIssue
        ? metrics.recentIssues.map(issue => 
            issue.id === editingIssue.id ? newIssue : issue
          )
        : [newIssue, ...metrics.recentIssues]
    };

    setMetrics(newMetrics);
    
    // Update localStorage
    const qualityResults = JSON.parse(localStorage.getItem('qualityCheckResults') || '{}');
    qualityResults.recentIssues = newMetrics.recentIssues;
    localStorage.setItem('qualityCheckResults', JSON.stringify(qualityResults));
    
    setShowIssueDialog(false);
  };

  const renderMetricCard = (title, data) => (
    <Card variant="outlined">
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">{title}</Typography>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography
              variant="h4"
              color={getScoreColor(data.score)}
            >
              {data.score}%
            </Typography>
            {getTrendIcon(data.trend)}
          </Box>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableBody>
              {Object.entries(data.details).map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell component="th" scope="row">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </TableCell>
                  <TableCell align="right">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {data.issues > 0 && (
          <Box mt={2} display="flex" alignItems="center">
            <WarningIcon color="warning" sx={{ mr: 1 }} />
            <Typography color="text.secondary">
              {data.issues} active {data.issues === 1 ? 'issue' : 'issues'}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderHistoryChart = () => {
    if (!metrics) return null;

    const data = {
      labels: metrics.history.labels,
      datasets: [
        {
          label: 'Overall',
          data: metrics.history.datasets.overall,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        },
        {
          label: 'Documents',
          data: metrics.history.datasets.documents,
          borderColor: 'rgb(54, 162, 235)',
          tension: 0.1
        },
        {
          label: 'Embeddings',
          data: metrics.history.datasets.embeddings,
          borderColor: 'rgb(153, 102, 255)',
          tension: 0.1
        },
        {
          label: 'Retrieval',
          data: metrics.history.datasets.retrieval,
          borderColor: 'rgb(255, 159, 64)',
          tension: 0.1
        }
      ]
    };

    const options = {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Quality Scores History'
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100
        }
      }
    };

    return (
      <Box sx={{ height: 300 }}>
        <Line data={data} options={options} />
      </Box>
    );
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          Quality Dashboard
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          <Button
            variant="contained"
            color="primary"
            startIcon={runningChecks ? <CircularProgress size={20} /> : <PlayArrowIcon />}
            onClick={runQualityChecks}
            disabled={runningChecks}
          >
            {runningChecks ? 'Running Checks...' : 'Run Quality Checks'}
          </Button>
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            }
            label="Auto-refresh"
          />
          <IconButton onClick={refreshMetrics} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 3 }} />}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {metrics.overall.score === 0 ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          <InfoIcon sx={{ mr: 1 }} />
          No quality check results available. Click "Run Quality Checks" to analyze your system.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">Overall System Quality</Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography
                      variant="h3"
                      color={getScoreColor(metrics.overall.score)}
                    >
                      {metrics.overall.score}%
                    </Typography>
                    {getTrendIcon(metrics.overall.trend)}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {Object.entries(metrics.components).map(([key, data]) => (
            <Grid item xs={12} md={6} key={key}>
              {renderMetricCard(
                key.charAt(0).toUpperCase() + key.slice(1),
                data
              )}
            </Grid>
          ))}

          <Grid item xs={12}>
            <Card>
              <CardContent>
                {renderHistoryChart()}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" gutterBottom>
                    Recent Issues
                  </Typography>
                  <Tooltip title="Add New Issue">
                    <IconButton onClick={handleAddIssue} color="primary">
                      <AddIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Component</TableCell>
                        <TableCell>Severity</TableCell>
                        <TableCell>Message</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {metrics?.recentIssues.map((issue) => (
                        <TableRow key={issue.id}>
                          <TableCell>
                            {new Date(issue.timestamp).toLocaleTimeString()}
                          </TableCell>
                          <TableCell>{issue.component}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={issue.severity}
                              color={
                                issue.severity === 'error' ? 'error' :
                                issue.severity === 'warning' ? 'warning' : 'info'
                              }
                            />
                          </TableCell>
                          <TableCell>{issue.message}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Edit Issue">
                              <IconButton 
                                size="small" 
                                onClick={() => handleEditIssue(issue)}
                                sx={{ mr: 1 }}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Issue">
                              <IconButton 
                                size="small" 
                                onClick={() => handleDeleteIssue(issue.id)}
                                color="error"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Issue Management Dialog */}
      <Dialog 
        open={showIssueDialog} 
        onClose={() => setShowIssueDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingIssue ? 'Edit Issue' : 'Add New Issue'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Component</InputLabel>
              <Select
                value={issueForm.component}
                onChange={(e) => setIssueForm({...issueForm, component: e.target.value})}
                label="Component"
              >
                <MenuItem value="Documents">Documents</MenuItem>
                <MenuItem value="Embeddings">Embeddings</MenuItem>
                <MenuItem value="Retrieval">Retrieval</MenuItem>
                <MenuItem value="Storage">Storage</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Severity</InputLabel>
              <Select
                value={issueForm.severity}
                onChange={(e) => setIssueForm({...issueForm, severity: e.target.value})}
                label="Severity"
              >
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="error">Error</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Message"
              multiline
              rows={3}
              value={issueForm.message}
              onChange={(e) => setIssueForm({...issueForm, message: e.target.value})}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowIssueDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveIssue}
            variant="contained"
            disabled={!issueForm.component || !issueForm.message}
          >
            {editingIssue ? 'Update' : 'Add'} Issue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QualityDashboard; 