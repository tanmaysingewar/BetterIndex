import { useEffect, useRef, memo, useCallback } from "react";

interface TextInputProps {
  input: string;
  setInput: (value: string) => void;
  height: number;
  onSend: (message: string) => void;
}

const TextInput = memo(function TextInput({
  input,
  setInput,
  height,
  onSend,
}: TextInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto first to get the correct scrollHeight
      textarea.style.height = height + "px";
      // Set the height to match the content
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [height]);

  // Adjust height when input changes
  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [setInput],
  );

  return (
    <textarea
      ref={textareaRef}
      placeholder="What do you want to ask?"
      value={input}
      className="w-full bg-transparent resize-none overflow-y-auto rounded-lg focus:outline-none dark:text-white p-3 placeholder:text-neutral-400 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500"
      style={{
        border: "none",
        fontSize: "16px",
        fontWeight: "300",
        maxHeight: "200px",
        height: height + "px",
      }}
      onChange={handleChange}
      // On press Enter, send the message
      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault(); // Prevent new line
          if (input.trim()) {
            // Only send if there's content
            onSend(input);
          }
        }
      }}
    />
  );
});

export default TextInput;
