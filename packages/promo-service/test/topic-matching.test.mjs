import assert from "node:assert/strict";
import test from "node:test";

import { TopicMatchingEngine } from "../dist/index.js";

test("agent-fetched cards are ranked into compact product-aligned candidates", async () => {
  const engine = new TopicMatchingEngine();
  const result = await engine.run({
    productProfile: {
      productName: "FlowPilot",
      positioning: "agent workflow automation for product teams",
      capabilities: ["agent workflow automation", "MCP integration"],
      activeCampaignLines: ["reliable agent workflow", "local MCP state control"],
      recentMessaging: ["turn demos into operations"],
    },
    topicSources: [{
      id: "demo-feed",
      label: "Demo feed",
      kind: "rss",
      url: "https://news.example.com/feed.xml",
    }],
    fetchedTopics: [
      {
        sourceId: "demo-feed",
        title: "Agent workflow automation is moving from demos to team operations",
        url: "https://news.example.com/agent-workflow",
        excerpt: "Teams use MCP integration to make agent workflows reliable.",
        publishedAt: "2026-08-31T10:00:00.000Z",
      },
      {
        sourceId: "demo-feed",
        title: "Weekend cooking guide",
        url: "https://news.example.com/cooking",
        excerpt: "Simple recipes for a quiet weekend.",
      },
    ],
  });

  assert.equal(result.fetchedTopicCount, 2);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].title, "Agent workflow automation is moving from demos to team operations");
  assert.deepEqual(result.candidates[0].matchedCapabilities, ["agent workflow automation", "MCP integration"]);
  assert.deepEqual(result.candidates[0].matchedCampaignLines, ["reliable agent workflow"]);
});
