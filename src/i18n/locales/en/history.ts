const history = {
  header: {
    title: "Publishing history",
    description: "Review posts already sent to Telegram and any recorded delivery warnings.",
  },
  search: {
    label: "Search publishing history",
    placeholder: "Search published posts or channels",
  },
  empty: {
    title: "No published posts yet",
    description: "Posts will appear here after they are approved and successfully published to Telegram.",
    search: "No published posts match this search. Try another channel or phrase.",
  },
  queue: {
    title: "Published posts",
    count_one: "{{formattedCount}} published post",
    count_other: "{{formattedCount}} published posts",
  },
  details: {
    publishedVersion: "Published version",
    publishedAt: "Published {{date}}",
    deliveryStatus: "Delivery status",
    delivered: "Published successfully",
    deliveredWithWarnings: "Published with delivery warnings",
    deliveryNote: "Delivery note",
    noTimestamp: "Publication time unavailable",
  },
  mobile: {
    title: "Published post",
    modeLabel: "History view",
    modes: {
      original: "Original",
      edit: "Published",
      preview: "Preview",
    },
  },
  accessibility: {
    historyList: "Publishing history list",
    publishedEditor: "Published post details",
  },
} as const;

export default history;
