// app/routes/settings.tsx
"use client";
import { useState } from "react";
import { Database, Highlighter, LogOutIcon, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import Image from "next/image";

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
          <div>
            <div className="mt-5 flex flex-row items-center mx-5 justify-center">
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
        </div>
      </div>
    </div>
  );
}
