import express from "express";
import axios from "axios";

const router = express.Router();

// ===== Get company details =====
router.get("/details/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const cleanSymbol = symbol.replace(".NS", "").toUpperCase();

    console.log(`📍 Fetching details for: ${cleanSymbol}`);

    // ===== NSE API (WORKS!) =====
    try {
      console.log(`🔍 Trying NSE API...`);

      const nseResponse = await axios.get(
        `https://www.nseindia.com/api/quote-equity?symbol=${cleanSymbol}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.nseindia.com/",
          },
          timeout: 10000,
        }
      );

      console.log("✅ NSE Response received");

      if (nseResponse.data) {
        const data = nseResponse.data;

        // Extract company name
        let companyName =
          data.companyName ||
          data.info?.companyName ||
          data.metadata?.companyName ||
          cleanSymbol;

        console.log(`Found company: ${companyName}`);

        // Extract metrics from NSE data
        let sector = "N/A";
        let industry = "N/A";
        let marketCap = "N/A";
        let pe = 0;
        let pb = 0;
        let dividend = 0;

        // Try different paths for data
        if (data.priceInfo) {
          sector = data.priceInfo.sector || "N/A";
          industry = data.priceInfo.industry || "N/A";
          marketCap = data.priceInfo.mktCap || "N/A";
          pe = parseFloat(data.priceInfo.pe) || 0;
          pb = parseFloat(data.priceInfo.pb) || 0;
          dividend = parseFloat(data.priceInfo.dividend) || 0;
        }

        // If NSE data has these, use them
        if (data.sector) sector = data.sector;
        if (data.industry) industry = data.industry;
        if (data.mktCap) marketCap = data.mktCap;
        if (data.pe) pe = parseFloat(data.pe);
        if (data.pb) pb = parseFloat(data.pb);

        console.log("📊 NSE Metrics:", { sector, industry, pe, pb, marketCap });

        // Now search Wikipedia for additional details
        let wikiData = {
          ceo: "N/A",
          founded: "N/A",
          headquarters: "N/A",
          website: "N/A",
          description: "N/A",
        };

        try {
          console.log(`📖 Searching Wikipedia for: ${companyName}`);

          const wikiResponse = await axios.get(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
              companyName
            )}`,
            {
              headers: { "User-Agent": "Mozilla/5.0" },
              timeout: 10000,
            }
          );

          if (wikiResponse.data?.extract) {
            const extract = wikiResponse.data.extract;
            console.log("✅ Wikipedia data found");

            // Parse CEO
            const ceoMatch = extract.match(
              /(?:CEO|Chief Executive Officer)[:\s]+([A-Za-z\s\.]+?)(?:\(|,|;|\n|$)/i
            );
            if (ceoMatch) wikiData.ceo = ceoMatch[1].trim();

            // Parse Founded
            const foundedMatch = extract.match(
              /(?:founded|established)[:\s]+(\d{4})/i
            );
            if (foundedMatch) wikiData.founded = foundedMatch[1];

            // Parse Headquarters
            const hqMatch = extract.match(
              /(?:based|headquartered|headquarters)[:\s]+([^,\n]+)/i
            );
            if (hqMatch) wikiData.headquarters = hqMatch[1].trim();

            wikiData.website = wikiResponse.data.content_urls?.desktop?.page || "N/A";
            wikiData.description = extract.substring(0, 350);
          }
        } catch (wikiErr) {
          console.log("⚠️ Wikipedia search failed for:", companyName);
        }

        // Return combined data
        return res.json({
          symbol: symbol,
          name: companyName,
          ceo: wikiData.ceo,
          founded: wikiData.founded,
          headquarters: wikiData.headquarters,
          website: wikiData.website,
          description: wikiData.description,
          source: "NSE + Wikipedia",
          nseData: {
            sector: sector,
            industry: industry,
            pe: pe,
            pb: pb,
            marketCap: marketCap,
            dividend: dividend,
          },
        });
      }
    } catch (nseErr) {
      console.error("❌ NSE API Error:", nseErr.message);
    }

    // ===== Fallback: Return error =====
    console.log("❌ Could not fetch data");

    return res.json({
      symbol: symbol,
      name: cleanSymbol,
      error: "Could not fetch company details",
      ceo: "N/A",
      founded: "N/A",
      headquarters: "N/A",
      website: "N/A",
      nseData: {
        sector: "N/A",
        industry: "N/A",
        pe: 0,
        pb: 0,
        marketCap: "N/A",
        dividend: 0,
      },
    });
  } catch (err) {
    console.error("❌ Server Error:", err.message);
    res.status(500).json({
      error: err.message,
      symbol: req.params.symbol,
    });
  }
});

export default router;