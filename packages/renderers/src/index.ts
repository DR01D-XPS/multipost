import type { PlatformKind, RichTextDocument, RichTextMark, RichTextNode } from "@multipost/core";

export type RenderWarning = {
  level: "warning";
  message: string;
};

export type PlatformRenderResult = {
  platform: PlatformKind;
  outputFormat: "HTML" | "MARKDOWN" | "PLAINTEXT";
  body: string;
  previewHtml: string;
  warnings: RenderWarning[];
};

type RenderMediaInput = number | Array<{ mimeType?: string | null }>;

type RenderContext = {
  mediaCount: number;
  hasGif: boolean;
  hasVideo: boolean;
};

type InlineHtmlOptions = {
  underline: boolean;
  customEmojiMode: "preview" | "alt";
};

const inlineMarkOrder = ["link", "bold", "italic", "underline", "strike", "code"] as const;

function resolveRenderContext(media: RenderMediaInput = 0): RenderContext {
  if (typeof media === "number") {
    return {
      mediaCount: media,
      hasGif: false,
      hasVideo: false
    };
  }

  return {
    mediaCount: media.length,
    hasGif: media.some((item) => item.mimeType?.toLowerCase() === "image/gif"),
    hasVideo: media.some((item) => item.mimeType?.toLowerCase().startsWith("video/"))
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!~>])/g, "\\$1");
}

function safeHref(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value, "https://example.com");
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

function safeCustomEmojiId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return /^\d+$/.test(value) ? value : null;
}

function getCustomEmojiAlt(node: RichTextNode): string {
  const alt = node.attrs?.alt;
  return typeof alt === "string" && alt.trim().length > 0 ? alt : "🙂";
}

function getCustomEmojiPreviewUrl(node: RichTextNode): string | null {
  const previewUrl = node.attrs?.previewUrl;
  if (typeof previewUrl !== "string" || previewUrl.trim().length === 0) {
    return null;
  }

  if (previewUrl.startsWith("/") || previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) {
    return previewUrl;
  }

  return null;
}

function getCustomEmojiPreviewMimeType(node: RichTextNode): string | null {
  const mimeType = node.attrs?.previewMimeType;
  return typeof mimeType === "string" && mimeType.trim().length > 0 ? mimeType : null;
}

function renderCustomEmojiPreview(node: RichTextNode, mode: "preview" | "alt"): string {
  const alt = getCustomEmojiAlt(node);

  if (mode === "alt") {
    return escapeHtml(alt);
  }

  const previewUrl = getCustomEmojiPreviewUrl(node);
  const previewMimeType = getCustomEmojiPreviewMimeType(node);
  const customEmojiId = safeCustomEmojiId(node.attrs?.customEmojiId);

  if (previewUrl && previewMimeType?.startsWith("image/")) {
    return `<span class="telegram-custom-emoji-inline"${customEmojiId ? ` data-custom-emoji-id="${customEmojiId}"` : ""}><img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(alt)}" class="telegram-custom-emoji-inline__asset" /></span>`;
  }

  if (previewUrl && previewMimeType?.startsWith("video/")) {
    return `<span class="telegram-custom-emoji-inline"${customEmojiId ? ` data-custom-emoji-id="${customEmojiId}"` : ""}><video src="${escapeHtml(previewUrl)}" class="telegram-custom-emoji-inline__asset" muted loop autoplay playsinline></video></span>`;
  }

  return `<span class="telegram-custom-emoji-inline telegram-custom-emoji-inline--fallback"${customEmojiId ? ` data-custom-emoji-id="${customEmojiId}"` : ""}>${escapeHtml(alt)}</span>`;
}

function renderCustomEmojiTelegramBody(node: RichTextNode): string {
  const alt = getCustomEmojiAlt(node);
  const customEmojiId = safeCustomEmojiId(node.attrs?.customEmojiId);

  if (!customEmojiId) {
    return escapeHtml(alt);
  }

  return `<tg-emoji emoji-id="${customEmojiId}">${escapeHtml(alt)}</tg-emoji>`;
}

