<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep Lia's affective rewards as optional Lia Card state separate from persistent memory, because treats must never alter learned user facts.
- Normalize multimodal files in the browser and convert provider payloads only at the server boundary, because both AI providers must receive the same validated media.
- Custom APIs live in LiaCardData.customApis (portable source) and mirror to custom_api_integrations when signed in; server fetches them only through the SSRF guard in customApis.server.ts, because user-supplied URLs must never reach internal hosts.
- Web Push is sent only via Web Crypto in webpush.server.ts and scheduled by pg_cron hitting /api/public/push-cron with a secret stored in push_cron_config, because the Worker runtime cannot run the Node web-push library.
- Face recognition runs only in the browser (face-api browser build, models from CDN) and stores only 128-number descriptors in LiaCardData.faces, because photos must never leave the device.
- Lia Link syncs by diffing the existing Lia Card/localStorage into per-item AES-GCM blobs (sync_blobs) encrypted client-side with the pairing password, because the server must never read user data and the memory system must stay unchanged.
- The OS agent (Lia Agent) polls /api/public/os-agent with a per-user token whose SHA-256 hash lives in os_agent_tokens; actions queue in os_actions, because the Worker cannot hold long-lived sockets to a local Python agent.
- Native (Capacitor) login redirects to the public /native-callback web bridge, which forwards the session to the liaapp://auth deep link handled in capacitor-auth.ts, because the auth server rejects custom schemes and native WebViews cannot receive same-origin OAuth redirects.
- Connector key encryption and Gmail base64 use Web Crypto/TextEncoder only (connectionKeyCrypto.ts, connectors.server.ts), because node:crypto and Buffer do not exist on the Worker runtime.
