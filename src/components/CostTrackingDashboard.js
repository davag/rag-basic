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
  Switch,
  TablePagination,
  ListSubheader
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
  // For very small values, use fixed decimal notation with 10 decimal places
  if (value > 0 && value < 0.0000001) {
    return `$${value.toFixed(10)}`;
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 7,
    maximumFractionDigits: 7
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
  const [vendorFilter, setVendorFilter] = useState('all');
  
  // State for sorting and pagination in Recent Operations
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'descending' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
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
  
  // Helper to consistently determine the vendor for a model
  const determineVendor = (modelName, originalModelName) => {
    // First check if the model exists in our definitions
    if (modelDefinitions[modelName]) {
      return modelDefinitions[modelName].vendor;
    }
    
    // Check if it's an Azure model by name pattern
    if (modelName.startsWith('azure-') || originalModelName?.startsWith('azure-')) {
      return 'AzureOpenAI';
    }
    
    // Check if the source field indicates Azure
    if (originalModelName && originalModelName.toLowerCase().includes('azure')) {
      return 'AzureOpenAI';
    }
    
    // For models not explicitly defined but following naming conventions
    if (modelName.startsWith('gpt-')) {
      return 'OpenAI';
    }
    
    if (modelName.includes('claude')) {
      return 'Anthropic';
    }
    
    if (modelName.startsWith('llama') || 
        modelName.startsWith('mistral') || 
        modelName.startsWith('gemma')) {
      return 'Ollama';
    }
    
    return 'Other';
  };

  // Add a helper to normalize model IDs (removes date suffix)
  const normalizeModelId = (modelId) => {
    if (!modelId) return modelId;
    return modelId.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  };

  // Filter cost data based on selected filters
  const getFilteredData = () => {
    // Make sure costData.llm and costData.embeddings exist before creating copies
    const llmData = Array.isArray(costData.llm) ? costData.llm : [];
    const embeddingsData = Array.isArray(costData.embeddings) ? costData.embeddings : [];
    
    let filteredLlm = [...llmData];
    let filteredEmbeddings = [...embeddingsData];
    
    // Apply vendor filter first if selected
    if (vendorFilter !== 'all') {
      filteredLlm = filteredLlm.filter(entry => {
        // Use improved Azure detection for consistent vendor identification
        const vendor = vendorFilter === 'AzureOpenAI' 
          ? isAzureModel(entry) 
          : !isAzureModel(entry) && determineVendor(entry.model, entry.originalModel) === vendorFilter;
        return vendor;
      });
      
      filteredEmbeddings = filteredEmbeddings.filter(entry => {
        // Use improved Azure detection for consistent vendor identification
        const vendor = vendorFilter === 'AzureOpenAI' 
          ? isAzureModel(entry) 
          : !isAzureModel(entry) && determineVendor(entry.model, entry.originalModel) === vendorFilter;
        return vendor;
      });
    }
    
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
    
    const llm = Array.isArray(filteredLlm) ? filteredLlm.map(entry => ({ ...entry, model: normalizeModelId(entry.model) })) : [];
    const embeddings = Array.isArray(filteredEmbeddings) ? filteredEmbeddings.map(entry => ({ ...entry, model: normalizeModelId(entry.model) })) : [];
    
    return { llm, embeddings };
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
  
  // Calculate costs by operation type for filtered data
  const getFilteredCostsByOperation = () => {
    const { llm, embeddings } = getFilteredData();
    const result = {
      llm: 0,
      embeddings: 0
    };
    
    // Sum up LLM costs
    llm.forEach(entry => { result.llm += Number(entry.cost) || 0 });
    
    // Sum up embedding costs
    embeddings.forEach(entry => { result.embeddings += Number(entry.cost) || 0 });
    
    return result;
  };
  
  // Get filtered costs by vendor
  const getFilteredCostsByVendor = () => {
    const { llm, embeddings } = getFilteredData();
    const result = {
      // Initialize all main vendors with zero cost
      'OpenAI': 0,
      'AzureOpenAI': 0,
      'Anthropic': 0,
      'Ollama': 0
    };
    
    // Process LLM costs by vendor
    llm.forEach(entry => {
      // Determine vendor with improved Azure detection
      const vendor = isAzureModel(entry) ? 'AzureOpenAI' : determineVendor(entry.model, entry.originalModel);
      
      if (!result[vendor]) {
        result[vendor] = 0;
      }
      result[vendor] += Number(entry.cost) || 0;
    });
    
    // Process embedding costs by vendor
    embeddings.forEach(entry => {
      // Determine vendor with improved Azure detection
      const vendor = isAzureModel(entry) ? 'AzureOpenAI' : determineVendor(entry.model, entry.originalModel);
      
      if (!result[vendor]) {
        result[vendor] = 0;
      }
      result[vendor] += Number(entry.cost) || 0;
    });
    
    return result;
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
    const llmData = Array.isArray(filteredData.llm) ? filteredData.llm : [];
    const embeddingsData = Array.isArray(filteredData.embeddings) ? filteredData.embeddings : [];
    const combinedData = [...llmData, ...embeddingsData];
    const modelVendorMap = {};
    combinedData.forEach(entry => {
      const isAzure = isAzureModel(entry);
      const vendor = isAzure ? 'AzureOpenAI' : determineVendor(entry.model, entry.originalModel);
      const normalizedModel = normalizeModelId(entry.model);
      const modelVendorKey = `${normalizedModel}__${vendor}`;
      if (!modelVendorMap[modelVendorKey]) {
        modelVendorMap[modelVendorKey] = {
          model: normalizedModel,
          vendor: vendor,
          cost: 0,
          displayName: isAzure ? `${normalizedModel} (Azure)` : normalizedModel,
          color: vendorColors[vendor] || vendorColors.Other
        };
      }
      modelVendorMap[modelVendorKey].cost += entry.cost;
    });
    const sortedModels = Object.values(modelVendorMap)
      .sort((a, b) => b.cost - a.cost);
    return {
      labels: sortedModels.map(item => item.displayName),
      datasets: [
        {
          label: 'Cost (USD)',
          data: sortedModels.map(item => item.cost),
          backgroundColor: sortedModels.map(item => item.color),
          borderColor: sortedModels.map(item => item.color + '80'),
          borderWidth: 1
        }
      ]
    };
  };
  
  // Get chart data for cost by vendor
  const getCostByVendorChartData = () => {
    const filteredData = getFilteredData();
    // Ensure we're working with arrays
    const llmData = Array.isArray(filteredData.llm) ? filteredData.llm : [];
    const embeddingsData = Array.isArray(filteredData.embeddings) ? filteredData.embeddings : [];
    
    const combinedData = [...llmData, ...embeddingsData];
    
    // Group costs by vendor
    const costsByVendor = {
      // Initialize the four main vendors we want to track
      'OpenAI': 0,
      'AzureOpenAI': 0,
      'Anthropic': 0,
      'Ollama': 0
    };
    
    combinedData.forEach(entry => {
      // Get the vendor using our consistent helper function with improved Azure detection
      const vendor = isAzureModel(entry) ? 'AzureOpenAI' : determineVendor(entry.model, entry.originalModel);
      
      if (!costsByVendor[vendor]) {
        costsByVendor[vendor] = 0;
      }
      costsByVendor[vendor] += entry.cost;
    });
    
    // Remove vendors with zero cost to avoid cluttering the chart
    const filteredVendors = Object.fromEntries(
      Object.entries(costsByVendor).filter(([_, cost]) => cost > 0)
    );
    
    // Sort by cost (descending)
    const sortedVendors = Object.entries(filteredVendors)
      .sort((a, b) => b[1] - a[1])
      .map(([vendor, cost]) => ({ vendor, cost }));
    
    // Get colors for each vendor - use the defined vendor colors
    const colors = sortedVendors.map(({ vendor }) => vendorColors[vendor]);
    
    return {
      labels: sortedVendors.map(item => item.vendor),
      datasets: [
        {
          label: 'Cost (USD)',
          data: sortedVendors.map(item => item.cost),
          backgroundColor: colors,
          borderColor: colors.map(color => color + '80'),
          borderWidth: 1
        }
      ]
    };
  };
  
  // Get chart data for cost by operation
  const getCostByOperationChartData = () => {
    // Use filtered costs by operation
    const filteredCosts = getFilteredCostsByOperation();
    
    return {
      labels: Object.keys(filteredCosts),
      datasets: [
        {
          label: 'Cost by Operation',
          data: Object.values(filteredCosts),
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
    const llmData = Array.isArray(costData.llm) ? costData.llm : [];
    const embeddingsData = Array.isArray(costData.embeddings) ? costData.embeddings : [];
    const allModels = [...llmData, ...embeddingsData].map(entry => normalizeModelId(entry.model));
    const uniqueModels = [...new Set(allModels)];
    const modelsByVendor = {};
    uniqueModels.forEach(model => {
      const azureEntry = [...llmData, ...embeddingsData].find(entry => 
        normalizeModelId(entry.model) === model && isAzureModel(entry)
      );
      const vendor = azureEntry 
        ? 'AzureOpenAI' 
        : determineVendor(model, null);
      if (!modelsByVendor[vendor]) {
        modelsByVendor[vendor] = [];
      }
      modelsByVendor[vendor].push(model);
    });
    return { uniqueModels, modelsByVendor };
  };
  
  // Get all unique vendors for filtering
  const getUniqueVendors = () => {
    // Make sure costData.llm and costData.embeddings exist before trying to spread them
    const llmData = Array.isArray(costData.llm) ? costData.llm : [];
    const embeddingsData = Array.isArray(costData.embeddings) ? costData.embeddings : [];
    
    const vendors = new Set();
    
    // Always include the main vendors even if there's no data
    vendors.add('OpenAI');
    vendors.add('AzureOpenAI');
    vendors.add('Anthropic');
    vendors.add('Ollama');
    
    // Add any vendors not already included
    [...llmData, ...embeddingsData].forEach(entry => {
      const vendor = isAzureModel(entry) ? 'AzureOpenAI' : determineVendor(entry.model, entry.originalModel);
      vendors.add(vendor);
    });
    
    return Array.from(vendors);
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
  
  // Handle sorting for Recent Operations table
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  // Function to sort operations data
  const getSortedOperationsData = () => {
    // Combine LLM and embedding data
    const llmData = Array.isArray(getFilteredData().llm) ? getFilteredData().llm : [];
    const embeddingsData = Array.isArray(getFilteredData().embeddings) ? getFilteredData().embeddings : [];
    
    // Add type field to identify the source
    const combinedData = [
      ...llmData.map(entry => ({ ...entry, type: 'llm' })),
      ...embeddingsData.map(entry => ({ ...entry, type: 'embeddings' }))
    ];
    
    // Debug: Log the first entry to see its structure
    if (combinedData.length > 0 && !window.entryLogged) {
      console.log("DEBUG - Operation entry structure:", combinedData[0]);
      window.entryLogged = true;
    }
    
    // Sort the combined data
    const sortedData = [...combinedData].sort((a, b) => {
      if (sortConfig.key === 'timestamp') {
        // For date comparison
        return sortConfig.direction === 'ascending' 
          ? new Date(a.timestamp) - new Date(b.timestamp)
          : new Date(b.timestamp) - new Date(a.timestamp);
      } else if (sortConfig.key === 'cost') {
        // For cost comparison
        return sortConfig.direction === 'ascending' 
          ? a.cost - b.cost
          : b.cost - a.cost;
      } else if (sortConfig.key === 'usage') {
        // For usage comparison
        const aTokens = a.type === 'llm' ? (a.usage?.totalTokens || 0) : (a.usage?.tokenCount || 0);
        const bTokens = b.type === 'llm' ? (b.usage?.totalTokens || 0) : (b.usage?.tokenCount || 0);
        return sortConfig.direction === 'ascending' 
          ? aTokens - bTokens
          : bTokens - aTokens;
      } else {
        // For string comparison (model, operation, type)
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      }
    });
    
    return sortedData;
  };
  
  // Handle pagination changes
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  // Helper function to identify Azure models from the entry data
  const isAzureModel = (entry) => {
    // Check for Azure in trackingId (which can contain azure-model names)
    if (entry.trackingId && entry.trackingId.includes('azure-')) {
      return true;
    }
    
    // Check original model name
    if (entry.originalModel && entry.originalModel.startsWith('azure-')) {
      return true;
    }
    
    // Check in the queryId which often contains model info
    if (entry.queryId && entry.queryId.includes('azure-')) {
      return true;
    }
    
    // Check in source if available
    if (entry.source && entry.source.toLowerCase().includes('azure')) {
      return true;
    }
    
    return false;
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
          <Grid item xs={12} md={2}>
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
              <Grid item xs={12} md={2}>
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
              <Grid item xs={12} md={2}>
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
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="vendor-filter-label">Vendor</InputLabel>
              <Select
                labelId="vendor-filter-label"
                id="vendor-filter"
                value={vendorFilter}
                label="Vendor"
                onChange={(e) => setVendorFilter(e.target.value)}
              >
                <MenuItem value="all">All Vendors</MenuItem>
                {getUniqueVendors().map(vendor => (
                  <MenuItem key={vendor} value={vendor}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        backgroundColor: vendorColors[vendor] || vendorColors.Other,
                        marginRight: 8 
                      }}></div>
                      {vendor}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={2}>
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
                {/* Group models by vendor */}
                {Object.entries(getUniqueModels().modelsByVendor).map(([vendor, models]) => [
                  <ListSubheader key={`vendor-header-${vendor}`} sx={{ 
                    backgroundColor: vendorColors[vendor] ? `${vendorColors[vendor]}22` : undefined,
                    color: vendorColors[vendor] ? `${vendorColors[vendor]}` : undefined,
                    fontWeight: 'bold'
                  }}>
                    {vendor}
                  </ListSubheader>,
                  ...models.map(model => (
                    <MenuItem key={model} value={model} sx={{ pl: 4 }}>{model}</MenuItem>
                  ))
                ]).flat()}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={2}>
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
                  {isLoading ? 'Loading...' : formatCurrency(getFilteredCostsByOperation().llm)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {isLoading ? '...' : `${(getFilteredData().llm || []).length} operations tracked`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="textSecondary">Embeddings Cost</Typography>
                <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
                  {isLoading ? 'Loading...' : formatCurrency(getFilteredCostsByOperation().embeddings)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {isLoading ? '...' : `${(getFilteredData().embeddings || []).length} operations tracked`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        {/* Vendor Costs Summary */}
        <Typography variant="h6" gutterBottom>Vendor Cost Breakdown</Typography>
        <Grid container spacing={2} mb={4}>
          {/* Display the main vendors in a consistent order */}
          {['OpenAI', 'AzureOpenAI', 'Anthropic', 'Ollama'].map((vendor) => {
            const cost = getFilteredCostsByVendor()[vendor] || 0;
            return (
              <Grid item xs={6} sm={4} md={3} lg={2} key={`vendor-cost-${vendor}`}>
                <Card sx={{ 
                  borderLeft: `4px solid ${vendorColors[vendor]}`,
                  height: '100%',
                  opacity: cost > 0 ? 1 : 0.7 // Slightly fade out zero-cost vendors
                }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      <div style={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        backgroundColor: vendorColors[vendor],
                        marginRight: 8 
                      }}></div>
                      <Typography variant="subtitle2">{vendor}</Typography>
                    </Box>
                    <Typography variant="h6" sx={{ mt: 1 }}>
                      {formatCurrency(cost)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {cost > 0 
                        ? `${((cost / getFilteredTotalCost()) * 100).toFixed(1)}% of total` 
                        : 'No costs tracked'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
          
          {/* Display any other vendors (if any) */}
          {Object.entries(getFilteredCostsByVendor())
            .filter(([vendor]) => !['OpenAI', 'AzureOpenAI', 'Anthropic', 'Ollama'].includes(vendor) && vendor !== 'Other')
            .map(([vendor, cost], index) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={`vendor-cost-other-${index}`}>
                <Card sx={{ 
                  borderLeft: `4px solid ${vendorColors[vendor] || vendorColors.Other}`,
                  height: '100%'
                }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      <div style={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        backgroundColor: vendorColors[vendor] || vendorColors.Other,
                        marginRight: 8 
                      }}></div>
                      <Typography variant="subtitle2">{vendor}</Typography>
                    </Box>
                    <Typography variant="h6" sx={{ mt: 1 }}>
                      {formatCurrency(cost)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {((cost / getFilteredTotalCost()) * 100).toFixed(1)}% of total
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          
          {Object.keys(getFilteredCostsByVendor()).length === 0 && (
            <Grid item xs={12}>
              <Typography variant="body2" color="textSecondary" align="center">
                No vendor cost data available for the selected filters
              </Typography>
            </Grid>
          )}
        </Grid>
        
        {/* Charts */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} md={4}>
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
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Cost by Vendor</Typography>
                <Box height={300}>
                  {isLoading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                      <Typography>Loading...</Typography>
                    </Box>
                  ) : Object.keys(costData.costsByModel || {}).length === 0 ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                      <Typography>No vendor data available</Typography>
                    </Box>
                  ) : (
                    <Pie 
                      data={getCostByVendorChartData()} 
                      options={{
                        maintainAspectRatio: false,
                        plugins: {
                          tooltip: {
                            callbacks: {
                              label: function(context) {
                                const value = context.raw;
                                const percentage = ((value / getFilteredTotalCost()) * 100).toFixed(2);
                                return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                              }
                            }
                          }
                        }
                      }}
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
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
                    <TableCell 
                      onClick={() => handleSort('timestamp')}
                      sx={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Timestamp
                      {sortConfig.key === 'timestamp' && (
                        <Box component="span" sx={{ ml: 1 }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('type')}
                      sx={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Type
                      {sortConfig.key === 'type' && (
                        <Box component="span" sx={{ ml: 1 }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('model')}
                      sx={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Model
                      {sortConfig.key === 'model' && (
                        <Box component="span" sx={{ ml: 1 }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('operation')}
                      sx={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Operation
                      {sortConfig.key === 'operation' && (
                        <Box component="span" sx={{ ml: 1 }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('usage')}
                      sx={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Usage
                      {sortConfig.key === 'usage' && (
                        <Box component="span" sx={{ ml: 1 }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell 
                      align="right"
                      onClick={() => handleSort('cost')}
                      sx={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Cost
                      {sortConfig.key === 'cost' && (
                        <Box component="span" sx={{ ml: 1 }}>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getSortedOperationsData()
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((entry, index) => (
                    <TableRow key={`operation-${index}`}>
                      <TableCell>{formatDate(entry.timestamp)}</TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          label={entry.type === 'llm' ? 'LLM' : 'Embedding'}
                          color={entry.type === 'llm' ? 'primary' : 'secondary'} 
                        />
                      </TableCell>
                      <TableCell>
                        {entry.originalModel && entry.originalModel !== entry.model ? (
                          <Tooltip title={`Original: ${entry.originalModel}`}>
                            <span>{entry.model}*</span>
                          </Tooltip>
                        ) : (
                          entry.model
                        )}
                        <Chip
                          size="small"
                          label={isAzureModel(entry) ? 'AzureOpenAI' : determineVendor(entry.model, entry.originalModel)}
                          sx={{
                            ml: 1,
                            backgroundColor: isAzureModel(entry)
                              ? vendorColors['AzureOpenAI'] 
                              : vendorColors[determineVendor(entry.model, entry.originalModel)] || vendorColors.Other,
                            color: 'white',
                            fontSize: '0.6rem',
                            height: '16px'
                          }}
                        />
                      </TableCell>
                      <TableCell>{entry.operation}</TableCell>
                      <TableCell>
                        {entry.type === 'llm' ? (
                          <>
                            {entry.usage?.totalTokens || 0} tokens
                            <Tooltip title={`Prompt: ${entry.usage?.promptTokens || 0}, Completion: ${entry.usage?.completionTokens || 0}`}>
                              <InfoIcon fontSize="small" sx={{ ml: 1, fontSize: 16, color: 'text.secondary' }} />
                            </Tooltip>
                          </>
                        ) : (
                          <>{entry.usage?.tokenCount || 0} tokens</>
                        )}
                      </TableCell>
                      <TableCell align="right">{formatCurrency(entry.cost)}</TableCell>
                    </TableRow>
                  ))}
                  
                  {getSortedOperationsData().length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">No operations tracked yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Pagination Controls */}
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={getSortedOperationsData().length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
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
    </Box>
  );
};

export default CostTrackingDashboard; 