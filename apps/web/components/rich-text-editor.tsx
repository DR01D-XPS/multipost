"use client";

import { Extension, Node } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import type { RichTextDocument } from "@multipost/core";
import type { TelegramEmojiPackView } from "../lib/server";
import { TelegramEmojiPicker } from "./telegram-emoji-picker";

const TelegramKeymap = Extension.create({
  name: "telegramKeymap",

  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.commands.toggleBold(),
      "Mod-i": () => this.editor.commands.toggleItalic(),
      "Mod-u": () => this.editor.commands.toggleUnderline(),
      "Mod-Shift-s": () => this.editor.commands.toggleStrike(),
      "Mod-Shift-m": () => this.editor.commands.toggleCode(),
      "Mod-Alt-1": () => this.editor.commands.toggleHeading({ level: 2 })
    };
  }
});

const TelegramCustomEmoji = Node.create({
  name: "telegramCustomEmoji",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      customEmojiId: {
        default: ""
      },
      alt: {
        default: "🙂"
      },
      previewUrl: {
        default: null
      },
      previewMimeType: {
        default: null
      },
      setName: {
        default: null
      },
      packTitle: {
        default: null
      },
      needsRepainting: {
        default: false
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-telegram-custom-emoji]"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const previewUrl = typeof HTMLAttributes.previewUrl === "string" ? HTMLAttributes.previewUrl : null;
    const previewMimeType = typeof HTMLAttributes.previewMimeType === "string" ? HTMLAttributes.previewMimeType : null;
    const alt = typeof HTMLAttributes.alt === "string" ? HTMLAttributes.alt : "🙂";

    const wrapperAttributes = {
      "data-telegram-custom-emoji": HTMLAttributes.customEmojiId ?? "",
      "data-emoji-id": HTMLAttributes.customEmojiId ?? "",
      "data-alt": alt,
      class: "telegram-custom-emoji-node"
    };

    if (previewUrl && previewMimeType?.startsWith("image/")) {
      return ["span", wrapperAttributes, ["img", { src: previewUrl, alt, class: "telegram-custom-emoji-asset" }]];
    }

    if (previewUrl && previewMimeType?.startsWith("video/")) {
      return [
        "span",
        wrapperAttributes,
        ["video", { src: previewUrl, muted: "true", loop: "true", autoplay: "true", playsinline: "true", class: "telegram-custom-emoji-asset" }]
      ];
    }

    return ["span", wrapperAttributes, alt];
  }
});

function ToolbarButton({
  label,
  isActive,
  title,
  onClick
}: {
  label: string;
  isActive?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-sm transition",
        isActive ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent/50 hover:bg-surfaceSoft"
      )}
    >
      {label}
    </button>
  );
}