function normalizeMarks(marks: RichTextMark[] | undefined): RichTextMark[] {
  return [...(marks ?? [])].sort((left, right) => {
    return (
      inlineMarkOrder.indexOf(left.type as (typeof inlineMarkOrder)[number]) -
      inlineMarkOrder.indexOf(right.type as (typeof inlineMarkOrder)[number])
    );
  });
}

function extractPlainText(node: RichTextNode): string {
  if (node.type === "telegramCustomEmoji") {
    return getCustomEmojiAlt(node);
  }

  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  return (node.content ?? []).map(extractPlainText).join("");
}

function applyHtmlMarks(value: string, marks: RichTextMark[] | undefined, options: { underline: boolean }): string {
  return normalizeMarks(marks).reduce((current, mark) => {
    switch (mark.type) {
      case "bold":
        return `<strong>${current}</strong>`;
      case "italic":
        return `<em>${current}</em>`;
      case "underline":
        return options.underline ? `<u>${current}</u>` : current;
      case "strike":
        return `<s>${current}</s>`;
      case "code":
        return `<code>${current}</code>`;
      case "link": {
        const href = safeHref(typeof mark.attrs?.href === "string" ? mark.attrs.href : undefined);
        return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${current}</a>` : current;
      }
      default:
        return current;
    }
  }, value);
}

function applyMarkdownMarks(value: string, marks: RichTextMark[] | undefined, options: { underline: boolean }): string {
  return normalizeMarks(marks).reduce((current, mark) => {
    switch (mark.type) {
      case "bold":
        return `**${current}**`;
      case "italic":
        return `_${current}_`;
      case "underline":
        return options.underline ? `++${current}++` : current;
      case "strike":
        return `~~${current}~~`;
      case "code":
        return `\`${current}\``;
      case "link": {
        const href = safeHref(typeof mark.attrs?.href === "string" ? mark.attrs.href : undefined);
        return href ? `[${current}](${href})` : current;
      }
      default:
        return current;
    }
  }, value);
}

function renderInlineHtml(nodes: RichTextNode[] | undefined, options: InlineHtmlOptions): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "telegramCustomEmoji") {
        return renderCustomEmojiPreview(node, options.customEmojiMode);
      }

      if (node.type === "text") {
        return applyHtmlMarks(escapeHtml(node.text ?? ""), node.marks, options);
      }

      if (node.type === "hardBreak") {
        return "<br />";
      }

      return renderInlineHtml(node.content, options);
    })
    .join("");
}

function renderInlineTelegramBody(nodes: RichTextNode[] | undefined, options: { underline: boolean }): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "telegramCustomEmoji") {
        return renderCustomEmojiTelegramBody(node);
      }

      if (node.type === "text") {
        return applyHtmlMarks(escapeHtml(node.text ?? ""), node.marks, options);
      }

      if (node.type === "hardBreak") {
        return "\n";
      }

      return renderInlineTelegramBody(node.content, options);
    })
    .join("");
}

function renderInlineMarkdown(nodes: RichTextNode[] | undefined, options: { underline: boolean }): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "telegramCustomEmoji") {
        return escapeMarkdown(getCustomEmojiAlt(node));
      }

      if (node.type === "text") {
        return applyMarkdownMarks(escapeMarkdown(node.text ?? ""), node.marks, options);
      }

      if (node.type === "hardBreak") {
        return "  \n";
      }

      return renderInlineMarkdown(node.content, options);
    })
    .join("");
}

function renderInlinePlain(nodes: RichTextNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "telegramCustomEmoji") {
        return getCustomEmojiAlt(node);
      }

      if (node.type === "text") {
        const text = node.text ?? "";
        const linkMark = node.marks?.find((mark) => mark.type === "link");
        const href = safeHref(typeof linkMark?.attrs?.href === "string" ? linkMark.attrs.href : undefined);
        if (href && text !== href) {
          return `${text} (${href})`;
        }

        return text;
      }

      if (node.type === "hardBreak") {
        return "\n";
      }

      return renderInlinePlain(node.content);
    })
    .join("");
}

