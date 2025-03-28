// app/routes/settings.tsx
"use client";
import { useState } from "react";
import { Database, LogOutIcon, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import Image from "next/image";
import { Switch } from "./ui/switch";

export default function Settings({ user }) {
  const router = useRouter();
  const [selected, setSelected] = useState("Account");

  console.log(user.image);

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/"); // redirect to login page
          return location.reload();
        },
      },
    });
  };

  return (
    <div className=" flex flex-col">
      <div className="p-3  bg-[#1d1e20] rounded-3xl">
        <p className="text-xl font-normal ml-3 mt-3">Settings</p>
        <div className="flex flex-row">
          <div className="mt-5 min-w-44 gap-2 flex flex-col">
            <div
              className={`flex gap-2 text-sm text-left font-light cursor-pointer rounded-xl px-4 py-3 text-neutral-400 ${selected === "Account" ? "bg-neutral-700 dark:bg-[#28292b] text-white" : "hover:bg-neutral-700 dark:hover:bg-[#28292b] hover:text-white"}`}
              onClick={() => setSelected("Account")}
            >
              <UserRound strokeWidth={1.2} className="h-5 w-5" />
              <p className="font-light">Account</p>
            </div>
            {/* <div
              className={`flex gap-2 text-sm text-left font-light cursor-pointer rounded-xl px-4 py-3 text-neutral-400 ${selected === "Appearance" ? "bg-neutral-700 dark:bg-[#28292b] text-white" : "hover:bg-neutral-700 dark:hover:bg-[#28292b] hover:text-white"}`}
              onClick={() => setSelected("Appearance")}
            >
              <Highlighter strokeWidth={1.2} className="h-5 w-5" />
              <p className="font-light">Highlighter</p>
            </div> */}
            <div
              className={`flex gap-2 text-sm text-left font-light hover:bg-neutral-700 dark:hover:bg-[#28292b] cursor-pointer rounded-xl px-4 py-3 text-neutral-400 ${selected === "Data" ? "bg-neutral-700 dark:bg-[#28292b] text-white" : "hover:bg-neutral-700 dark:hover:bg-[#28292b] hover:text-white"}`}
              onClick={() => setSelected("Data")}
            >
              <Database strokeWidth={1.2} className="h-5 w-5 " />
              <p className="font-light">Data</p>
            </div>
          </div>
          {selected === "Account" && (
            <div className="mx-5">
              <div className="mt-5 flex flex-row items-center justify-center">
                <Avatar className="w-12 h-12 rounded-full">
                  <Image
                    src={user?.image || ""}
                    alt=""
                    className="w-full h-full rounded-full"
                    width={100}
                    height={100}
                  />
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>

                <div className="ml-3 justify-center">
                  <p className="text-left">{user?.name}</p>
                  <p className="text-xs mt-1">{user?.email}</p>
                </div>
              </div>
              <Button className="mt-10" onClick={() => handleLogout()}>
                <LogOutIcon strokeWidth={1.2} className="h-5 w-5" />
                <p className="font-light">Logout</p>
              </Button>
            </div>
          )}
          {selected === "Data" && (
            <div className="space-y-4">
              <div className="flex flex-row mx-5">
                <div>
                  <p className="text-sm font-bold">Improve the Model</p>
                  <p className="text-sm mt-2">
                    By allowing your data to be used for training our models,
                    you help enhance your own experience and improve the quality
                    of the model for all users. We take measures to ensure your
                    privacy is protected throughout the process.
                  </p>
                </div>
                <div className="flex justify-center items-center mx-10">
                  <Switch id="airplane-mode" defaultChecked />
                  {/* Checking can be accessed by the checked={true}*/}
                </div>
              </div>
              <div className="flex flex-row mx-5">
                <div>
                  <p className="text-sm font-bold">Export Account Data</p>
                  <p className="text-sm mt-2">
                    You can download all data associated with your account
                    below. This data includes everything stored in all xAI
                    products.
                  </p>
                </div>
                <div className="flex justify-center items-center mx-5">
                  <Button
                    variant="secondary"
                    className="rounded-4xl border border-neutral-500"
                  >
                    Export
                  </Button>
                </div>
              </div>
              <div className="flex flex-row mx-5">
                <div>
                  <p className="text-sm font-bold">Delete All Conversations</p>
                  <p className="text-sm mt-2">
                    Permanently remove all records of your conversations and any
                    associated logs from servers.
                  </p>
                </div>
                <div className="flex justify-center items-center mx-5">
                  <Button
                    variant="secondary"
                    className="rounded-4xl border border-neutral-400"
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <div className="flex flex-row mx-5">
                <div>
                  <p className="text-sm font-bold">Delete Account</p>
                  <p className="text-sm mt-2">
                    Permanently delete your account and associated data from the
                    xAI platform. Deletions are immediate and cannot be undone.
                  </p>
                </div>
                <div className="flex justify-center items-center mx-5">
                  <Button
                    variant="secondary"
                    className="rounded-4xl border border-red-400 text-red-400"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
