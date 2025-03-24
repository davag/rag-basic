import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  Card, 
  CardContent, 
  Button, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch
} from '@mui/material';
import { 
  DownloadOutlined as DownloadIcon,
  RestartAlt as ResetIcon,
  ExpandMore as ExpandMoreIcon,
  Settings as SettingsIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import axios from 'axios';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, registerables } from 'chart.js';
import { vendorColors, defaultModels } from '../config/llmConfig';
import { useSnackbar } from 'notistack';
ChartJS.register(...registerables);

// Format a number as currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 6,
    maximumFractionDigits: 6
  }).format(value);
};

// Format a date for display
const formatDate = (date) => {
  return new Date(date).toLocaleString();
};

const CostTrackingDashboard = () => {
  // State for cost data
  const [costData, setCostData] = useState({
    totalCost: 0,
    costsByModel: {},
    costsByOperation: {},
    llm: [],
    embeddings: []
  });
  
  // Add loading state
  const [isLoading, setIsLoading] = useState(true);
  
  // State for filtering
  const [timeFilter, setTimeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [operationFilter, setOperationFilter] = useState('all');
  
  // State for settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailedLogging, setDetailedLogging] = useState(false);
  const [modelDefinitions, setModelDefinitions] = useState(defaultModels);
  
  // State for confirmation dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  
  const { enqueueSnackbar } = useSnackbar();
  
  // Fetch cost data
  const fetchCostData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/api/cost-tracking/summary');
      // Ensure the response data has all required properties
      const responseData = {
        ...response.data,
        llm: Array.isArray(response.data.llm) ? response.data.llm : [],
        embeddings: Array.isArray(response.data.embeddings) ? response.data.embeddings : []
      };
      setCostData(responseData);
      
      // If using a time filter, get specific period data
      if (timeFilter === 'custom' && startDate && endDate) {
        const periodResponse = await axios.get('/api/cost-tracking/by-period', {
          params: { startDate, endDate }
        });
        
        // Ensure period response has all required properties
        const periodData = {
          ...periodResponse.data,
          llm: Array.isArray(periodResponse.data.llm) ? periodResponse.data.llm : [],
          embeddings: Array.isArray(periodResponse.data.embeddings) ? periodResponse.data.embeddings : []
        };
        
        setCostData(prevData => ({
          ...prevData,
          ...periodData
        }));
      }
    } catch (error) {
      console.error('Failed to fetch cost data:', error);
      // Try using the local endpoints if the server endpoints fail
      try {
        console.log('Attempting to use alternative API endpoints...');
        const response = await axios.get('/api/cost-tracking-summary');
        // Ensure the response data has all required properties
        const responseData = {
          ...response.data,
          llm: Array.isArray(response.data.llm) ? response.data.llm : [],
          embeddings: Array.isArray(response.data.embeddings) ? response.data.embeddings : []
        };
        setCostData(responseData);
      } catch (altError) {
        console.error('Failed to fetch cost data from alternative endpoint:', altError);
        // Set empty data structure if everything fails
        setCostData({
          totalCost: 0,
          costsByModel: {},
          costsByOperation: {},
          llm: [],
          embeddings: []
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [timeFilter, startDate, endDate]);
  
  // Fetch cost data on component mount and when filters change
  useEffect(() => {
    fetchCostData();
  }, [fetchCostData]);
  
  // After data is loaded, log the raw data for debugging
  useEffect(() => {
    if (costData) {
      console.log('Cost data loaded in dashboard:', costData);
      console.log('Total cost:', costData.totalCost);
      console.log('Costs by model:', costData.costsByModel);
      console.log('Costs by operation:', costData.costsByOperation);
    }
  }, [costData]);
  
  // Export cost data
  const handleExportData = async () => {
    try {
      // Using window.open for this endpoint will trigger a download
      window.open('/api/cost-tracking/export', '_blank');
    } catch (error) {
      console.error('Failed to export cost data:', error);
      // Try alternative endpoint
      try {
        window.open('/api/cost-tracking-export', '_blank');
      } catch (altError) {
        console.error('Failed to export from alternative endpoint:', altError);
      }
    }
  };
  
  // Reset cost data (with confirmation)
  const handleResetData = async () => {
    setResetDialogOpen(true);
  };
  
  const confirmResetData = async () => {
    try {
      await axios.post('/api/cost-tracking/reset');
      await fetchCostData();
      setResetDialogOpen(false);
    } catch (error) {
      console.error('Failed to reset cost data:', error);
      // Try alternative endpoint
      try {
        await axios.post('/api/cost-tracking-reset');
        await fetchCostData();
        setResetDialogOpen(false);
      } catch (altError) {
        console.error('Failed to reset using alternative endpoint:', altError);
      }
    }
  };
  
  // Update time filter
  const handleTimeFilterChange = (event) => {
    const value = event.target.value;
    setTimeFilter(value);
    
    // Set appropriate date ranges based on filter
    const now = new Date();
    
    if (value === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setStartDate(today.toISOString());
      setEndDate(now.toISOString());
    } else if (value === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      setStartDate(weekAgo.toISOString());
      setEndDate(now.toISOString());
    } else if (value === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      setStartDate(monthAgo.toISOString());
      setEndDate(now.toISOString());
    } else if (value === 'all') {
      setStartDate('');
      setEndDate('');
    }
    // For 'custom', don't change the dates
  };
  
  // Filter cost data based on selected filters
  const getFilteredData = () => {
    // Make sure costData.llm and costData.embeddings exist before creating copies
    const llmData = Array.isArray(costData.llm) ? costData.llm : [];
    const embeddingsData = Array.isArray(costData.embeddings) ? costData.embeddings : [];
    
    let filteredLlm = [...llmData];
    let filteredEmbeddings = [...embeddingsData];
    
    // Apply model filter
    if (modelFilter !== 'all') {
      filteredLlm = filteredLlm.filter(entry => entry.model === modelFilter);
      filteredEmbeddings = filteredEmbeddings.filter(entry => entry.model === modelFilter);
    }
    
    // Apply operation filter
    if (operationFilter !== 'all') {
      if (operationFilter === 'llm') {
        filteredEmbeddings = [];
      } else if (operationFilter === 'embeddings') {
        filteredLlm = [];
      } else {
        // Filter by specific operation type
        filteredLlm = filteredLlm.filter(entry => entry.operation === operationFilter);
        filteredEmbeddings = filteredEmbeddings.filter(entry => entry.operation === operationFilter);
      }
    }
    
    return { llm: filteredLlm, embeddings: filteredEmbeddings };
  };
  
  // Calculate total cost for filtered data
  const getFilteredTotalCost = () => {
    const { llm, embeddings } = getFilteredData();
    let total = 0;
    
    // Ensure we're working with valid cost values
    llm.forEach(entry => { total += Number(entry.cost) || 0 });
    embeddings.forEach(entry => { total += Number(entry.cost) || 0 });
    
    return total;
  };
  
  // Save settings
  const saveSettings = async () => {
    try {
      await axios.post('/api/cost-tracking/settings', {
        detailedLogging
      });
      
      setSettingsOpen(false);
      enqueueSnackbar('Settings saved successfully', { variant: 'success' });
    } catch (error) {
      console.error('Failed to save settings:', error);
      
      // Try alternative endpoint
      try {
        await axios.post('/api/cost-tracking-settings', {
          detailedLogging
        });
        setSettingsOpen(false);
        enqueueSnackbar('Settings saved successfully', { variant: 'success' });
      } catch (altError) {
        console.error('Failed to save settings (alternative endpoint):', altError);
        enqueueSnackbar('Failed to save settings', { variant: 'error' });
      }
    }
  };
  
  // Load model definitions from localStorage
  useEffect(() => {
    const savedModels = localStorage.getItem('llmModels');
    if (savedModels) {
      try {
        setModelDefinitions(JSON.parse(savedModels));
      } catch (err) {
        console.error('Error parsing saved models:', err);
        setModelDefinitions(defaultModels);
      }
    }
  }, []);
  
  // Get chart data for costs by model
  const getCostByModelChartData = () => {
    const filteredData = getFilteredData();
    // Ensure we're working with arrays
    const llmData = Array.isArray(filteredData.llm) ? filteredData.llm : [];
    const embeddingsData = Array.isArray(filteredData.embeddings) ? filteredData.embeddings : [];
    
    const combinedData = [...llmData, ...embeddingsData];
    
    const costsByModel = {};
    combinedData.forEach(entry => {
      if (!costsByModel[entry.model]) {
        costsByModel[entry.model] = 0;
      }
      costsByModel[entry.model] += entry.cost;
    });
    
    // Sort by cost (descending)
    const sortedModels = Object.entries(costsByModel)
      .sort((a, b) => b[1] - a[1])
      .map(([model, cost]) => ({ model, cost }));
    
    // Get colors for each model based on its vendor
    const colors = sortedModels.map(({ model }) => {
      const modelConfig = modelDefinitions[model];
      const vendor = modelConfig ? modelConfig.vendor : 'Other';
      return vendorColors[vendor] || vendorColors.Other;
    });
    
    return {
      labels: sortedModels.map(item => item.model),
      datasets: [
        {
          label: 'Cost (USD)',
          data: sortedModels.map(item => item.cost),
          backgroundColor: colors,
          borderColor: colors.map(color => color + '80'),
          borderWidth: 1
        }
      ]
    };
  };
  
  // Get chart data for cost by operation
  const getCostByOperationChartData = () => {
    // Ensure costsByOperation exists and is an object
    const costsByOperation = costData.costsByOperation || {};
    
    return {
      labels: Object.keys(costsByOperation),
      datasets: [
        {
          label: 'Cost by Operation',
          data: Object.values(costsByOperation),
          backgroundColor: [
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 99, 132, 0.6)',
          ],
          borderWidth: 1,
        },
      ],
    };
  };
  
  // Get unique models from the data, grouped by vendor
  const getUniqueModels = () => {
    // Make sure costData.llm and costData.embeddings exist before trying to spread them
    const llmData = Array.isArray(costData.llm) ? costData.llm : [];
    const embeddingsData = Array.isArray(costData.embeddings) ? costData.embeddings : [];
    
    const allModels = [...llmData, ...embeddingsData].map(entry => entry.model);
    const uniqueModels = [...new Set(allModels)];
    
    // Group models by vendor
    const modelsByVendor = {};
    uniqueModels.forEach(model => {
      const modelConfig = modelDefinitions[model];
      const vendor = modelConfig ? modelConfig.vendor : 'Other';
      
      if (!modelsByVendor[vendor]) {
        modelsByVendor[vendor] = [];
      }
      modelsByVendor[vendor].push(model);
    });
    
    return { uniqueModels, modelsByVendor };
  };
  
  // Get all unique operations for filtering
  const getUniqueOperations = () => {
    const operations = new Set();
    
    // Make sure costData.llm and costData.embeddings exist before iterating
    const llmData = Array.isArray(costData.llm) ? costData.llm : [];
    const embeddingsData = Array.isArray(costData.embeddings) ? costData.embeddings : [];
    
    llmData.forEach(entry => operations.add(entry.operation));
    embeddingsData.forEach(entry => operations.add(entry.operation));
    
    return Array.from(operations);
  };
  
  return (
    <Box>
      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5">Cost Tracking Dashboard</Typography>
          <Stack direction="row" spacing={1}>
            <Button 
              variant="outlined" 
              startIcon={<DownloadIcon />} 
              onClick={handleExportData}
              size="small"
            >
              Export Data
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<ResetIcon />} 
              onClick={handleResetData}
              size="small"
              color="error"
            >
              Reset Data
            </Button>
            <IconButton onClick={() => setSettingsOpen(true)} size="small">
              <SettingsIcon />
            </IconButton>
          </Stack>
        </Box>
        
        <Alert severity="info" sx={{ mb: 3 }}>
          This dashboard tracks costs for all AI operations, including LLM API calls and embeddings generation.
          Use the filters to analyze costs by model, operation type, and time period.
        </Alert>
        
        {/* Filters */}
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="time-filter-label">Time Period</InputLabel>
              <Select
                labelId="time-filter-label"
                id="time-filter"
                value={timeFilter}
                label="Time Period"
                onChange={handleTimeFilterChange}
              >
                <MenuItem value="all">All Time</MenuItem>
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="week">Last 7 Days</MenuItem>
                <MenuItem value="month">Last 30 Days</MenuItem>
                <MenuItem value="custom">Custom Range</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          {timeFilter === 'custom' && (
            <>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Start Date"
                  type="datetime-local"
                  value={startDate ? startDate.slice(0, 16) : ''}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="End Date"
                  type="datetime-local"
                  value={endDate ? endDate.slice(0, 16) : ''}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  size="small"
                />
              </Grid>
            </>
          )}
          
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="model-filter-label">Model</InputLabel>
              <Select
                labelId="model-filter-label"
                id="model-filter"
                value={modelFilter}
                label="Model"
                onChange={(e) => setModelFilter(e.target.value)}
              >
                <MenuItem value="all">All Models</MenuItem>
                {getUniqueModels().uniqueModels.map(model => (
                  <MenuItem key={model} value={model}>{model}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="operation-filter-label">Operation Type</InputLabel>
              <Select
                labelId="operation-filter-label"
                id="operation-filter"
                value={operationFilter}
                label="Operation Type"
                onChange={(e) => setOperationFilter(e.target.value)}
              >
                <MenuItem value="all">All Operations</MenuItem>
                <MenuItem value="llm">All LLM Calls</MenuItem>
                <MenuItem value="embeddings">All Embeddings</MenuItem>
                {getUniqueOperations().map(operation => (
                  <MenuItem key={operation} value={operation}>{operation}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        
        {/* Summary Cards */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="textSecondary">Total Cost</Typography>
                <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
                  {isLoading ? 'Loading...' : formatCurrency(getFilteredTotalCost())}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {timeFilter === 'all' ? 'All time' : timeFilter === 'custom' ? 'Custom period' : `Last ${timeFilter}`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="textSecondary">LLM Calls Cost</Typography>
                <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
                  {isLoading ? 'Loading...' : formatCurrency(costData.costsByOperation?.llm || 0)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {isLoading ? '...' : `${(costData.llm || []).length} operations tracked`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="textSecondary">Embeddings Cost</Typography>
                <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
                  {isLoading ? 'Loading...' : formatCurrency(costData.costsByOperation?.embeddings || 0)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {isLoading ? '...' : `${(costData.embeddings || []).length} operations tracked`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        {/* Charts */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Cost by Model</Typography>
                <Box height={300}>
                  {isLoading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                      <Typography>Loading...</Typography>
                    </Box>
                  ) : Object.keys(costData.costsByModel || {}).length === 0 ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                      <Typography>No model data available</Typography>
                    </Box>
                  ) : (
                    <Bar 
                      data={getCostByModelChartData()} 
                      options={{
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false,
                          },
                        },
                      }}
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Cost by Operation</Typography>
                <Box height={300}>
                  {isLoading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                      <Typography>Loading...</Typography>
                    </Box>
                  ) : Object.keys(costData.costsByOperation || {}).length === 0 ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                      <Typography>No operation data available</Typography>
                    </Box>
                  ) : (
                    <Pie 
                      data={getCostByOperationChartData()} 
                      options={{
                        maintainAspectRatio: false,
                      }}
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        {/* Recent Operations */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Recent Operations</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Model</TableCell>
                    <TableCell>Operation</TableCell>
                    <TableCell>Usage</TableCell>
                    <TableCell align="right">Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* LLM Entries */}
                  {getFilteredData().llm.slice(-10).map((entry, index) => (
                    <TableRow key={`llm-${index}`}>
                      <TableCell>{formatDate(entry.timestamp)}</TableCell>
                      <TableCell>
                        <Chip size="small" label="LLM" color="primary" />
                      </TableCell>
                      <TableCell>{entry.model}</TableCell>
                      <TableCell>{entry.operation}</TableCell>
                      <TableCell>
                        {entry.usage?.totalTokens || 0} tokens
                        <Tooltip title={`Prompt: ${entry.usage?.promptTokens || 0}, Completion: ${entry.usage?.completionTokens || 0}`}>
                          <InfoIcon fontSize="small" sx={{ ml: 1, fontSize: 16, color: 'text.secondary' }} />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">{formatCurrency(entry.cost)}</TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Embedding Entries */}
                  {getFilteredData().embeddings.slice(-10).map((entry, index) => (
                    <TableRow key={`embed-${index}`}>
                      <TableCell>{formatDate(entry.timestamp)}</TableCell>
                      <TableCell>
                        <Chip size="small" label="Embedding" color="secondary" />
                      </TableCell>
                      <TableCell>{entry.model}</TableCell>
                      <TableCell>{entry.operation}</TableCell>
                      <TableCell>{entry.usage?.tokenCount || 0} tokens</TableCell>
                      <TableCell align="right">{formatCurrency(entry.cost)}</TableCell>
                    </TableRow>
                  ))}
                  
                  {getFilteredData().llm.length === 0 && getFilteredData().embeddings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">No operations tracked yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      </Paper>
      
      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="md">
        <DialogTitle>Cost Tracking Settings</DialogTitle>
        <DialogContent>
          <Box mb={3}>
            <FormControlLabel
              control={
                <Switch
                  checked={detailedLogging}
                  onChange={(e) => setDetailedLogging(e.target.checked)}
                  color="primary"
                />
              }
              label="Enable detailed logging"
            />
            <Typography variant="body2" color="textSecondary">
              Logs detailed information about token usage and costs to the console
            </Typography>
          </Box>
          
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom>
              Model Pricing Information
            </Typography>
            <Typography variant="body2" gutterBottom color="textSecondary">
              Embedding model pricing is defined in the central LLM configuration (llmConfig.js).
              To modify pricing, please update the configuration file directly.
            </Typography>
            
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">Input (per 1M tokens)</TableCell>
                    <TableCell align="right">Output (per 1M tokens)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(modelDefinitions)
                    .filter(([_, model]) => model.vendor === 'AzureOpenAI' && 
                            (model.description?.toLowerCase().includes('embedding') || 
                             _.toLowerCase().includes('embedding')))
                    .map(([id, model]) => (
                      <TableRow key={id}>
                        <TableCell component="th" scope="row">
                          {id}
                        </TableCell>
                        <TableCell align="right">${model.input.toFixed(5)}</TableCell>
                        <TableCell align="right">${model.output.toFixed(5)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button onClick={saveSettings} color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle>Confirm Reset</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to reset all cost tracking data? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmResetData} variant="contained" color="error">Reset</Button>
        </DialogActions>
      </Dialog>
      
      {/* Debug Information */}
      <Box sx={{ marginBottom: 2, padding: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
        <Typography variant="h6">Debug Information</Typography>
        <Typography variant="body2">Total Cost: ${costData?.totalCost?.toFixed(6) || '0.000000'}</Typography>
        <Typography variant="body2">Raw Data: {JSON.stringify(costData || {}, null, 2)}</Typography>
      </Box>
    </Box>
  );
};

export default CostTrackingDashboard; 