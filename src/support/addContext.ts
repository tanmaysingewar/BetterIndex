import { QdrantClient } from "@qdrant/js-client-rest"; // Import Qdrant client
import OpenAI from "openai"; // Import OpenAI

// Instantiate Qdrant Client
const qdrantClient = new QdrantClient({
  url: "https://18ba2c2a-f7d7-4ee0-bf76-40eebb84a4c5.us-east4-0.gcp.cloud.qdrant.io",
  apiKey: process.env.QDRANT_API_KEY,
});

// Instantiate OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const grokClient = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

export default async function getContext(UserQuery: string) {
  const split = await grokClient.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `
You are an AI assistant tasked with analyzing a user query related to coding, frameworks, or platforms and breaking it down into multiple clear and specific questions. 
Each question should focus on an individual subject or component mentioned in the query. 
Follow these steps:
Identify the main subjects, tools, platforms, or frameworks in the query (e.g., modal, unsloth, etc.).
For each subject, generate a single, concise question that addresses the user's intent for that subject.
Tag each question with a relevant keyword using the @ symbol (e.g., @modal, @unsloth) based on the subject.
Ensure the questions are clear, specific, and directly related to the user's query.
Present the questions in a list format.
For example, if the query is: "Write the @modal code to fine-tune the modal by using @unsloth," the response should be:

@modal example of the simple code execution
@unsloth fine tune the model

INSTRUCTION:
- Make at least 1 and max 10 queries in return.
- Don't make up and any new selection with @ use only selection that user specified.
- One query should have only one selection specified.
- Return the only query.
- Mention @ user selection in front of the query.
- Don't add - or any other symbols before the query

Now, analyze the following user query and break it down into specific questions based on the subjects involved:`,
      },
      {
        role: "user",
        content: UserQuery,
      },
    ],
    model: "grok-3-beta",
    temperature: 0.1,
  });

  // console.log(split.choices[0]?.message);

  const indexQueries = split.choices[0]?.message.content?.split("\n") || [];

  console.log(indexQueries?.map((queries) => queries.trim()));

  function extractAndCleanWordWithAt(sentence: string): string | undefined {
    const words = sentence.split(/\s+/);
    const wordWithAt = words.find((word) => word.startsWith("@"));

    if (wordWithAt) {
      return wordWithAt.slice(1).toLowerCase();
    }

    return "";
  }

  // Function to generate embeddings using OpenAI text-embedding-3-large
  async function generateEmbedding(text: string): Promise<number[]> {
    // Normalize the input text to replace newlines, which can affect performance.
    const input = text.replace(/\n/g, " ");

    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-large", // Specify the model
        input: input,
        // Optionally specify dimensions if your Qdrant collection uses a smaller size
        // dimensions: 1536, // Or 256, 512 etc. if needed and supported by your Qdrant setup
      });

      // Check if the response structure is as expected
      if (
        !embeddingResponse ||
        !embeddingResponse.data ||
        !embeddingResponse.data[0] ||
        !embeddingResponse.data[0].embedding
      ) {
        console.error(
          "Invalid response structure from OpenAI API:",
          embeddingResponse
        );
        throw new Error(
          "Failed to get embedding from OpenAI: Invalid response structure."
        );
      }

      const vector = embeddingResponse.data[0].embedding;
      // console.log(`Generated embedding of dimension: ${vector.length}`); // Optional: Log dimension
      return vector;
    } catch (error) {
      console.error("Error generating embedding from OpenAI:", error);
      // Re-throw the error or handle it appropriately (e.g., return a default/empty vector or throw specific error)
      throw new Error(
        `Failed to generate embedding: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Initialize an array to store results for each query
  const results = [];

  for (let i = 0; i < indexQueries.length; i++) {
    const query = indexQueries[i] || "";
    const collectionName = extractAndCleanWordWithAt(query);
    //remove the @ word form the sentence
    const searchQuery = query
      .split(/\s+/)
      .filter((word) => !word.startsWith("@"))
      .join(" ");
    // Get the collection name
    console.log(collectionName, ":", searchQuery);

    try {
      // 1. Generate embedding for the user's message
      const queryVector = await generateEmbedding(searchQuery); // Now uses OpenAI

      // 2. Search Qdrant using searchNameSpace as the collection name
      const searchResult = await qdrantClient.search(collectionName || "", {
        vector: queryVector,
        limit: 1, // Limit is 1, so searchResult array will have at most one element
        //   with_payload: true,
      });

      // 3. Extract content from results and format as a string
      const extractedContent = searchResult
        .map((point) => point.payload?.content as string)
        .filter(
          (content) => typeof content === "string" && content.trim() !== ""
        );

      // Join the extracted content into a single string (will be the content if found, or empty string if not)
      const searchResultString = extractedContent.join(" "); // Join with a space or '' if preferred

      // Store the query and its extracted content string in an object
      results.push({ query: searchQuery, searchResult: searchResultString });

      // The following lines related to processing the docs array are now redundant
      // as the content is processed directly for the results array.
      // docs = extractedContent; // Update docs if still needed for some other reason
      console.log(
        "Retrieved context documents from Qdrant:",
        extractedContent.length
      );
    } catch (error) {
      // Log errors from embedding generation or other Qdrant issues
      console.error(
        `Error during Qdrant search/embedding process for collection '${collectionName}':`,
        error
      );
    }
  }

  // const docsString: string = // This variable is also redundant
  //   docs.length > 0 ? JSON.stringify(docs) : "No relevant context found."; // Updated message
  // Return the array of results
  return results;
}
