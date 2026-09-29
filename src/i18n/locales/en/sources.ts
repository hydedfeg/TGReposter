const sources = {
  header: {
    title: "Source Channels",
    description: "Collect messages directly from public Telegram channels. No API credentials required.",
  },
  actions: {
    scrapeAll: "Scrape all channels",
    add: "Add channel",
    scrapeOne: "Scrape this channel",
    remove: "Remove channel",
  },
  form: {
    usernameLabel: "Telegram channel username",
    placeholder: "durov or techcrunch",
  },
  validation: {
    usernameRequired: "Username cannot be empty.",
    duplicate: "Channel already exists.",
  },
  empty: {
    title: "No source channels",
    description: "Add a Telegram channel username above to begin collecting content.",
  },
  status: {
    fetching: "Fetching",
    scraped: "Scraped {{time}}",
    failed: "Failed",
  },
  accessibility: {
    channelList: "Source channels",
  },
} as const;

export default sources;
