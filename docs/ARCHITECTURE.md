# TGReposter Architecture

## Current

The application is currently a full-stack TypeScript project that contains:

- React + Vite frontend
- Express backend
- Supabase integration
- Telegram Bot integration
- AI Providers
  - Gemini
  - OpenRouter

## Target Architecture

```
Browser
        │
        ▼
 GitHub Pages
    React App
        │
 HTTPS REST API
        ▼
 Railway
 Express Server
        │
 ├── Supabase
 ├── Telegram Bot API
 ├── Gemini
 └── OpenRouter
```

## Deployment Plan

Frontend
- GitHub Pages

Backend
- Railway

Database
- Supabase

Authentication
- Supabase Auth

Storage
- Supabase