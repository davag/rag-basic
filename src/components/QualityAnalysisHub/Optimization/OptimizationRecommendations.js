import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  Snackbar,
  LinearProgress
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Storage as StorageIcon,
  TrendingUp as TrendingUpIcon,
  Build as BuildIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { createLlmInstance } from '../../../utils/apiServices';

const OptimizationRecommendations = () => {
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [implementing, setImplementing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load recommendations from localStorage on mount
  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = () => {
    const savedRecommendations = JSON.parse(localStorage.getItem('optimizationRecommendations') || '[]');
    setRecommendations(savedRecommendations);
  };

  const generateRecommendations = async () => {
    setLoading(true);
    try {
      // Get quality check results
      const qualityResults = JSON.parse(localStorage.getItem('qualityCheckResults') || '{}');
      
      // Create LLM instance for analysis
      const llm = createLlmInstance('gpt-4o-mini', 'You are an expert at analyzing RAG system quality and providing actionable recommendations.');
      
      // Prepare analysis prompt
      const analysisPrompt = `Analyze the following quality check results and provide specific, actionable recommendations for improvement:
        ${JSON.stringify(qualityResults, null, 2)}
        
        For each recommendation, provide:
        1. Category (performance, quality, or storage)
        2. Title
        3. Description
        4. Impact (high, medium, low)
        5. Effort (high, medium, low)
        6. Specific metrics affected
        7. Implementation steps
        8. Current status (pending)
        
        Return ONLY a JSON array of recommendation objects, with no markdown formatting or additional text.`;

      // Get recommendations from LLM
      const response = await llm.invoke(analysisPrompt);
      
      // Clean the response by removing markdown code blocks and any extra text
      const cleanResponse = response
        .replace(/```json\n?/g, '')  // Remove opening ```json
        .replace(/```\n?/g, '')      // Remove closing ```
        .trim();                     // Remove extra whitespace
      
      const newRecommendations = JSON.parse(cleanResponse);
      
      // Add IDs and timestamps
      const recommendationsWithIds = newRecommendations.map((rec, index) => ({
        ...rec,
        id: Date.now() + index,
        timestamp: new Date().toISOString(),
        status: 'pending'
      }));

      // Save to localStorage
      localStorage.setItem('optimizationRecommendations', JSON.stringify(recommendationsWithIds));
      setRecommendations(recommendationsWithIds);
      setSuccess('Recommendations generated successfully');
    } catch (error) {
      console.error('Error generating recommendations:', error);
      setError('Failed to generate recommendations: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImplement = async (recommendation) => {
    setImplementing(true);
    try {
      // Get quality check results
      const qualityResults = JSON.parse(localStorage.getItem('qualityCheckResults') || '{}');
      
      // Create LLM instance for implementation
      const llm = createLlmInstance('gpt-4o-mini', 'You are an expert at implementing RAG system optimizations.');
      
      // Prepare implementation prompt
      const implementationPrompt = `Implement the following recommendation:
        ${JSON.stringify(recommendation, null, 2)}
        
        Current system state:
        ${JSON.stringify(qualityResults, null, 2)}
        
        Return ONLY a JSON object with implementation steps and expected outcomes, with no markdown formatting or additional text.`;

      // Get implementation guidance
      const response = await llm.invoke(implementationPrompt);
      
      // Clean the response
      const cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const implementationSteps = JSON.parse(cleanResponse);

      // Update recommendation status
      const updatedRecommendations = recommendations.map(rec => 
        rec.id === recommendation.id 
          ? { ...rec, status: 'in_progress', implementationSteps }
          : rec
      );

      // Save updated recommendations
      localStorage.setItem('optimizationRecommendations', JSON.stringify(updatedRecommendations));
      setRecommendations(updatedRecommendations);
      setSuccess('Implementation started successfully');
    } catch (error) {
      console.error('Error implementing recommendation:', error);
      setError('Failed to implement recommendation: ' + error.message);
    } finally {
      setImplementing(false);
      setSelectedRecommendation(null);
    }
  };

  const completeImplementation = async (recommendation) => {
    try {
      // Get quality check results
      const qualityResults = JSON.parse(localStorage.getItem('qualityCheckResults') || '{}');
      
      // Create LLM instance for verification
      const llm = createLlmInstance('gpt-4o-mini', 'You are an expert at verifying RAG system optimizations.');
      
      // Prepare verification prompt
      const verificationPrompt = `Verify the implementation of the following recommendation:
        ${JSON.stringify(recommendation, null, 2)}
        
        Current system state:
        ${JSON.stringify(qualityResults, null, 2)}
        
        Return ONLY a JSON object with verification results and any remaining issues, with no markdown formatting or additional text.`;

      // Get verification results
      const response = await llm.invoke(verificationPrompt);
      
      // Clean the response
      const cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const verificationResults = JSON.parse(cleanResponse);

      // Update recommendation status
      const updatedRecommendations = recommendations.map(rec => 
        rec.id === recommendation.id 
          ? { 
              ...rec, 
              status: 'completed',
              verificationResults,
              completedAt: new Date().toISOString()
            }
          : rec
      );

      // Save updated recommendations
      localStorage.setItem('optimizationRecommendations', JSON.stringify(updatedRecommendations));
      setRecommendations(updatedRecommendations);
      setSuccess('Implementation completed successfully');
    } catch (error) {
      console.error('Error completing implementation:', error);
      setError('Failed to complete implementation: ' + error.message);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'performance':
        return <SpeedIcon />;
      case 'quality':
        return <BuildIcon />;
      case 'storage':
        return <StorageIcon />;
      default:
        return <TrendingUpIcon />;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'in_progress':
        return <WarningIcon color="warning" />;
      case 'pending':
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const getImpactColor = (impact) => {
    switch (impact) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
    }
  };

  const filteredRecommendations = recommendations.filter(rec => 
    filter === 'all' || rec.status === filter
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          Optimization Recommendations
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={generateRecommendations}
            disabled={loading}
          >
            Generate Recommendations
          </Button>
          <TextField
            select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            size="small"
            sx={{ width: 150 }}
          >
            <MenuItem value="all">All Status</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </TextField>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 3 }} />}

      <Grid container spacing={3}>
        {filteredRecommendations.map((recommendation) => (
          <Grid item xs={12} key={recommendation.id}>
            <Card variant="outlined">
              <CardContent>
                <Box display="flex" alignItems="flex-start" gap={2}>
                  <ListItemIcon>
                    {getCategoryIcon(recommendation.category)}
                  </ListItemIcon>
                  <Box flex={1}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="h6">
                        {recommendation.title}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          size="small"
                          label={`Impact: ${recommendation.impact}`}
                          color={getImpactColor(recommendation.impact)}
                        />
                        <Chip
                          size="small"
                          label={`Effort: ${recommendation.effort}`}
                          variant="outlined"
                        />
                        {getStatusIcon(recommendation.status)}
                      </Box>
                    </Box>
                    
                    <Typography color="text.secondary" paragraph>
                      {recommendation.description}
                    </Typography>

                    {recommendation.metrics && (
                      <Grid container spacing={2} sx={{ mb: 2 }}>
                        {Object.entries(recommendation.metrics).map(([key, value]) => (
                          <Grid item xs={12} sm={4} key={key}>
                            <Box textAlign="center">
                              <Typography variant="subtitle2" color="text.secondary">
                                {key.split(/(?=[A-Z])/).join(' ')}
                              </Typography>
                              <Typography variant="h6">
                                {value}
                              </Typography>
                            </Box>
                          </Grid>
                        ))}
                      </Grid>
                    )}

                    {recommendation.status === 'in_progress' && recommendation.implementationSteps && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" gutterBottom>
                          Implementation Progress:
                        </Typography>
                        <List dense>
                          {recommendation.implementationSteps.steps?.map((step, index) => (
                            <ListItem key={index}>
                              <ListItemIcon>
                                <CheckCircleIcon color="disabled" />
                              </ListItemIcon>
                              <ListItemText primary={step} />
                            </ListItem>
                          )) || (
                            <ListItem>
                              <ListItemText primary="No implementation steps available" />
                            </ListItem>
                          )}
                        </List>
                        <Button
                          variant="contained"
                          color="success"
                          onClick={() => completeImplementation(recommendation)}
                          sx={{ mt: 1 }}
                        >
                          Complete Implementation
                        </Button>
                      </Box>
                    )}

                    {recommendation.status === 'completed' && recommendation.verificationResults && (
                      <Box mb={2}>
                        <Typography variant="subtitle2" gutterBottom>
                          Verification Results:
                        </Typography>
                        <Typography color="text.secondary">
                          {recommendation.verificationResults.summary}
                        </Typography>
                        {recommendation.verificationResults.remainingIssues && (
                          <Box mt={1}>
                            <Typography variant="subtitle2" color="warning.main">
                              Remaining Issues:
                            </Typography>
                            <List dense>
                              {recommendation.verificationResults.remainingIssues.map((issue, index) => (
                                <ListItem key={index}>
                                  <ListItemIcon>
                                    <WarningIcon color="warning" />
                                  </ListItemIcon>
                                  <ListItemText primary={issue} />
                                </ListItem>
                              ))}
                            </List>
                          </Box>
                        )}
                      </Box>
                    )}

                    {recommendation.status === 'pending' && (
                      <Box display="flex" justifyContent="flex-end" mt={2}>
                        <Button
                          variant="contained"
                          onClick={() => setSelectedRecommendation(recommendation)}
                        >
                          Implement
                        </Button>
                      </Box>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog
        open={!!selectedRecommendation}
        onClose={() => setSelectedRecommendation(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Implement Recommendation
        </DialogTitle>
        <DialogContent>
          {selectedRecommendation && (
            <>
              <Typography variant="subtitle1" gutterBottom>
                Implementation Steps:
              </Typography>
              <List>
                {selectedRecommendation.implementationSteps?.steps?.map((step, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <CheckCircleIcon color="disabled" />
                    </ListItemIcon>
                    <ListItemText primary={step} />
                  </ListItem>
                )) || (
                  <ListItem>
                    <ListItemText primary="Loading implementation steps..." />
                  </ListItem>
                )}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSelectedRecommendation(null)}
            disabled={implementing}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => handleImplement(selectedRecommendation)}
            disabled={implementing}
          >
            {implementing ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Implementing...
              </>
            ) : (
              'Start Implementation'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={!!error} 
        autoHideDuration={6000} 
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error">
          {error}
        </Alert>
      </Snackbar>

      <Snackbar 
        open={!!success} 
        autoHideDuration={6000} 
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccess(null)} severity="success">
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OptimizationRecommendations; 