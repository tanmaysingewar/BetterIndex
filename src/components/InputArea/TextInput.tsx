import {
  useEffect,
  useRef,
  memo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";

interface TextInputProps {
  input: string;
  setInput: (value: string) => void;
  height: number;
  onSend: (message: string) => void;
  filteredSuggestions?: string[];
  selectedIndex?: number;
  setSelectedIndex?: (index: number | ((prev: number) => number)) => void;
  handleSelection?: (selection: string) => void;
  handleInputChange?: (value: string) => void;
  disabled?: boolean;
}

// Define methods that can be called on the TextInput ref
export interface TextInputRef {
  focus: () => void;
}

const TextInput = memo(
  forwardRef<TextInputRef, TextInputProps>(function TextInput(
    {
      input,
      setInput,
      height,
      onSend,
      filteredSuggestions = [],
      selectedIndex = 0,
      setSelectedIndex = () => {},
      handleSelection = () => {},
      handleInputChange = setInput,
      disabled = false,
    },
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose focus method to parent components
    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus();
      },
    }));

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
        const newValue = e.target.value;
        const words = input.split(" ");
        const hasExistingTone = words.some((word) => word.startsWith("!"));

        // If there's an existing tone and user is trying to add another !, prevent it
        if (
          hasExistingTone &&
          newValue.length > input.length &&
          newValue.slice(-1) === "!"
        ) {
          return;
        }

        handleInputChange(newValue);
      },
      [handleInputChange, input]
    );

    return (
      <div className="relative w-full">
        <textarea
          ref={textareaRef}
          placeholder="How can I help you"
          value={input}
          className="w-full bg-transparent resize-none overflow-y-auto rounded-lg focus:outline-none caret-black dark:caret-white p-3 placeholder:text-neutral-400 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500"
          style={{
            fontSize: "16px",
            fontWeight: "400",
            maxHeight: "200px",
            height: height + "px",
          }}
          onChange={handleChange}
          // Handle keyboard events for suggestions and sending messages
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            const hasSuggestions = filteredSuggestions.length > 0;

            if (e.key === "ArrowUp" && hasSuggestions) {
              e.preventDefault();
              setSelectedIndex((prev: number) =>
                prev > 0 ? prev - 1 : filteredSuggestions.length - 1
              );
            } else if (e.key === "ArrowDown" && hasSuggestions) {
              e.preventDefault();
              setSelectedIndex((prev: number) =>
                prev < filteredSuggestions.length - 1 ? prev + 1 : 0
              );
            } else if (e.key === "Enter") {
              if (!e.shiftKey && hasSuggestions) {
                e.preventDefault();
                handleSelection(filteredSuggestions[selectedIndex]);
              } else if (
                !e.shiftKey &&
                !input.split(" ").slice(-1)[0].includes("@")
              ) {
                e.preventDefault(); // Prevent new line
                if (input.trim() && !disabled) {
                  // Only send if there's content and not disabled
                  onSend(input);
                }
              }
            }
          }}
        />
      </div>
    );
  })
);

export default TextInput;
