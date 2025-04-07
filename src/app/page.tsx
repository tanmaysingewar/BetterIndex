"use server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  return redirect("/chat?new=true");
}
