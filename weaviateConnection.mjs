import weaviate from "weaviate-ts-client";
import dotenv from "dotenv";

// Load environment variables from the .env file
dotenv.config();

// Create a Weaviate client instance with the given connection settings
const client = weaviate.client({
  scheme: process.env.WEAVIATE_SCHEME, // Specify the connection scheme (http)
  host: process.env.WEAVIATE_HOST, // Weaviate instance running locally on port 8080
});

// Export the client instance for use in other modules
export default client;