function renderListItemHtml(item: RichTextNode, options: InlineHtmlOptions): string {
  return (item.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return renderInlineHtml(child.content, options);
      }
      if (child.type === "heading") {
        return `<strong>${renderInlineHtml(child.content, options)}</strong>`;
      }
      return renderInlineHtml(child.content, options) || escapeHtml(extractPlainText(child));
    })
    .filter(Boolean)
    .join("<br />");
}

function renderListItemTelegramBody(item: RichTextNode, options: { underline: boolean }): string {
  return (item.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return renderInlineTelegramBody(child.content, options);
      }
      if (child.type === "heading") {
        const headingText = renderInlineTelegramBody(child.content, options);
        return headingText ? `<b>${headingText}</b>` : "";
      }
      return renderInlineTelegramBody(child.content, options) || escapeHtml(extractPlainText(child));
    })
    .filter(Boolean)
    .join("\n");
}

function renderListItemMarkdown(item: RichTextNode, options: { underline: boolean }): string {
  return (item.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return renderInlineMarkdown(child.content, options);
      }
      if (child.type === "heading") {
        return `**${renderInlineMarkdown(child.content, options)}**`;
      }
      return renderInlineMarkdown(child.content, options) || escapeMarkdown(extractPlainText(child));
    })
    .filter(Boolean)
    .join(" ");
}

function renderListItemPlain(item: RichTextNode): string {
  return (item.content ?? [])
    .map((child) => {
      if (child.type === "paragraph" || child.type === "heading") {
        return renderInlinePlain(child.content);
      }
      return renderInlinePlain(child.content) || extractPlainText(child);
    })
    .filter(Boolean)
    .join(" ");
}

function renderBlockTelegramPreview(node: RichTextNode, orderedIndex = 1): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInlineHtml(node.content, { underline: true, customEmojiMode: "preview" }) || "<br />"}</p>`;
    case "heading":
      return `<p><strong>${renderInlineHtml(node.content, { underline: true, customEmojiMode: "preview" }) || "<br />"}</strong></p>`;
    case "bulletList":
      return (node.content ?? [])
        .map((item) => `<p>&bull; ${renderListItemHtml(item, { underline: true, customEmojiMode: "preview" })}</p>`)
        .join("");
    case "orderedList":
      return (node.content ?? [])
        .map(
          (item, index) =>
            `<p>${orderedIndex + index}. ${renderListItemHtml(item, { underline: true, customEmojiMode: "preview" })}</p>`
        )
        .join("");
    case "blockquote":
      return `<blockquote>${(node.content ?? []).map((child) => renderBlockTelegramPreview(child)).join("")}</blockquote>`;
    case "listItem":
      return renderListItemHtml(node, { underline: true, customEmojiMode: "preview" });
    default:
      return `<p>${escapeHtml(extractPlainText(node))}</p>`;
  }
}

function renderBlockMaxPreview(node: RichTextNode, orderedIndex = 1): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInlineHtml(node.content, { underline: true, customEmojiMode: "alt" }) || "<br />"}</p>`;
    case "heading":
      return `<h3>${renderInlineHtml(node.content, { underline: true, customEmojiMode: "alt" }) || "<br />"}</h3>`;
    case "bulletList":
      return `<ul>${(node.content ?? []).map((item) => `<li>${renderListItemHtml(item, { underline: true, customEmojiMode: "alt" })}</li>`).join("")}</ul>`;
    case "orderedList":
      return `<ol start="${orderedIndex}">${(node.content ?? []).map((item) => `<li>${renderListItemHtml(item, { underline: true, customEmojiMode: "alt" })}</li>`).join("")}</ol>`;
    case "blockquote":
      return `<blockquote>${(node.content ?? []).map((child) => renderBlockMaxPreview(child)).join("")}</blockquote>`;
    case "listItem":
      return renderListItemHtml(node, { underline: true, customEmojiMode: "alt" });
    default:
      return `<p>${escapeHtml(extractPlainText(node))}</p>`;
  }
}

