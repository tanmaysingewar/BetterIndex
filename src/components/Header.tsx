"use client";
import { SettingsIcon, SquarePen, TextSearch } from "lucide-react";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

import { useAppTheme } from "./theme-provider";

import Settings from "./Setting";
import { authClient } from "@/lib/auth-client";

export default function Header() {
  const [openSettings, setOpenSettings] = useState(false);
  const { resolvedTheme, mounted } = useAppTheme();

  const [user, setUser] = useState({});

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await authClient.getSession();
        setUser(user?.data?.user);
        console.log(user?.data?.user);
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    };
    fetchUser();
  }, []);

  console.log(resolvedTheme);

  return (
    <div className="w-full">
      <div className="flex flex-row items-center justify-between w-full top-0 fixed max-w-full bg-[#1d1e20] md:bg-transparent shadow-lg shadow-neutral-800 dark:shadow-[#1d1e20] md:shadow-none">
        <div>
          {/* <h1 className='text-3xl font-bold text-white ml-2'>Logo</h1> */}
        </div>
        <div
          id={"desktop-menu"}
          className="flex flex-row px-4 justify-center items-center"
        >
          <div className="flex-row px-4 pt-2 justify-center items-center hidden md:flex">
            <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
              <SquarePen className="w-4 h-4 text-white" strokeWidth={2.8} />
            </div>

            <button
              className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full"
              onClick={() => setOpenSettings(true)}
            >
              <SettingsIcon
                className="w-[17px] h-[17px] text-white"
                strokeWidth={2.5}
              />
            </button>
            {/* <div className='flex-row px-3 justify-center items-center flex'></div> */}
          </div>
          <div
            id={"mobile-menu"}
            className="flex-row px-4 pt-2 justify-center items-center flex md:hidden"
          >
            <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
              <SquarePen className="w-4 h-4 text-white" strokeWidth={2.8} />
            </div>
            <Drawer>
              <DrawerTrigger>
                <div className="p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full">
                  <TextSearch
                    className="w-5 h-5 text-white"
                    strokeWidth={2.5}
                  />
                </div>
              </DrawerTrigger>
              <DrawerContent className="w-full bg-[#1d1e20] rounded-t-2xl max-w-2xl ">
                <DrawerHeader>
                  <DrawerTitle>Are you absolutely sure?</DrawerTitle>
                  <DrawerDescription>
                    This action cannot be undone.
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerFooter>
                  {/* <Button>Submit</Button> */}
                  <DrawerClose>
                    {/* <Button variant="outline">Cancel</Button> */}
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>

          <Dialog open={openSettings} onOpenChange={setOpenSettings}>
            <DialogContent className="bg-[#1d1e20] h-[60vh] w-[53vw]">
              <DialogTitle className="sr-only">Settings</DialogTitle>
              <Settings user={user} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

// <Dialog>
//                             <DialogTrigger>
//                                 <div className='p-3 hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-full'>
//                                     <TextSearch className='w-5 h-5 text-white' strokeWidth={2.5} />
//                                 </div>
//                             </DialogTrigger>
//                             <DialogContent className='bg-[#1d1e20] rounded-lg  w-[53vw]'>
//                                 <DialogTitle className="sr-only"></DialogTitle>
//                                 <div className='flex flex-col justify-start'>
//                                     <Input
//                                         placeholder='Search'
//                                         style={{ fontSize: "16px" }}
//                                         className='w-full border-0 ring-0 top-0 h-[60px] border-b-2 rounded-none'
//                                     />
//                                     <div className='p-4 h-[60vh] overflow-y-scroll'>
//                                         <p className='font-light text-[15px] px-3 pb-5'>Today</p>
//                                         <div className='gap-1 flex flex-col overflow-y-scroll'>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>Scaling Beyond 160 Requests/Minute</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>Bottleneck and Traffic Estimate</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>With a VPS configuration of 8 cores (16 threads) at 3.8 GHz, 32 GB RAM, 1 TB NVMe SSD</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>50 requests/minute, each streaming for ~60 seconds, fully concurrent 50 active streams at peak</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                             <div className='hover:bg-neutral-200 dark:hover:bg-[#36383a] cursor-pointer rounded-xl p-3'>
//                                                 <p className='text-[16px]'>I/O-bound (OpenAI API calls + streaming to clients), minimal local</p>
//                                             </div>
//                                         </div>
//                                     </div>
//                                     <div className='border-t-2 h-[60px]'>
//                                         <p></p>
//                                     </div>
//                                 </div>
//                             </DialogContent>
// </Dialog>
