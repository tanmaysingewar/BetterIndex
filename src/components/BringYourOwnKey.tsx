import React, { useState, useEffect } from "react";
import { Key } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BringYourOwnKey() {
  const [isOpen, setIsOpen] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");

  // Load existing keys from localStorage on component mount
  useEffect(() => {
    const savedOpenaiKey = localStorage.getItem("openai_api_key");
    const savedOpenrouterKey = localStorage.getItem("openrouter_api_key");
    const savedAnthropicKey = localStorage.getItem("anthropic_api_key");
    const savedGoogleKey = localStorage.getItem("google_api_key");

    if (savedOpenaiKey) setOpenaiKey(savedOpenaiKey);
    if (savedOpenrouterKey) setOpenrouterKey(savedOpenrouterKey);
    if (savedAnthropicKey) setAnthropicKey(savedAnthropicKey);
    if (savedGoogleKey) setGoogleKey(savedGoogleKey);
  }, []);

  const handleSave = () => {
    // Save keys to localStorage
    localStorage.setItem("openrouter_api_key", openrouterKey.trim());
    localStorage.setItem("openai_api_key", openaiKey.trim());
    localStorage.setItem("anthropic_api_key", anthropicKey.trim());
    localStorage.setItem("google_api_key", googleKey.trim());

    // Close the dialog
    setIsOpen(false);
  };

  const handleCancel = () => {
    // Reset to saved values
    const savedOpenaiKey = localStorage.getItem("openai_api_key") || "";
    const savedOpenrouterKey = localStorage.getItem("openrouter_api_key") || "";
    const savedAnthropicKey = localStorage.getItem("anthropic_api_key") || "";
    const savedGoogleKey = localStorage.getItem("google_api_key") || "";

    setOpenaiKey(savedOpenaiKey);
    setOpenrouterKey(savedOpenrouterKey);
    setAnthropicKey(savedAnthropicKey);
    setGoogleKey(savedGoogleKey);
    setIsOpen(false);
  };

  return (
    <>
      <div
        className="flex items-center gap-2 p-3 mx-2 mb-0 mt-2 dark:bg-[#222325] bg-neutral-200 rounded-md cursor-pointer hover:dark:bg-[#2a2b2d] hover:bg-neutral-300 transition-colors"
        onClick={() => setIsOpen(true)}
      >
        <Key className="h-4 w-4" />
        <div className="flex-1">
          <p className="text-sm font-medium">Add API Keys</p>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl bg-transparent border-none p-5">
          <div className="dark:bg-[#1d1e20] rounded-lg p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Bring Your Own Key
              </DialogTitle>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-left mt-2">
                Add your own API keys
              </p>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 leading-2.5 text-left">
                Your keys are stored locally and never sent to our servers.
              </span>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium mt-5">OpenRouter</Label>
                  <Input
                    placeholder="sk-or-v1-..."
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    className="border border-neutral-300 dark:border-neutral-700"
                  />
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 leading-2.5">
                  OpenRouter will be prioritized over other providers. If you
                  provide an OpenRouter API key along with other API keys, the
                  system will default to using OpenRouter exclusively.
                </span>
                <Label className="text-sm font-medium mt-3">OpenAI</Label>
                <Input
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="border border-neutral-300 dark:border-neutral-700"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Anthropic (Claude)
                </Label>
                <Input
                  placeholder="sk-ant-api03-..."
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  className="border border-neutral-300 dark:border-neutral-700"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Google Gemini</Label>
                <Input
                  placeholder="AIzaSyC..."
                  value={googleKey}
                  onChange={(e) => setGoogleKey(e.target.value)}
                  className="border border-neutral-300 dark:border-neutral-700"
                />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-bold">
                Note
              </span>
              <ul className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                <li>
                  - Your API keys are stored locally on your device and are
                  never transmitted to our servers.
                </li>
                <li>
                  - Using your own API keys removes <u>rate limits</u> and usage
                  restrictions.
                </li>
                <li>
                  - Model reasoning and thinking processes are only available
                  when using OpenRouter.
                </li>
              </ul>
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                className="mr-2 cursor-pointer"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button className="cursor-pointer" onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
