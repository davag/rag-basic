import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Breadcrumbs,
  Link,
  Paper
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Build as BuildIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';
import QualityDashboard from './Monitoring/QualityDashboard';
import OptimizationRecommendations from './Optimization/OptimizationRecommendations';
import QualityTestSuite from './Testing/QualityTestSuite';

const QualityHub = () => {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const tabs = [
    { label: 'Monitoring', icon: <DashboardIcon />, component: <QualityDashboard /> },
    { label: 'Optimization', icon: <BuildIcon />, component: <OptimizationRecommendations /> },
    { label: 'Testing', icon: <SpeedIcon />, component: <QualityTestSuite /> }
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link
          color="inherit"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            // Handle navigation to home
          }}
        >
          Home
        </Link>
        <Typography color="text.primary">Quality Analysis Hub</Typography>
        <Typography color="text.primary">{tabs[activeTab].label}</Typography>
      </Breadcrumbs>

      <Typography variant="h4" gutterBottom>
        Quality Analysis Hub
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
          indicatorColor="primary"
          textColor="primary"
        >
          {tabs.map((tab, index) => (
            <Tab
              key={index}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Paper>

      <Box sx={{ mt: 3 }}>
        {tabs[activeTab].component}
      </Box>
    </Box>
  );
};

export default QualityHub; 