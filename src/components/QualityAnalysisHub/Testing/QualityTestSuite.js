import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  PlayArrow as PlayArrowIcon,
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

const QualityTestSuite = () => {
  const [running, setRunning] = useState(false);
  const [showNewTest, setShowNewTest] = useState(false);
  const [expandedTest, setExpandedTest] = useState(null);
  const [testSuites, setTestSuites] = useState([
    {
      id: 1,
      name: 'Retrieval Quality Tests',
      description: 'Validate retrieval accuracy and relevance across different query types',
      tests: [
        {
          id: 101,
          name: 'Basic Retrieval Test',
          description: 'Test basic document retrieval with simple queries',
          status: 'passed',
          lastRun: '2024-03-19T05:30:00Z',
          metrics: {
            accuracy: '95%',
            recall: '92%',
            latency: '150ms'
          },
          results: [
            { query: 'What is RAG?', matches: 5, relevant: 5, time: '120ms' },
            { query: 'How to implement vector search?', matches: 4, relevant: 3, time: '180ms' }
          ]
        },
        {
          id: 102,
          name: 'Edge Case Handling',
          description: 'Test retrieval with edge cases and complex queries',
          status: 'failed',
          lastRun: '2024-03-19T05:35:00Z',
          metrics: {
            accuracy: '75%',
            recall: '68%',
            latency: '250ms'
          },
          results: [
            { query: 'Complex nested query with multiple conditions', matches: 3, relevant: 1, time: '300ms' },
            { query: 'Query with special characters !@#$%', matches: 2, relevant: 1, time: '200ms' }
          ]
        }
      ]
    },
    {
      id: 2,
      name: 'Embedding Quality Tests',
      description: 'Validate embedding quality and semantic similarity measures',
      tests: [
        {
          id: 201,
          name: 'Semantic Similarity Test',
          description: 'Test semantic similarity calculations',
          status: 'warning',
          lastRun: '2024-03-19T05:40:00Z',
          metrics: {
            accuracy: '88%',
            consistency: '85%',
            coverage: '90%'
          },
          results: [
            { pair: ['document1', 'document2'], similarity: 0.85, expected: 0.90 },
            { pair: ['query1', 'document3'], similarity: 0.75, expected: 0.80 }
          ]
        }
      ]
    }
  ]);

  // New test form state
  const [newTest, setNewTest] = useState({
    name: '',
    description: '',
    suiteId: '',
    config: {
      semanticSimilarity: false,
      edgeCases: false,
      responseTimes: false
    }
  });

  // Handle form field changes
  const handleNewTestChange = (field) => (event) => {
    if (field.startsWith('config.')) {
      const configField = field.split('.')[1];
      setNewTest(prev => ({
        ...prev,
        config: {
          ...prev.config,
          [configField]: event.target.checked
        }
      }));
    } else {
      setNewTest(prev => ({
        ...prev,
        [field]: event.target.value
      }));
    }
  };

  // Create new test
  const handleCreateTest = () => {
    if (!newTest.name || !newTest.description || !newTest.suiteId) {
      alert('Please fill in all required fields');
      return;
    }

    const newTestObj = {
      id: Math.max(...testSuites.flatMap(suite => suite.tests.map(test => test.id))) + 1,
      name: newTest.name,
      description: newTest.description,
      status: 'pending',
      lastRun: null,
      metrics: {},
      results: [],
      config: newTest.config
    };

    setTestSuites(prev => prev.map(suite => 
      suite.id === parseInt(newTest.suiteId)
        ? { ...suite, tests: [...suite.tests, newTestObj] }
        : suite
    ));

    // Reset form and close dialog
    setNewTest({
      name: '',
      description: '',
      suiteId: '',
      config: {
        semanticSimilarity: false,
        edgeCases: false,
        responseTimes: false
      }
    });
    setShowNewTest(false);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passed':
        return <CheckCircleIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'passed':
        return 'success';
      case 'failed':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'default';
    }
  };

  const handleRunTest = async (test) => {
    setRunning(true);
    
    // Find the suite containing this test
    const suiteIndex = testSuites.findIndex(suite => 
      suite.tests.some(t => t.id === test.id)
    );
    
    // Find the test index within the suite
    const testIndex = testSuites[suiteIndex].tests.findIndex(t => t.id === test.id);
    
    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate simulated test results
    const newResults = {
      ...test,
      status: Math.random() > 0.3 ? 'passed' : 'failed',
      lastRun: new Date().toISOString(),
      metrics: {
        accuracy: `${(Math.random() * 20 + 80).toFixed(1)}%`,
        recall: `${(Math.random() * 20 + 75).toFixed(1)}%`,
        latency: `${Math.floor(Math.random() * 200 + 100)}ms`
      },
      results: test.config.semanticSimilarity ? [
        { query: 'Test query 1', matches: 5, relevant: Math.floor(Math.random() * 3 + 3), time: `${Math.floor(Math.random() * 100 + 100)}ms` },
        { query: 'Test query 2', matches: 4, relevant: Math.floor(Math.random() * 2 + 2), time: `${Math.floor(Math.random() * 100 + 100)}ms` }
      ] : test.config.edgeCases ? [
        { query: 'Edge case test 1', matches: 3, relevant: Math.floor(Math.random() * 2 + 1), time: `${Math.floor(Math.random() * 150 + 150)}ms` },
        { query: 'Edge case test 2', matches: 2, relevant: Math.floor(Math.random() * 2), time: `${Math.floor(Math.random() * 150 + 150)}ms` }
      ] : [
        { query: 'Basic test 1', matches: 4, relevant: Math.floor(Math.random() * 3 + 2), time: `${Math.floor(Math.random() * 100 + 100)}ms` }
      ]
    };
    
    // Update test in state
    setTestSuites(prev => prev.map((suite, idx) => 
      idx === suiteIndex ? {
        ...suite,
        tests: suite.tests.map((t, i) => 
          i === testIndex ? newResults : t
        )
      } : suite
    ));
    
    setRunning(false);
  };

  const handleRunSuite = async (suite) => {
    setRunning(true);
    
    // Run each test in the suite sequentially
    const updatedTests = [];
    for (const test of suite.tests) {
      // Simulate individual test execution
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newResults = {
        ...test,
        status: Math.random() > 0.3 ? 'passed' : 'failed',
        lastRun: new Date().toISOString(),
        metrics: {
          accuracy: `${(Math.random() * 20 + 80).toFixed(1)}%`,
          recall: `${(Math.random() * 20 + 75).toFixed(1)}%`,
          latency: `${Math.floor(Math.random() * 200 + 100)}ms`
        },
        results: test.config?.semanticSimilarity ? [
          { query: 'Suite test 1', matches: 5, relevant: Math.floor(Math.random() * 3 + 3), time: `${Math.floor(Math.random() * 100 + 100)}ms` },
          { query: 'Suite test 2', matches: 4, relevant: Math.floor(Math.random() * 2 + 2), time: `${Math.floor(Math.random() * 100 + 100)}ms` }
        ] : [
          { query: 'Basic suite test', matches: 4, relevant: Math.floor(Math.random() * 3 + 2), time: `${Math.floor(Math.random() * 100 + 100)}ms` }
        ]
      };
      
      updatedTests.push(newResults);
    }
    
    // Update all tests in the suite
    setTestSuites(prev => prev.map(s => 
      s.id === suite.id ? {
        ...s,
        tests: updatedTests
      } : s
    ));
    
    setRunning(false);
  };

  const renderTestResults = (test) => {
    if (!test.results || test.results.length === 0) return null;

    return (
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {Object.keys(test.results[0]).map((key) => (
                <TableCell key={key}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {test.results.map((result, index) => (
              <TableRow key={index}>
                {Object.values(result).map((value, i) => (
                  <TableCell key={i}>
                    {Array.isArray(value) ? value.join(' → ') : value}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          Quality Test Suite
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setShowNewTest(true)}
        >
          New Test
        </Button>
      </Box>

      {running && <LinearProgress sx={{ mb: 3 }} />}

      {testSuites.map((suite) => (
        <Card key={suite.id} sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                {suite.name}
              </Typography>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => handleRunSuite(suite)}
                disabled={running}
              >
                Run Suite
              </Button>
            </Box>

            <Typography color="text.secondary" paragraph>
              {suite.description}
            </Typography>

            {suite.tests.map((test) => (
              <Accordion
                key={test.id}
                expanded={expandedTest === test.id}
                onChange={() => setExpandedTest(expandedTest === test.id ? null : test.id)}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" gap={2} width="100%">
                    {getStatusIcon(test.status)}
                    <Typography flex={1}>{test.name}</Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        size="small"
                        label={test.status}
                        color={getStatusColor(test.status)}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Last run: {new Date(test.lastRun).toLocaleString()}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunTest(test);
                        }}
                        disabled={running}
                      >
                        <PlayArrowIcon />
                      </IconButton>
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography paragraph>
                    {test.description}
                  </Typography>

                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    {Object.entries(test.metrics).map(([key, value]) => (
                      <Grid item xs={12} sm={4} key={key}>
                        <Box textAlign="center">
                          <Typography variant="subtitle2" color="text.secondary">
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </Typography>
                          <Typography variant="h6">
                            {value}
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>

                  {renderTestResults(test)}
                </AccordionDetails>
              </Accordion>
            ))}
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={showNewTest}
        onClose={() => setShowNewTest(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Create New Test
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              label="Test Name"
              fullWidth
              margin="normal"
              value={newTest.name}
              onChange={handleNewTestChange('name')}
              required
            />
            <TextField
              label="Description"
              fullWidth
              margin="normal"
              multiline
              rows={3}
              value={newTest.description}
              onChange={handleNewTestChange('description')}
              required
            />
            <TextField
              select
              label="Test Suite"
              fullWidth
              margin="normal"
              value={newTest.suiteId}
              onChange={handleNewTestChange('suiteId')}
              required
            >
              {testSuites.map((suite) => (
                <MenuItem key={suite.id} value={suite.id}>
                  {suite.name}
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Test Configuration
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={newTest.config.semanticSimilarity}
                    onChange={handleNewTestChange('config.semanticSimilarity')}
                  />
                }
                label="Include semantic similarity checks"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={newTest.config.edgeCases}
                    onChange={handleNewTestChange('config.edgeCases')}
                  />
                }
                label="Test with edge cases"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={newTest.config.responseTimes}
                    onChange={handleNewTestChange('config.responseTimes')}
                  />
                }
                label="Measure response times"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewTest(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained"
            onClick={handleCreateTest}
            disabled={!newTest.name || !newTest.description || !newTest.suiteId}
          >
            Create Test
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QualityTestSuite; 