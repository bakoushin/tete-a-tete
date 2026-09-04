"use client";

import { useState } from "react";
import type { WalletClient } from "viem";
import type { Identity } from "@tat/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { normalizeName } from "@/lib/ens";

export function HomeCard({
  myName,
  openPeers,
  contacts,
  active,
  onOpen,
  onSelect,
}: {
  myName: string;
  identity: Identity;
  wallet: WalletClient | null;
  openPeers: string[];
  contacts: string[];
  active: string | null;
  onOpen: (peer: string) => Promise<void>;
  onSelect: (peer: string) => void;
  onRotate: () => Promise<Identity>;
  onNameChange: (name: string) => void;
}) {
  const [peer, setPeer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);

  const open = async () => {
    setError(null);
    setChecking(true);
    try {
      const n = normalizeName(peer);
      if (n === myName) throw new Error("that's you");
      await onOpen(n);
      setPeer("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const idle = contacts.filter((c) => !openPeers.includes(c));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open a private chat</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            placeholder="Enter ENS name"
            value={peer}
            onChange={(e) => setPeer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void open()}
          />
          <Button onClick={open} disabled={!peer || checking}>
            {checking ? "Checking…" : "Open"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {(openPeers.length > 0 || idle.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {openPeers.map((p) => (
              <button key={p} onClick={() => onSelect(p)} className="cursor-pointer">
                <Badge variant={p === active ? "default" : "secondary"}>{p}</Badge>
              </button>
            ))}
            {idle.map((p) => (
              <button key={p} onClick={() => void onOpen(p).catch((e) => setError((e as Error).message))} className="cursor-pointer" title="remembered contact">
                <Badge variant="outline">{p}</Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
