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

// Add these utility functions
const extractField = (text, fieldName) => {
  const regex = new RegExp(`${fieldName}[:\\s]+(.+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
};

const splitName = (fullName) => {
  const parts = fullName.split(' ');
  const surname = parts.pop();
  const forename = parts.join(' ');
  return { surname, forename };
};

const extractName = (text) => {
  return extractField(text, 'Name');
};

const extractDiocese = (text) => {
  const diocese = extractField(text, 'Diocese');
  return diocese.replace('Diocese', '').trim();
};

const extractSponsoringBishop = (text) => {
  return extractField(text, 'Sponsoring Bishop');
};

const extractDDOName = (text) => {
  const match = text.match(/Contact DDO\s*(.*?)(?=\s*email:|\s*Phone:)/i);
  return match ? match[1].trim() : '';
};

const extractDDOEmail = (text) => {
  const match = text.match(/email:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
  return match ? match[1].trim() : '';
};

const extractQuestionToPanel = (text) => {
  const questionSection = text.match(/3\.\s*Question to the Panel([\s\S]*?)4\./);
  return questionSection ? questionSection[1].trim() : '';
};

const extractContactNumber = (text) => {
  const match = text.match(/Contact Number:[\s\S]*?(\d[\d\s]*\d)/);
  return match ? match[1].replace(/\s/g, '') : '';
};

const extractDDOPhone = (text) => {
  const match = text.match(/Phone:\s*(\d+\s*\d+)/i);
  return match ? match[1].replace(/\s/g, '') : '';
};

const extractEmail = (text) => {
  const match = text.match(/Email:[\s\S]*?([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  return match ? match[1].trim() : '';
};

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

    const fullName = extractName(text);
    const { surname, forename } = splitName(fullName);

    const contactNumber = extractContactNumber(text);
    console.log('Extracted contact number:', contactNumber);

    const extractedData = {
      surname,
      forename,
      email: extractEmail(text),
      diocese: extractDiocese(text),
      ddoName: extractDDOName(text),
      ddoEmail: extractDDOEmail(text),
      ddoPhone: extractDDOPhone(text),
      sponsoringBishop: extractSponsoringBishop(text),
      questionToThePanel: extractQuestionToPanel(text),
      contactNumber: contactNumber,
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
