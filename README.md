# RAG Testing Application

This application allows you to test and compare Retrieval-Augmented Generation (RAG) performance across different LLMs and system prompts.

## Features

- Document upload (PDF, TXT, DOCX, Python files)
- Namespace support for organizing documents
- In-memory vector store creation
- Query interface for test questions
- Toggle between different LLMs (OpenAI, Claude, Ollama)
- Edit and switch between system prompts
- Side-by-side response comparison
- Basic metrics (response time, token usage)

## Quality Analysis Tools

The application includes three powerful quality analysis tools to help evaluate and improve your RAG system:

### 1. Retrieval Quality Evaluation
- Evaluates the quality of retrieval results using multiple metrics:
  - Relevance scoring of retrieved chunks
  - Diversity analysis of results
  - Precision and recall measurements
- Generates test queries to evaluate retrieval performance
- Provides detailed analysis of retrieved content quality
- Shows aggregate scores and recommendations for improvement

### 2. Embedding Quality Analysis
- Analyzes the quality and characteristics of embeddings:
  - Semantic coherence evaluation
  - Dimensionality analysis
  - Clustering quality assessment
  - Distance distribution analysis
- Provides visualizations and statistics
- Identifies potential issues in embedding quality
- Offers recommendations for optimization

### 3. Source Content Analysis
- Evaluates the quality of source documents:
  - Content completeness check
  - Formatting issues detection
  - Readability analysis
  - Key information identification
- Calculates aggregate quality metrics
- Identifies common issues across documents
- Provides detailed per-document analysis
- Shows recommendations for content improvement

These tools help you:
- Identify potential issues in your RAG pipeline
- Optimize retrieval quality
- Improve embedding effectiveness
- Enhance source document quality
- Make data-driven decisions for system improvement

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with your API keys (use `.env.example` as a template):
   ```
   # Client-side environment variables
   REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
   REACT_APP_ANTHROPIC_API_KEY=your_anthropic_api_key_here
   REACT_APP_API_URL=http://localhost:3002
   REACT_APP_OLLAMA_API_URL=http://localhost:11434

   # Server-side environment variables
   OPENAI_API_KEY=your_openai_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   OLLAMA_API_URL=http://localhost:11434
   FRONTEND_PORT=3000
   BACKEND_PORT=3002
   ```

## Running with Docker

The application can be run using Docker Desktop for a consistent development environment:

### Initial Setup

1. Make sure Docker Desktop is installed and running on your machine
2. Copy the `.env.example` file to `.env` and configure your environment variables
3. Build and start the container:
   ```bash
   docker-compose up --build
   ```
   This will:
   - Build the application image
   - Start the container
   - Make the application available at:
     - Frontend: http://localhost:3000
     - Backend: http://localhost:3002

### Docker Commands Reference

#### Basic Operations
```bash
# Start the application (with existing images)
docker-compose up

# Start in detached mode (run in background)
docker-compose up -d

# Stop the application
docker-compose down

# View logs in real-time
docker-compose logs -f
```

#### Rebuilding and Updates

When you need to rebuild (e.g., after dependency changes or Dockerfile updates):

```bash
# Full rebuild (recommended when experiencing issues)
docker-compose down --rmi all    # Remove all images
docker system prune -f          # Clean up unused data
docker-compose up --build       # Rebuild and start

# Quick rebuild (might not catch all changes)
docker-compose up --build

# Force rebuild of specific service
docker-compose build --no-cache web
docker-compose up
```

#### Development Workflow

The development environment is configured for hot-reloading:

- Source code is mounted as a volume
- Changes to React components will auto-refresh
- Server changes will trigger automatic restart
- Environment variables from `.env` are automatically loaded

#### Troubleshooting Docker Issues

1. **Container won't start or crashes:**
   ```bash
   # Check container logs
   docker-compose logs

   # Check specific service logs
   docker-compose logs web
   docker-compose logs api
   ```

2. **Port conflicts:**
   - Ensure ports 3000 and 3002 are not in use
   - Check running containers: `docker ps`
   - Stop conflicting services or modify ports in docker-compose.yml

3. **Performance issues:**
   ```bash
   # Clear Docker cache and unused data
   docker system prune -a --volumes
   
   # Monitor container resources
   docker stats
   ```

4. **Volume mounting issues:**
   - Ensure proper file permissions
   - Check volume mounts: `docker-compose ps`
   - Verify paths in docker-compose.yml

5. **Environment variables not loading:**
   - Confirm `.env` file exists and is properly formatted
   - Rebuild with: `docker-compose up --build`
   - Check environment: `docker-compose exec web env`

