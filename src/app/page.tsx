import MainPage from "@/components/MainPage";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Chat() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return (
      <MainPage
        session={{
          user: {
            isAnonymous: true,
            isDummy: true,
          },
        }}
      />
    );
  }
  return <MainPage session={session} />;
}
