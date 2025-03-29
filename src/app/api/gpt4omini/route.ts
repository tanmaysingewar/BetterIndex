import Groq from "groq-sdk";

const client = new Groq({
  apiKey: "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",
});

export async function POST(req: Request) {
  try {
    const { message, previous_conversations } = await req.json();

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const messages_format: Array<{
          role: "system" | "user" | "assistant";
          content: string;
        }> = [
          {
            role: "system",
            content: "",
          },
        ];

        // Add previous conversations properly
        if (Array.isArray(previous_conversations)) {
          messages_format.push(...previous_conversations);
        }

        // Add the new user message
        messages_format.push({
          role: "user",
          content: message,
        });

        try {
          const completion = await client.chat.completions.create({
            messages: messages_format,
            model: "llama-3.3-70b-specdec",
            temperature: 0.7,
            // max_tokens: 1024,
            stream: true as const,
          });

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