### Best Practices

1. **Development:**
   - Use volumes for hot-reloading
   - Keep node_modules in container
   - Use .dockerignore for faster builds

2. **Production:**
   - Use multi-stage builds
   - Minimize image size
   - Set NODE_ENV=production

3. **Security:**
   - Never commit .env files
   - Use secrets management
   - Regularly update base images

4. **Performance:**
   - Use .dockerignore
   - Layer caching optimization
   - Regular cleanup with `docker system prune`

## Running the Application

### Development Mode

To run both the React application and the API server concurrently:

```
npm run dev
```

This will start:
- The React application on http://localhost:3000
- The API server on http://localhost:3002

### Running Separately

To run the React application only:

```
npm start
```

To run the API server only:

```
npm run server
```

## Using Ollama

To use Ollama models:

1. Install Ollama from https://ollama.ai/
2. Run Ollama locally: `ollama serve`
3. Pull the models you want to use:
   ```
   ollama pull llama3
   ollama pull mistral
   ```
4. In the application, select Ollama models and configure the endpoint (default: http://localhost:11434)

## Namespaces

The application supports organizing documents into namespaces:

1. When uploading documents, assign them to a namespace
2. Create multiple namespaces for different document sets
3. When querying, select which namespaces to include in the search

## Usage

1. Upload documents using the file dropzone and assign namespaces
2. Configure your vector store settings (chunk size, overlap)
3. Create the vector store
4. Enter your test questions and select namespaces to query
5. Select LLMs and system prompts to compare
6. View and analyze the responses and metrics

## Technologies Used

- React
- Material UI
- LangChain
- Memory Vector Store (browser-compatible)
- PDF.js
- Mammoth (for DOCX processing)
- Express (for API server)
- Ollama (for local LLM support)

## Troubleshooting

### Webpack Issues

If you encounter webpack errors related to Node.js modules:

1. Make sure you have all the required polyfill dependencies installed:
   ```
   npm install --save-dev node-polyfill-webpack-plugin
   npm install --save assert browserify-zlib stream-http https-browserify url os-browserify
   ```

2. Check that your `config-overrides.js` file is properly configured to handle Node.js modules in the browser.

3. If you see FAISS-related warnings, they can be safely ignored as we're using the MemoryVectorStore instead of FAISS for browser compatibility.

### API Connection Issues

If you have trouble connecting to the API:

1. Make sure your server is running on the correct port (default: 3002)
2. Check that your `.env` file contains the correct API keys
3. Verify that the CORS settings in the server allow connections from your React app

### Ollama Integration

If Ollama integration is not working:

1. Ensure Ollama is running locally: `ollama serve`
2. Verify that you've pulled the models you want to use
3. Check that the Ollama endpoint is correctly configured in the application

# Using Azure OpenAI Models

To use Azure OpenAI models in this application, you need to properly configure your Azure OpenAI service and set the required environment variables.

## Azure OpenAI Setup

1. Create an Azure OpenAI service in your Azure portal if you haven't already.
2. Deploy the models you want to use in your Azure OpenAI service.
3. Note down your deployment names - these will be used to reference your models.
4. Obtain your Azure OpenAI API key and endpoint URL from the Azure portal.

## Configuration

Add the following variables to your `.env` file:

```
REACT_APP_AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
REACT_APP_AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
REACT_APP_AZURE_OPENAI_API_VERSION=2023-12-01-preview
```

## Using Azure Models

To use an Azure model in the application:

1. In the LLM Settings menu, add a new model with the format: `azure-YOUR_DEPLOYMENT_NAME`.
   - For example, if your deployment is named `gpt-4o`, enter `azure-gpt-4o`.
   - Make sure to set the vendor to "AzureOpenAI"
   
2. The application will then route requests for this model to your Azure OpenAI service.

3. Note that the deployment name must exactly match what you've configured in your Azure OpenAI service.

## Troubleshooting

If you encounter a 404 error when using Azure models, check that:

1. Your deployment name is correctly specified in the model name (with the `azure-` prefix)
2. The deployment actually exists in your Azure OpenAI service
3. Your API key has access to the specified deployment
4. Your endpoint URL is correctly formatted (should end with `.openai.azure.com`)

Debug logs will be visible in the browser console for troubleshooting.

## Recent Updates

### Cost Tracking Optimization
- Modified the application to use cost data directly from API responses when available, rather than recalculating
- Updated components: ResponseComparison and ResponseValidation
- Maintains fallback to calculated costs when API response doesn't include cost data
- This ensures more accurate cost tracking, particularly for API providers that calculate costs differently based on model version or other factors