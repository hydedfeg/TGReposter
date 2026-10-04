const ai = {
  header: {
    title: "AI Curation Engine",
    description: "Configure the language model used to rewrite, translate, and extract hashtags from posts.",
  },
  providers: {
    label: "Select AI Provider",
    geminiDescription: "Fast, highly capable Google AI model suite.",
    openrouterDescription: "Access open-source and proprietary language models through one endpoint.",
    personalCredential: "Your API key",
    enabled: "Personal key ready",
    missingSecret: "Add your API key",
    select: "Select {{provider}}",
  },
  credentials: {
    title: "Personal API credential",
    description: "This {{provider}} key belongs only to your account and is used only for your AI requests.",
    label: "{{provider}} API key",
    placeholder: "Paste your {{provider}} API key",
    save: "Save personal key",
    saving: "Saving…",
    saved: "{{provider}} key saved securely.",
    security: "The key is sent only to the backend, stored in Supabase Vault, and is never returned to the browser.",
    saveError: "Your API key could not be saved.",
  },
  models: {
    label: "Select AI Model",
    custom: "Custom model…",
    customInputLabel: "Custom model identifier",
    customPlaceholder: "e.g. meta-llama/llama-3.1-405b-instruct",
    apply: "Apply",
    current: "Current active AI model:",
    select: "Select model {{model}}",
  },
  playground: {
    title: "AI test playground",
    description: "Test the active AI provider and selected model. This sends the sample text through the normal server-side curation endpoint using a creative, viral rephrase context.",
    credentialRequired: "Add your personal {{provider}} API key before running a test.",
    inputLabel: "Input sample text",
    placeholder: "Paste some test text here…",
    sample: "Scraping Telegram channels is a great way to curate industry newsletter posts.",
    output: "Curated output",
    error: "Curation error",
    testing: "Testing AI connection…",
    run: "Run AI test",
  },
  errors: {
    generationFallback: "AI failed to generate a test response.",
    connectionFallback: "Connection failed. Check the configured API key and provider settings.",
  },
} as const;

export default ai;
