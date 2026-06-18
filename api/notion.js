const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
  const { track } = req.query;
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DB_ID,
      filter: {
        or: [
          { property: "曲目", title: { contains: track } },
          { property: "艺人", rich_text: { contains: track } }
        ]
      }
    });

    if (response.results.length === 0) return res.status(200).json({ found: false });

    const props = response.results[0].properties;
    res.status(200).json({
      found: true,
      track: props["曲目"].title[0]?.plain_text,
      artist: props["艺人"].rich_text[0]?.plain_text,
      status: props["流程状态"].select?.name || "进行中",
      progress: props["完成百分比"].select?.name || "0%"
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
