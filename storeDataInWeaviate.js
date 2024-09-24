const { OpenAIEmbeddings } = require("@langchain/openai");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { WeaviateStore } = require("@langchain/weaviate");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const textract = require("textract");
// const csv = require("csv-parser");
require("dotenv").config();
const csvParser = require("csv-parser");

// Function to extract text from various file types
async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      // Read PDF file and extract text
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      return pdfData.text;

    case ".docx":
      // Extract text from DOCX file
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;

    case ".txt":
      // Read plain text file
      return fs.readFileSync(filePath, "utf8");

    case '.csv':
      return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on("data", (row) => {
            rows.push(row);
          })
          .on("end", () => {
            resolve(JSON.stringify(rows, null, 2)); // Convert CSV rows to JSON for easier processing
          })
          .on("error", (error) => {
            reject(error);
          });
      });

    default:
      // For other file types, use textract to extract text
      return new Promise((resolve, reject) => {
        textract.fromFileWithPath(filePath, (error, text) => {
          if (error) {
            reject(error);
          } else {
            resolve(text);
          }
        });
      });
  }
}

// Function to store extracted text data into Weaviate
async function storeDataInWeaviate() {
  // Dynamically import Weaviate client
  const { default: client } = await import("./weaviateConnection.mjs");
  const embeddings = new OpenAIEmbeddings();

  // Read all files from the specified directory
  const files = fs.readdirSync(process.env.DIRECTORY_PATH);

  let allDocs = [];
  for (const file of files) {
    const filePath = path.join(process.env.DIRECTORY_PATH, file);
    console.log(`Processing file: ${file}`);

    try {
      // Extract text from each file
      const text = await extractTextFromFile(filePath);

      // Split text into chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 50,
      });
      const docs = await textSplitter.createDocuments([text]);
      allDocs.push(...docs);
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }
  }

  // Create Weaviate schema if it doesn't already exist
  try {
    await client.schema
      .classCreator()
      .withClass({
        class: process.env.COLLECTION_NAME,
        vectorizer: "text2vec-openai",
      })
      .do();
    console.log(`Schema created for class: ${process.env.COLLECTION_NAME}`);
  } catch (error) {
    if (error.message.includes("already exists")) {
      console.log(
        `Class ${process.env.COLLECTION_NAME} already exists. Skipping creation.`
      );
    } else {
      throw error;
    }
  }

  // Create the vector store in Weaviate using batches
  const batchSize = 10;
  for (let i = 0; i < allDocs.length; i += batchSize) {
    const batch = allDocs.slice(i, i + batchSize);
    await WeaviateStore.fromDocuments(batch, embeddings, {
      client,
      indexName: process.env.COLLECTION_NAME,
      textKey: "text",
    });
    console.log(
      `Processed batch ${i / batchSize + 1} of ${Math.ceil(
        allDocs.length / batchSize
      )}`
    );
  }

  console.log("Vector store created in Weaviate.");
}

// Function to check the total number of inserted documents in Weaviate
async function checkInsertedData() {
  const { default: client } = await import("./weaviateConnection.mjs");

  const result = await client.graphql
    .aggregate()
    .withClassName(process.env.COLLECTION_NAME)
    .withFields("meta { count }")
    .do();

  console.log(
    `Total inserted documents in Weaviate: ${
      result.data.Aggregate[process.env.COLLECTION_NAME][0].meta.count
    }`
  );
}

// Execute the functions to store data and check the result
storeDataInWeaviate()
  .then(() => checkInsertedData())
  .catch(console.error);
