import { OctagonPause, Send } from "lucide-react";
import { Button } from "../ui/button";
import TextInput from "./TextInput";

interface InputBoxProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (message: string) => void;
  height: number;
  disabled?: boolean;
}

export default function InputBox({
  input,
  setInput,
  onSend,
  height,
  disabled,
}: InputBoxProps) {
  return (
    <div>
      {/* <p>{input}</p> */}
      <div className="max-w-3xl md:mx-auto text-base font-sans lg:px-0 dark:bg-[#1d1e20] md:pb-4 pb-2 w-screen md:rounded-t-3xl px-2">
        <div className="flex flex-col items-end rounded-3xl dark:bg-[#303335] bg-neutral-100 p-2 w-full">
          <TextInput
            input={input}
            setInput={setInput}
            height={height}
            onSend={onSend}
          />
          <div className="flex flex-row justify-between w-full mt-0">
            <div className="flex flex-row mt-2 text-neutral-200">
              {/* <div className="flex mx-1 my-auto text-sm rounded-full justify-center items-center p-2 cursor-pointer text-blue-200">
                                <Highlighter className="w-5 h-5 text-blue-400" /> <p className="ml-2 text-sm mr-1 text-blue-400">Highlights</p>
                            </div> */}
              <p className="text-sm mx-3">Llama 3.3 70b Specdec</p>
            </div>
            <div className="flex flex-row justify-center items-center">
              <p className="text-xs dark:text-neutral-400 mr-3 hidden sm:block">
                Use{" "}
                <span className="dark:text-white text-black">
                  shift + return
                </span>{" "}
                for new line
              </p>
              <Button
                className="p-2 h-[38px] w-[38px] rounded-full dark:bg-neutral-200 bg-neutral-800"
                onClick={() => onSend(input)}
                disabled={disabled}
              >
                {!disabled ? <Send /> : <OctagonPause />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
