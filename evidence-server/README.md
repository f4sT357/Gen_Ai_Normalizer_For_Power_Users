# GANFPU Evidence Server

A local HTTP adapter between GANFPU's browser-side Evidence Layer and a pluggable web-search backend.

## Contract

`GET /evidence/search?q=<query>&limit=<n>` returns:

```json
{
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "snippet": "...",
      "source": "..."
    }
  ],
  "errors": []
}
```

The browser client does not call a search engine directly. The server owns the search backend and normalizes its output into the GANFPU Evidence contract.

## Backend

The initial adapter is intended to use the MIT-licensed `webserp` project as the search backend. `webserp` performs multi-engine searches and returns JSON results; its upstream search-engine terms still apply independently of the MIT license on the adapter code.

Keep the server separate from the browser application so the frontend remains provider-neutral.
