# LLM Configuration in RAG-Basic

This document describes the centralized approach to LLM configuration in the RAG-Basic application.

## Overview

We've implemented a centralized configuration system for all LLM-related settings to ensure:

1. A single source of truth for model definitions, costs, and default settings
2. Consistent behavior across different components
3. Easier maintenance and updates to model configurations
4. Clear separation between configuration and implementation

## Key Components

### 1. Central Configuration File

The core of the system is the `src/config/llmConfig.js` file, which defines:

- Default model definitions and pricing information
- Vendor-specific visual styling (colors)
- API key configuration and validation
- Default application settings
- Utility functions for cost calculation and model filtering

### 2. Configuration Usage

The central configuration is used by:

- `LlmSettings.js` - For displaying and editing model configurations
- `apiServices.js` - For creating LLM instances with appropriate settings
- `CostTrackingDashboard.js` - For calculating and visualizing costs
- `parallelValidationProcessor.js` and `parallelLLMProcessor.js` - For processing queries
- `App.js` - For checking API key configuration

### 3. Local Storage Integration

While we maintain a centralized configuration, we also support user customization through localStorage:

- Custom model configurations are saved to and loaded from localStorage
- User-specific settings override the defaults
- The centralized system provides fallbacks when localStorage values aren't available

## Model Configuration Format

Each model is defined with the following properties:

```javascript
{
  vendor: 'OpenAI',           // The provider of the model
  input: 2.5,                 // Cost per 1M input tokens in USD
  output: 10,                 // Cost per 1M output tokens in USD
  active: true,               // Whether the model is available for use
  description: 'Description', // User-friendly description
  deploymentName: 'name'      // (Optional) For Azure deployments
}
```

## Usage Examples

### Creating an LLM Instance

```javascript
import { createLlmInstance } from './utils/apiServices';

// The model name will be automatically matched to the right client
const llm = createLlmInstance('gpt-4o', 'You are a helpful assistant');
const response = await llm.invoke('Hello!');
```

### Calculating Costs

```javascript
import { calculateCost } from './config/llmConfig';

const cost = calculateCost('gpt-4o', { 
  input: 1000,  // Token count
  output: 500   // Token count
});
```

### Getting Active Models

```javascript
import { getActiveModels } from './config/llmConfig';

const activeModels = getActiveModels();
// Returns an array of model IDs that are marked as active
```

## Extending the Configuration

To add a new model:

1. Add the model definition to `defaultModels` in `src/config/llmConfig.js`
2. Update the provider-specific client in `apiServices.js` if necessary
3. The new model will automatically be available in the UI and for cost tracking

## Best Practices

1. Always use the centralized configuration instead of hardcoding model properties
2. When accessing localStorage, always provide a fallback from the central configuration
3. For new components, import settings directly from the configuration module
4. Keep model-specific logic in the appropriate provider classes in `apiServices.js` 