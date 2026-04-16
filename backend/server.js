const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5001;

// Helper to get absolute base URL
const getBaseUrl = (req) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}`;
};

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// API Endpoints

// 1. Upload Audio
app.post('/api/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const baseUrl = getBaseUrl(req);
  res.json({ 
    message: 'File uploaded successfully',
    filename: req.file.filename,
    url: `${baseUrl}/uploads/${req.file.filename}`
  });
});

// 2. Process Signal
app.post('/api/process', (req, res) => {
  const { inputFilename, operations } = req.body;
  if (!inputFilename) return res.status(400).json({ error: 'Missing input filename' });

  const inputPath = path.join(__dirname, 'uploads', inputFilename);
  const outputFilename = `proc-${uuidv4()}.wav`;
  const outputPath = path.join(__dirname, 'uploads', outputFilename);

  const pythonScript = path.join(__dirname, 'scripts', 'processor.py');
  
  // Set default operations if not provided
  const ops = operations || {};
  
  const pyProcess = spawn('python3', [
    pythonScript,
    inputPath,
    outputPath,
    JSON.stringify(ops)
  ]);

  let resultData = '';
  let errorData = '';

  pyProcess.stdout.on('data', (data) => {
    resultData += data.toString();
    console.log('Python Output Chunk:', data.toString().substring(0, 100));
  });
  pyProcess.stderr.on('data', (data) => {
    errorData += data.toString();
    console.log('Python Error Chunk:', data.toString());
  });

  pyProcess.on('close', (code) => {
    if (code !== 0) {
      console.error('Python Error:', errorData);
      return res.status(500).json({ error: 'Processing failed', details: errorData });
    }

    try {
      const result = JSON.parse(resultData);
      if (result.error) {
         return res.status(500).json({ error: 'Processing logic failed', details: result.error });
      }
      const baseUrl = getBaseUrl(req);
      result.outputUrl = `${baseUrl}/uploads/${outputFilename}`;
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse result from processor', raw: resultData });
    }
  });
});

// 3. Generate Synthetic Signal
app.post('/api/generate', (req, res) => {
  const { type, frequency, duration = 2, amplitude = 1 } = req.body;
  
  const outputFilename = `gen-${uuidv4()}.wav`;
  const outputPath = path.join(__dirname, 'uploads', outputFilename);
  const pythonScript = path.join(__dirname, 'scripts', 'processor.py');

  const config = { mode: 'generate', type, frequency, duration, amplitude };

  const pyProcess = spawn('python3', [
    pythonScript,
    'NONE', // Dummy input
    outputPath,
    JSON.stringify(config)
  ]);

  let resultData = '';
  pyProcess.stdout.on('data', (data) => resultData += data.toString());

  pyProcess.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ error: 'Generation failed' });
    try {
      const result = JSON.parse(resultData);
      const baseUrl = getBaseUrl(req);
      result.url = `${baseUrl}/uploads/${outputFilename}`;
      result.filename = outputFilename;
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Generation parse error' });
    }
  });
});

const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`Signal Visualizer Server running on http://localhost:${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
};

startServer(PORT);
