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
