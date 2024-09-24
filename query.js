const { ChatOpenAI } = require("@langchain/openai");
const { RetrievalQAChain, LLMChain } = require("langchain/chains");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { WeaviateStore } = require("@langchain/weaviate");


require("dotenv").config();

// Function to initialize the Retrieval-Augmented Generation (RAG) setup
async function initializeRAG() {
  // Initialize the language model with specific temperature and model name
  const model = new ChatOpenAI({
    temperature: 0.7,
    modelName: "gpt-3.5-turbo",
  });

  // Initialize the embedding model for vector representation of text
  const embeddings = new OpenAIEmbeddings();

  // Dynamically import the Weaviate client
  const { default: client } = await import("./weaviateConnection.mjs");

  // Initialize the WeaviateStore with the existing index
  const vectorStore = await WeaviateStore.fromExistingIndex(embeddings, {
    client,
    indexName: process.env.COLLECTION_NAME, // Collection name from environment variables
    textKey: "text", // Key for the text in the Weaviate index
  });

  // Create a custom prompt template for processing responses
  const promptTemplate = new PromptTemplate({
    template:
      "Based on the following context, list and briefly describe all key concepts. Ensure you include every concept without omitting any: {context}",
    inputVariables: ["context"],
  });
  // inputVariables: ["context", "query"],

  // Create the retrieval chain with the language model and vector store
  const chain = RetrievalQAChain.fromLLM(
    model,
    vectorStore.asRetriever({ k: 100 }), // Retrieve top 10 relevant documents
    {
      returnSourceDocuments: true, // Return source documents along with the answer
      combineDocumentsChain: new LLMChain({
        llm: model, // Language model used for combining documents
        prompt: promptTemplate, // Custom prompt template for document combination
      }),
    }
  );

  return chain;
}

// Function to query the RAG setup and get the response
async function queryRAG(chain, query) {
  // Call the chain with the query and return the response text
  const response = await chain.call({
    query: query,
  });

  return response.text;
}

// Main function to execute the RAG query process
async function main() {
  try {
    // Initialize the RAG setup
    const chain = await initializeRAG();

    // Define your query here
  
    const query = "What is total cost of product 'Many Season'?";

    // Execute the query and get the response
    const response = await queryRAG(chain, query);

    // Output the query and response
    console.log("Query:", query);
    console.log("Response:", response);
  } catch (error) {
    // Log any errors encountered during execution
    console.error("Error in main function:", error);
  }
}

// Run the main function
main().catch(console.error);




















