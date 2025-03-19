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
  FormControlLabel
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { Line } from 'react-chartjs-2';

const QualityDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [metrics, setMetrics] = useState(null);

  // Simulated metrics data
  const generateMetrics = () => ({
    timestamp: new Date().toISOString(),
    overall: {
      score: 87,
      trend: +2,
      issues: 7
    },
    components: {
      documents: {
        score: 92,
        trend: +1,
        issues: 2,
        details: {
          total: 1250,
          processed: 1200,
          failed: 3
        }
      },
      embeddings: {
        score: 85,
        trend: -1,
        issues: 3,
        details: {
          total: 1200,
          optimized: 1150,
          degraded: 5
        }
      },
      retrieval: {
        score: 89,
        trend: +3,
        issues: 1,
        details: {
          queries: 500,
          successful: 485,
          failed: 15
        }
      },
      storage: {
        score: 94,
        trend: 0,
        issues: 1,
        details: {
          size: '2.3GB',
          indices: 3,
          fragmentation: '5%'
        }
      }
    },
    recentIssues: [
      {
        id: 1,
        timestamp: '2024-03-19T06:15:00Z',
        component: 'Embeddings',
        severity: 'warning',
        message: 'Degraded embedding quality detected in recent batch'
      },
      {
        id: 2,
        timestamp: '2024-03-19T06:10:00Z',
        component: 'Retrieval',
        severity: 'error',
        message: 'Query latency spike detected'
      },
      {
        id: 3,
        timestamp: '2024-03-19T06:05:00Z',
        component: 'Documents',
        severity: 'info',
        message: 'New document batch processed successfully'
      }
    ],
    history: {
      labels: Array.from({ length: 24 }, (_, i) => `${23-i}h ago`),
      datasets: {
        overall: Array.from({ length: 24 }, () => Math.floor(80 + Math.random() * 20)),
        documents: Array.from({ length: 24 }, () => Math.floor(85 + Math.random() * 15)),
        embeddings: Array.from({ length: 24 }, () => Math.floor(75 + Math.random() * 25)),
        retrieval: Array.from({ length: 24 }, () => Math.floor(80 + Math.random() * 20))
      }
    }
  });

  const refreshMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setMetrics(generateMetrics());
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(refreshMetrics, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshMetrics]);

  const getScoreColor = (score) => {
    if (score >= 90) return 'success.main';
    if (score >= 70) return 'warning.main';
    return 'error.main';
  };

  const getTrendIcon = (trend) => {
    if (trend > 0) return <TrendingUpIcon color="success" />;
    if (trend < 0) return <TrendingDownIcon color="error" />;
    return null;
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

      {metrics && (
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
                <Typography variant="h6" gutterBottom>
                  Recent Issues
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Component</TableCell>
                        <TableCell>Severity</TableCell>
                        <TableCell>Message</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {metrics.recentIssues.map((issue) => (
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
    </Box>
  );
};

export default QualityDashboard; 