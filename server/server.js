const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve static files from the 'dist' folder (adjust path if necessary)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Define a route for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html')); // Ensure this points to your frontend entry point
});

const upload = multer({ storage: multer.memoryStorage() });

// Your existing utility functions...

app.post('/api/extract-pro-forma-data', upload.single('proForma'), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    let text;

    console.log('File received:', req.file.originalname, 'Type:', req.file.mimetype);

    if (req.file.mimetype === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      throw new Error('Unsupported file type');
    }

    console.log('Extracted text:', text);

    const fullName = extractField(text, 'Name');
    const { surname, forename } = splitName(fullName);

    const candidateEmail = extractEmail(text);
    const ddoEmail = extractDDOEmail(text);

    console.log('Extracted candidate email:', candidateEmail);
    console.log('Extracted DDO email:', ddoEmail);

    const extractedData = {
      surname,
      forename,
      email: candidateEmail,
      diocese: extractField(text, 'Diocese'),
      ddoName: extractField(text, 'Contact DDO'),
      ddoEmail: ddoEmail,
      sponsoringBishop: extractField(text, 'Sponsoring Bishop'),
      questionToThePanel: extractField(text, 'Question to the Panel'),
    };

    console.log('Extracted data:', extractedData);

    res.json(extractedData);
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});