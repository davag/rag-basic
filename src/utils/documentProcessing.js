import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

/**
 * Process a PDF file and extract its text content
 * @param {File} file - The PDF file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processPdf = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    text += pageText + ' ';
  }
  
  return text;
};

/**
 * Process a DOCX file and extract its text content
 * @param {File} file - The DOCX file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processDocx = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

/**
 * Process a TXT or Python file and extract its text content
 * @param {File} file - The TXT or Python file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processTxt = async (file) => {
  return await file.text();
};

/**
 * Process a Python file and extract its text content
 * @param {File} file - The Python file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processPython = async (file) => {
  const text = await file.text();
  // You could add special processing for Python files here if needed
  return text;
};

/**
 * Determine if a file is a Python file based on extension or type
 * @param {File} file - The file to check
 * @returns {boolean} - Whether the file is a Python file
 */
export const isPythonFile = (file) => {
  return file.name.endsWith('.py') || 
         file.type === 'text/x-python' || 
         file.type === 'application/x-python-code' || 
         file.type === 'text/x-python-script';
};

/**
 * Process a file based on its type
 * @param {File} file - The file to process
 * @returns {Promise<{pageContent: string, metadata: {source: string, namespace: string}}>} - The processed document
 */
export const processFile = async (file) => {
  let text = '';
  
  if (file.type === 'application/pdf') {
    text = await processPdf(file);
  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    text = await processDocx(file);
  } else if (isPythonFile(file)) {
    text = await processPython(file);
  } else if (file.type === 'text/plain' || file.type === '') {
    // Handle text files or files with no specified MIME type
    text = await processTxt(file);
  } else {
    throw new Error(`Unsupported file type: ${file.type} for file ${file.name}`);
  }
  
  return {
    pageContent: text,
    metadata: { 
      source: file.name,
      originalFileName: file.name,
      documentName: file.name,
      namespace: 'default' // Default namespace, will be updated by the component
    }
  };
}; 