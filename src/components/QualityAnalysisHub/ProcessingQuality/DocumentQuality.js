import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';

const DocumentQuality = () => {
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedMetrics, setSelectedMetrics] = useState(['readability', 'completeness', 'formatting']);
  const [sampleSize, setSampleSize] = useState(100);

  const metrics = {
    readability: {
      label: 'Readability',
      description: 'Analyzes text complexity and readability scores'
    },
    completeness: {
      label: 'Completeness',
      description: 'Checks for missing information and content gaps'
    },
    formatting: {
      label: 'Formatting',
      description: 'Evaluates document structure and formatting consistency'
    },
    metadata: {
      label: 'Metadata',
      description: 'Assesses presence and quality of metadata'
    },
    duplicates: {
      label: 'Duplicates',
      description: 'Identifies duplicate or near-duplicate content'
    }
  };

  const analyzeDocuments = async () => {
    setAnalyzing(true);
    try {
      // Simulated analysis - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setResults({
        summary: {
          totalDocuments: 150,
          analyzedDocuments: sampleSize,
          overallScore: 85,
          criticalIssues: 2,
          warnings: 5
        },
        metrics: {
          readability: {
            score: 88,
            details: {
              fleschKincaid: 65,
              automatedReadability: 12,
              daleChall: 9.2
            },
            issues: [
              {
                severity: 'warning',
                message: 'Complex sentences detected in 3 documents',
                affected: ['doc1.txt', 'doc2.txt', 'doc3.txt']
              }
            ]
          },
          completeness: {
            score: 92,
            details: {
              missingFields: 2,
              incompleteContent: 1
            },
            issues: [
              {
                severity: 'error',
                message: 'Required fields missing in 2 documents',
                affected: ['doc4.txt', 'doc5.txt']
              }
            ]
          },
          formatting: {
            score: 78,
            details: {
              inconsistentFormatting: 5,
              brokenLinks: 2
            },
            issues: [
              {
                severity: 'warning',
                message: 'Inconsistent heading styles in 5 documents',
                affected: ['doc6.txt', 'doc7.txt']
              }
            ]
          }
        }
      });
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'success.main';
    if (score >= 70) return 'warning.main';
    return 'error.main';
  };

  const renderMetricCard = (metricKey, data) => {
    if (!data) return null;

    return (
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              {metrics[metricKey].label}
            </Typography>
            <Chip
              label={`${data.score}%`}
              sx={{ 
                bgcolor: getScoreColor(data.score),
                color: 'white'
              }}
            />
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Details
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    {Object.entries(data.details).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell component="th" scope="row">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </TableCell>
                        <TableCell align="right">{value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Issues
              </Typography>
              <List dense>
                {data.issues.map((issue, index) => (
                  <ListItem key={index}>
                    {issue.severity === 'error' ? (
                      <ErrorIcon color="error" sx={{ mr: 1 }} />
                    ) : (
                      <WarningIcon color="warning" sx={{ mr: 1 }} />
                    )}
                    <ListItemText
                      primary={issue.message}
                      secondary={`Affected: ${issue.affected.join(', ')}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Document Quality Analysis
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Analysis Metrics</InputLabel>
                <Select
                  multiple
                  value={selectedMetrics}
                  onChange={(e) => setSelectedMetrics(e.target.value)}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip key={value} label={metrics[value].label} />
                      ))}
                    </Box>
                  )}
                >
                  {Object.entries(metrics).map(([key, { label, description }]) => (
                    <MenuItem key={key} value={key}>
                      <Box>
                        <Typography>{label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Sample Size"
                value={sampleSize}
                onChange={(e) => setSampleSize(Math.max(1, Math.min(1000, parseInt(e.target.value) || 0)))}
                helperText="Number of documents to analyze (1-1000)"
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                variant="contained"
                onClick={analyzeDocuments}
                disabled={analyzing || selectedMetrics.length === 0}
                fullWidth
              >
                {analyzing ? 'Analyzing...' : 'Run Analysis'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {analyzing && <LinearProgress sx={{ mb: 3 }} />}

      {results && (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Analysis Summary
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Box textAlign="center">
                    <Typography variant="h4" color={getScoreColor(results.summary.overallScore)}>
                      {results.summary.overallScore}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Overall Quality Score
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={8}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Documents Analyzed
                      </Typography>
                      <Typography variant="h6">
                        {results.summary.analyzedDocuments} / {results.summary.totalDocuments}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Issues Found
                      </Typography>
                      <Box display="flex" gap={1}>
                        <Chip
                          size="small"
                          color="error"
                          label={`${results.summary.criticalIssues} Critical`}
                          icon={<ErrorIcon />}
                        />
                        <Chip
                          size="small"
                          color="warning"
                          label={`${results.summary.warnings} Warnings`}
                          icon={<WarningIcon />}
                        />
                      </Box>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {selectedMetrics.map(metric => 
            renderMetricCard(metric, results.metrics[metric])
          )}
        </>
      )}
    </Box>
  );
};

export default DocumentQuality; 