function normalizeLinkHref(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function RichTextEditor({
  content,
  onChange,
  emojiPacks
}: {
  content: RichTextDocument;
  onChange: (value: RichTextDocument) => void;
  emojiPacks: TelegramEmojiPackView[];
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("https://");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2]
        },
        codeBlock: false,
        horizontalRule: false
      }),
      TelegramCustomEmoji,
      Underline,
      Link.configure({
        openOnClick: false
      }),
      Placeholder.configure({
        placeholder: "Напишите текст поста. Форматирование сохранится и будет адаптировано под каждую платформу."
      }),
      TelegramKeymap
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap studio-scrollbar rounded-[1.5rem] border border-line bg-field px-5 py-5"
      }
    },
    onUpdate({ editor: currentEditor }) {
      onChange(currentEditor.getJSON() as RichTextDocument);
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentValue = editor.getJSON();
    if (JSON.stringify(currentValue) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const openLinkEditor = useCallback(() => {
    if (!editor) {
      return;
    }

    const currentHref = (editor.getAttributes("link").href as string | undefined) ?? "";
    editor.chain().focus().extendMarkRange("link").run();
    setLinkDraft(currentHref || "https://");
    setIsLinkEditorOpen(true);
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const dom = editor.view.dom;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openLinkEditor();
      }

      if (event.key === "Escape" && isLinkEditorOpen) {
        event.preventDefault();
        setIsLinkEditorOpen(false);
      }
    };

    dom.addEventListener("keydown", handleKeyDown);
    return () => {
      dom.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, isLinkEditorOpen, openLinkEditor]);

  if (!editor) {
    return <div className="rounded-[1.5rem] border border-line bg-surface px-4 py-12 text-sm text-ink/60">Загрузка редактора...</div>;
  }

  function insertTelegramCustomEmoji(input: {
    customEmojiId: string;
    emoji: string;
    previewUrl: string | null;
    previewMimeType: string | null;
    setName: string;
    packTitle: string;
    needsRepainting: boolean;
  }) {
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "telegramCustomEmoji",
          attrs: {
            customEmojiId: input.customEmojiId,
            alt: input.emoji,
            previewUrl: input.previewUrl,
            previewMimeType: input.previewMimeType,
            setName: input.setName,
            packTitle: input.packTitle,
            needsRepainting: input.needsRepainting
          }
        },
        {
          type: "text",
          text: " "
        }
      ])
      .run();
  }

  function applyLink() {
    const normalizedHref = normalizeLinkHref(linkDraft);
    if (!normalizedHref) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setIsLinkEditorOpen(false);
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: normalizedHref }).run();
    setIsLinkEditorOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ToolbarButton label="Жирный" title="Жирный текст (Ctrl+B)" isActive={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="Курсив" title="Курсив (Ctrl+I)" isActive={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton
          label="Подчеркнуть"
          title="Подчеркнуть (Ctrl+U)"
          isActive={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          label="Зачеркнуть"
          title="Зачеркнуть (Ctrl+Shift+S)"
          isActive={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton label="Код" title="Моноширинный код (Ctrl+Shift+M)" isActive={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolbarButton label="Ссылка" title="Ссылка (Ctrl+K)" isActive={editor.isActive("link")} onClick={openLinkEditor} />
        <ToolbarButton label="Список" title="Маркированный список" isActive={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="Нумерация" title="Нумерованный список" isActive={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="Цитата" title="Цитата" isActive={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton
          label="Заголовок MAX"
          title="Заголовок уровня 2 для MAX (Ctrl+Alt+1)"
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton label="TG Emoji" title="Панель Telegram emoji" isActive={showEmojiPicker} onClick={() => setShowEmojiPicker((current) => !current)} />
      </div>

      {showEmojiPicker ? (
        <TelegramEmojiPicker
          packs={emojiPacks}
          onSelect={(emoji) =>
            insertTelegramCustomEmoji({
              customEmojiId: emoji.customEmojiId,
              emoji: emoji.emoji,
              previewUrl: emoji.previewUrl,
              previewMimeType: emoji.previewMimeType,
              setName: emoji.setName,
              packTitle: emoji.packTitle,
              needsRepainting: emoji.needsRepainting
            })
          }
        />
      ) : null}

      {editor ? (
        <BubbleMenu
          editor={editor}
          shouldShow={() => isLinkEditorOpen}
          tippyOptions={{
            placement: "top",
            duration: [180, 140],
            maxWidth: 360,
            interactive: true
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
            className="flex w-[min(86vw,340px)] items-center gap-2 rounded-2xl border border-line bg-panel px-2 py-2 shadow-[0_16px_32px_rgba(0,0,0,0.28)]"
          >
            <input
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              placeholder="https://example.com"
              className="min-w-0 flex-1 rounded-xl border border-line bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
              autoFocus
            />
            <button type="submit" className="rounded-xl border border-accent bg-accent px-3 py-2 text-xs font-medium text-white">
              OK
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setIsLinkEditorOpen(false);
              }}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium hover:border-accentWarm hover:text-accentWarm"
            >
              Убрать
            </button>
          </form>
        </BubbleMenu>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
}
