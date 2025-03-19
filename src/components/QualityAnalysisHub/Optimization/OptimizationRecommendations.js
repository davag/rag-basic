import React, { useState } from 'react';
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
  MenuItem
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Storage as StorageIcon,
  TrendingUp as TrendingUpIcon,
  Build as BuildIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

const OptimizationRecommendations = () => {
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [implementing, setImplementing] = useState(false);
  const [filter, setFilter] = useState('all');

  // Simulated recommendations data
  const recommendations = [
    {
      id: 1,
      category: 'performance',
      title: 'Optimize Embedding Batch Size',
      description: 'Current batch size may be causing memory inefficiencies. Consider adjusting for better performance.',
      impact: 'high',
      effort: 'medium',
      metrics: {
        currentValue: '128',
        recommendedValue: '256',
        estimatedImprovement: '25%'
      },
      steps: [
        'Analyze current memory usage patterns',
        'Gradually increase batch size while monitoring performance',
        'Implement new batch size with fallback mechanism',
        'Verify performance improvements'
      ],
      status: 'pending'
    },
    {
      id: 2,
      category: 'quality',
      title: 'Enhance Document Preprocessing',
      description: 'Current preprocessing pipeline missing key cleaning steps. Add additional filters for better quality.',
      impact: 'medium',
      effort: 'low',
      metrics: {
        currentQuality: '85%',
        estimatedQuality: '92%',
        affectedDocuments: '2.3k'
      },
      steps: [
        'Implement additional text cleaning filters',
        'Add special character handling',
        'Update preprocessing pipeline',
        'Reprocess affected documents'
      ],
      status: 'in_progress'
    },
    {
      id: 3,
      category: 'storage',
      title: 'Optimize Vector Store Index',
      description: 'Current index structure showing signs of fragmentation. Reorganization recommended.',
      impact: 'medium',
      effort: 'high',
      metrics: {
        fragmentation: '15%',
        potentialSaving: '500MB',
        estimatedSpeedup: '10%'
      },
      steps: [
        'Create backup of current index',
        'Analyze fragmentation patterns',
        'Rebuild index with optimized structure',
        'Verify query performance'
      ],
      status: 'completed'
    }
  ];

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

  const handleImplement = async (recommendation) => {
    setImplementing(true);
    // Simulate implementation process
    await new Promise(resolve => setTimeout(resolve, 2000));
    setImplementing(false);
    setSelectedRecommendation(null);
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

                    <Grid container spacing={2}>
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

                    {recommendation.status !== 'completed' && (
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
                {selectedRecommendation.steps.map((step, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <CheckCircleIcon color="disabled" />
                    </ListItemIcon>
                    <ListItemText primary={step} />
                  </ListItem>
                ))}
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
    </Box>
  );
};

export default OptimizationRecommendations; 