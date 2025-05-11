import axios from "axios";
import type { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { NextResponse } from "next/server";
import { URL } from "url";

interface FormData {
  [key: string]: string;
}

interface PibRelease {
  ministry_name: string;
  title: string;
  link: string;
  posted_date: string;
}

interface OrganizedPibReleases {
  [date: string]: {
    [ministry: string]: PibRelease[];
  };
}

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Content-Type": "application/x-www-form-urlencoded",
};

async function getInitialFormData(
  pageUrl: string,
  headers: Record<string, string>,
  session?: AxiosInstance
): Promise<FormData | null> {
  try {
    const client = session || axios;
    const response = await client.get(pageUrl, { headers });
    const $ = cheerio.load(response.data);
    const formData: FormData = {};
    const form = $("#form1");

    if (form.length === 0) {
      console.error(`Error: Could not find the form 'form1' at ${pageUrl}.`);
      return null;
    }

    form.find("input").each((i, el) => {
      const name = $(el).attr("name");
      const value = $(el).attr("value") || "";
      if (name) {
        formData[name] = value;
      }
    });

    form.find("select").each((i, el) => {
      const name = $(el).attr("name");
      if (name) {
        const selectedOption = $(el).find("option[selected]");
        if (selectedOption.length > 0) {
          formData[name] = selectedOption.first().attr("value") || "";
        } else {
          const firstOption = $(el).find("option").first();
          if (firstOption.length > 0) {
            formData[name] = firstOption.attr("value") || "";
          } else {
            formData[name] = "";
          }
        }
      }
    });

    if (!formData["ctl00$Bar1$ddlregion"])
      formData["ctl00$Bar1$ddlregion"] = "3";
    if (!formData["ctl00$Bar1$ddlLang"]) formData["ctl00$Bar1$ddlLang"] = "1";
    if (!formData["ctl00$ContentPlaceHolder1$ddlMinistry"])
      formData["ctl00$ContentPlaceHolder1$ddlMinistry"] = "0";
    if (!formData["ctl00$ContentPlaceHolder1$ddlday"])
      formData["ctl00$ContentPlaceHolder1$ddlday"] = "0";
    if (
      !formData["__VIEWSTATE"] ||
      !formData["__VIEWSTATEGENERATOR"] ||
      !formData["__EVENTVALIDATION"]
    ) {
      console.error("Error: Critical ASP.NET hidden fields not found.");
      return null;
    }

    return formData;
  } catch (error) {
    console.error(
      `Error fetching initial form data from ${pageUrl}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

async function fetchAllPibReleases(
  url: string = "https://www.pib.gov.in/allRel.aspx",
  dayFilter: string = "0",
  monthFilter: string = "0",
  yearFilter: string = "0",
  ministryFilter: string = "0",
  regionFilter: string = "3",
  langFilter: string = "1",
  session?: AxiosInstance
): Promise<PibRelease[]> {
  const headers = {
    ...DEFAULT_HEADERS,
    Referer: url,
    Origin: "https://www.pib.gov.in",
  };
  const baseUrl = "https://www.pib.gov.in";
  const allReleasesFlatList: PibRelease[] = [];

  const currentSession = session || axios.create();

  const initialFormData = await getInitialFormData(
    url,
    headers,
    currentSession
  );
  if (!initialFormData) {
    console.error("Failed to get initial form data. Aborting.");
    return [];
  }

  const payload: FormData = { ...initialFormData };
  payload["ctl00$Bar1$ddlregion"] = regionFilter;
  payload["ctl00$Bar1$ddlLang"] = langFilter;
  payload["ctl00$ContentPlaceHolder1$ddlMinistry"] = ministryFilter;
  payload["ctl00$ContentPlaceHolder1$ddlday"] = dayFilter;

  payload["ctl00$ContentPlaceHolder1$ddlMonth"] =
    monthFilter !== "0"
      ? monthFilter
      : initialFormData["ctl00$ContentPlaceHolder1$ddlMonth"] || "0";
  payload["ctl00$ContentPlaceHolder1$ddlYear"] =
    yearFilter !== "0"
      ? yearFilter
      : initialFormData["ctl00$ContentPlaceHolder1$ddlYear"] || "0";

  if (
    ministryFilter !==
    (initialFormData["ctl00$ContentPlaceHolder1$ddlMinistry"] || "0")
  ) {
    payload["__EVENTTARGET"] = "ctl00$ContentPlaceHolder1$ddlMinistry";
  } else if (
    yearFilter !== "0" &&
    yearFilter !== (initialFormData["ctl00$ContentPlaceHolder1$ddlYear"] || "0")
  ) {
    payload["__EVENTTARGET"] = "ctl00$ContentPlaceHolder1$ddlYear";
  } else if (
    monthFilter !== "0" &&
    monthFilter !==
      (initialFormData["ctl00$ContentPlaceHolder1$ddlMonth"] || "0")
  ) {
    payload["__EVENTTARGET"] = "ctl00$ContentPlaceHolder1$ddlMonth";
  } else if (
    dayFilter !== (initialFormData["ctl00$ContentPlaceHolder1$ddlday"] || "0")
  ) {
    payload["__EVENTTARGET"] = "ctl00$ContentPlaceHolder1$ddlday";
  } else {
    payload["__EVENTTARGET"] = "ctl00$ContentPlaceHolder1$ddlMinistry";
  }

  delete payload["ctl00$ContentPlaceHolder1$Print1$print.x"];
  delete payload["ctl00$ContentPlaceHolder1$Print1$print.y"];
  delete payload["ctl00$ContentPlaceHolder1$Print1$print_x"];
  delete payload["ctl00$ContentPlaceHolder1$Print1$print_y"];
  delete payload["ctl00$ContentPlaceHolder1$Print1$print"];

  payload["__EVENTARGUMENT"] = "";
  if (!payload["__LASTFOCUS"]) payload["__LASTFOCUS"] = "";

  try {
    const formBody = new URLSearchParams();
    for (const key in payload) {
      if (payload.hasOwnProperty(key)) {
        formBody.append(key, payload[key] ?? "");
      }
    }

    const response = await currentSession.post(url, formBody.toString(), {
      headers,
    });

    const $ = cheerio.load(response.data);

    const contentArea = $("div.content-area");
    if (contentArea.length === 0) {
      console.error(
        "Could not find the main content area ('div.content-area') after POST."
      );
      return [];
    }

    const allLeftUls = contentArea.find("ul.leftul");

    allLeftUls.each((i, ulEl) => {
      const $ulEl = $(ulEl);
      let ministryName = "Unknown Ministry";
      const parentLiOfUl = $ulEl.closest("li");
      if (parentLiOfUl.length > 0) {
        const ministryNameTagInParent = parentLiOfUl.find("h3.font104");
        if (ministryNameTagInParent.length > 0) {
          ministryName = ministryNameTagInParent.text().trim();
        } else {
          const h3PrevSibling = $ulEl.prevAll("h3.font104").first();
          if (h3PrevSibling.length > 0) {
            ministryName = h3PrevSibling.text().trim();
          }
        }
      } else {
        const h3PrevSibling = $ulEl.prevAll("h3.font104").first();
        if (h3PrevSibling.length > 0) {
          ministryName = h3PrevSibling.text().trim();
        }
      }

      $ulEl.children("li").each((j, liEl) => {
        const $liEl = $(liEl);
        const anchorTag = $liEl.find("a").first();
        const dateSpan = $liEl.find("span.publishdatesmall").first();

        if (anchorTag.length > 0 && dateSpan.length > 0) {
          const title = anchorTag.text().trim();
          const relativeLink = anchorTag.attr("href");

          let absoluteLink = "N/A";
          if (relativeLink) {
            try {
              absoluteLink = new URL(relativeLink, baseUrl).href;
            } catch (e) {
              absoluteLink = relativeLink;
              console.log(e);
            }
          }

          const postedDateRaw = dateSpan.text().trim();
          const postedDate = postedDateRaw.replace("Posted On:", "").trim();

          allReleasesFlatList.push({
            ministry_name: ministryName,
            title,
            link: absoluteLink,
            posted_date: postedDate,
          });
        }
      });
    });

    return allReleasesFlatList;
  } catch (error) {
    console.error(
      "Error during POST request or parsing:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

function organizeReleasesByDateAndMinistry(
  releases: PibRelease[]
): OrganizedPibReleases {
  const sortedReleases = [...releases].sort((a, b) => {
    const dateCompare =
      new Date(b.posted_date).getTime() - new Date(a.posted_date).getTime();
    if (dateCompare === 0) {
      return a.ministry_name.localeCompare(b.ministry_name);
    }
    return dateCompare;
  });

  const organized: OrganizedPibReleases = {};

  for (const release of sortedReleases) {
    if (!organized[release.posted_date]) {
      organized[release.posted_date] = {};
    }
    if (!organized[release.posted_date]![release.ministry_name]) {
      organized[release.posted_date]![release.ministry_name] = [];
    }
    organized[release.posted_date]![release.ministry_name]!.push(release);
  }

  return organized;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || "4";
    const year = searchParams.get("year") || "2025";

    const pibUrl = "https://www.pib.gov.in/allRel.aspx";
    const s = axios.create({
      headers: { ...DEFAULT_HEADERS },
    });

    const allReleasesData = await fetchAllPibReleases(
      pibUrl,
      "0",
      month,
      year,
      "0",
      undefined,
      undefined,
      s
    );

    if (allReleasesData.length > 0) {
      const organizedData = organizeReleasesByDateAndMinistry(allReleasesData);
      return NextResponse.json({ success: true, data: organizedData });
    } else {
      return NextResponse.json({
        success: false,
        error: `No data found for month ${month} and year ${year}`,
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
}
