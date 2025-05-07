interface TonePrompt {
  tone: string;
  prompt: string;
}

const tonePrompts: TonePrompt[] = [
  {
    tone: "friendly",
    prompt:
      "Respond in a warm, approachable, and conversational manner. Use casual language while maintaining professionalism. Feel free to use encouraging phrases and positive reinforcement.",
  },
  {
    tone: "formal",
    prompt:
      "Maintain a professional and structured tone. Use formal language, complete sentences, and avoid colloquialisms. Present information in a clear, organized manner.",
  },
  {
    tone: "casual",
    prompt:
      "Keep the conversation relaxed and informal. Use everyday language, contractions, and a more laid-back style. Feel free to be more conversational and less rigid in structure.",
  },
  {
    tone: "professional",
    prompt:
      "Communicate with business-appropriate language and maintain a focus on efficiency and clarity. Use industry-standard terminology when applicable and maintain a respectful, authoritative tone.",
  },
  {
    tone: "technical",
    prompt:
      "Focus on precise, technical language. Include relevant technical details, use proper terminology, and maintain accuracy in technical explanations. Support statements with specific technical references when appropriate.",
  },
  {
    tone: "simple",
    prompt:
      "Use clear, straightforward language. Avoid complex terminology and break down concepts into easily digestible parts. Focus on making information accessible to all levels of understanding.",
  },
];

export function getPromptByTone(tone: string): string {
  const defaultPrompt =
    "Respond in a balanced, neutral tone while maintaining clarity and professionalism.";
  const tonePrompt = tonePrompts.find(
    (t) => t.tone.toLowerCase() === tone.toLowerCase()
  );
  return tonePrompt ? tonePrompt.prompt : defaultPrompt;
}

export function generateSystemPrompt(message: string): string {
  // Extract tone indicators (words starting with !)
  const toneIndicators = message
    .split(" ")
    .filter((word) => word.startsWith("!"))
    .map((word) => word.substring(1).toLowerCase());

  if (toneIndicators.length === 0) {
    return "You are a helpful assistant.";
  }

  // Get the first valid tone indicator
  const selectedTone = toneIndicators[0];
  return getPromptByTone(selectedTone);
}

export function hasToneIndicator(message: string): boolean {
  return message.split(" ").some((word) => word.startsWith("!"));
}
