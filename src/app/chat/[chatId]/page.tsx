import ChatInterface from "@/screens/ChatInterface";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

interface User {
  id: string | undefined;
  name: string | undefined;
  email: string | undefined;
  emailVerified: boolean | undefined;
  image: string | undefined;
  createdAt?: Date | undefined; // Allow undefined or null
  updatedAt?: Date | undefined; // Allow undefined or null
  isAnonymous: boolean;
  isDummy?: boolean;
}

export default async function Chat() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return redirect("/");
  }

  //console.log("ChatInterface Session", session.user);
  return <ChatInterface user={session.user as User} />;
}
