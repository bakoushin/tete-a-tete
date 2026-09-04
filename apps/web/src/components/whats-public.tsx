"use client";

import { useState } from "react";
import { deriveSharedSecret, deriveWeekKeys, directionOf, encodeRdvKey } from "@tat/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ChannelSession, ChannelSnapshot } from "@/lib/channel";
import { PARENT_NAME, RESOLVER_ADDRESS } from "@/lib/config";
import { fetchGatewayRecord, readRdvKey } from "@/lib/ens";
import type { StoredRecord } from "@/gateway/store";

/**
 * Shows exactly what an observer sees: the resolver on-chain, and the gateway's record for the
 * current label — a random label, a fixed-size ciphertext, a random writer key. No names anywhere.
 * Also recomputes the label live from both public rdv-key records + the local private key.
 */
export function WhatsPublic({ session, snapshot: s, myName }: { session: ChannelSession; snapshot: ChannelSnapshot; myName: string }) {
  const [rec, setRec] = useState<StoredRecord | null | "loading" | "error">("loading");
  const [recompute, setRecompute] = useState<{ mineKey: string; peerKey: string; label: string; match: boolean } | null>(null);
  void session;

  const load = async () => {
    setRec("loading");
    setRecompute(null);
    try {
      if (!s.gateway || !s.mine) throw new Error("no gateway");
      setRec(await fetchGatewayRecord(s.gateway, s.mine.node));
    } catch {
      setRec("error");
    }
  };

  const doRecompute = async () => {
    const [mine, peer] = await Promise.all([readRdvKey(myName), readRdvKey(s.peer)]);
    if (!mine || !peer || !s.mine) return;
    const id = (await import("@/lib/identity")).loadIdentity();
    const identity = await id;
    if (!identity) return;
    const shared = await deriveSharedSecret(identity, peer);
    const k = deriveWeekKeys(shared, s.week, directionOf(myName, s.peer), PARENT_NAME);
    setRecompute({ mineKey: encodeRdvKey(mine), peerKey: encodeRdvKey(peer), label: k.label, match: k.label === s.mine.label });
  };

  return (
    <Dialog onOpenChange={(o) => o && void load()}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>What&apos;s public?</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>What an observer sees</DialogTitle>
          <DialogDescription>The chain holds a wildcard resolver. The gateway holds ciphertext under a random label. Neither knows who talks to whom.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-xs">
          <section>
            <h4 className="mb-1 font-medium">On-chain (Sepolia)</h4>
            <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 font-mono break-all">
              <dt className="text-muted-foreground">resolver</dt>
              <dd>
                <a className="underline" target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/address/${RESOLVER_ADDRESS}`}>
                  {RESOLVER_ADDRESS}
                </a>
              </dd>
              <dt className="text-muted-foreground">parent</dt>
              <dd>{PARENT_NAME}</dd>
              <dt className="text-muted-foreground">gateway</dt>
              <dd>{s.gateway?.template ?? "—"}</dd>
            </dl>
          </section>
          <section>
            <h4 className="mb-1 font-medium">Gateway record for this week&apos;s label (my direction)</h4>
            {rec === "loading" ? (
              <p className="text-muted-foreground">loading…</p>
            ) : rec === "error" ? (
              <p className="text-destructive">could not reach gateway</p>
            ) : (
              <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 font-mono break-all">
                <dt className="text-muted-foreground">name</dt>
                <dd>{s.mine?.name}</dd>
                <dt className="text-muted-foreground">node</dt>
                <dd>{s.mine?.node}</dd>
                {rec ? (
                  <>
                    <dt className="text-muted-foreground">writer</dt>
                    <dd>{rec.writer} (ed25519, derived — not a wallet)</dd>
                    <dt className="text-muted-foreground">written</dt>
                    <dd>{new Date(rec.ts).toISOString()}</dd>
                    <dt className="text-muted-foreground">expires</dt>
                    <dd>{new Date(rec.validUntil).toISOString()}</dd>
                    <dt className="text-muted-foreground">blob</dt>
                    <dd className="max-h-24 overflow-hidden text-ellipsis">
                      {rec.blob.length} chars base64, always the same size · {rec.blob.slice(0, 160)}…
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">record</dt>
                    <dd>none — nothing exists at this label yet</dd>
                  </>
                )}
              </dl>
            )}
          </section>
          <section>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="font-medium">Recompute the label from public keys + my private key</h4>
              <Button size="sm" variant="outline" onClick={doRecompute}>
                Recompute
              </Button>
            </div>
            {recompute && (
              <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 font-mono break-all">
                <dt className="text-muted-foreground">{myName}</dt>
                <dd>{recompute.mineKey}</dd>
                <dt className="text-muted-foreground">{s.peer}</dt>
                <dd>{recompute.peerKey}</dd>
                <dt className="text-muted-foreground">label</dt>
                <dd>
                  {recompute.label} {recompute.match ? "✓ matches" : "✗ mismatch"}
                </dd>
              </dl>
            )}
            <p className="mt-1 text-muted-foreground">
              HKDF(ECDH(R_me, R_peer), week, direction) → label · enc key · write key. Without a private key the label is just 16 random bytes.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