function renderBlockVkPreview(node: RichTextNode, orderedIndex = 1): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return `<p>${escapeHtml(renderInlinePlain(node.content)) || "<br />"}</p>`;
    case "bulletList":
      return (node.content ?? []).map((item) => `<p>- ${escapeHtml(renderListItemPlain(item))}</p>`).join("");
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => `<p>${orderedIndex + index}. ${escapeHtml(renderListItemPlain(item))}</p>`)
        .join("");
    case "blockquote":
      return (node.content ?? []).map((child) => `<p>&gt; ${escapeHtml(extractPlainText(child))}</p>`).join("");
    default:
      return `<p>${escapeHtml(extractPlainText(node))}</p>`;
  }
}

function renderBlockTelegramBody(node: RichTextNode, orderedIndex = 1): string {
  switch (node.type) {
    case "paragraph":
      return renderInlineTelegramBody(node.content, { underline: true });
    case "heading": {
      const text = renderInlineTelegramBody(node.content, { underline: true });
      return text ? `<b>${text}</b>` : "";
    }
    case "bulletList":
      return (node.content ?? []).map((item) => `• ${renderListItemTelegramBody(item, { underline: true })}`).join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => `${orderedIndex + index}. ${renderListItemTelegramBody(item, { underline: true })}`)
        .join("\n");
    case "blockquote": {
      const body = (node.content ?? [])
        .map((child) => renderBlockTelegramBody(child).trim())
        .filter(Boolean)
        .join("\n");
      return body ? `<blockquote>${body}</blockquote>` : "";
    }
    case "listItem":
      return renderListItemTelegramBody(node, { underline: true });
    default:
      return escapeHtml(extractPlainText(node));
  }
}

function renderBlockMaxMarkdown(node: RichTextNode, orderedIndex = 1): string {
  switch (node.type) {
    case "paragraph":
      return renderInlineMarkdown(node.content, { underline: true });
    case "heading":
      return `### ${renderInlineMarkdown(node.content, { underline: true })}`;
    case "bulletList":
      return (node.content ?? []).map((item) => `- ${renderListItemMarkdown(item, { underline: true })}`).join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => `${orderedIndex + index}. ${renderListItemMarkdown(item, { underline: true })}`)
        .join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map((child) =>
          renderBlockMaxMarkdown(child)
            .split("\n")
            .filter(Boolean)
            .map((line) => `> ${line}`)
            .join("\n")
        )
        .filter(Boolean)
        .join("\n");
    case "listItem":
      return renderListItemMarkdown(node, { underline: true });
    default:
      return escapeMarkdown(extractPlainText(node));
  }
}

function renderBlockVkPlain(node: RichTextNode, orderedIndex = 1): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return renderInlinePlain(node.content);
    case "bulletList":
      return (node.content ?? []).map((item) => `- ${renderListItemPlain(item)}`).join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => `${orderedIndex + index}. ${renderListItemPlain(item)}`)
        .join("\n");
    case "blockquote":
      return (node.content ?? []).map((child) => `> ${extractPlainText(child)}`).join("\n");
    case "listItem":
      return renderListItemPlain(node);
    default:
      return extractPlainText(node);
  }
}

function joinBlocks(blocks: string[]): string {
  return blocks.filter((block) => block.trim().length > 0).join("\n\n").trim();
}

