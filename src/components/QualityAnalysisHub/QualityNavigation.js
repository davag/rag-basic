import React from 'react';
import { 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  ListItemButton,
  Collapse,
  Box,
  Drawer,
  Toolbar,
  Divider
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  Timeline as TimelineIcon,
  Compare as CompareIcon,
  AutoFixHigh as OptimizeIcon,
  Science as TestingIcon,
  ExpandLess,
  ExpandMore,
  Description as DocumentIcon,
  Storage as StorageIcon,
  Code as EmbeddingIcon,
  ViewModule as ChunkIcon
} from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';

const menuItems = [
  {
    id: 'processing',
    label: 'Processing Quality',
    icon: <AssessmentIcon />,
    subitems: [
      { id: 'document', label: 'Document Quality', icon: <DocumentIcon /> },
      { id: 'chunk', label: 'Chunk Quality', icon: <ChunkIcon /> },
      { id: 'embedding', label: 'Embedding Quality', icon: <EmbeddingIcon /> },
      { id: 'storage', label: 'Storage Quality', icon: <StorageIcon /> }
    ]
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: <TimelineIcon />,
    subitems: [
      { id: 'dashboard', label: 'Quality Dashboard' },
      { id: 'trends', label: 'Trend Analysis' },
      { id: 'alerts', label: 'Alert Settings' }
    ]
  },
  {
    id: 'comparisons',
    label: 'Comparisons',
    icon: <CompareIcon />,
    subitems: [
      { id: 'models', label: 'Model Comparison' },
      { id: 'chunks', label: 'Chunk Comparison' },
      { id: 'batches', label: 'Batch Comparison' }
    ]
  },
  {
    id: 'optimization',
    label: 'Optimization',
    icon: <OptimizeIcon />,
    subitems: [
      { id: 'auto', label: 'Auto-Tuning' },
      { id: 'recommendations', label: 'Recommendations' },
      { id: 'apply', label: 'Apply Changes' }
    ]
  },
  {
    id: 'testing',
    label: 'Testing',
    icon: <TestingIcon />,
    subitems: [
      { id: 'benchmarks', label: 'Quality Benchmarks' },
      { id: 'regression', label: 'Regression Tests' },
      { id: 'performance', label: 'Performance Tests' }
    ]
  }
];

const QualityNavigation = ({ drawerWidth = 240 }) => {
  const [open, setOpen] = React.useState({});
  const location = useLocation();

  const handleClick = (id) => {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isSelected = (path) => location.pathname.includes(path);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
        },
      }}
    >
      <Toolbar />
      <Box sx={{ overflow: 'auto' }}>
        <List>
          {menuItems.map((item) => (
            <React.Fragment key={item.id}>
              <ListItem disablePadding>
                <ListItemButton onClick={() => handleClick(item.id)}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                  {open[item.id] ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
              </ListItem>
              <Collapse in={open[item.id]} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {item.subitems.map((subitem) => (
                    <ListItemButton
                      key={`${item.id}-${subitem.id}`}
                      component={Link}
                      to={`/quality/${item.id}/${subitem.id}`}
                      selected={isSelected(`/quality/${item.id}/${subitem.id}`)}
                      sx={{ pl: 4 }}
                    >
                      <ListItemIcon>{subitem.icon || item.icon}</ListItemIcon>
                      <ListItemText primary={subitem.label} />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

export default QualityNavigation; 