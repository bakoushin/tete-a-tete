"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { ChannelSession } from "@/lib/channel";
import { setContactRemembered } from "@/lib/identity";
import { PARENT_NAME } from "@/lib/config";
import { WhatsPublic } from "./whats-public";

export function ChannelView({
  session,
  myName,
  remembered,
  onRemember,
  onClose,
}: {
  session: ChannelSession;
  myName: string;
  remembered: boolean;
  onRemember: (v: boolean) => void;
  onClose: () => void;
}) {
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [s.messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSendError(null);
    setText("");
    try {
      await session.send(t);
    } catch (e) {
      setSendError((e as Error).message);
      setText(t);
    }
  };

  const toggleRemember = (v: boolean) => {
    setContactRemembered(s.peer, v);
    onRemember(v);
  };

  return (
    <Card className="flex min-h-[420px] flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{s.peer}</CardTitle>
          {s.syncError && (
            <Badge variant="destructive" title={s.syncError}>
              gateway unreachable
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground" title="Keep this name in this browser (never the messages)">
            remember
            <Switch size="sm" checked={remembered} onCheckedChange={toggleRemember} />
          </label>
          {s.status === "open" && <WhatsPublic session={session} snapshot={s} myName={myName} />}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="close channel">
            <X />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-3">
        {s.status === "resolving" && <p className="text-sm text-muted-foreground">Resolving {s.peer}&apos;s rdv-key…</p>}
        {s.status === "no-key" && (
          <div className="rounded-md border px-3 py-2 text-sm">
            Can&apos;t open a private channel: <strong>{s.peer}</strong> hasn&apos;t published an <code>rdv-key</code>. Send them an invite.
          </div>
        )}
        {s.status === "error" && <p className="text-sm text-destructive">{s.error}</p>}

        {s.banners.map((b) => (
          <div
            key={b.id}
            className={`flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs ${
              b.kind === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted"
            }`}
          >
            <span>{b.text}</span>
            <button className="cursor-pointer opacity-60" onClick={() => session.dismissBanner(b.id)} aria-label="dismiss">
              ×
            </button>
          </div>
        ))}

        {s.status === "open" && (
          <>
            <div className="flex max-h-[50vh] min-h-[200px] flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {s.messages.length === 0 && !s.syncError && (
                <p className="m-auto text-center text-sm text-muted-foreground">
                  Empty channel. Nothing exists at this label until one of you writes.
                </p>
              )}
              {s.messages.map((m, i) => (
                <div key={`${m.week}-${m.t}-${i}`} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                      m.mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                    title={new Date(m.t).toLocaleString()}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.m}</div>
                    <div className={`mt-0.5 text-[10px] ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {m.week !== s.week ? " · last week" : ""}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={`Message ${s.peer}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
                disabled={s.sending}
                autoFocus
              />
              <Button onClick={send} disabled={s.sending || !text.trim()}>
                {s.sending ? "Sealing…" : "Send"}
              </Button>
            </div>
            {sendError && <p className="text-xs text-destructive">{sendError}</p>}

            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
              <span className="font-mono" title="This week's label for messages you write. Only the two of you can compute it.">
                {s.mine?.label}.{PARENT_NAME}
              </span>
              <span>{s.lastSync ? `synced ${new Date(s.lastSync).toLocaleTimeString()}` : "…"}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
