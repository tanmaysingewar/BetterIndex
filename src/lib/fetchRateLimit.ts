export default async function getRateLimit() {
  try {
    const rateLimitResponse = await fetch("/api/rateLimit");

    if (!rateLimitResponse.ok) {
      console.error(
        `API Error fetching rate limit: ${rateLimitResponse.status} ${rateLimitResponse.statusText}`
      );
      // Optionally throw an error or handle based on how critical this is
    } else {
      const rateLimitData = await rateLimitResponse.json();
      if (rateLimitData && rateLimitData.rateLimit !== undefined) {
        localStorage.setItem(
          "userRateLimit",
          rateLimitData.rateLimit.toString()
        );
        console.log(
          `Successfully fetched and cached rate limit: ${rateLimitData.rateLimit}`
        );
      } else {
        console.error(
          "Invalid rate limit data received from API:",
          rateLimitData
        );
      }
    }
  } catch (rateLimitError) {
    console.error("Failed to fetch or cache rate limit:", rateLimitError);
  }
}
