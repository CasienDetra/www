import { generateOGImage } from "@/lib/og";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const png = await generateOGImage({
    title: "Yanouk",
    description:
      "Software developer in Phnom Penh, Cambodia. Open-source projects, developer tools, and practical guides.",
  });
  return new Response(png, {
    headers: { "Content-Type": "image/png" },
  });
};
