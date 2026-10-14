import { createServerFn } from "@tanstack/react-start";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { CustomApiSchema } from "./custom-apis";
import { IotSchema } from "./iot";

const Input = z.object({
  system: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(40),
  /** Frame atual da câmera (data URL JPEG), quando o módulo de visão está ativo. */
  frame: z.string().startsWith("data:image/").max(4_500_000).optional(),
  /** Anexos enviados pelo usuário nesta mensagem. */
  attachments: z
    .array(
      z.object({
        name: z.string().max(200),
        mime: z.string().max(120),
        /** Imagens vêm como data URL; documentos vêm como texto extraído. */
        dataUrl: z.string().max(5_500_000).optional(),
        text: z.string().max(400_000).optional(),
      }),
    )
    .max(6)
    .optional(),
  /** Credenciais da Evolution API (WhatsApp) salvas no navegador do usuário. */
  whatsapp: z
    .object({ url: z.string().url().max(300), apiKey: z.string().min(1).max(300), instance: z.string().min(1).max(80) })
    .optional(),
  /** Extensões dinâmicas do Lia Card (ferramentas e provedores reservas). */
  customApis: z.array(CustomApiSchema).max(40).optional(),
  /** Módulo IoT ativo: ponte HTTP do Arduino/ESP32. */
  iot: IotSchema.optional(),
  /** Arduino ligado por USB neste navegador (Web Serial). */
  usb: z.boolean().optional(),
  /** Outros aparelhos pareados pelo Lia Link. */
  remoteDevices: z.array(z.enum(["mobile", "desktop"])).max(2).optional(),
  /** Lia Agent (controle do computador) ligado; autonomo = sem confirmação prévia. */
  osAgent: z.object({ autonomo: z.boolean() }).optional(),
  /** App Android com o plugin LiaNative disponível. */
  nativeAndroid: z.boolean().optional(),
});

