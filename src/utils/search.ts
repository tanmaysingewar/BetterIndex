import * as cheerio from "cheerio";

// Define the structure of a search result
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string;
  img_url: string;
}

export async function searchDuckDuckGo(query: string): Promise<string> {
  if (!query) {
    return "Error: Query parameter is required";
  }

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
    query
  )}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return `Error: Failed to fetch page: ${response.status}`;
    }

    const html = await response.text();
    console.log(html);
    const $ = cheerio.load(html);
    const results = $(".result.results_links.results_links_deep.web-result");
    const resultList: SearchResult[] = [];

    results.each((_, element) => {
      const titleElem = $(element).find("h2.result__title");
      const title = titleElem.find("a.result__a").text().trim() || "";
      const url = titleElem.find("a.result__a").attr("href") || "";
      const snippet = $(element).find("a.result__snippet").text().trim() || "";

      const dateElem = $(element)
        .find("span")
        .filter((_, el) => {
          const text = $(el).text();
          return Boolean(text && text.includes("T"));
        });
      const date = dateElem.text().trim() || "";

      let imgUrl = $(element).find("img.result__icon__img").attr("src") || "";
      if (imgUrl.startsWith("//")) {
        imgUrl = "https:" + imgUrl;
      }

      resultList.push({
        title,
        url,
        snippet,
        date,
        img_url: imgUrl,
      });
    });

    if (resultList.length === 0) {
      return "No search results found.";
    }

    // Format the results into a readable text string
    let outputText = "Search Results:\n\n";
    resultList.forEach((result, index) => {
      outputText += `${index + 1}. Title: ${result.title}\n`;
      outputText += `   URL: ${result.url}\n`;
      if (result.snippet) {
        outputText += `   Snippet: ${result.snippet}\n`;
      }
      if (result.date) {
        outputText += `   Date: ${result.date}\n`;
      }
      if (result.img_url) {
        outputText += `   Image URL: ${result.img_url}\n`;
      }
      outputText += "---\n";
    });

    return outputText;
  } catch (error) {
    console.error("Error during scraping:", error);
    return "Error: Internal server error during search.";
  }
}

// Example usage:
// async function main() {
//   const searchTerm = "example search query";
//   const results = await searchDuckDuckGo(searchTerm);
//   console.log(results);
// }
//