function collectWarnings(platform: PlatformKind, document: RichTextDocument, context: RenderContext): RenderWarning[] {
  const warnings: RenderWarning[] = [];
  const nodeTypes = new Set<string>();
  const markTypes = new Set<string>();

  const visit = (node: RichTextNode) => {
    nodeTypes.add(node.type);
    for (const mark of node.marks ?? []) {
      markTypes.add(mark.type);
    }
    for (const child of node.content ?? []) {
      visit(child);
    }
  };

  for (const node of document.content) {
    visit(node);
  }

  if (platform === "telegram") {
    if (nodeTypes.has("telegramCustomEmoji")) {
      warnings.push({
        level: "warning",
        message:
          "Для публикации custom emoji в Telegram-канал нужен бот с additional usernames на Fragment. Иначе Telegram заменит их базовыми эмодзи."
      });
    }

    if (context.mediaCount > 1 && context.hasGif) {
      warnings.push({
        level: "warning",
        message: "Telegram не объединяет GIF с другими файлами в один альбом. GIF будет отправлена отдельным сообщением."
      });
    }
  }

  if (platform === "max") {
    if (nodeTypes.has("telegramCustomEmoji")) {
      warnings.push({
        level: "warning",
        message: "Telegram custom emoji в MAX заменяются базовыми эмодзи."
      });
    }
  }

  if (platform === "vk") {
    if (["bold", "italic", "underline", "strike", "code"].some((mark) => markTypes.has(mark))) {
      warnings.push({
        level: "warning",
        message: "VK упрощает часть форматирования и публикует его как обычный текст."
      });
    }

    if (nodeTypes.has("telegramCustomEmoji")) {
      warnings.push({
        level: "warning",
        message: "Telegram custom emoji в VK заменяются обычными эмодзи."
      });
    }

    if (context.hasVideo || context.hasGif) {
      warnings.push({
        level: "warning",
        message: "Проверьте ограничения формата медиа в VK: часть файлов может быть преобразована платформой."
      });
    }
  }

  if (platform !== "max" && nodeTypes.has("heading")) {
    warnings.push({
      level: "warning",
      message: "Заголовок предназначен для MAX. В других платформах он отправится как обычный абзац."
    });
  }

  return warnings;
}

export function renderTelegram(document: RichTextDocument, media: RenderMediaInput = 0): PlatformRenderResult {
  const context = resolveRenderContext(media);
  const previewHtml = document.content.map((node) => renderBlockTelegramPreview(node)).join("");
  const body = joinBlocks(document.content.map((node) => renderBlockTelegramBody(node)));

  return {
    platform: "telegram",
    outputFormat: "HTML",
    body,
    previewHtml,
    warnings: collectWarnings("telegram", document, context)
  };
}

export function renderMax(document: RichTextDocument, media: RenderMediaInput = 0): PlatformRenderResult {
  const context = resolveRenderContext(media);
  const previewHtml = document.content.map((node) => renderBlockMaxPreview(node)).join("");
  const body = joinBlocks(document.content.map((node) => renderBlockMaxMarkdown(node)));

  return {
    platform: "max",
    outputFormat: "MARKDOWN",
    body,
    previewHtml,
    warnings: collectWarnings("max", document, context)
  };
}

export function renderVk(document: RichTextDocument, media: RenderMediaInput = 0): PlatformRenderResult {
  const context = resolveRenderContext(media);
  const previewHtml = document.content.map((node) => renderBlockVkPreview(node)).join("");
  const body = joinBlocks(document.content.map((node) => renderBlockVkPlain(node)));

  return {
    platform: "vk",
    outputFormat: "PLAINTEXT",
    body,
    previewHtml,
    warnings: collectWarnings("vk", document, context)
  };
}

export function renderForPlatform(
  platform: PlatformKind,
  document: RichTextDocument,
  media: RenderMediaInput = 0
): PlatformRenderResult {
  switch (platform) {
    case "telegram":
      return renderTelegram(document, media);
    case "max":
      return renderMax(document, media);
    case "vk":
      return renderVk(document, media);
  }
}

export function renderAllPlatforms(document: RichTextDocument, media: RenderMediaInput = 0): PlatformRenderResult[] {
  return [renderTelegram(document, media), renderMax(document, media), renderVk(document, media)];
}