/** Fala da Lia: conversação, visão e ações nos serviços conectados. */
export const liaRespond = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];


    // O último turno do usuário carrega o frame da câmera e os anexos, quando existem.
    const anexos = data.attachments ?? [];
    const messages = data.messages.map((m, i) => {
      const isLastUser = i === data.messages.length - 1 && m.role === "user";
      if (!isLastUser || (!data.frame && !anexos.length)) return m;
      const parts: Array<Record<string, unknown>> = [{ type: "text", text: m.content }];
      if (data.frame) parts.push({ type: "image", image: data.frame });
      for (const a of anexos) {
        if (a.dataUrl && a.mime.startsWith("image/")) {
          parts.push({ type: "image", image: a.dataUrl });
        } else if (a.dataUrl && a.mime === "application/pdf") {
          const comma = a.dataUrl.indexOf(",");
          const base64 = comma >= 0 ? a.dataUrl.slice(comma + 1) : a.dataUrl;
          parts.push({ type: "file", mediaType: a.mime, data: base64, filename: a.name });
        } else if (a.text) {
          parts.push({ type: "text", text: `Arquivo anexado "${a.name}":\n${a.text}` });
        }
      }
      return { role: "user" as const, content: parts };
    });

    // Ferramentas dos serviços conectados (só para usuário autenticado).
    let tools: Record<string, unknown> = {};
    try {
      const { resolveOptionalUserId } = await import("@/server/optionalAuth.server");
      const userId = await resolveOptionalUserId();
      if (userId) {
        const { buildLiaTools } = await import("@/server/liaTools.server");
        tools = (await buildLiaTools(userId)).tools;
      }
    } catch (error) {
      console.error("Falha ao preparar as ferramentas da Lia:", (error as Error).message);
    }

    if (data.whatsapp) {
      try {
        const { buildWhatsAppTools } = await import("./whatsappTools.server");
        tools = { ...tools, ...buildWhatsAppTools(data.whatsapp) };
      } catch (error) {
        console.error("Falha ao preparar o WhatsApp:", (error as Error).message);
      }
    }

    try {
      const { buildTavilyTools } = await import("./tavily.server");
      tools = { ...tools, ...buildTavilyTools() };
    } catch (error) {
      console.error("Falha ao preparar a pesquisa web:", (error as Error).message);
    }

    if (data.iot) {
      try {
        const { buildIotTools } = await import("./iot.server");
        tools = { ...tools, ...buildIotTools(data.iot) };
      } catch (error) {
        console.error("Falha ao preparar o módulo IoT:", (error as Error).message);
      }
    }
    if (data.usb) {
      const { buildUsbTool } = await import("./iot.server");
      tools = { ...tools, ...buildUsbTool() };
    }
    {
      const { tool } = await import("ai");
      tools = {
        ...tools,
        aparelho_local: tool({
          description: "Age neste aparelho onde a conversa está aberta: vibrar (padrão curto) ou lanterna (ligar true/false; só celular com câmera traseira). Responda em linguagem natural, sem mostrar código.",
          inputSchema: z.object({ acao: z.enum(["vibrar", "lanterna"]), ligar: z.boolean().optional() }),
          execute: async () => ({ ok: true, executando: "no aparelho" }),
        }),
      };
    }
    if (data.nativeAndroid) {
      const { tool } = await import("ai");
      tools = {
        ...tools,
        celular_nativo: tool({
          description:
            "Controla este celular Android pelo app nativo da Lia: clicar_texto (toca no botão/item com 'texto' visível), tocar (x,y em pixels), deslizar (x,y até x2,y2; rolar para baixo = y maior para y2 menor), mostrar_bolha/esconder_bolha (bolha flutuante sobre outros apps), iniciar_segundo_plano/parar_segundo_plano. O conteúdo da tela atual já está no CONTEXTO DO APARELHO. Prefira clicar_texto a coordenadas.",
          inputSchema: z.object({
            acao: z.enum(["clicar_texto", "tocar", "deslizar", "mostrar_bolha", "esconder_bolha", "iniciar_segundo_plano", "parar_segundo_plano"]),
            texto: z.string().max(200).optional(),
            x: z.number().optional(), y: z.number().optional(), x2: z.number().optional(), y2: z.number().optional(),
          }),
          execute: async () => ({ ok: true, executando: "no celular" }),
        }),
      };
    }
    if (data.remoteDevices?.length) {
      const { tool } = await import("ai");
      const alvos = data.remoteDevices;
      tools = {
        ...tools,
        comando_outro_dispositivo: tool({
          description: `Envia uma ação para outro aparelho pareado do usuário pelo Lia Link (disponíveis: ${alvos.join(", ")}). acao: notificar (mostra um aviso com 'texto'), abrir_link ('url'), vibrar, lanterna ('ligar' true/false), usb (controla o Arduino ligado por USB naquele aparelho). Use quando o pedido só pode ser feito no outro aparelho. O resultado aparece no chat sincronizado.`,
          inputSchema: z.object({
            alvo: z.enum(["mobile", "desktop"]),
            acao: z.enum(["notificar", "abrir_link", "usb", "vibrar", "lanterna"]),
            ligar: z.boolean().optional(),
            texto: z.string().max(500).optional(),
            url: z.string().url().max(1000).optional(),
            usb: z
              .object({ action: z.enum(["digital_write", "pwm", "digital_read", "analog_read"]), pin: z.number().int().min(0).max(99), value: z.number().int().min(0).max(255).optional() })
              .optional(),
          }),
          execute: async ({ alvo }) =>
            alvos.includes(alvo) ? { ok: true, enviado: `para o aparelho ${alvo}` } : { ok: false, erro: "nenhum aparelho desse tipo pareado" },
        }),
      };
    }

    if (data.osAgent) {
      try {
        const { resolveOptionalUserId } = await import("@/server/optionalAuth.server");
        const uid = await resolveOptionalUserId();
        if (uid) {
          const { tool } = await import("ai");
          const { ACAO_MAP } = await import("./os-agent");
          const autonomo = data.osAgent.autonomo;
          tools = {
            ...tools,
            executar_acao_os: tool({
              description:
                "Controla o computador do usuário via Lia Desktop Agent (mouse, teclado, programas, comandos). Use só quando o usuário pedir uma ação na tela/sistema. parametros: x,y (clicar/mover_mouse), texto (digitar), atalho ex 'ctrl+t' (tecla_atalho), programa (abrir_programa), quantidade negativa=desce (rolar), comando (executar_comando), url (abrir_link), texto (notificar = aviso na tela do PC); ler_clipboard lê a área de transferência (o resultado aparece no painel Lia Agent).",
              inputSchema: z.object({
                dispositivo: z.enum(["desktop", "mobile"]),
                acao: z.enum(["clicar", "mover_mouse", "digitar", "abrir_programa", "tecla_atalho", "rolar", "executar_comando", "abrir_link", "ler_clipboard", "notificar"]),
                parametros: z
                  .object({
                    x: z.number().optional(), y: z.number().optional(), texto: z.string().max(4000).optional(),
                    atalho: z.string().max(60).optional(), programa: z.string().max(200).optional(),
                    quantidade: z.number().optional(), comando: z.string().max(2000).optional(), url: z.string().url().max(1000).optional(),
                  })
                  .default({}),
              }),
              execute: async ({ dispositivo, acao, parametros: p }) => {
                const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                const payload = { x: p.x, y: p.y, text: p.texto, key: p.atalho, app_name: p.programa, amount: p.quantidade, script: p.comando, url: p.url };
                const { error } = await supabaseAdmin.from("os_actions").insert({
                  user_id: uid, target: dispositivo, action: ACAO_MAP[acao], payload, status: autonomo ? "approved" : "pending",
                });
                if (error) return { ok: false, erro: "falha ao enviar" };
                if (dispositivo === "mobile") return { ok: true, aviso: "registrado, mas o celular ainda não tem agente que execute ações" };
                return { ok: true, status: autonomo ? "enviado ao Desktop Agent" : "aguardando o usuário aprovar no painel Lia Agent" };
              },
            }),
          };
        }
      } catch (error) {
        console.error("Falha ao preparar o Lia Agent:", (error as Error).message);
      }
    }

    const customApis = data.customApis ?? [];
    try {
      const { buildCustomTools } = await import("./customApis.server");
      tools = { ...tools, ...buildCustomTools(customApis) };
    } catch (error) {
      console.error("Falha ao preparar as extensões:", (error as Error).message);
    }

    // Nenhuma ferramenta pode travar a resposta: erro ou demora viram um resultado de fallback.
    for (const [name, t] of Object.entries(tools)) {
      const def = t as { execute?: (...args: unknown[]) => unknown };
      if (typeof def.execute !== "function") continue;
      const original = def.execute.bind(def);
      tools[name] = {
        ...def,
        execute: async (...args: unknown[]) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            return await Promise.race([
              Promise.resolve(original(...args)),
              new Promise((resolve) => {
                timer = setTimeout(() => resolve({ ok: false, erro: "a ferramenta demorou demais para responder" }), 12_000);
              }),
            ]);
          } catch (e) {
            console.error(`Ferramenta ${name} falhou:`, (e as Error).message);
            return { ok: false, erro: "a ferramenta falhou; responda ao usuário sem ela" };
          } finally {
            clearTimeout(timer);
          }
        },
      };
    }

    const agora = new Date();
    const contextoTemporal = `\n\nAGORA: ${agora.toISOString()} (fuso do usuário: America/Sao_Paulo).`;
    const systemFinal = data.system + contextoTemporal;

    // Roda um modelo com TODAS as ferramentas e devolve os comandos locais (USB, celular etc.).
    const runWithTools = async (model: Parameters<typeof generateText>[0]["model"], timeoutMs?: number) => {
      const options = {
        model,
        system: systemFinal,
        messages,
        maxRetries: 0,
        ...(timeoutMs ? { abortSignal: AbortSignal.timeout(timeoutMs) } : {}),
        ...(Object.keys(tools).length ? { tools, stopWhen: stepCountIs(8) } : {}),
      } as Parameters<typeof generateText>[0];
      const result = await generateText(options);
      const registered = result.steps
        .flatMap((s) => s.toolResults ?? [])
        .filter((r) => r.toolName === "register_new_api_tool")
        .map((r) => (r as { output?: { registered?: unknown } }).output?.registered)
        .filter(Boolean) as z.infer<typeof CustomApiSchema>[];
      const calls = (name: string) =>
        result.steps
          .flatMap((s) => s.toolCalls ?? [])
          .filter((c) => c.toolName === name)
          .map((c) => (c as { input?: unknown }).input);
      const usbCmds = calls("usb_comando");
      const localCmds = calls("aparelho_local");
      const nativeCmds = calls("celular_nativo");
      const remoteCmds = calls("comando_outro_dispositivo");
      const anyCall = usbCmds.length + localCmds.length + nativeCmds.length + remoteCmds.length > 0;
      const text = result.text.trim() || (anyCall ? "Pronto, feito! 💜" : "");
      if (!text) throw new Error("resposta vazia");
      return {
        ok: true as const,
        text,
        ...(registered.length ? { registeredJson: JSON.stringify(registered) } : {}),
        ...(usbCmds.length ? { usbJson: JSON.stringify(usbCmds) } : {}),
        ...(localCmds.length ? { localJson: JSON.stringify(localCmds) } : {}),
        ...(nativeCmds.length ? { nativeJson: JSON.stringify(nativeCmds) } : {}),
        ...(remoteCmds.length ? { remoteJson: JSON.stringify(remoteCmds) } : {}),
      };
    };

    // Cascata anti-falha: cada camada tenta rápido e passa para a próxima.
    // Orçamento total ~22 s (o navegador desiste em 25 s).
    const inicio = Date.now();
    const restante = () => 22_000 - (Date.now() - inicio);
    const tempo = (ms: number) => Math.max(1_500, Math.min(ms, restante()));
    const temTempo = () => restante() > 1_500;
    type Gm = Array<{ role: "user" | "assistant"; content: string | Record<string, unknown>[] }>;
    let status: number | undefined;
    const falhou = (camada: string, e: unknown) => {
      const s = (e as { statusCode?: number; status?: number }).statusCode ?? (e as { status?: number }).status;
      if (s) status = s;
      console.error(`[cascata] ${camada} falhou:`, s ?? "", (e as Error).message?.slice(0, 200));
    };

    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const gKey = process.env["GEMINI_API_KEY"];
    const orKey = process.env["OPENROUTER_API_KEY"];
    const gemini = gKey
      ? createOpenAICompatible({ name: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", headers: { authorization: `Bearer ${gKey}` } })
      : null;
    const GEMINI_FAST = ["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    const GEMINI_STRONG = ["gemini-3-flash-preview", "gemini-3.8-flash", "gemini-flash-latest"];

    // 1) Gemini rápido (Flash Lite) com ferramentas — cota própria, <1 s.
    if (gemini) {
      for (const id of GEMINI_FAST) {
        if (!temTempo()) break;
        try { return { ...(await runWithTools(gemini(id), tempo(6_000))), provider: "gemini" as const }; }
        catch (e) { falhou(`Gemini ${id}`, e); }
      }
    }

    // 2) IA do Lovable com ferramentas.
    if (key && temTempo()) {
      const gateway = createLovableAiGatewayProvider(key);
      for (const id of ["google/gemini-3.7-flash"]) {
        if (!temTempo()) break;
        try { return await runWithTools(gateway(id), tempo(6_000)); }
        catch (e) { falhou(`Lovable ${id}`, e); }
      }
    }

    // 3) Gemini mais fortes com ferramentas.
    if (gemini) {
      for (const id of GEMINI_STRONG) {
        if (!temTempo()) break;
        try { return { ...(await runWithTools(gemini(id), tempo(6_000))), provider: "gemini" as const }; }
        catch (e) { falhou(`Gemini ${id}`, e); }
      }
    }

    // 4) OpenRouter gratuito com ferramentas.
    if (orKey && temTempo()) {
      try {
        const { toolModels } = await import("./openrouter.server");
        const or = createOpenAICompatible({
          name: "openrouter",
          baseURL: "https://openrouter.ai/api/v1",
          headers: { authorization: `Bearer ${orKey}`, "http-referer": "https://lia-portable-ai.lovable.app", "x-title": "Lia" },
        });
        for (const id of (await toolModels(orKey)).slice(0, 3)) {
          if (!temTempo()) break;
          try { return { ...(await runWithTools(or(id), tempo(6_000))), provider: "openrouter" as const }; }
          catch (e) { falhou(`OpenRouter ${id}`, e); }
        }
      } catch (e) { falhou("OpenRouter lista", e); }
    }

    // 5) Provedores reservas cadastrados pelo usuário (prioridade, 6 s cada).
    const providers = customApis.filter((a) => a.type === "llm_provider" && a.is_active).sort((a, b) => a.priority - b.priority);
    if (providers.length) {
      const { callCustomProvider } = await import("./customApis.server");
      for (const p of providers) {
        if (!temTempo()) break;
        try { return { ok: true as const, text: await callCustomProvider(p, systemFinal, messages as Gm, tempo(6_000)), provider: p.name }; }
        catch (e) { falhou(`Reserva ${p.name}`, e); }
      }
    }

    // 6) Só texto (sem ferramentas): Gemini direto, depois OpenRouter.
    if (temTempo()) {
      try {
        const { generateWithGemini } = await import("./gemini.server");
        return { ok: true as const, text: await generateWithGemini(systemFinal, messages as Gm, tempo(5_000)), provider: "gemini" as const };
      } catch (e) { falhou("Gemini texto", e); }
    }
    if (temTempo()) {
      try {
        const { generateWithOpenRouter } = await import("./openrouter.server");
        return { ok: true as const, text: await generateWithOpenRouter(systemFinal, messages as Gm), provider: "openrouter" as const };
      } catch (e) { falhou("OpenRouter texto", e); }
    }

    // 7) Busca pública com a última pergunta.
    const last = [...data.messages].reverse().find((m) => m.role === "user");
    try {
      const { tavilyFallback } = await import("./tavily.server");
      let found = last ? await tavilyFallback(last.content) : null;
      if (!found && last) {
        const { searchFallback } = await import("./gemini.server");
        found = await searchFallback(last.content);
      }
      if (found) return { ok: true as const, text: found, provider: "busca" as const };
    } catch (e) { falhou("Busca", e); }

    // 8) Resposta de emergência local — a Lia nunca fica muda.
    const q = (last?.content ?? "").toLowerCase();
    const h = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    let texto = "Minha conexão com os modelos de IA oscilou agora, mas continuo aqui 💜 Pode repetir em alguns segundos?";
    if (/\b(oi|olá|ola|bom dia|boa tarde|boa noite|hey)\b/.test(q)) texto = "Oi! Estou aqui 💜 Minha conexão está instável agora, mas já já volto ao normal.";
    else if (/\bhoras?\b/.test(q)) texto = `Agora são ${h.getHours().toString().padStart(2, "0")}:${h.getMinutes().toString().padStart(2, "0")}.`;
    else if (/\b(data|dia é hoje|que dia)\b/.test(q)) texto = `Hoje é ${h.toLocaleDateString("pt-BR")}.`;
    else if (/\b(obrigad|valeu)\b/.test(q)) texto = "De nada! 💜";
    else if (/\b(quem é você|quem e voce|seu nome)\b/.test(q)) texto = "Sou a Lia, sua assistente pessoal. Agora estou com a conexão instável, mas sigo aqui.";
    return { ok: true as const, text: texto, provider: "emergencia" as const, status: status ?? 503 };
  });
